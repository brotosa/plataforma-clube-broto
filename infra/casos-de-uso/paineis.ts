// `Prisma` como VALOR, e não `import type`: `Prisma.DbNull` é o único jeito
// de gravar SQL NULL em coluna JSONB anulável — `null` ali é o literal JSON
// `null`, que voltaria da leitura como valor presente.
import { Prisma } from "@prisma/client";
import type { VisibilidadeRelatorio } from "@prisma/client";

import { prisma } from "@/infra/prisma/cliente";
import { criarGravadorPrisma } from "@/infra/auditoria/gravador-prisma";
import { registrarMutacao } from "@/dominio/auditoria/servico-auditoria";
import { ErroDeAutorizacao, exigirPermissao } from "@/dominio/autorizacao/permissoes";
import { assuntoPorSlug } from "@/dominio/relatorios/catalogo";
import { resumirDefinicao } from "@/dominio/relatorios/compilador";
import {
  type EixoDoPainel,
  type FiltroDoPainel,
  aplicarFiltroDoPainel,
  validarFiltroDoPainel,
} from "@/dominio/relatorios/eixos";
import {
  type Movimento,
  acrescentarBloco,
  alternarLargura,
  moverBloco,
  removerBloco,
} from "@/dominio/relatorios/edicao-painel";
import {
  type BlocoDoPainel,
  validarBlocos,
  validarPainelParaGravar,
} from "@/dominio/relatorios/painel";
import type { TabelaPivotada } from "@/dominio/relatorios/pivo";
import type { Visualizacao } from "@/dominio/relatorios/visualizacao";
import { executarRelatorio } from "./relatorios";
import { type Ator, ErroDeValidacao } from "./contexto";

/**
 * Casos de uso do Painel (Onda 18, ficha §3).
 *
 * ## O painel COMPÕE; ele não consulta (RN86)
 *
 * Não há consulta própria aqui. Cada bloco chama `executarRelatorio`, que é
 * o mesmo caminho da T36 — com a mesma conferência de permissão (RN76), a
 * mesma exigência de finalidade (RN78), o mesmo teto (RN79) e a mesma
 * trilha. O painel não soma bloco com bloco e não deriva nada de dois
 * blocos juntos.
 *
 * ## E ele não é o Dashboard
 *
 * A T26 é institucional, e cada indicador dela vem de ficha validada
 * (RN50). O painel é de quem o montou e só recompõe o que a pessoa já podia
 * executar. Não há como pôr num bloco um número que não seja resultado de um
 * relatório do catálogo, e é assim de propósito.
 */

const ENTIDADE = "Painel";

function estadoAuditavel(painel: {
  nome: string;
  visibilidade: VisibilidadeRelatorio;
  blocos: unknown;
}) {
  return {
    nome: painel.nome,
    visibilidade: painel.visibilidade,
    // Os blocos inteiros, e não a contagem: é a definição de cada um que diz
    // o que aquele painel dava a ver, e é isso que alguém vai querer
    // reconstituir depois.
    blocos: JSON.stringify(painel.blocos),
  };
}

// ---------------------------------------------------------------------
// Galeria
// ---------------------------------------------------------------------

export interface PainelDaGaleria {
  id: string;
  nome: string;
  quantosBlocos: number;
  visibilidade: VisibilidadeRelatorio;
  meu: boolean;
  atualizadoEm: Date;
}

export async function listarPaineis(ator: Ator): Promise<ReadonlyArray<PainelDaGaleria>> {
  const linhas = await prisma.painel.findMany({
    where: { OR: [{ autorId: ator.id }, { visibilidade: "TIME" }] },
    orderBy: { atualizadoEm: "desc" },
    select: {
      id: true,
      nome: true,
      blocos: true,
      visibilidade: true,
      autorId: true,
      atualizadoEm: true,
    },
  });

  return linhas.map((linha) => ({
    id: linha.id,
    nome: linha.nome,
    // Conta os blocos LIDOS, não o comprimento cru do JSONB: bloco que não
    // abre mais não deve aparecer na contagem da galeria como se abrisse.
    quantosBlocos: validarBlocos(linha.blocos).filter((item) => item.ok).length,
    visibilidade: linha.visibilidade,
    meu: linha.autorId === ator.id,
    atualizadoEm: linha.atualizadoEm,
  }));
}

