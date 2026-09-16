import type { Papel, Prisma, VisibilidadeRelatorio } from "@prisma/client";

import { prisma } from "@/infra/prisma/cliente";
import { criarGravadorPrisma } from "@/infra/auditoria/gravador-prisma";
import { registrarMutacao } from "@/dominio/auditoria/servico-auditoria";
import { exigirPermissao, podeExecutar } from "@/dominio/autorizacao/permissoes";
import {
  ASSUNTOS,
  type AssuntoRelatorio,
  assuntoPorSlug,
} from "@/dominio/relatorios/catalogo";
import {
  type DefinicaoRelatorio,
  ErroDeRelatorioInvalido,
  TETO_LINHAS_PADRAO,
  resumirDefinicao,
  validarEstruturaDefinicao,
} from "@/dominio/relatorios/compilador";
import { type TabelaPivotada, pivotar, tabelaParaCsv } from "@/dominio/relatorios/pivo";
import { executarConsultaDeRelatorio } from "@/infra/consultas/relatorios";
import { type Ator, ErroDeValidacao } from "./contexto";

/**
 * Casos de uso do Gerador de relatórios (Onda 16, ficha §3).
 *
 * Três invariantes atravessam tudo o que está aqui:
 *
 *  RN76 — a consulta roda com a permissão de **quem executa**, e relatório
 *         compartilhado roda com a permissão de **quem abre**, nunca de quem
 *         criou. É o ponto onde relatório compartilhado costuma virar
 *         vazamento: executar com a credencial do autor é como um relatório
 *         inocente acaba entregando ao time inteiro o que só o autor
 *         alcançava.
 *  RN78 — toda execução grava evento, inclusive a que termina em recusa.
 *         Consulta que falhou é justamente a que alguém vai querer explicar
 *         depois.
 *  RN79 — o resultado tem teto, e estourá-lo nomeia a causa e oferece o
 *         caminho (RN55) — nunca devolve resultado truncado em silêncio.
 */

const ENTIDADE = "RelatorioSalvo";

/** O que a auditoria guarda de um relatório salvo. */
function estadoAuditavel(relatorio: {
  nome: string;
  assuntoSlug: string;
  visibilidade: VisibilidadeRelatorio;
  definicao: unknown;
}) {
  return {
    nome: relatorio.nome,
    assuntoSlug: relatorio.assuntoSlug,
    visibilidade: relatorio.visibilidade,
    // A definição inteira, e não um resumo: é ela que diz o que a pessoa
    // podia ver, e um resumo perderia justamente o filtro que importa
    // quando alguém for reconstituir um acesso.
    definicao: JSON.stringify(relatorio.definicao),
  };
}

// ---------------------------------------------------------------------
// Catálogo visível — RN76
// ---------------------------------------------------------------------

/**
 * Os assuntos que o papel alcança.
 *
 * Assunto fora do alcance **não aparece** — sem cadeado e sem "peça acesso".
 * Oferecer o que não se pode abrir só produz pedido de suporte, e a pessoa
 * que vê o cadeado aprende que a plataforma tem lugares proibidos para ela,
 * o que é verdade mas não é informação útil aqui.
 */
export function assuntosVisiveis(papel: Papel): ReadonlyArray<AssuntoRelatorio> {
  return ASSUNTOS.filter((assunto) => podeExecutar(papel, assunto.permissao));
}

function exigirAssuntoAlcancavel(ator: Ator, slug: string): AssuntoRelatorio {
  const assunto = assuntoPorSlug(slug);
  if (!assunto) {
    throw new ErroDeValidacao([
      `O assunto "${slug}" não existe mais no catálogo de relatórios.`,
    ]);
  }
  // `exigirPermissao` lança `ErroDeAutorizacao`, que a interface já sabe
  // traduzir (RN55). Não se inventa mensagem nova aqui.
  exigirPermissao(ator.papel, assunto.permissao);
  return assunto;
}

