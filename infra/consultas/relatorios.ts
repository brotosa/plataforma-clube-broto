import { Prisma } from "@prisma/client";

import { prisma } from "@/infra/prisma/cliente";
import {
  type ColunaProjetada,
  type DefinicaoRelatorio,
  TETO_DETALHE,
  TETO_LINHAS_PADRAO,
  compilarDetalhe,
  compilarRelatorio,
} from "@/dominio/relatorios/compilador";
import type { Celula, LinhaCrua } from "@/dominio/relatorios/pivo";

/**
 * Execução da consulta compilada — a única camada que fala com o banco.
 *
 * Ela não decide nada: não confere permissão, não grava trilha, não escolhe
 * teto. Recebe uma definição já validada e devolve linhas. Quem decide é o
 * caso de uso, e a separação é a de sempre nesta casa.
 */

/**
 * Normaliza o que o driver devolve para algo que atravessa a fronteira
 * servidor → cliente e vira JSON sem surpresa.
 *
 * **As três conversões existem por observação, não por precaução.** Rodando
 * as consultas dos modelos contra a base real:
 *
 *  • `count()` volta como **bigint**, e bigint quebra `JSON.stringify` com
 *    "Do not know how to serialize a BigInt" — foi literalmente o primeiro
 *    erro ao executar o compilador pela primeira vez;
 *  • `avg()` e `sum()` voltam como **Decimal** do Prisma, um objeto que
 *    serializa como `{}` e faria a coluna aparecer vazia na tela;
 *  • coluna de data volta como **Date**, que atravessa a serialização do
 *    React virando texto ISO com hora e fuso — "2025-02-07T00:00:00.000Z"
 *    onde a pessoa espera uma data.
 *
 * Nenhum dos três daria erro visível: dois apareceriam como célula vazia e um
 * como texto estranho. Por isso a conversão é explícita e o caso `default`
 * devolve `String(valor)` em vez de deixar passar — tipo novo do Postgres
 * aparece como texto legível, nunca como `[object Object]`.
 */
function normalizarCelula(valor: unknown): Celula {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === "bigint") return Number(valor);
  if (typeof valor === "number" || typeof valor === "boolean") return valor;
  if (typeof valor === "string") return valor;
  if (valor instanceof Date) {
    // Só a data: a coluna é `@db.Date` e a hora é sempre zero. Mandar o
    // instante completo faria o fuso do navegador deslocar o dia.
    return valor.toISOString().slice(0, 10);
  }
  if (Prisma.Decimal.isDecimal(valor)) {
    return (valor as Prisma.Decimal).toNumber();
  }
  return String(valor);
}

export interface ResultadoDaConsulta {
  projecao: ReadonlyArray<ColunaProjetada>;
  linhas: ReadonlyArray<LinhaCrua>;
  /** O resultado bateu no teto e havia mais (RN79). */
  truncado: boolean;
  teto: number;
  duracaoMs: number;
}

export async function executarConsultaDeRelatorio(
  definicao: DefinicaoRelatorio,
  opcoes: { teto?: number } = {},
): Promise<ResultadoDaConsulta> {
  const teto = opcoes.teto ?? TETO_LINHAS_PADRAO;
  const compilado = compilarRelatorio(definicao, { teto });

  const comecou = Date.now();
  const cruas = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    compilado.sql,
    ...compilado.parametros,
  );
  const duracaoMs = Date.now() - comecou;

  /*
   * O compilador pediu teto+1 linhas. Veio a mais? Então havia mais, e a
   * linha extra é descartada: exibi-la faria o resultado ter uma linha além
   * do teto que a mensagem anuncia, e o número na tela contradiria o texto
   * ao lado dele.
   */
  const truncado = cruas.length > teto;
  const aproveitadas = truncado ? cruas.slice(0, teto) : cruas;

  const linhas: LinhaCrua[] = aproveitadas.map((crua) => {
    const linha: Record<string, Celula> = {};
    compilado.projecao.forEach((coluna) => {
      linha[coluna.chave] = normalizarCelula(crua[coluna.chave]);
    });
    return linha;
  });

  return { projecao: compilado.projecao, linhas, truncado, teto, duracaoMs };
}

/**
 * RN93 — a consulta do **detalhe**: os registros por trás do agregado.
 *
 * Duas idas ao banco, de propósito. A primeira traz as linhas; a segunda
 * conta **linhas e registros distintos** sobre o mesmo recorte, sem teto —
 * porque é justamente a diferença entre os dois números que a tela precisa
 * declarar quando houver junção que multiplica. Resolver as duas numa só, com
 * função de janela, economizaria uma viagem e esconderia a intenção; e a
 * contagem sem teto é barata perto da leitura das colunas.
 *
 * Como esta camada, ela não decide nada — não confere permissão, não grava
 * trilha, não escolhe teto.
 */
export interface ResultadoDoDetalhe extends ResultadoDaConsulta {
  /** Quantas linhas o recorte tem no banco, ignorando o teto. */
  linhasNoBanco: number;
  /** Quantos REGISTROS do assunto essas linhas representam. */
  registros: number;
}

export async function executarConsultaDeDetalhe(
  definicao: DefinicaoRelatorio,
  opcoes: { teto?: number } = {},
): Promise<ResultadoDoDetalhe> {
  const teto = opcoes.teto ?? TETO_DETALHE;
  const { compilado, sqlDeContagem, parametrosDaContagem } = compilarDetalhe(definicao, { teto });

  const comecou = Date.now();
  const [cruas, contagem] = await Promise.all([
    prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(compilado.sql, ...compilado.parametros),
    prisma.$queryRawUnsafe<Array<{ linhas: number; registros: number }>>(
      sqlDeContagem,
      ...parametrosDaContagem,
    ),
  ]);
  const duracaoMs = Date.now() - comecou;

  const truncado = cruas.length > teto;
  const aproveitadas = truncado ? cruas.slice(0, teto) : cruas;
  const linhas: LinhaCrua[] = aproveitadas.map((crua) => {
    const linha: Record<string, Celula> = {};
    compilado.projecao.forEach((coluna) => {
      linha[coluna.chave] = normalizarCelula(crua[coluna.chave]);
    });
    return linha;
  });

  const primeira = contagem[0];
  return {
    projecao: compilado.projecao,
    linhas,
    truncado,
    teto,
    duracaoMs,
    linhasNoBanco: primeira?.linhas ?? linhas.length,
    registros: primeira?.registros ?? linhas.length,
  };
}
