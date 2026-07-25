import type { OrigemEmpresa, TipoRegistroNegociacao } from "@prisma/client";
import { prisma } from "@/infra/prisma/cliente";
import { criarGravadorPrisma } from "@/infra/auditoria/gravador-prisma";
import { registrarMutacao } from "@/dominio/auditoria/servico-auditoria";
import {
  ErroDeAutorizacao,
  exigirPermissao,
  podeExecutar,
} from "@/dominio/autorizacao/permissoes";
import { podeTransicionar } from "@/dominio/empresas/estagio";
import { validarPriorizacao } from "@/dominio/avaliacao/regras";
import {
  destinosDeMovimentoManual,
  validarDescarte,
  validarEntradaNoRadar,
} from "@/dominio/funil/regras";
import { estadoAuditavel } from "./empresas";
import { type Ator, ErroDeValidacao } from "./contexto";

/**
 * Casos de uso do funil de mercado (F6 — T8/T9). Toda movimentação grava
 * auditoria com autor, data e valor anterior/novo; RN14, RN16 e RN17 são
 * garantidas aqui (as validações puras vivem em dominio/funil).
 */

export interface DadosRadar {
  nomeFantasia: string;
  site?: string | null;
  origem: OrigemEmpresa | null;
  categoriaIds: string[];
}

/** T9 — inclui empresa no radar como Mapeada (RN13). */
export async function entrarNoRadar(ator: Ator, dados: DadosRadar) {
  exigirPermissao(ator.papel, "INCLUIR_NO_RADAR");
  const erros = validarEntradaNoRadar({
    nomeFantasia: dados.nomeFantasia,
    origem: dados.origem,
    quantidadeCategoriasAlvo: dados.categoriaIds.length,
  });
  if (erros.length > 0) {
    throw new ErroDeValidacao(erros);
  }

  const agora = new Date();
  return prisma.$transaction(async (tx) => {
    const empresa = await tx.empresa.create({
      data: {
        nomeFantasia: dados.nomeFantasia.trim(),
        site: dados.site?.trim() || null,
        origem: dados.origem,
        estagio: "MAPEADA",
        dataEntradaRadar: agora,
        estagioDesde: agora,
        categorias: {
          create: dados.categoriaIds.map((categoriaId) => ({ categoriaId })),
        },
      },
    });
    await registrarMutacao(criarGravadorPrisma(tx), {
      entidade: "empresa",
      entidadeId: empresa.id,
      autorId: ator.id,
      anterior: null,
      novo: estadoAuditavel(empresa),
    });
    return empresa;
  });
}

/**
 * T8 — movimentação manual entre lanes do funil, restrita a
 * destinosDeMovimentoManual (o grafo já exclui EM_APROVACAO, do motor, e
 * DESCARTADA, que tem ação própria). RN14: mover para EM_AVALIACAO é ato
 * de quem assume — o ator vira responsável de scout; voltar a MAPEADA
 * devolve a empresa ao pool (responsável limpo). RN15 (F7): PRIORIZADA
 * exige avaliação fechada — e é sempre este ato humano; nenhum fechamento
 * de avaliação chama esta função.
 */
export async function moverNoFunil(
  ator: Ator,
  empresaId: string,
  destino: "MAPEADA" | "EM_AVALIACAO" | "PRIORIZADA",
) {
  exigirPermissao(
    ator.papel,
    destino === "PRIORIZADA" ? "PRIORIZAR" : "ASSUMIR_E_AVALIAR",
  );

  return prisma.$transaction(async (tx) => {
    const anterior = await tx.empresa.findUniqueOrThrow({ where: { id: empresaId } });
    if (!destinosDeMovimentoManual(anterior.estagio).includes(destino)) {
      throw new ErroDeValidacao([
        `Mover de ${anterior.estagio} para ${destino} não é permitido pelo pipeline do funil.`,
      ]);
    }
    if (destino === "PRIORIZADA") {
      const avaliacoesFechadas = await tx.avaliacaoScout.count({
        where: { empresaId, status: "FECHADA" },
      });
      const errosRN15 = validarPriorizacao(avaliacoesFechadas > 0);
      if (errosRN15.length > 0) {
        throw new ErroDeValidacao(errosRN15);
      }
    }
    const empresa = await tx.empresa.update({
      where: { id: empresaId },
      data: {
        estagio: destino,
        estagioDesde: new Date(),
        // RN14: assumir a avaliação atribui o responsável de scout; voltar
        // a MAPEADA devolve ao pool.
        ...(destino === "EM_AVALIACAO" ? { responsavelScoutId: ator.id } : {}),
        ...(destino === "MAPEADA" ? { responsavelScoutId: null } : {}),
      },
    });
    await registrarMutacao(criarGravadorPrisma(tx), {
      entidade: "empresa",
      entidadeId: empresaId,
      autorId: ator.id,
      anterior: estadoAuditavel(anterior),
      novo: estadoAuditavel(empresa),
    });
    return empresa;
  });
}

