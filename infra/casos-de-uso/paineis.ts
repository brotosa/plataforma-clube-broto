import type { Prisma, VisibilidadeRelatorio } from "@prisma/client";

import { prisma } from "@/infra/prisma/cliente";
import { criarGravadorPrisma } from "@/infra/auditoria/gravador-prisma";
import { registrarMutacao } from "@/dominio/auditoria/servico-auditoria";
import { ErroDeAutorizacao, exigirPermissao } from "@/dominio/autorizacao/permissoes";
import { assuntoPorSlug } from "@/dominio/relatorios/catalogo";
import { resumirDefinicao } from "@/dominio/relatorios/compilador";
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
  | { estado: "PRONTO"; titulo: string; largura: string; visualizacao: Visualizacao; tabela: TabelaPivotada; resumo: string; truncado: boolean }
  /** RN87 — quem abre não alcança o assunto. Os demais blocos seguem. */
  | { estado: "SEM_ALCANCE"; titulo: string; largura: string; motivo: string }
  /** RN88 — alcança dado pessoal: espera a finalidade, por bloco. */
  | { estado: "AGUARDA_FINALIDADE"; titulo: string; largura: string; assunto: string }
  /** O bloco não pôde ser lido ou executado; a causa vem nomeada (RN55). */
  | { estado: "FALHOU"; titulo: string; largura: string; motivo: string };

export interface PainelAberto {
  id: string;
  nome: string;
  visibilidade: VisibilidadeRelatorio;
  meu: boolean;
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

  return {
    id: painel.id,
    nome: painel.nome,
    visibilidade: painel.visibilidade,
    meu: painel.autorId === ator.id,
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
      if (assunto.contemDadoPessoal) {
        return {
          estado: "AGUARDA_FINALIDADE",
          titulo: bloco.titulo,
          largura: bloco.largura,
          assunto: assunto.rotulo,
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

  // A permissão, a finalidade, o teto e a trilha são todos de
  // `executarRelatorio`. Não há atalho aqui, e é o que a RN86 exige.
  return executarRelatorio(ator, item.bloco.definicao, { finalidade, painelId });
}