// ---------------------------------------------------------------------
// Gravar
// ---------------------------------------------------------------------

export interface DadosDoPainel {
  nome: string;
  blocos: unknown;
  visibilidade?: VisibilidadeRelatorio;
}

export async function salvarPainel(ator: Ator, dados: DadosDoPainel): Promise<{ id: string }> {
  const validado = validarPainelParaGravar(dados);

  /*
   * A permissão de QUEM GRAVA, sobre cada bloco.
   *
   * Sem isto, alguém montaria um painel com bloco de assunto que não alcança
   * e o compartilharia com o time: a leitura continuaria protegida pela
   * RN76, mas o painel viraria um jeito de descobrir QUE ASSUNTOS EXISTEM
   * fora do próprio alcance — e a RN76 esconde o assunto justamente para
   * não ensinar que há lugares proibidos.
   */
  for (const bloco of validado.blocos) {
    exigirAlcance(ator, bloco);
  }

  const criado = await prisma.$transaction(async (tx) => {
    const painel = await tx.painel.create({
      data: {
        nome: validado.nome,
        blocos: validado.blocos as unknown as Prisma.InputJsonValue,
        autorId: ator.id,
        visibilidade: dados.visibilidade ?? "PRIVADO",
      },
    });
    await registrarMutacao(criarGravadorPrisma(tx), {
      entidade: ENTIDADE,
      entidadeId: painel.id,
      autorId: ator.id,
      anterior: null,
      novo: estadoAuditavel(painel),
    });
    return painel;
  });

  return { id: criado.id };
}

// ---------------------------------------------------------------------
// Editar — RN94 (F35)
// ---------------------------------------------------------------------

export interface MudancasDoPainel {
  nome?: string;
  visibilidade?: VisibilidadeRelatorio;
  blocos?: unknown;
  /** `null` limpa o filtro; ausente o mantém. */
  filtro?: unknown;
  /**
   * O `atualizadoEm` que a tela tinha ao desenhar os botões.
   *
   * **Concorrência otimista, e ela não é zelo excessivo.** Os atos são por
   * ÍNDICE, e índice é frágil: com a mesma pessoa editando o painel em duas
   * abas, "descer o bloco 2" da aba velha moveria outro bloco — e nada na
   * tela denunciaria, porque a operação teria sucesso. A recusa nomeada é o
   * que transforma corrupção silenciosa em "recarregue a tela".
   */
  versao?: string;
}

/**
 * RN94 — o painel se edita, e quem edita é quem o montou.
 *
 * ## Por que a edição é do autor, mesmo num painel Do time
 *
 * É a mesma decisão que `apagarPainel` e `apagarRelatorio` já tomaram, e pelo
 * mesmo motivo: o painel é a pergunta de uma pessoa. Um painel do time que
 * mudasse de forma sob os pés de quem o abre produziria a volta na
 * segunda-feira com outro painel e nada na tela explicando.
 *
 * **Fechado até haver pedido, e não aberto até haver objeção** — liberar a
 * edição compartilhada depois não custa nada a ninguém; recuar depois de
 * liberar seria retirar algo já em uso. Mesmo raciocínio da RN93.
 *
 * ## O alcance é reconferido a CADA gravação
 *
 * Não só na criação. Sem isso bastaria montar o painel enquanto se tinha o
 * papel e editá-lo depois de perdê-lo: a leitura continuaria protegida pela
 * RN76, mas o painel viraria um jeito de descobrir **que assuntos existem**
 * fora do próprio alcance — que é justamente o que a RN76 esconde.
 */