/**
 * T8 — handoff Priorizada → Em negociação (RN16): exige responsável
 * comercial designado. O Comercial assume para si (ficha §2, "assumir
 * negociação"); o Gestor pode designar outra pessoa ("designar
 * responsáveis"). O designado precisa poder conduzir negociações.
 */
export async function handoffParaNegociacao(
  ator: Ator,
  empresaId: string,
  responsavelComercialId: string,
) {
  if (!responsavelComercialId) {
    throw new ErroDeValidacao([
      "Em negociação exige responsável comercial designado (RN16).",
    ]);
  }
  exigirPermissao(
    ator.papel,
    responsavelComercialId === ator.id ? "ASSUMIR_NEGOCIACAO" : "DEFINIR_METAS_E_DESIGNAR",
  );

  const designado = await prisma.usuario.findUnique({
    where: { id: responsavelComercialId },
  });
  if (!designado || !designado.ativo) {
    throw new ErroDeValidacao(["Responsável comercial designado não encontrado ou inativo."]);
  }
  if (!podeExecutar(designado.papel, "ASSUMIR_NEGOCIACAO")) {
    throw new ErroDeValidacao([
      "O responsável comercial precisa ser do time Comercial (ou Gestor), conforme a ficha §2.",
    ]);
  }

  return prisma.$transaction(async (tx) => {
    const anterior = await tx.empresa.findUniqueOrThrow({ where: { id: empresaId } });
    if (anterior.estagio !== "PRIORIZADA") {
      throw new ErroDeValidacao([
        "O handoff para negociação parte de uma empresa Priorizada (RN16).",
      ]);
    }
    const empresa = await tx.empresa.update({
      where: { id: empresaId },
      data: {
        estagio: "EM_NEGOCIACAO",
        estagioDesde: new Date(),
        responsavelComercialId,
      },
    });
    await registrarMutacao(criarGravadorPrisma(tx), {
      entidade: "empresa",
      entidadeId: empresaId,
      autorId: ator.id,
      anterior: estadoAuditavel(anterior),
      novo: estadoAuditavel(empresa),
    });
    return empresa;
  });
}

/**
 * T8 — descarte com motivo tipificado (RN17). Alçada: Gestor e Analista
 * de Scout descartam em qualquer estágio do funil; o Comercial, somente
 * na negociação que conduz (ex.: "recusou condições").
 */
export async function descartarEmpresa(
  ator: Ator,
  empresaId: string,
  motivo: { motivoDescarteId: string; descricao: string | null; comentario: string | null },
) {
  const motivoRegistro = await prisma.motivoDescarte.findUniqueOrThrow({
    where: { id: motivo.motivoDescarteId },
  });
  const errosMotivo = validarDescarte({
    motivoSlug: motivoRegistro.slug,
    descricao: motivo.descricao,
  });
  if (errosMotivo.length > 0) {
    throw new ErroDeValidacao(errosMotivo);
  }

  return prisma.$transaction(async (tx) => {
    const anterior = await tx.empresa.findUniqueOrThrow({ where: { id: empresaId } });
    const descartePermitido =
      podeExecutar(ator.papel, "ASSUMIR_E_AVALIAR") ||
      (podeExecutar(ator.papel, "ASSUMIR_NEGOCIACAO") && anterior.estagio === "EM_NEGOCIACAO");
    if (!descartePermitido) {
      throw new ErroDeAutorizacao(ator.papel, "ASSUMIR_E_AVALIAR");
    }
    if (!podeTransicionar(anterior.estagio, "DESCARTADA")) {
      throw new ErroDeValidacao([
        `Transição de ${anterior.estagio} para DESCARTADA não é permitida.`,
      ]);
    }
    const empresa = await tx.empresa.update({
      where: { id: empresaId },
      data: {
        estagio: "DESCARTADA",
        estagioDesde: new Date(),
        motivoDescarteId: motivo.motivoDescarteId,
        motivoDescarteDescricao: motivo.descricao?.trim() || null,
        motivoDescarteComentario: motivo.comentario?.trim() || null,
      },
    });
    await registrarMutacao(criarGravadorPrisma(tx), {
      entidade: "empresa",
      entidadeId: empresaId,
      autorId: ator.id,
      anterior: estadoAuditavel(anterior),
      novo: estadoAuditavel(empresa),
    });
    return empresa;
  });
}