// ---------------------------------------------------------------------
// Executar — RN78, RN79
// ---------------------------------------------------------------------

export interface ResultadoDoRelatorio {
  tabela: TabelaPivotada;
  total: number;
  truncado: boolean;
  teto: number;
  duracaoMs: number;
  resumo: string;
}

export interface OpcoesDeExecucao {
  /** Amostra da prévia; ausente = o teto cheio. */
  teto?: number;
  /** Relatório salvo de origem, quando houver. */
  relatorioId?: string;
  /** Exigida quando o assunto alcança dado pessoal (RN78). */
  finalidade?: string;
  /** Marca a execução como exportação em CSV na trilha operacional. */
  exportacao?: boolean;
}

/**
 * Registra a execução na trilha operacional.
 *
 * **Fora de transação, e depois da consulta.** A execução de leitura não tem
 * nada a desfazer, e prender o registro à consulta faria uma falha de
 * gravação do histórico derrubar um relatório que já tinha sido produzido
 * com sucesso — trocar informação por indisponibilidade.
 *
 * Falhar aqui não derruba a resposta, pelo mesmo motivo da marca de presença
 * na T27: ninguém fica sem o relatório porque o histórico não pôde ser
 * escrito. O erro vai para o log do servidor.
 */
async function registrarExecucao(dados: {
  ator: Ator;
  definicao: DefinicaoRelatorio;
  relatorioId?: string;
  linhas: number;
  truncado: boolean;
  duracaoMs: number;
  finalidade?: string;
  erro?: string;
  exportou: boolean;
}): Promise<void> {
  try {
    await prisma.execucaoRelatorio.create({
      data: {
        relatorioId: dados.relatorioId ?? null,
        assuntoSlug: dados.definicao.assunto,
        definicao: dados.definicao as unknown as Prisma.InputJsonValue,
        linhas: dados.linhas,
        truncado: dados.truncado,
        duracaoMs: dados.duracaoMs,
        finalidade: dados.finalidade ?? null,
        erro: dados.erro ?? null,
        autorId: dados.ator.id,
        exportou: dados.exportou,
      },
    });
  } catch {
    // Silêncio deliberado: o detalhe fica no log do Prisma, e a alternativa
    // — propagar — custaria à pessoa o relatório que ela já tem em mãos.
  }
}

export async function executarRelatorio(
  ator: Ator,
  definicaoBruta: unknown,
  opcoes: OpcoesDeExecucao = {},
): Promise<ResultadoDoRelatorio> {
  const definicao = validarEstruturaDefinicao(definicaoBruta);
  const assunto = exigirAssuntoAlcancavel(ator, definicao.assunto);

  if (assunto.contemDadoPessoal && !opcoes.finalidade?.trim()) {
    // RN78. A finalidade é o mesmo caminho da RN35, e não um campo novo:
    // quem exporta lista de assinantes já declara para quê, e um relatório
    // que alcança as mesmas pessoas não pode pedir menos.
    throw new ErroDeValidacao([
      `O assunto "${assunto.rotulo}" alcança dado pessoal. Declare a finalidade antes de executar.`,
    ]);
  }

  const teto = opcoes.teto ?? TETO_LINHAS_PADRAO;

  let resultado;
  try {
    resultado = await executarConsultaDeRelatorio(definicao, { teto });
  } catch (erro) {
    await registrarExecucao({
      ator,
      definicao,
      relatorioId: opcoes.relatorioId,
      linhas: 0,
      truncado: false,
      duracaoMs: 0,
      finalidade: opcoes.finalidade,
      // Só a mensagem da classe conhecida do domínio (RN55); qualquer outra
      // exceção entra como rótulo genérico, e o detalhe fica no log. Rastro
      // de pilha e SQL não vão para a trilha, que é lida na tela.
      erro:
        erro instanceof ErroDeRelatorioInvalido || erro instanceof ErroDeValidacao
          ? erro.message
          : "falha ao executar a consulta",
      exportou: opcoes.exportacao ?? false,
    });
    throw erro;
  }

  await registrarExecucao({
    ator,
    definicao,
    relatorioId: opcoes.relatorioId,
    linhas: resultado.linhas.length,
    truncado: resultado.truncado,
    duracaoMs: resultado.duracaoMs,
    finalidade: opcoes.finalidade,
    exportou: opcoes.exportacao ?? false,
  });

  return {
    tabela: pivotar(resultado.projecao, resultado.linhas),
    total: resultado.linhas.length,
    truncado: resultado.truncado,
    teto: resultado.teto,
    duracaoMs: resultado.duracaoMs,
    resumo: resumirDefinicao(definicao),
  };
}