export async function atualizarPainel(
  ator: Ator,
  id: string,
  mudancas: MudancasDoPainel,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const atual = await tx.painel.findUnique({ where: { id } });
    if (!atual) throw new ErroDeValidacao(["Painel não encontrado."]);
    if (atual.autorId !== ator.id) {
      throw new ErroDeValidacao(["Só quem criou o painel pode editá-lo."]);
    }
    if (mudancas.versao && mudancas.versao !== atual.atualizadoEm.toISOString()) {
      throw new ErroDeValidacao([
        "O painel mudou desde que esta tela foi aberta. Recarregue para ver o estado atual.",
      ]);
    }

    /*
     * Valida SEMPRE o painel inteiro, e não só o que mudou.
     *
     * Trocar o nome de um painel cujo bloco aponta para assunto que saiu do
     * catálogo tem de falhar dizendo isso — validar só o campo tocado
     * gravaria por cima de um painel que não abre, e a pessoa descobriria ao
     * reabrir.
     */
    const validado = validarPainelParaGravar(
      {
        nome: mudancas.nome ?? atual.nome,
        blocos: mudancas.blocos ?? atual.blocos,
      },
      // RN94 — na edição o painel pode ficar sem bloco.
      { permitirVazio: true },
    );

    for (const bloco of validado.blocos) {
      exigirAlcance(ator, bloco);
    }

    const filtro =
      mudancas.filtro === undefined ? atual.filtro : validarFiltroDoPainel(mudancas.filtro);

    const novo = await tx.painel.update({
      where: { id },
      data: {
        nome: validado.nome,
        blocos: validado.blocos as unknown as Prisma.InputJsonValue,
        ...(mudancas.visibilidade ? { visibilidade: mudancas.visibilidade } : {}),
        // `Prisma.DbNull` e não `null`: em coluna JSONB anulável, `null` é o
        // literal JSON `null`, que voltaria da leitura como valor presente.
        filtro: filtro === null ? Prisma.DbNull : (filtro as unknown as Prisma.InputJsonValue),
      },
    });

    await registrarMutacao(criarGravadorPrisma(tx), {
      entidade: ENTIDADE,
      entidadeId: id,
      autorId: ator.id,
      anterior: estadoAuditavel(atual),
      novo: estadoAuditavel(novo),
    });
  });
}

/**
 * Acrescenta um bloco a um painel existente — o destino do "Pôr no painel".
 *
 * Passa pelo **mesmo** `atualizarPainel`, e não por um caminho próprio: a
 * conferência de autoria, o alcance por bloco e a trilha são os mesmos, e
 * uma segunda porta para gravar bloco divergiria da primeira na correção
 * seguinte. O teto de 12 é cobrado por `acrescentarBloco`, que nomeia o
 * número (RN55).
 */
export async function acrescentarAoPainel(
  ator: Ator,
  painelId: string,
  bloco: unknown,
): Promise<void> {
  const atual = await prisma.painel.findUnique({ where: { id: painelId } });
  if (!atual) throw new ErroDeValidacao(["Painel não encontrado."]);
  if (atual.autorId !== ator.id) {
    throw new ErroDeValidacao(["Só quem criou o painel pode acrescentar blocos a ele."]);
  }

  /*
   * Os blocos que JÁ estão lá passam pela leitura tolerante, e os que não
   * abrem mais são preservados como estão: acrescentar um bloco não é
   * momento de descartar em silêncio o que alguém montou. Quem decide o que
   * fazer com bloco quebrado é a tela de edição, onde ele aparece nomeado.
   */
  const existentes = Array.isArray(atual.blocos) ? atual.blocos : [];
  const novoBloco = validarPainelParaGravar({ nome: atual.nome, blocos: [bloco] }).blocos[0]!;

  const resultado = acrescentarBloco(
    existentes as unknown as ReadonlyArray<BlocoDoPainel>,
    novoBloco,
  );
  if (!resultado.pode) throw new ErroDeValidacao([resultado.motivo]);

  await atualizarPainel(ator, painelId, { blocos: resultado.blocos });
}

/**
 * Os atos de edição por bloco, que a tela dispara um a um.
 *
 * **O cliente manda o índice e a versão; nunca os blocos.** Os blocos vêm do
 * banco, e a decisão é da função de domínio. Se a tela mandasse a lista
 * inteira, gravar viraria "aceite o que o cliente diz que o painel é" — e o
 * cliente é entrada não confiável.
 */