/**
 * RN17 — reativação de descartada: volta a Mapeada preservando todo o
 * histórico (auditoria, notas e registros permanecem); motivo de descarte
 * e responsáveis são limpos — a empresa retorna ao pool do radar.
 */
export async function reativarDescartada(ator: Ator, empresaId: string) {
  exigirPermissao(ator.papel, "INCLUIR_NO_RADAR");
  return prisma.$transaction(async (tx) => {
    const anterior = await tx.empresa.findUniqueOrThrow({ where: { id: empresaId } });
    if (!podeTransicionar(anterior.estagio, "MAPEADA")) {
      throw new ErroDeValidacao([
        "Somente empresas descartadas podem ser reativadas para Mapeada (RN17).",
      ]);
    }
    const empresa = await tx.empresa.update({
      where: { id: empresaId },
      data: {
        estagio: "MAPEADA",
        estagioDesde: new Date(),
        motivoDescarteId: null,
        motivoDescarteDescricao: null,
        motivoDescarteComentario: null,
        responsavelScoutId: null,
        responsavelComercialId: null,
      },
    });
    await registrarMutacao(criarGravadorPrisma(tx), {
      entidade: "empresa",
      entidadeId: empresaId,
      autorId: ator.id,
      anterior: estadoAuditavel(anterior),
      novo: estadoAuditavel(empresa),
    });
    return empresa;
  });
}

/** Registro simples de andamento da negociação (ficha §3.5 — não é CRM). */
export async function registrarNegociacao(
  ator: Ator,
  empresaId: string,
  dados: { data: Date; tipo: TipoRegistroNegociacao; nota: string },
) {
  exigirPermissao(ator.papel, "ASSUMIR_NEGOCIACAO");
  if (!dados.nota.trim()) {
    throw new ErroDeValidacao(["O registro de negociação precisa de uma nota curta."]);
  }

  return prisma.$transaction(async (tx) => {
    const empresa = await tx.empresa.findUniqueOrThrow({ where: { id: empresaId } });
    if (empresa.estagio !== "EM_NEGOCIACAO" && empresa.estagio !== "EM_APROVACAO") {
      throw new ErroDeValidacao([
        "Registro de andamento vale para empresas em negociação (ou aguardando aprovação).",
      ]);
    }
    const registro = await tx.registroNegociacao.create({
      data: {
        empresaId,
        responsavelId: ator.id,
        data: dados.data,
        tipo: dados.tipo,
        nota: dados.nota.trim(),
      },
    });
    await registrarMutacao(criarGravadorPrisma(tx), {
      entidade: "registro_negociacao",
      entidadeId: registro.id,
      autorId: ator.id,
      anterior: null,
      novo: {
        empresaId,
        data: registro.data,
        tipo: registro.tipo,
        nota: registro.nota,
      },
    });
    return registro;
  });
}

/** Nota rápida da empresa no funil (ficha §3.1): histórico, nunca edição. */
export async function adicionarNotaRapida(ator: Ator, empresaId: string, texto: string) {
  if (
    !podeExecutar(ator.papel, "INCLUIR_NO_RADAR") &&
    !podeExecutar(ator.papel, "ASSUMIR_NEGOCIACAO")
  ) {
    throw new ErroDeAutorizacao(ator.papel, "INCLUIR_NO_RADAR");
  }
  if (!texto.trim()) {
    throw new ErroDeValidacao(["A nota rápida não pode ficar vazia."]);
  }

  return prisma.$transaction(async (tx) => {
    await tx.empresa.findUniqueOrThrow({ where: { id: empresaId } });
    const nota = await tx.notaRapida.create({
      data: { empresaId, autorId: ator.id, texto: texto.trim() },
    });
    await registrarMutacao(criarGravadorPrisma(tx), {
      entidade: "nota_rapida",
      entidadeId: nota.id,
      autorId: ator.id,
      anterior: null,
      novo: { empresaId, texto: nota.texto },
    });
    return nota;
  });
}