/**
 * Exportação em CSV.
 *
 * **Não é atalho para nada** (RN76, ficha §3): passa pelo mesmo
 * `executarRelatorio`, com a mesma conferência de permissão, a mesma
 * exigência de finalidade e o mesmo teto. A única diferença é que a trilha
 * operacional marca `exportou`, que é o recorte de quem pergunta o que saiu
 * da plataforma.
 */
export async function exportarRelatorioCsv(
  ator: Ator,
  definicaoBruta: unknown,
  opcoes: Omit<OpcoesDeExecucao, "exportacao" | "teto"> = {},
): Promise<{ csv: string; nomeArquivo: string; linhas: number; truncado: boolean }> {
  const resultado = await executarRelatorio(ator, definicaoBruta, {
    ...opcoes,
    exportacao: true,
  });

  const definicao = validarEstruturaDefinicao(definicaoBruta);
  const assunto = assuntoPorSlug(definicao.assunto);
  const carimbo = new Date().toISOString().slice(0, 10);
  const base = (assunto?.rotulo ?? definicao.assunto)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();

  return {
    csv: tabelaParaCsv(resultado.tabela),
    nomeArquivo: `relatorio-${base}-${carimbo}.csv`,
    linhas: resultado.total,
    truncado: resultado.truncado,
  };
}

/*
 * A mensagem do estouro de teto (RN79 + RN55) vive nas DUAS telas que a
 * exibem, e não aqui, numa função comum.
 *
 * Houve uma, exportada, e ela ficou sem chamador: a prévia e a exportação
 * dizem coisas diferentes — "amostra, há mais" contra "o arquivo saiu com N
 * linhas e foi cortado" —, e uma frase só para as duas seria vaga nas duas.
 * Mantê-la exportada e sem uso seria pior que não tê-la: a próxima mão a
 * tomaria por caminho canônico e trocaria duas mensagens boas por uma
 * genérica. Trazê-la de volta exige um terceiro lugar que precise do mesmo
 * texto.
 *
 * E há a razão técnica: o construtor é componente de cliente, e importar
 * daqui arrastaria o caso de uso — com o Prisma atrás — para o pacote do
 * navegador.
 */

// ---------------------------------------------------------------------
// Galeria — salvar, listar, abrir, apagar
// ---------------------------------------------------------------------

export interface DadosDoRelatorioSalvo {
  nome: string;
  definicao: unknown;
  visibilidade?: VisibilidadeRelatorio;
}