export type AtoDeEdicao =
  | { tipo: "MOVER"; indice: number; movimento: Movimento }
  | { tipo: "REMOVER"; indice: number }
  | { tipo: "LARGURA"; indice: number };

export async function aplicarAtoDeEdicao(
  ator: Ator,
  painelId: string,
  ato: AtoDeEdicao,
  /** O `atualizadoEm` que a tela tinha ao desenhar os botões. */
  versaoDaTela: string,
): Promise<void> {
  const atual = await prisma.painel.findUnique({ where: { id: painelId } });
  if (!atual) throw new ErroDeValidacao(["Painel não encontrado."]);
  if (atual.autorId !== ator.id) {
    throw new ErroDeValidacao(["Só quem criou o painel pode editá-lo."]);
  }

  /*
   * A versão é conferida ANTES de aplicar o índice, e não só ao gravar.
   *
   * A conferência de gravação pega mudança entre a leitura e a escrita —
   * uma janela de milissegundos. Esta pega a que importa: o índice foi
   * escolhido contra o que a PESSOA viu, e se o painel mudou desde então
   * (outra aba, outro dispositivo), "descer o bloco 2" desce outro bloco,
   * com sucesso e sem nada denunciando.
   */
  if (versaoDaTela !== atual.atualizadoEm.toISOString()) {
    throw new ErroDeValidacao([
      "O painel mudou desde que esta tela foi aberta. Recarregue para ver o estado atual.",
    ]);
  }

  const blocos = validarBlocos(atual.blocos).flatMap((item) => (item.ok ? [item.bloco] : []));
  const resultado =
    ato.tipo === "MOVER"
      ? moverBloco(blocos, ato.indice, ato.movimento)
      : ato.tipo === "REMOVER"
        ? removerBloco(blocos, ato.indice)
        : alternarLargura(blocos, ato.indice);

  if (!resultado.pode) throw new ErroDeValidacao([resultado.motivo]);

  await atualizarPainel(ator, painelId, {
    blocos: resultado.blocos,
    versao: versaoDaTela,
  });
}

/** Os painéis que este ator pode editar — o destino oferecido pelo "Pôr no painel". */
export async function listarPaineisEditaveis(
  ator: Ator,
): Promise<ReadonlyArray<{ id: string; nome: string; quantosBlocos: number }>> {
  const linhas = await prisma.painel.findMany({
    // Só os DELE. Oferecer um painel do time de outra pessoa como destino,
    // para depois recusar a gravação, é pior que não oferecer.
    where: { autorId: ator.id },
    orderBy: { atualizadoEm: "desc" },
    select: { id: true, nome: true, blocos: true },
  });
  return linhas.map((linha) => ({
    id: linha.id,
    nome: linha.nome,
    quantosBlocos: validarBlocos(linha.blocos).filter((item) => item.ok).length,
  }));
}

