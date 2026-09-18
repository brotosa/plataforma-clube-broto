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
import {
  type FormatoDeSaida,
  type Procedencia,
  TETO_POR_FORMATO,
  descreverFiltros,
  nomeDoArquivo,
} from "@/dominio/relatorios/saida";
import { type Visualizacao, validarVisualizacao } from "@/dominio/relatorios/visualizacao";
import { executarConsultaDeDetalhe, executarConsultaDeRelatorio } from "@/infra/consultas/relatorios";
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
  /** Marca a execução como saída de dado na trilha operacional. */
  exportacao?: boolean;
  /**
   * RN84 — **como** o dado saiu.
   *
   * `exportacao` responde "saiu da plataforma?" e continua sendo a pergunta
   * de auditoria; esta responde "saiu como?". As duas convivem de propósito:
   * estreitar a primeira para caber num enum trocaria um dado bom por um
   * mais bonito, e quebraria a leitura de tudo que foi gravado antes desta
   * fase — onde `exportou = true` com formato nulo significa CSV, que era o
   * único que havia.
   */
  formato?: FormatoDeSaida;
  /**
   * RN86 — de qual painel veio esta execução.
   *
   * Sem isto, abrir um painel de oito blocos aparece na trilha como oito
   * consultas soltas no mesmo segundo, e quem for reconstituir um acesso não
   * consegue distinguir isso de alguém varrendo a plataforma à mão.
   */
  painelId?: string;
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
  formato?: FormatoDeSaida;
  painelId?: string;
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
        formato: dados.formato ?? null,
        painelId: dados.painelId ?? null,
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
      formato: opcoes.formato,
      painelId: opcoes.painelId,
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
    painelId: opcoes.painelId,
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
 * RN83 — a saída, em qualquer formato.
 *
 * **Não é atalho para nada**, e esta é a metade da RN83 que vive aqui: todo
 * formato passa pelo mesmo `executarRelatorio`, com a mesma conferência de
 * permissão (RN76), a mesma exigência de finalidade (RN78) e a mesma trilha.
 * O que muda entre um formato e outro é o **teto** e o **renderizador** —
 * nada mais.
 *
 * O defeito que o desenho existe para impedir tem nome: uma rota de XLSX que
 * monte a própria consulta "porque a planilha precisa de todas as linhas".
 * No dia em que isso acontecer, o alcance por papel deixa de valer para quem
 * souber pedir em `.xlsx`.
 *
 * Devolve a tabela e a procedência; **quem transforma em bytes é o chamador**,
 * e de propósito: o XLSX é assíncrono e o HTML precisa do SVG que só a tela
 * tem. Empurrar os dois para dentro daqui traria a renderização para o caso
 * de uso, que é o oposto do que a RN83 pede.
 */
export interface SaidaDeRelatorio {
  tabela: TabelaPivotada;
  procedencia: Procedencia;
  titulo: string;
  nomeArquivo: string;
  linhas: number;
  truncado: boolean;
}

export async function prepararSaidaDeRelatorio(
  ator: Ator,
  definicaoBruta: unknown,
  formato: FormatoDeSaida,
  opcoes: Omit<OpcoesDeExecucao, "exportacao" | "teto" | "formato"> & {
    /** Nome de quem gerou, para a procedência do arquivo. */
    autor: string;
    /** Nome do relatório salvo, quando a saída veio de um. */
    nome?: string;
  },
): Promise<SaidaDeRelatorio> {
  const resultado = await executarRelatorio(ator, definicaoBruta, {
    relatorioId: opcoes.relatorioId,
    finalidade: opcoes.finalidade,
    exportacao: true,
    formato,
    teto: TETO_POR_FORMATO[formato],
  });

  const definicao = validarEstruturaDefinicao(definicaoBruta);
  const titulo = opcoes.nome?.trim() || resultado.resumo;

  return {
    tabela: resultado.tabela,
    titulo,
    nomeArquivo: nomeDoArquivo(definicao, EXTENSAO_POR_FORMATO[formato]),
    linhas: resultado.total,
    truncado: resultado.truncado,
    procedencia: {
      assunto: resultado.resumo,
      filtros: descreverFiltros(definicao),
      autor: opcoes.autor,
      geradoEm: new Date(),
      finalidade: opcoes.finalidade?.trim() || undefined,
      linhas: resultado.total,
      truncado: resultado.truncado,
      teto: TETO_POR_FORMATO[formato],
    },
  };
}