export async function salvarRelatorio(
  ator: Ator,
  dados: DadosDoRelatorioSalvo,
): Promise<{ id: string }> {
  const nome = dados.nome?.trim() ?? "";
  if (nome.length < 3) {
    throw new ErroDeValidacao(["Dê ao relatório um nome de ao menos 3 caracteres."]);
  }
  if (nome.length > 120) {
    throw new ErroDeValidacao(["O nome do relatório passa de 120 caracteres."]);
  }

  const definicao = validarEstruturaDefinicao(dados.definicao);
  exigirAssuntoAlcancavel(ator, definicao.assunto);
  // Compila antes de guardar: relatório salvo que não executa é pior que
  // relatório não salvo, porque aparece na prateleira e falha só ao abrir.
  await executarConsultaDeRelatorio(definicao, { teto: 1 });

  const criado = await prisma.$transaction(async (tx) => {
    const relatorio = await tx.relatorioSalvo.create({
      data: {
        nome,
        assuntoSlug: definicao.assunto,
        definicao: definicao as unknown as Prisma.InputJsonValue,
        autorId: ator.id,
        visibilidade: dados.visibilidade ?? "PRIVADO",
      },
    });
    await registrarMutacao(criarGravadorPrisma(tx), {
      entidade: ENTIDADE,
      entidadeId: relatorio.id,
      autorId: ator.id,
      anterior: null,
      novo: estadoAuditavel(relatorio),
    });
    return relatorio;
  });

  return { id: criado.id };
}

export async function renomearOuCompartilharRelatorio(
  ator: Ator,
  id: string,
  mudancas: { nome?: string; visibilidade?: VisibilidadeRelatorio },
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const atual = await tx.relatorioSalvo.findUnique({ where: { id } });
    if (!atual) {
      throw new ErroDeValidacao(["Relatório não encontrado."]);
    }
    /*
     * Editar é do AUTOR, e só dele — inclusive para quem tem acesso total.
     * Não é uma permissão de RBAC esquecida: o relatório salvo é a pergunta
     * de uma pessoa, e outra pessoa reescrever a pergunta alheia produziria
     * a situação em que alguém abre "seu" relatório e recebe outra coisa,
     * sem nada na tela explicando. Quem quiser variar, duplica.
     */
    if (atual.autorId !== ator.id) {
      throw new ErroDeValidacao([
        "Só quem criou o relatório pode renomeá-lo ou mudar quem o vê. Duplique-o para ter a sua versão.",
      ]);
    }

    const nome = mudancas.nome?.trim();
    if (nome !== undefined && (nome.length < 3 || nome.length > 120)) {
      throw new ErroDeValidacao(["O nome do relatório precisa ter de 3 a 120 caracteres."]);
    }

    const atualizado = await tx.relatorioSalvo.update({
      where: { id },
      data: {
        ...(nome !== undefined ? { nome } : {}),
        ...(mudancas.visibilidade !== undefined
          ? { visibilidade: mudancas.visibilidade }
          : {}),
      },
    });

    await registrarMutacao(criarGravadorPrisma(tx), {
      entidade: ENTIDADE,
      entidadeId: id,
      autorId: ator.id,
      anterior: estadoAuditavel(atual),
      novo: estadoAuditavel(atualizado),
    });
  });
}

export async function apagarRelatorio(ator: Ator, id: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const atual = await tx.relatorioSalvo.findUnique({ where: { id } });
    if (!atual) {
      throw new ErroDeValidacao(["Relatório não encontrado."]);
    }
    if (atual.autorId !== ator.id) {
      throw new ErroDeValidacao(["Só quem criou o relatório pode apagá-lo."]);
    }
    /*
     * Evento de ATO, escrito à mão, e não diff de campos: `registrarMutacao`
     * compara dois estados, e exclusão não tem estado novo com que comparar
     * — o diff sairia vazio e o ato ficaria invisível na T28. É o mesmo
     * desenho do acesso a dados plenos da Onda 5 e da importação de
     * telemetria da Onda 1.
     *
     * A trilha vai ANTES do delete, porque depois não haveria de onde ler o
     * estado anterior. As execuções sobrevivem por `ON DELETE SET NULL`:
     * apagar a pergunta não apaga o registro de que ela foi feita.
     */
    await criarGravadorPrisma(tx).gravar([
      {
        entidade: ENTIDADE,
        entidadeId: id,
        campo: "exclusao",
        valorAnterior: JSON.stringify(estadoAuditavel(atual)),
        valorNovo: null,
        autorId: ator.id,
      },
    ]);
    await tx.relatorioSalvo.delete({ where: { id } });
  });
}

