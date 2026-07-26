import type { Prisma } from "@prisma/client";
import { prisma } from "@/infra/prisma/cliente";
import {
  type DistribuicaoGeografica,
  type LinhaDeUf,
  type ModoGeografico,
} from "@/dominio/geografia/distribuicao";
import { type Regiao, UFS_POR_REGIAO, regiaoDaUf } from "@/dominio/geografia/regioes";
import { UFS_PROJETADAS } from "@/infra/geografia/projecao";

/**
 * T30 — distribuição geográfica da rede (ficha Onda 7 §3).
 *
 * RN52 governa o arquivo: **sede e abrangência são consultas diferentes**,
 * porque são perguntas diferentes ao cadastro. Não há um caminho comum que
 * "resolva" as duas — tentar unificá-las seria justamente a mistura que a
 * regra proíbe.
 *
 * - **Sede** lê `empresas.endereco_uf`. Aliado sem UF cadastrada, ou com
 *   sigla que não é uma das 27, fica fora do mapa e é contado como não
 *   declarado.
 * - **Abrangência** lê a cobertura declarada das soluções publicadas:
 *   `solucoes.cobertura_nacional` (as 27) ou o conjunto em `solucao_ufs`.
 *   Aliado cujas soluções publicadas não declaram cobertura alguma fica fora
 *   e é contado como não declarado.
 *
 * Sobre a abrangência não existir como campo do aliado: o cadastro guarda a
 * cobertura na SOLUÇÃO, e a abrangência do aliado é a união das coberturas
 * das soluções que ele publicou. É a única declaração de alcance que o
 * cadastro sustenta hoje; a ficha §10 registra o preenchimento por aliado
 * como pendência operacional herdada, e é exatamente o volume que o modo
 * informa como não declarado em vez de deduzir da sede.
 */

export interface RecorteDoMapa {
  culturaId?: string;
  categoriaId?: string;
}

const NOMES_DE_UF = new Map(UFS_PROJETADAS.map((uf) => [uf.sigla, uf.nome]));

/** Todas as siglas com região conhecida, na ordem do asset de geometria. */
const SIGLAS: ReadonlyArray<string> = UFS_PROJETADAS.map((uf) => uf.sigla);

function linhasZeradas(): Map<string, { aliados: number; solucoes: number }> {
  return new Map(SIGLAS.map((sigla) => [sigla, { aliados: 0, solucoes: 0 }]));
}

function montarLinhas(
  contagens: Map<string, { aliados: number; solucoes: number }>,
): LinhaDeUf[] {
  return SIGLAS.flatMap((sigla): LinhaDeUf[] => {
    const regiao = regiaoDaUf(sigla);
    if (!regiao) {
      return [];
    }
    const contagem = contagens.get(sigla) ?? { aliados: 0, solucoes: 0 };
    return [
      {
        sigla,
        nome: NOMES_DE_UF.get(sigla) ?? sigla,
        regiao,
        aliados: contagem.aliados,
        solucoes: contagem.solucoes,
      },
    ];
  });
}

/** Filtro do aliado ativo segundo o recorte da tela. */
function ondeDoAliado(recorte: RecorteDoMapa): Prisma.EmpresaWhereInput {
  const onde: Prisma.EmpresaWhereInput = { estagio: "ALIADA_ATIVA" };
  if (recorte.categoriaId) {
    onde.categorias = { some: { categoriaId: recorte.categoriaId } };
  }
  if (recorte.culturaId) {
    onde.solucoes = { some: { culturas: { some: { culturaId: recorte.culturaId } } } };
  }
  return onde;
}

/** Filtro da solução publicada segundo o recorte da tela. */
function ondeDaSolucao(recorte: RecorteDoMapa): Prisma.SolucaoWhereInput {
  const onde: Prisma.SolucaoWhereInput = {
    ofertas: { some: { status: "PUBLICADA" } },
    empresa: ondeDoAliado(recorte),
  };
  if (recorte.categoriaId) {
    onde.categoriaId = recorte.categoriaId;
  }
  if (recorte.culturaId) {
    onde.culturas = { some: { culturaId: recorte.culturaId } };
  }
  return onde;
}

// ---------------------------------------------------------------------
// Modo Sede
// ---------------------------------------------------------------------

