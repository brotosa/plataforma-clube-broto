import type { GrupoIndicador, PeriodoMeta, Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/infra/prisma/cliente";
import { criarGravadorPrisma } from "@/infra/auditoria/gravador-prisma";
import { registrarMutacao } from "@/dominio/auditoria/servico-auditoria";
import { exigirPermissao, podeExecutar } from "@/dominio/autorizacao/permissoes";
import {
  type ChaveValorRegra,
  definicaoDe,
  validarCoerenciaDasReguas,
  validarValorRegra,
} from "@/dominio/parametrizador/valores-regra";
import {
  familiaDe,
  totalDeUsos,
  validarInativacao,
  validarNomeDeItem,
} from "@/dominio/parametrizador/listas";
import type { FamiliaLista } from "@/dominio/parametrizador/listas";
import {
  type FamiliaSensivel,
  exigeAprovacao,
  exigeNovaVersaoDeConfiguracao,
  validarPeso,
} from "@/dominio/parametrizador/regras";
import { intervaloDoPeriodo, validarMeta } from "@/dominio/parametrizador/metas";
import { invalidarCacheDeConfiguracao } from "@/infra/configuracao/servico-configuracao";
import {
  type CamposDeItem,
  ENTIDADE_AUDITORIA,
  type NovoItem,
  atualizarItem,
  contarUsos,
  criarItem,
  listarItens,
} from "@/infra/parametrizador/familias";
import { type Ator, ErroDeValidacao } from "./contexto";

/**
 * Casos de uso do Parametrizador (F10 — T15, T16 e T17).
 *
 * Três invariantes atravessam tudo o que está aqui:
 *  RN23 — escrita só do Administrador da Plataforma, sempre auditada;
 *  RN25 — efeito prospectivo: nada aqui recalcula registro fechado, e
 *         escrita que muda o score gera nova versão de configuração;
 *  RN27 — quando a regra PARAMETRO_SENSIVEL está ligada na T7, a escrita
 *         sensível vira solicitação em vez de valer na hora.
 */

type ClienteTransacao = Prisma.TransactionClient;
type ClientePrisma = PrismaClient | ClienteTransacao;

/** Mudança sensível à espera de decisão (payload da solicitação). */
export type MudancaSensivel =
  | { familia: "COMISSAO_PADRAO" | "TETO_DO_DOSSIE"; chave: ChaveValorRegra; valor: number | null }
  | { familia: "PESO_DE_INDICADOR"; indicadorId: string; peso: number }
  | {
      familia: "META";
      periodo: PeriodoMeta;
      inicio: string;
      fim: string;
      categoriaId: string | null;
      valor: number;
    };

async function regraSensivelLigada(cliente: ClientePrisma): Promise<boolean> {
  const regra = await cliente.aprovacaoRegra.findUnique({
    where: { tipoEntidade: "PARAMETRO_SENSIVEL" },
  });
  return regra?.exigida ?? false;
}

async function abrirSolicitacaoSensivel(
  cliente: ClientePrisma,
  ator: Ator,
  entidadeId: string,
  mudanca: MudancaSensivel,
) {
  return cliente.aprovacaoSolicitacao.create({
    data: {
      tipoEntidade: "PARAMETRO_SENSIVEL",
      entidadeId,
      solicitanteId: ator.id,
      payload: mudanca as unknown as Prisma.InputJsonValue,
    },
  });
}

export interface ResultadoDeEscrita {
  /** `true` quando o valor passou a valer; `false` quando foi para a fila. */
  aplicado: boolean;
  solicitacaoId?: string;
}

// ---------------------------------------------------------------------
// Valores de regra (T17)
// ---------------------------------------------------------------------

/**
 * Grava um valor de regra com histórico (RN25) e auditoria. O histórico da
 * T17 e a trilha de auditoria são coisas diferentes de propósito: o
 * primeiro é a leitura do negócio sobre aquele valor; a segunda é a prova
 * transversal exigida pelo CLAUDE.md, e nenhuma substitui a outra.
 */
async function gravarValorDentroDaTransacao(
  tx: ClienteTransacao,
  autorId: string,
  chave: ChaveValorRegra,
  valor: number | null,
) {
  const anterior = await tx.valorRegra.findUniqueOrThrow({ where: { chave } });
  const valorAnterior = anterior.valor === null ? null : Number(anterior.valor);
  if (valorAnterior === valor) {
    return anterior;
  }

  const atualizado = await tx.valorRegra.update({ where: { chave }, data: { valor } });
  await tx.valorRegraHistorico.create({
    data: {
      valorRegraId: anterior.id,
      valorAnterior: anterior.valor,
      valorNovo: valor,
      autorId,
    },
  });
  await registrarMutacao(criarGravadorPrisma(tx), {
    entidade: "valor_regra",
    entidadeId: anterior.id,
    autorId,
    anterior: { chave: anterior.chave, valor: valorAnterior },
    novo: { chave: atualizado.chave, valor },
  });
  return atualizado;
}

/**
 * T17 — altera um valor de regra. Réguas valem na hora; comissão-padrão e
 * tetos passam pela RN27 quando a regra estiver ligada.
 */
export async function alterarValorDeRegra(
  ator: Ator,
  chave: ChaveValorRegra,
  valor: number | null,
): Promise<ResultadoDeEscrita> {
  exigirPermissao(ator.papel, "CONFIGURAR_PARAMETROS");

  const definicao = definicaoDe(chave);
  const erros = validarValorRegra(chave, valor);
  if (definicao.tipo === "DIAS" || definicao.tipo === "MESES") {
    if (valor === null) {
      erros.push(`${definicao.rotulo}: régua não pode ficar sem valor.`);
    }
  }
  if (erros.length > 0) {
    throw new ErroDeValidacao(erros);
  }

  // Coerência entre as duas pontas do envelhecimento: a régua alterada é
  // confrontada com a que já está gravada, não com a que veio na tela.
  if (
    chave === "FUNIL_ENVELHECIMENTO_LEVE_DIAS" ||
    chave === "FUNIL_ENVELHECIMENTO_FORTE_DIAS"
  ) {
    const outraChave: ChaveValorRegra =
      chave === "FUNIL_ENVELHECIMENTO_LEVE_DIAS"
        ? "FUNIL_ENVELHECIMENTO_FORTE_DIAS"
        : "FUNIL_ENVELHECIMENTO_LEVE_DIAS";
    const outra = await prisma.valorRegra.findUnique({ where: { chave: outraChave } });
    const errosDeCoerencia = validarCoerenciaDasReguas({
      [chave]: valor,
      [outraChave]: outra?.valor === null || outra === null ? null : Number(outra.valor),
    });
    if (errosDeCoerencia.length > 0) {
      throw new ErroDeValidacao(errosDeCoerencia);
    }
  }

  const familiaSensivel: FamiliaSensivel | null = !definicao.sensivel
    ? null
    : definicao.grupo === "COMISSAO"
      ? "COMISSAO_PADRAO"
      : "TETO_DO_DOSSIE";

  return prisma.$transaction(async (tx) => {
    if (exigeAprovacao(await regraSensivelLigada(tx), familiaSensivel) && familiaSensivel) {
      const linha = await tx.valorRegra.findUniqueOrThrow({ where: { chave } });
      const solicitacao = await abrirSolicitacaoSensivel(tx, ator, linha.id, {
        familia: familiaSensivel,
        chave,
        valor,
      });
      return { aplicado: false, solicitacaoId: solicitacao.id };
    }
    await gravarValorDentroDaTransacao(tx, ator.id, chave, valor);
    invalidarCacheDeConfiguracao();
    return { aplicado: true };
  });
}

// ---------------------------------------------------------------------
// Versão de configuração (RN25)
// ---------------------------------------------------------------------

/**
 * Congela indicadores, dimensões e pesos como estão AGORA. É chamada
 * depois de toda escrita que muda o que o score usa — nunca antes, para
 * que o snapshot descreva o mundo que passa a valer.
 */
export async function criarVersaoDeConfiguracao(
  tx: ClienteTransacao,
  autorId: string | null,
  motivo: string,
) {
  const indicadores = await tx.indicador.findMany({ orderBy: { ordem: "asc" } });
  const ultima = await tx.configuracaoVersao.findFirst({ orderBy: { numero: "desc" } });
  return tx.configuracaoVersao.create({
    data: {
      numero: (ultima?.numero ?? 0) + 1,
      motivo,
      autorId,
      snapshot: indicadores.map((i) => ({
        indicadorId: i.id,
        slug: i.slug,
        nome: i.nome,
        grupo: i.grupo,
        dimensao: i.dimensao,
        peso: Number(i.peso),
        ativo: i.ativo,
      })),
    },
  });
}

/** Versão vigente — é a que uma avaliação nova carimba ao ser criada. */
export async function versaoVigente(cliente: ClientePrisma) {
  return cliente.configuracaoVersao.findFirst({ orderBy: { numero: "desc" } });
}

// ---------------------------------------------------------------------
// Listas de domínio (T16)
// ---------------------------------------------------------------------

function exigirFamilia(id: string) {
  const familia = familiaDe(id);
  if (!familia) {
    throw new ErroDeValidacao([`Família de lista desconhecida: ${id}.`]);
  }
  return familia;
}

/** T16 — lista + contagem de itens; leitura liberada a todos (RN23). */
export async function lerFamilia(ator: Ator, familiaId: string) {
  exigirPermissao(ator.papel, "VISUALIZAR_PARAMETROS");
  const familia = exigirFamilia(familiaId);
  const itens = await listarItens(prisma, familia.id);
  return { familia, itens };
}

/** RN24 — as frentes de uso do item, apuradas na hora para exibir antes de inativar. */
export async function lerUsosDoItem(ator: Ator, familiaId: string, itemId: string) {
  exigirPermissao(ator.papel, "VISUALIZAR_PARAMETROS");
  const familia = exigirFamilia(familiaId);
  return contarUsos(prisma, familia.id, itemId);
}

export async function criarItemDeLista(
  ator: Ator,
  familiaId: string,
  novo: NovoItem,
): Promise<ResultadoDeEscrita> {
  exigirPermissao(ator.papel, "CONFIGURAR_PARAMETROS");
  const familia = exigirFamilia(familiaId);
  if (!familia.permiteCriar) {
    throw new ErroDeValidacao([
      `${familia.rotulo} não recebe itens novos — a lista reproduz um fato público e fechado.`,
    ]);
  }

  return prisma.$transaction(async (tx) => {
    const existentes = await listarItens(tx, familia.id);
    const erros = validarNomeDeItem(
      novo.nome,
      existentes.map((item) => item.nome),
    );
    if (familia.afetaScore) {
      if (novo.peso === undefined) {
        erros.push("Indicador novo exige peso.");
      } else {
        erros.push(...validarPeso(novo.peso));
      }
      if (!novo.grupo) {
        erros.push("Indicador novo exige o grupo (Empresa ou Produto).");
      }
      if (!novo.dimensao?.trim()) {
        erros.push("Indicador novo exige a dimensão de medição.");
      }
    }
    if (erros.length > 0) {
      throw new ErroDeValidacao(erros);
    }

    const criado = await criarItem(tx, familia.id, novo);
    await registrarMutacao(criarGravadorPrisma(tx), {
      entidade: ENTIDADE_AUDITORIA[familia.id],
      entidadeId: criado.id,
      autorId: ator.id,
      anterior: null,
      novo: {
        nome: criado.nome,
        ativo: criado.ativo,
        ...(criado.grupo ? { grupo: criado.grupo } : {}),
        ...(criado.dimensao ? { dimensao: criado.dimensao } : {}),
        ...(criado.peso === undefined ? {} : { peso: criado.peso }),
      },
    });
    if (familia.afetaScore) {
      await criarVersaoDeConfiguracao(tx, ator.id, "indicador criado");
    }
    return { aplicado: true };
  });
}

/**
 * T16 — altera nome e, para indicadores, grupo/dimensão/peso. Renomear vale
 * na hora; mudar peso é família sensível (RN27) e gera nova versão de
 * configuração (RN25) sem tocar em avaliação fechada.
 */
export async function atualizarItemDeLista(
  ator: Ator,
  familiaId: string,
  itemId: string,
  campos: CamposDeItem,
): Promise<ResultadoDeEscrita> {
  exigirPermissao(ator.papel, "CONFIGURAR_PARAMETROS");
  const familia = exigirFamilia(familiaId);

  return prisma.$transaction(async (tx) => {
    const itens = await listarItens(tx, familia.id);
    const anterior = itens.find((item) => item.id === itemId);
    if (!anterior) {
      throw new ErroDeValidacao(["Item não encontrado nesta lista."]);
    }

    const erros: string[] = [];
    if (campos.nome !== undefined && campos.nome.trim() !== anterior.nome) {
      erros.push(
        ...validarNomeDeItem(
          campos.nome,
          itens.filter((item) => item.id !== itemId).map((item) => item.nome),
        ),
      );
    }
    if (campos.peso !== undefined) {
      erros.push(...validarPeso(campos.peso));
    }
    if (erros.length > 0) {
      throw new ErroDeValidacao(erros);
    }

    // Peso é a única alteração de lista na família sensível da RN27.
    const mudaPeso = campos.peso !== undefined && campos.peso !== anterior.peso;
    if (mudaPeso && exigeAprovacao(await regraSensivelLigada(tx), "PESO_DE_INDICADOR")) {
      const solicitacao = await abrirSolicitacaoSensivel(tx, ator, itemId, {
        familia: "PESO_DE_INDICADOR",
        indicadorId: itemId,
        peso: campos.peso as number,
      });
      // O restante da edição (nome, por exemplo) não fica refém do peso.
      const semPeso: CamposDeItem = { ...campos };
      delete semPeso.peso;
      if (Object.keys(semPeso).length > 0) {
        await aplicarAtualizacaoDeItem(tx, ator.id, familia.id, itemId, semPeso, anterior);
      }
      return { aplicado: false, solicitacaoId: solicitacao.id };
    }

    await aplicarAtualizacaoDeItem(tx, ator.id, familia.id, itemId, campos, anterior);
    return { aplicado: true };
  });
}

async function aplicarAtualizacaoDeItem(
  tx: ClienteTransacao,
  autorId: string,
  familiaId: FamiliaLista,
  itemId: string,
  campos: CamposDeItem,
  anterior: { nome: string; ativo: boolean; grupo?: GrupoIndicador; dimensao?: string; peso?: number },
) {
  const atualizado = await atualizarItem(tx, familiaId, itemId, campos);
  const estado = (item: typeof anterior) => ({
    nome: item.nome,
    ativo: item.ativo,
    ...(item.grupo ? { grupo: item.grupo } : {}),
    ...(item.dimensao ? { dimensao: item.dimensao } : {}),
    ...(item.peso === undefined ? {} : { peso: item.peso }),
  });
  await registrarMutacao(criarGravadorPrisma(tx), {
    entidade: ENTIDADE_AUDITORIA[familiaId],
    entidadeId: itemId,
    autorId,
    anterior: estado(anterior),
    novo: estado(atualizado),
  });

  // RN25 — só versiona quando a escrita muda o que o score usa. Renomear
  // não versiona: o score referencia o indicador por id.
  if (
    familiaId === "indicadores" &&
    exigeNovaVersaoDeConfiguracao(
      {
        nome: anterior.nome,
        grupo: anterior.grupo ?? "",
        dimensao: anterior.dimensao ?? "",
        peso: anterior.peso ?? 0,
        ativo: anterior.ativo,
      },
      {
        nome: atualizado.nome,
        grupo: atualizado.grupo ?? "",
        dimensao: atualizado.dimensao ?? "",
        peso: atualizado.peso ?? 0,
        ativo: atualizado.ativo,
      },
    )
  ) {
    await criarVersaoDeConfiguracao(tx, autorId, "peso ou composição de indicador");
  }
  return atualizado;
}

/**
 * RN24 — inativa ou reativa. Inativar exige a contagem de uso apurada:
 * quem chama precisa tê-la exibido, e `usosApurados` é a evidência disso.
 * Excluir não existe nesta plataforma.
 */
export async function definirEstadoDoItem(
  ator: Ator,
  familiaId: string,
  itemId: string,
  ativo: boolean,
  usosApurados: number | null,
): Promise<ResultadoDeEscrita> {
  exigirPermissao(ator.papel, "CONFIGURAR_PARAMETROS");
  const familia = exigirFamilia(familiaId);

  if (!ativo) {
    const erros = validarInativacao(usosApurados);
    if (erros.length > 0) {
      throw new ErroDeValidacao(erros);
    }
  }

  return prisma.$transaction(async (tx) => {
    const itens = await listarItens(tx, familia.id);
    const anterior = itens.find((item) => item.id === itemId);
    if (!anterior) {
      throw new ErroDeValidacao(["Item não encontrado nesta lista."]);
    }
    await aplicarAtualizacaoDeItem(tx, ator.id, familia.id, itemId, { ativo }, anterior);
    return { aplicado: true };
  });
}

/** Confere a contagem viva antes de inativar — usada pela T16 e pelos testes. */
export async function apurarUsos(familiaId: FamiliaLista, itemId: string): Promise<number> {
  return totalDeUsos(await contarUsos(prisma, familiaId, itemId));
}

// ---------------------------------------------------------------------
// Metas (T17 · RN28)
// ---------------------------------------------------------------------

export interface NovaMeta {
  periodo: PeriodoMeta;
  /** Qualquer dia dentro do período desejado; o domínio o normaliza. */
  referencia: Date;
  categoriaId: string | null;
  valor: number;
}

export async function criarMeta(ator: Ator, nova: NovaMeta): Promise<ResultadoDeEscrita> {
  // Errata da ficha Onda 3 v0.2: metas são do Administrador da Plataforma.
  exigirPermissao(ator.papel, "DEFINIR_METAS");

  const { inicio, fim } = intervaloDoPeriodo(nova.periodo, nova.referencia);

  return prisma.$transaction(async (tx) => {
    const existentes = await tx.meta.findMany({ where: { periodo: nova.periodo } });
    const categoria = nova.categoriaId
      ? await tx.categoria.findUnique({ where: { id: nova.categoriaId } })
      : null;
    if (nova.categoriaId && !categoria) {
      throw new ErroDeValidacao(["Categoria da meta não encontrada."]);
    }

    const erros = validarMeta(
      { periodo: nova.periodo, inicio, fim, categoriaId: nova.categoriaId, valor: nova.valor },
      existentes.map((m) => ({
        id: m.id,
        periodo: m.periodo,
        inicio: m.inicio,
        fim: m.fim,
        categoriaId: m.categoriaId,
      })),
      { nomeCategoria: categoria?.nome ?? null },
    );
    if (erros.length > 0) {
      throw new ErroDeValidacao(erros);
    }

    if (exigeAprovacao(await regraSensivelLigada(tx), "META")) {
      const solicitacao = await abrirSolicitacaoSensivel(tx, ator, "nova-meta", {
        familia: "META",
        periodo: nova.periodo,
        inicio: inicio.toISOString(),
        fim: fim.toISOString(),
        categoriaId: nova.categoriaId,
        valor: nova.valor,
      });
      return { aplicado: false, solicitacaoId: solicitacao.id };
    }

    const criada = await tx.meta.create({
      data: {
        periodo: nova.periodo,
        inicio,
        fim,
        categoriaId: nova.categoriaId,
        valor: nova.valor,
        autorId: ator.id,
      },
    });
    await registrarMutacao(criarGravadorPrisma(tx), {
      entidade: "meta",
      entidadeId: criada.id,
      autorId: ator.id,
      anterior: null,
      novo: {
        periodo: criada.periodo,
        inicio: criada.inicio,
        fim: criada.fim,
        categoriaId: criada.categoriaId,
        valor: criada.valor,
      },
    });
    return { aplicado: true };
  });
}

// ---------------------------------------------------------------------
// RN27 — aplicação do que foi aprovado na T6
// ---------------------------------------------------------------------

/**
 * Efeito de uma solicitação de parâmetro sensível aprovada. É chamada pelo
 * motor de aprovação, na transação da decisão: até aqui, a configuração
 * vigente seguiu valendo intocada.
 */
export async function aplicarParametroSensivelDentroDaTransacao(
  tx: ClienteTransacao,
  autorId: string,
  payload: unknown,
) {
  const mudanca = payload as MudancaSensivel | null;
  if (!mudanca) {
    throw new ErroDeValidacao([
      "Solicitação de parâmetro sensível sem conteúdo — nada a aplicar.",
    ]);
  }

  switch (mudanca.familia) {
    case "COMISSAO_PADRAO":
    case "TETO_DO_DOSSIE": {
      await gravarValorDentroDaTransacao(tx, autorId, mudanca.chave, mudanca.valor);
      invalidarCacheDeConfiguracao();
      return;
    }
    case "PESO_DE_INDICADOR": {
      const itens = await listarItens(tx, "indicadores");
      const anterior = itens.find((item) => item.id === mudanca.indicadorId);
      if (!anterior) {
        throw new ErroDeValidacao(["Indicador da solicitação não existe mais."]);
      }
      await aplicarAtualizacaoDeItem(
        tx,
        autorId,
        "indicadores",
        mudanca.indicadorId,
        { peso: mudanca.peso },
        anterior,
      );
      return;
    }
    case "META": {
      const inicio = new Date(mudanca.inicio);
      const fim = new Date(mudanca.fim);
      const existentes = await tx.meta.findMany({ where: { periodo: mudanca.periodo } });
      const erros = validarMeta(
        {
          periodo: mudanca.periodo,
          inicio,
          fim,
          categoriaId: mudanca.categoriaId,
          valor: mudanca.valor,
        },
        existentes.map((m) => ({
          id: m.id,
          periodo: m.periodo,
          inicio: m.inicio,
          fim: m.fim,
          categoriaId: m.categoriaId,
        })),
      );
      // A RN28 é reconferida na aprovação: entre o pedido e a decisão,
      // outra meta pode ter ocupado o período.
      if (erros.length > 0) {
        throw new ErroDeValidacao(erros);
      }
      const criada = await tx.meta.create({
        data: {
          periodo: mudanca.periodo,
          inicio,
          fim,
          categoriaId: mudanca.categoriaId,
          valor: mudanca.valor,
          autorId,
        },
      });
      await registrarMutacao(criarGravadorPrisma(tx), {
        entidade: "meta",
        entidadeId: criada.id,
        autorId,
        anterior: null,
        novo: {
          periodo: criada.periodo,
          inicio: criada.inicio,
          fim: criada.fim,
          categoriaId: criada.categoriaId,
          valor: criada.valor,
        },
      });
      return;
    }
  }
}

/** Papel do ator pode escrever no Parametrizador? Usado pelas telas. */
export function podeConfigurar(ator: Ator): boolean {
  return podeExecutar(ator.papel, "CONFIGURAR_PARAMETROS");
}