export interface RelatorioNaGaleria {
  id: string;
  nome: string;
  assuntoSlug: string;
  assuntoRotulo: string;
  resumo: string;
  visibilidade: VisibilidadeRelatorio;
  meu: boolean;
  autorNome: string;
  atualizadoEm: Date;
}

/**
 * As prateleiras "Meus relatórios" e "Do time".
 *
 * O compartilhado é filtrado pelo que o papel alcança **na leitura**, e não
 * na gravação: se o catálogo mudar, ou se o papel de alguém mudar, a
 * prateleira encolhe sozinha. É a mesma ideia da RN76 aplicada à listagem —
 * não se oferece a abertura do que não se pode abrir.
 */
export async function listarRelatorios(ator: Ator): Promise<{
  meus: RelatorioNaGaleria[];
  doTime: RelatorioNaGaleria[];
}> {
  const alcancaveis = new Set(assuntosVisiveis(ator.papel).map((assunto) => assunto.slug));

  const linhas = await prisma.relatorioSalvo.findMany({
    where: {
      OR: [{ autorId: ator.id }, { visibilidade: "TIME" }],
      assuntoSlug: { in: [...alcancaveis] },
    },
    orderBy: { atualizadoEm: "desc" },
    include: { autor: { select: { nome: true } } },
    take: 200,
  });

  const converter = (linha: (typeof linhas)[number]): RelatorioNaGaleria => {
    let resumo: string;
    try {
      resumo = resumirDefinicao(validarEstruturaDefinicao(linha.definicao));
    } catch {
      // Definição que não valida mais (campo saiu do catálogo): a galeria
      // continua listando, com o aviso no lugar do resumo. Some-la seria
      // esconder da pessoa que o relatório dela deixou de funcionar.
      resumo = "Definição desatualizada — abra para conferir";
    }
    return {
      id: linha.id,
      nome: linha.nome,
      assuntoSlug: linha.assuntoSlug,
      assuntoRotulo: assuntoPorSlug(linha.assuntoSlug)?.rotulo ?? linha.assuntoSlug,
      resumo,
      visibilidade: linha.visibilidade,
      meu: linha.autorId === ator.id,
      autorNome: linha.autor.nome,
      atualizadoEm: linha.atualizadoEm,
    };
  };

  const todos = linhas.map(converter);
  return {
    meus: todos.filter((relatorio) => relatorio.meu),
    doTime: todos.filter((relatorio) => !relatorio.meu),
  };
}

/**
 * Abre um relatório salvo — e é aqui que a metade que importa da RN76
 * acontece.
 *
 * A permissão conferida é a de **quem abre**. O autor não entra na conta em
 * momento nenhum: o que ele podia ver quando salvou é irrelevante para o que
 * esta pessoa pode ver agora.
 */
export async function abrirRelatorio(
  ator: Ator,
  id: string,
): Promise<{ id: string; nome: string; definicao: DefinicaoRelatorio; meu: boolean }> {
  const relatorio = await prisma.relatorioSalvo.findUnique({ where: { id } });
  if (!relatorio) {
    throw new ErroDeValidacao(["Relatório não encontrado."]);
  }
  if (relatorio.visibilidade === "PRIVADO" && relatorio.autorId !== ator.id) {
    // A mesma mensagem de "não existe", de propósito: distinguir os dois
    // casos revelaria, para quem tentasse identificadores, quais existem.
    throw new ErroDeValidacao(["Relatório não encontrado."]);
  }

  const definicao = validarEstruturaDefinicao(relatorio.definicao);
  exigirAssuntoAlcancavel(ator, definicao.assunto);

  return {
    id: relatorio.id,
    nome: relatorio.nome,
    definicao,
    meu: relatorio.autorId === ator.id,
  };
}
