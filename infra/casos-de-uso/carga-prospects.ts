import { Prisma } from "@prisma/client";
import { prisma } from "@/infra/prisma/cliente";
import { criarGravadorPrisma } from "@/infra/auditoria/gravador-prisma";
import { registrarMutacao } from "@/dominio/auditoria/servico-auditoria";
import { exigirPermissao } from "@/dominio/autorizacao/permissoes";
import { normalizarCnpj, validarCnpj } from "@/dominio/empresas/cnpj";
import {
  extrairCampos,
  type MapeamentoColunas,
  normalizarComparavel,
  separarCategorias,
  somenteDigitos,
  sugerirMapeamento,
  validarMapeamento,
} from "@/dominio/carga-prospects/mapeamento";
import { lerListaDeProspects } from "@/infra/carga-prospects/leitor-listas";
import { estadoAuditavel } from "./empresas";
import { logger } from "@/infra/log/logger";
import { type Ator, ErroDeValidacao } from "./contexto";

/**
 * Importação de listas de prospects (T9, ficha Onda 2 §7) sobre a
 * infraestrutura de staging da carga inicial (F3): upload → staging cru →
 * mapeamento de colunas (configuração por importação) → deduplicação por
 * CNPJ/nome contra o radar e as aliadas → resumo → efetivação como
 * empresas Mapeadas, tudo auditado. Linhas recusadas ficam em quarentena
 * com motivo — nada é convertido por suposição.
 */

/** Passo 1 — upload: staging cru + sugestão de mapeamento. */
export async function iniciarImportacaoProspects(
  ator: Ator,
  nomeArquivo: string,
  conteudo: Buffer,
) {
  exigirPermissao(ator.papel, "INCLUIR_NO_RADAR");
  const lista = await lerListaDeProspects(nomeArquivo, conteudo);
  if (lista.linhas.length === 0) {
    throw new ErroDeValidacao(["A lista não tem nenhuma linha de dados além do cabeçalho."]);
  }

  return prisma.$transaction(async (tx) => {
    // Uma nova importação substitui o staging de prospects não efetivado
    // (a conferência recomeça do zero — padrão da carga inicial da F3).
    await tx.stagingEmpresa.deleteMany({ where: { estado: { not: "EFETIVADA" } } });

    const importacao = await tx.importacao.create({
      data: { tipo: "CARGA_PROSPECTS", nomeArquivo, autorId: ator.id },
    });
    for (const linha of lista.linhas) {
      await tx.stagingEmpresa.create({
        data: {
          importacaoId: importacao.id,
          linhaOrigem: linha.numero,
          dadosOriginais: linha.valores as Prisma.InputJsonValue,
        },
      });
    }
    logger.info(
      { importacaoId: importacao.id, linhas: lista.linhas.length, nomeArquivo },
      "importação de prospects: staging povoado",
    );
    return {
      importacaoId: importacao.id,
      nomeArquivo,
      cabecalhos: lista.cabecalhos,
      sugestaoMapeamento: sugerirMapeamento(lista.cabecalhos),
      totalLinhas: lista.linhas.length,
    };
  });
}

export interface ResumoImportacaoProspects {
  importacaoId: string;
  nomeArquivo: string;
  lidas: number;
  novas: number;
  jaNoRadar: number;
  jaAliadas: number;
  recusadas: Array<{ linha: number; motivo: string }>;
  efetivadas: number;
}

/**
 * Passo 2 — aplica o mapeamento escolhido e roda a deduplicação por
 * CNPJ/nome contra todas as empresas cadastradas (radar e aliadas) e
 * dentro da própria lista. Linhas sem nome, com CNPJ inválido (RN08) ou
 * sem categoria-alvo reconhecida (RN13) vão para a quarentena com motivo.
 */