export async function apagarPainel(ator: Ator, id: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const atual = await tx.painel.findUnique({ where: { id } });
    if (!atual) throw new ErroDeValidacao(["Painel não encontrado."]);
    /*
     * Apagar é do AUTOR, e só dele — inclusive para quem tem acesso total.
     * É a mesma decisão do relatório salvo: o painel é a pergunta de uma
     * pessoa, e apagá-lo por outra produziria a situação em que alguém abre
     * a galeria e o painel sumiu, sem nada na tela explicando.
     */
    if (atual.autorId !== ator.id) {
      throw new ErroDeValidacao(["Só quem criou o painel pode apagá-lo."]);
    }
    /*
     * Evento de ATO, escrito à mão, e não diff de campos — o mesmo caminho
     * que `apagarRelatorio` já usa, e pelo mesmo motivo: `registrarMutacao`
     * compara dois estados, e exclusão não tem estado novo com que comparar,
     * então o diff sairia vazio e o ato ficaria invisível na T28.
     *
     * A trilha vai ANTES do delete, porque depois não haveria de onde ler o
     * estado anterior. As execuções sobrevivem por `ON DELETE SET NULL`:
     * apagar o painel não apaga o registro do que foi consultado por ele.
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
    await tx.painel.delete({ where: { id } });
  });
}

// ---------------------------------------------------------------------
// Abrir e executar — RN87, RN88
// ---------------------------------------------------------------------

/**
 * O estado de um bloco na abertura do painel.
 *
 * Quatro, e cada um existe por um motivo distinto — juntá-los num
 * "indisponível" genérico esconderia justamente o que a pessoa precisa saber
 * para agir.
 */
export type BlocoDoPainelLido =
  /** Carregado, com dado. */
  | { estado: "PRONTO"; titulo: string; largura: string; visualizacao: Visualizacao; tabela: TabelaPivotada; resumo: string; truncado: boolean; naoAplicados: ReadonlyArray<EixoDoPainel> }
  /** RN87 — quem abre não alcança o assunto. Os demais blocos seguem. */
  | { estado: "SEM_ALCANCE"; titulo: string; largura: string; motivo: string }
  /** RN88 — alcança dado pessoal: espera a finalidade, por bloco. */
  | { estado: "AGUARDA_FINALIDADE"; titulo: string; largura: string; assunto: string; naoAplicados: ReadonlyArray<EixoDoPainel> }
  /** O bloco não pôde ser lido ou executado; a causa vem nomeada (RN55). */
  | { estado: "FALHOU"; titulo: string; largura: string; motivo: string };

export interface PainelAberto {
  id: string;
  nome: string;
  /** RN89 — o filtro vigente, para a tela exibi-lo. */
  filtro: FiltroDoPainel | null;
  visibilidade: VisibilidadeRelatorio;
  meu: boolean;
  /**
   * O `atualizadoEm` em ISO — a versão que a tela devolve em cada ato de
   * edição (RN94). Sai daqui e não de uma segunda consulta para que seja
   * exatamente o estado que a pessoa está vendo.
   */
  versao: string;
  blocos: ReadonlyArray<BlocoDoPainelLido>;
}

function exigirAlcance(ator: Ator, bloco: BlocoDoPainel): void {
  const assunto = assuntoPorSlug(bloco.definicao.assunto);
  if (!assunto) {
    throw new ErroDeValidacao([
      `O assunto "${bloco.definicao.assunto}" não existe mais no catálogo.`,
    ]);
  }
  // `exigirPermissao` lança `ErroDeAutorizacao`, que a interface já sabe
  // traduzir (RN55). Não se inventa mensagem nova aqui.
  exigirPermissao(ator.papel, assunto.permissao);
}

/**
 * Abre o painel e devolve o **estado** de cada bloco, sem executar nenhum.
 *
 * A execução é de `executarBlocoDoPainel`, um bloco por vez, e essa separação
 * é o que permite a tela carregar cada bloco por conta própria — oito blocos
 * não podem fazer a página esperar pelo mais lento.
 */
export async function abrirPainel(ator: Ator, id: string): Promise<PainelAberto> {
  const painel = await prisma.painel.findUnique({ where: { id } });
  if (!painel) throw new ErroDeValidacao(["Painel não encontrado."]);
  if (painel.visibilidade === "PRIVADO" && painel.autorId !== ator.id) {
    // A mesma mensagem de "não existe", de propósito: distinguir os dois
    // casos revelaria, para quem tentasse identificadores, quais existem.
    throw new ErroDeValidacao(["Painel não encontrado."]);
  }

  const lidos = validarBlocos(painel.blocos);
  const filtro = validarFiltroDoPainel(painel.filtro);

  return {
    id: painel.id,
    nome: painel.nome,
    filtro,
    visibilidade: painel.visibilidade,
    meu: painel.autorId === ator.id,
    versao: painel.atualizadoEm.toISOString(),
    blocos: lidos.map((item) => {
      if (item.ok === false) {
        return { estado: "FALHOU", titulo: item.titulo, largura: "METADE", motivo: item.motivo };
      }

      const bloco = item.bloco;
      const assunto = assuntoPorSlug(bloco.definicao.assunto);
      if (!assunto) {
        return {
          estado: "FALHOU",
          titulo: bloco.titulo,
          largura: bloco.largura,
          motivo: "O assunto deste bloco não existe mais no catálogo.",
        };
      }

      /*
       * RN87 — a conferência é de QUEM ABRE, nunca de quem montou, e é POR
       * BLOCO. O painel não é escondido e não falha inteiro: esconder
       * ensinaria que ele não existe, e falhar inteiro tiraria de quem abre
       * os blocos que ele legitimamente alcança.
       */
      try {
        exigirAlcance(ator, bloco);
      } catch (erro) {
        return {
          estado: "SEM_ALCANCE",
          titulo: bloco.titulo,
          largura: bloco.largura,
          motivo:
            erro instanceof ErroDeAutorizacao
              ? "Seu papel não alcança o assunto deste bloco."
              : "Este bloco não pôde ser aberto.",
        };
      }

      /*
       * RN88 — bloco de dado pessoal NÃO carrega sozinho.
       *
       * É o ponto onde o painel destruiria a RN78 sem que ninguém percebesse.
       * A finalidade existe para atar o acesso a dado pessoal a um ato
       * deliberado, registrado; pedi-la uma vez na porta do painel a
       * transformaria em cerimônia de entrada, repetida sem leitura toda
       * manhã. E num painel compartilhado, quem abre estaria declarando
       * finalidade para a pergunta de outra pessoa.
       */
      /*
       * RN89 — quais eixos do filtro este assunto NÃO comporta.
       *
       * Calculado na abertura e não na execução, de propósito: o bloco que
       * aguarda finalidade também precisa avisar, e ele pode nunca executar.
       * Um aviso que só aparecesse depois de carregar seria o pior momento
       * possível — a pessoa já teria lido o número.
       */
      const { naoAplicados } = aplicarFiltroDoPainel(bloco.definicao, assunto, filtro);

      if (assunto.contemDadoPessoal) {
        return {
          estado: "AGUARDA_FINALIDADE",
          titulo: bloco.titulo,
          largura: bloco.largura,
          assunto: assunto.rotulo,
          naoAplicados,
        };
      }

      return {
        estado: "PRONTO",
        titulo: bloco.titulo,
        largura: bloco.largura,
        visualizacao: bloco.visualizacao,
        // Vazio aqui: quem executa é `executarBlocoDoPainel`. Este caminho
        // só diz QUE o bloco pode carregar.
        tabela: { dimensoes: [], medidas: [], linhas: [] } as unknown as TabelaPivotada,
        resumo: resumirDefinicao(bloco.definicao),
        truncado: false,
        naoAplicados,
      };
    }),
  };
}

/**
 * Executa **um** bloco.
 *
 * Um por vez, e não todos de uma vez, para que a tela carregue cada um por
 * conta própria: oito blocos não podem fazer a página esperar pelo mais
 * lento. E porque a finalidade da RN88 chega bloco a bloco, quando chega.
 */
export async function executarBlocoDoPainel(
  ator: Ator,
  painelId: string,
  indice: number,
  finalidade?: string,
) {
  const painel = await prisma.painel.findUnique({ where: { id: painelId } });
  if (!painel) throw new ErroDeValidacao(["Painel não encontrado."]);
  if (painel.visibilidade === "PRIVADO" && painel.autorId !== ator.id) {
    throw new ErroDeValidacao(["Painel não encontrado."]);
  }

  const lidos = validarBlocos(painel.blocos);
  const item = lidos[indice];
  if (!item || item.ok === false) {
    throw new ErroDeValidacao(["Bloco não encontrado neste painel."]);
  }

  const assunto = assuntoPorSlug(item.bloco.definicao.assunto);
  if (!assunto) {
    throw new ErroDeValidacao(["O assunto deste bloco não existe mais no catálogo."]);
  }

  /*
   * RN89 — o filtro do painel entra AQUI, acrescentando à definição do bloco.
   *
   * E o que sai daqui volta a passar por `executarRelatorio`: a permissão, a
   * finalidade, o teto e a trilha continuam sendo dele. O filtro estreita a
   * pergunta; ele não abre caminho novo até o dado (RN86).
   */
  const { definicao } = aplicarFiltroDoPainel(
    item.bloco.definicao,
    assunto,
    validarFiltroDoPainel(painel.filtro),
  );

  return executarRelatorio(ator, definicao, { finalidade, painelId });
}