const EXTENSAO_POR_FORMATO: Readonly<Record<FormatoDeSaida, string>> = {
  CSV: "csv",
  XLSX: "xlsx",
  HTML: "html",
  AREA_TRANSFERENCIA: "txt",
};

/**
 * Exportação em CSV — o caminho que existe desde a F24.
 *
 * Passou a ser um caso particular de `prepararSaidaDeRelatorio`, e continua
 * exportado com a mesma assinatura porque a rota e os testes que o chamam não
 * têm razão para mudar. O CSV não carrega procedência por dentro: ele é o
 * formato de **máquina**, e uma linha de aviso no topo quebraria quem o
 * consome (RN85).
 */
export async function exportarRelatorioCsv(
  ator: Ator,
  definicaoBruta: unknown,
  opcoes: Omit<OpcoesDeExecucao, "exportacao" | "teto" | "formato"> = {},
): Promise<{ csv: string; nomeArquivo: string; linhas: number; truncado: boolean }> {
  const saida = await prepararSaidaDeRelatorio(ator, definicaoBruta, "CSV", {
    ...opcoes,
    autor: ator.id,
  });

  return {
    csv: tabelaParaCsv(saida.tabela),
    nomeArquivo: saida.nomeArquivo,
    linhas: saida.linhas,
    truncado: saida.truncado,
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

  /*
   * O que se GUARDA é maior do que o que se COMPILA, e a diferença é o ponto.
   *
   * `validarEstruturaDefinicao` reconstrói o objeto só com as chaves que o
   * compilador conhece — é o que impede chave estranha de chegar ao SQL, e
   * por isso ela não deve aprender sobre visualização. O efeito colateral,
   * quando a F27 acrescentou o bloco, foi o desenho escolhido ser descartado
   * em silêncio no salvamento: a tela mostrava barras, o banco guardava a
   * definição sem elas, e a reabertura voltava em tabela sem nada explicando.
   *
   * A visualização é, portanto, validada à parte (`validarVisualizacao`, que
   * também recorta o que não pertence ao tipo) e anexada só na hora de gravar.
   * Quem compila continua recebendo apenas a definição estreita.
   */
  const visualizacao = validarVisualizacao(
    (dados.definicao as { visualizacao?: unknown } | null)?.visualizacao,
  );
  const definicaoGuardada = { ...definicao, visualizacao };

  const criado = await prisma.$transaction(async (tx) => {
    const relatorio = await tx.relatorioSalvo.create({
      data: {
        nome,
        assuntoSlug: definicao.assunto,
        definicao: definicaoGuardada as unknown as Prisma.InputJsonValue,
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
): Promise<{
  id: string;
  nome: string;
  definicao: DefinicaoRelatorio;
  /**
   * RN80 — o desenho escolhido, que viaja no MESMO JSONB da definição.
   *
   * Ele é lido aqui, e não em `validarEstruturaDefinicao`, para não criar
   * ciclo de módulo: `visualizacao` importa `pivo`, que importa `compilador`.
   * O compilador não precisa saber que existe gráfico — ele monta SQL, e
   * desenho não muda uma vírgula de SQL.
   *
   * Relatório salvo antes da Onda 17 não tem o bloco e recebe o padrão
   * (tabela), sem migração de dados e sem backfill.
   */
  visualizacao: Visualizacao;
  meu: boolean;
}> {
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

  const bruto = relatorio.definicao as { visualizacao?: unknown } | null;
  return {
    id: relatorio.id,
    nome: relatorio.nome,
    definicao,
    visualizacao: validarVisualizacao(bruto?.visualizacao),
    meu: relatorio.autorId === ator.id,
  };
}

// ---------------------------------------------------------------------
// RN93 — ver as linhas por trás
// ---------------------------------------------------------------------

/**
 * Assuntos cujo detalhe abre em **gente com nome**, e por isso não abre.
 *
 * `[A CONFIRMAR — Superintendência/jurídico]`, pendência 2 da ficha da Onda
 * 19. No agregado a pessoa é uma unidade dentro de um número; no detalhe, é
 * uma linha identificável — e isso é uma escalada de acesso, não um recorte
 * mais fino do mesmo acesso.
 *
 * **Fechado até haver resposta, e não aberto até haver objeção.** Recuar
 * depois de liberar seria retirar algo já em uso; liberar depois de recusar
 * não custa nada a ninguém. A lista é derivada de `contemDadoPessoal`, e não
 * escrita à mão: assunto sensível novo entra fechado sem que ninguém precise
 * lembrar de acrescentá-lo aqui.
 */
export function detalheEstaDisponivel(assunto: AssuntoRelatorio): { pode: boolean; motivo?: string } {
  if (assunto.contemDadoPessoal) {
    return {
      pode: false,
      motivo:
        `"${assunto.rotulo}" alcança dado pessoal, e as linhas por trás do número seriam pessoas ` +
        `identificáveis. Abrir o detalhe deste assunto depende de decisão da Superintendência, ` +
        `que está registrada como pendência na ficha da Onda 19.`,
    };
  }
  return { pode: true };
}

export interface ResultadoDoDetalheDoRelatorio {
  tabela: TabelaPivotada;
  /** Linhas devolvidas (já cortadas no teto). */
  total: number;
  truncado: boolean;
  teto: number;
  duracaoMs: number;
  resumo: string;
  /** Linhas que o recorte tem no banco, sem teto. */
  linhasNoBanco: number;
  /** Registros do assunto que essas linhas representam. */
  registros: number;
  /**
   * As duas contagens divergem?
   *
   * Quando sim, a tela **tem** de dizer — é a RN93(a). Calcular aqui, e não
   * na tela, evita que duas telas cheguem a conclusões diferentes sobre o
   * mesmo par de números.
   */
  linhasRepetemRegistros: boolean;
}

/**
 * Executa o detalhe de um recorte (RN93).
 *
 * Três garantias, e nenhuma é herdada do agregado:
 *
 * 1. **Alcance por papel (RN76)** — a mesma conferência, pelo mesmo caminho.
 * 2. **Finalidade (RN78) não se herda.** Hoje o ponto é teórico, porque os
 *    dois assuntos com dado pessoal estão fechados; mas a exigência fica
 *    escrita e testada para o dia em que abrirem, e não como emenda posterior.
 * 3. **Evento próprio na trilha.** Não é nota de rodapé da execução que o
 *    originou: quem investiga precisa ver que alguém abriu os registros, e
 *    não só que alguém viu um agregado.
 */
export async function executarDetalheDoRelatorio(
  ator: Ator,
  definicaoBruta: unknown,
  opcoes: { finalidade?: string; teto?: number } = {},
): Promise<ResultadoDoDetalheDoRelatorio> {
  const definicao = validarEstruturaDefinicao(definicaoBruta);
  const assunto = exigirAssuntoAlcancavel(ator, definicao.assunto);

  const disponivel = detalheEstaDisponivel(assunto);
  if (!disponivel.pode) {
    throw new ErroDeValidacao([disponivel.motivo!]);
  }

  if (assunto.contemDadoPessoal && !opcoes.finalidade?.trim()) {
    // Inalcançável hoje (o assunto já teria sido recusado acima), e escrito
    // assim de propósito: se a pendência for respondida abrindo o detalhe, a
    // exigência de finalidade já está no lugar, e não vira emenda esquecida.
    throw new ErroDeValidacao([
      `O assunto "${assunto.rotulo}" alcança dado pessoal. Declare a finalidade antes de abrir o detalhe.`,
    ]);
  }

  let resultado;
  try {
    resultado = await executarConsultaDeDetalhe(definicao, { teto: opcoes.teto });
  } catch (erro) {
    await registrarExecucao({
      ator,
      definicao,
      linhas: 0,
      truncado: false,
      duracaoMs: 0,
      finalidade: opcoes.finalidade,
      erro:
        erro instanceof ErroDeRelatorioInvalido || erro instanceof ErroDeValidacao
          ? erro.message
          : "falha ao abrir o detalhe",
      exportou: false,
    });
    throw erro;
  }

  await registrarExecucao({
    ator,
    definicao,
    linhas: resultado.linhas.length,
    truncado: resultado.truncado,
    duracaoMs: resultado.duracaoMs,
    finalidade: opcoes.finalidade,
    exportou: false,
  });

  return {
    tabela: pivotar(resultado.projecao, resultado.linhas),
    total: resultado.linhas.length,
    truncado: resultado.truncado,
    teto: resultado.teto,
    duracaoMs: resultado.duracaoMs,
    resumo: resumirDefinicao(definicao),
    linhasNoBanco: resultado.linhasNoBanco,
    registros: resultado.registros,
    linhasRepetemRegistros: resultado.linhasNoBanco !== resultado.registros,
  };
}