export async function aplicarMapeamentoProspects(
  ator: Ator,
  importacaoId: string,
  mapeamento: MapeamentoColunas,
): Promise<ResumoImportacaoProspects> {
  exigirPermissao(ator.papel, "INCLUIR_NO_RADAR");
  const errosMapeamento = validarMapeamento(mapeamento);
  if (errosMapeamento.length > 0) {
    throw new ErroDeValidacao(errosMapeamento);
  }

  const [importacao, linhas, empresas, categorias] = await Promise.all([
    prisma.importacao.findUniqueOrThrow({ where: { id: importacaoId } }),
    prisma.stagingEmpresa.findMany({
      where: { importacaoId, estado: { not: "EFETIVADA" } },
      orderBy: { linhaOrigem: "asc" },
    }),
    prisma.empresa.findMany({
      select: { id: true, nomeFantasia: true, cnpj: true, estagio: true },
    }),
    prisma.categoria.findMany({ where: { ativa: true } }),
  ]);
  if (linhas.length === 0) {
    throw new ErroDeValidacao(["Nenhuma linha pendente nesta importação — refaça o upload."]);
  }

  const porCnpj = new Map(
    empresas.filter((e) => e.cnpj).map((e) => [somenteDigitos(e.cnpj), e]),
  );
  const porNome = new Map(
    empresas.map((e) => [normalizarComparavel(e.nomeFantasia), e]),
  );
  const categoriaPorNome = new Map(
    categorias.flatMap((categoria) => [
      [normalizarComparavel(categoria.nome), categoria] as const,
      [normalizarComparavel(categoria.slug), categoria] as const,
    ]),
  );

  const vistosNaLista = new Set<string>();
  const resumo: ResumoImportacaoProspects = {
    importacaoId,
    nomeArquivo: importacao.nomeArquivo,
    lidas: linhas.length,
    novas: 0,
    jaNoRadar: 0,
    jaAliadas: 0,
    recusadas: [],
    efetivadas: 0,
  };

  await prisma.$transaction(async (tx) => {
    await tx.importacao.update({
      where: { id: importacaoId },
      data: { configuracaoMapeamento: mapeamento as Prisma.InputJsonValue },
    });

    for (const linha of linhas) {
      const campos = extrairCampos(
        linha.dadosOriginais as Record<string, unknown>,
        mapeamento,
      );
      let estado: "PENDENTE" | "REJEITADA" = "PENDENTE";
      let mensagemErro: string | null = null;
      let duplicataDeEmpresaId: string | null = null;

      const nomeComparavel = normalizarComparavel(campos.nomeFantasia);
      const cnpjDigitos = somenteDigitos(campos.cnpj);
      const categoriasReconhecidas = separarCategorias(campos.categoriasTexto)
        .map((texto) => categoriaPorNome.get(normalizarComparavel(texto)))
        .filter(Boolean);

      if (!campos.nomeFantasia) {
        estado = "REJEITADA";
        mensagemErro = "Linha sem nome de empresa.";
      } else if (campos.cnpj && !validarCnpj(campos.cnpj)) {
        estado = "REJEITADA";
        mensagemErro = "CNPJ inválido — dígito verificador não confere (RN08).";
      } else if (categoriasReconhecidas.length === 0) {
        estado = "REJEITADA";
        mensagemErro =
          "Categoria-alvo ausente ou fora da taxonomia da vitrine (RN13) — ajuste o mapeamento ou a lista.";
      } else {
        const duplicata =
          (cnpjDigitos ? porCnpj.get(cnpjDigitos) : undefined) ??
          porNome.get(nomeComparavel);
        const chaveNaLista = cnpjDigitos || nomeComparavel;
        if (duplicata) {
          estado = "REJEITADA";
          duplicataDeEmpresaId = duplicata.id;
          if (duplicata.estagio === "ALIADA_ATIVA") {
            mensagemErro = "Já é aliada ativa — ignorada na deduplicação.";
            resumo.jaAliadas += 1;
          } else if (duplicata.estagio === "SUSPENSA" || duplicata.estagio === "ENCERRADA") {
            mensagemErro = "Já cadastrada na rede (aliada suspensa/encerrada) — ignorada.";
            resumo.jaAliadas += 1;
          } else {
            mensagemErro = "Já está no radar — ignorada na deduplicação.";
            resumo.jaNoRadar += 1;
          }
        } else if (vistosNaLista.has(chaveNaLista)) {
          estado = "REJEITADA";
          mensagemErro = "Linha duplicada na própria lista — ignorada.";
        } else {
          vistosNaLista.add(chaveNaLista);
          resumo.novas += 1;
        }
      }
      if (estado === "REJEITADA" && !duplicataDeEmpresaId && mensagemErro) {
        resumo.recusadas.push({ linha: linha.linhaOrigem, motivo: mensagemErro });
      }

      await tx.stagingEmpresa.update({
        where: { id: linha.id },
        data: {
          nomeFantasia: campos.nomeFantasia,
          site: campos.site,
          cnpj: campos.cnpj,
          categoriasTexto: campos.categoriasTexto,
          estado,
          mensagemErro,
          duplicataDeEmpresaId,
        },
      });
    }

    await tx.importacao.update({
      where: { id: importacaoId },
      data: {
        linhasOk: resumo.novas,
        linhasErro: resumo.lidas - resumo.novas,
        relatorioQuarentena:
          resumo.recusadas.length > 0
            ? (resumo.recusadas as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull,
      },
    });
  });

  return resumo;
}

/** Resumo da importação para o passo 3 (recontado do staging). */
export async function resumoImportacaoProspects(
  importacaoId: string,
): Promise<ResumoImportacaoProspects> {
  const [importacao, linhas] = await Promise.all([
    prisma.importacao.findUniqueOrThrow({ where: { id: importacaoId } }),
    prisma.stagingEmpresa.findMany({
      where: { importacaoId },
      orderBy: { linhaOrigem: "asc" },
    }),
  ]);
  const resumo: ResumoImportacaoProspects = {
    importacaoId,
    nomeArquivo: importacao.nomeArquivo,
    lidas: linhas.length,
    novas: 0,
    jaNoRadar: 0,
    jaAliadas: 0,
    recusadas: [],
    efetivadas: 0,
  };
  for (const linha of linhas) {
    if (linha.estado === "EFETIVADA") {
      resumo.efetivadas += 1;
    } else if (linha.estado === "PENDENTE") {
      resumo.novas += 1;
    } else if (linha.mensagemErro?.includes("radar")) {
      resumo.jaNoRadar += 1;
    } else if (linha.mensagemErro?.includes("aliada")) {
      resumo.jaAliadas += 1;
    } else if (linha.mensagemErro) {
      resumo.recusadas.push({ linha: linha.linhaOrigem, motivo: linha.mensagemErro });
    }
  }
  return resumo;
}

/**
 * Passo 3 — efetiva as linhas novas como empresas Mapeadas, com origem
 * "Lista importada" (RN13), data de entrada no radar e auditoria por
 * empresa. Reexecutável: linhas já efetivadas não repetem.
 */
export async function efetivarImportacaoProspects(ator: Ator, importacaoId: string) {
  exigirPermissao(ator.papel, "INCLUIR_NO_RADAR");
  const [importacao, pendentes, categorias] = await Promise.all([
    prisma.importacao.findUniqueOrThrow({ where: { id: importacaoId } }),
    prisma.stagingEmpresa.findMany({
      where: { importacaoId, estado: "PENDENTE" },
      orderBy: { linhaOrigem: "asc" },
    }),
    prisma.categoria.findMany({ where: { ativa: true } }),
  ]);
  if (!importacao.configuracaoMapeamento) {
    throw new ErroDeValidacao(["Aplique o mapeamento de colunas antes de efetivar (passo 2)."]);
  }
  if (pendentes.length === 0) {
    throw new ErroDeValidacao(["Nenhuma linha nova para efetivar nesta importação."]);
  }
  const categoriaPorNome = new Map(
    categorias.flatMap((categoria) => [
      [normalizarComparavel(categoria.nome), categoria] as const,
      [normalizarComparavel(categoria.slug), categoria] as const,
    ]),
  );

  const agora = new Date();
  return prisma.$transaction(async (tx) => {
    const gravador = criarGravadorPrisma(tx);
    let empresasCriadas = 0;
    for (const linha of pendentes) {
      const categoriaIds = [
        ...new Set(
          separarCategorias(linha.categoriasTexto)
            .map((texto) => categoriaPorNome.get(normalizarComparavel(texto))?.id)
            .filter((id): id is string => Boolean(id)),
        ),
      ];
      const empresa = await tx.empresa.create({
        data: {
          nomeFantasia: linha.nomeFantasia!,
          site: linha.site,
          cnpj: linha.cnpj ? normalizarCnpj(linha.cnpj) : null,
          origem: "LISTA_IMPORTADA",
          estagio: "MAPEADA",
          dataEntradaRadar: agora,
          estagioDesde: agora,
          categorias: { create: categoriaIds.map((categoriaId) => ({ categoriaId })) },
        },
      });
      await registrarMutacao(gravador, {
        entidade: "empresa",
        entidadeId: empresa.id,
        autorId: ator.id,
        anterior: null,
        novo: estadoAuditavel(empresa),
      });
      await tx.stagingEmpresa.update({
        where: { id: linha.id },
        data: { estado: "EFETIVADA", empresaIdEfetivada: empresa.id },
      });
      empresasCriadas += 1;
    }
    logger.info(
      { importacaoId, empresasCriadas },
      "importação de prospects efetivada",
    );
    return { empresasCriadas };
  }, { timeout: 60_000 });
}