async function distribuicaoPorSede(
  recorte: RecorteDoMapa,
): Promise<DistribuicaoGeografica> {
  const [aliados, solucoes] = await Promise.all([
    prisma.empresa.findMany({
      where: ondeDoAliado(recorte),
      select: { id: true, enderecoUf: true },
    }),
    prisma.solucao.findMany({
      where: ondeDaSolucao(recorte),
      select: { id: true, empresa: { select: { enderecoUf: true } } },
    }),
  ]);

  const contagens = linhasZeradas();
  let semUf = 0;
  for (const aliado of aliados) {
    const sigla = aliado.enderecoUf?.trim().toUpperCase() ?? "";
    const contagem = contagens.get(sigla);
    if (!contagem || !regiaoDaUf(sigla)) {
      // Sem UF, ou com sigla que não é uma das 27: some do mapa e é
      // declarado. Chutar a UF a partir do município seria inventar dado.
      semUf += 1;
      continue;
    }
    contagem.aliados += 1;
  }

  for (const solucao of solucoes) {
    const sigla = solucao.empresa.enderecoUf?.trim().toUpperCase() ?? "";
    const contagem = contagens.get(sigla);
    if (contagem && regiaoDaUf(sigla)) {
      contagem.solucoes += 1;
    }
  }

  return {
    modo: "SEDE",
    linhas: montarLinhas(contagens),
    baseDeAliados: aliados.length - semUf,
    baseDeSolucoes: solucoes.length,
    naoDeclarado:
      semUf > 0
        ? { aliados: semUf, motivo: "sem UF de sede válida no cadastro do aliado" }
        : null,
  };
}

// ---------------------------------------------------------------------
// Modo Abrangência declarada
// ---------------------------------------------------------------------

const TODAS_AS_SIGLAS: ReadonlyArray<string> = Object.values(UFS_POR_REGIAO).flatMap(
  (siglas) => [...siglas],
);

async function distribuicaoPorAbrangencia(
  recorte: RecorteDoMapa,
): Promise<DistribuicaoGeografica> {
  const [aliados, solucoes] = await Promise.all([
    prisma.empresa.count({ where: ondeDoAliado(recorte) }),
    prisma.solucao.findMany({
      where: ondeDaSolucao(recorte),
      select: {
        id: true,
        empresaId: true,
        coberturaNacional: true,
        ufs: { select: { uf: { select: { sigla: true } } } },
      },
    }),
  ]);

  const contagens = linhasZeradas();
  /** UFs distintas por aliado — o mesmo aliado não conta duas vezes na UF. */
  const ufsPorAliado = new Map<string, Set<string>>();

  for (const solucao of solucoes) {
    const alcance = solucao.coberturaNacional
      ? TODAS_AS_SIGLAS
      : solucao.ufs.map((vinculo) => vinculo.uf.sigla);

    const doAliado = ufsPorAliado.get(solucao.empresaId) ?? new Set<string>();
    for (const sigla of alcance) {
      const normalizada = sigla.trim().toUpperCase();
      const contagem = contagens.get(normalizada);
      if (!contagem || !regiaoDaUf(normalizada)) {
        continue;
      }
      contagem.solucoes += 1;
      doAliado.add(normalizada);
    }
    ufsPorAliado.set(solucao.empresaId, doAliado);
  }

  for (const ufs of ufsPorAliado.values()) {
    for (const sigla of ufs) {
      const contagem = contagens.get(sigla);
      if (contagem) {
        contagem.aliados += 1;
      }
    }
  }

  const comAbrangencia = [...ufsPorAliado.values()].filter((ufs) => ufs.size > 0).length;
  const naoDeclarados = aliados - comAbrangencia;

  return {
    modo: "ABRANGENCIA",
    linhas: montarLinhas(contagens),
    baseDeAliados: comAbrangencia,
    baseDeSolucoes: solucoes.length,
    naoDeclarado:
      naoDeclarados > 0
        ? {
            aliados: naoDeclarados,
            motivo:
              "sem cobertura declarada nas soluções publicadas — a plataforma não infere alcance a partir da sede (RN52)",
          }
        : null,
  };
}

// ---------------------------------------------------------------------

export async function distribuicaoGeografica(
  modo: ModoGeografico,
  recorte: RecorteDoMapa = {},
): Promise<DistribuicaoGeografica> {
  return modo === "SEDE"
    ? distribuicaoPorSede(recorte)
    : distribuicaoPorAbrangencia(recorte);
}

/** Regiões usadas pelo ranking — reexportado para a página não importar duas vezes. */
export type { Regiao };
