import { type Regiao, ROTULOS_REGIAO, REGIOES } from "./regioes";

/**
 * RN52 — **o modo geográfico é sempre declarado**.
 *
 * Sede e abrangência são leituras distintas e a tela nunca as mistura.
 * Plotar sede não é plotar cobertura de atendimento: um aliado sediado em
 * Curitiba que atende o país inteiro aparece como um ponto no Paraná no modo
 * Sede, e em 27 UFs no modo Abrangência. Confundir os dois produz decisão
 * errada de scouting — "o Norte está descoberto" quando talvez esteja
 * atendido de longe, ou o contrário.
 *
 * A plataforma **não infere** cobertura a partir da sede. Quando a
 * abrangência não está declarada, o volume correspondente é informado como
 * não declarado, nunca preenchido por dedução.
 */

export const MODOS_GEOGRAFICOS = ["SEDE", "ABRANGENCIA"] as const;

export type ModoGeografico = (typeof MODOS_GEOGRAFICOS)[number];

export const ROTULOS_MODO: Readonly<Record<ModoGeografico, string>> = {
  SEDE: "Sede do aliado",
  ABRANGENCIA: "Abrangência declarada",
};

/** O que cada modo está de fato mostrando — exibido junto do mapa. */
export const DESCRICOES_MODO: Readonly<Record<ModoGeografico, string>> = {
  SEDE: "onde o aliado tem endereço cadastrado — é presença societária, não alcance de atendimento",
  ABRANGENCIA:
    "onde as soluções publicadas declaram atender — é alcance declarado, não presença física",
};

/**
 * A fonte de cada modo no cadastro, dita em voz alta na tela. Sem isso, quem
 * lê não tem como saber por que os dois números diferem.
 */
export const FONTES_MODO: Readonly<Record<ModoGeografico, string>> = {
  SEDE: "endereço do aliado (UF da sede) na ficha do aliado",
  ABRANGENCIA:
    "cobertura declarada das soluções publicadas — nacional, ou o conjunto de UFs escolhido no cadastro da solução",
};

export function modoValido(valor: unknown): ModoGeografico | null {
  return typeof valor === "string" && (MODOS_GEOGRAFICOS as ReadonlyArray<string>).includes(valor)
    ? (valor as ModoGeografico)
    : null;
}

// ---------------------------------------------------------------------
// Linhas e agregação
// ---------------------------------------------------------------------

export interface LinhaDeUf {
  sigla: string;
  nome: string;
  regiao: Regiao;
  aliados: number;
  solucoes: number;
}

export interface LinhaDeRegiao {
  regiao: Regiao;
  aliados: number;
  solucoes: number;
  /** Participação sobre a base de aliados considerada; null sem base. */
  participacao: number | null;
  vazia: boolean;
}

/**
 * Volume que o modo não consegue plotar — RN52 manda informar, não omitir.
 * `null` quando não há nenhum.
 */
export interface NaoDeclarado {
  aliados: number;
  motivo: string;
}

export interface DistribuicaoGeografica {
  modo: ModoGeografico;
  linhas: ReadonlyArray<LinhaDeUf>;
  /**
   * Base de aliados do recorte — o denominador da participação. É a
   * contagem de aliados DISTINTOS, não a soma da coluna: no modo
   * abrangência um aliado aparece em várias UFs.
   */
  baseDeAliados: number;
  baseDeSolucoes: number;
  naoDeclarado: NaoDeclarado | null;
}

/**
 * No modo abrangência a coluna de UF soma mais que a base, porque o mesmo
 * aliado atende várias. A tela precisa dizer isso, ou quem lê soma a coluna e
 * conclui que a rede é maior do que é — o mesmo cuidado da matriz
 * Categoria × cultura.
 */
export function somaExcedeBase(distribuicao: DistribuicaoGeografica): boolean {
  const soma = distribuicao.linhas.reduce((total, linha) => total + linha.aliados, 0);
  return soma > distribuicao.baseDeAliados;
}

export function participacao(valor: number, base: number): number | null {
  if (base <= 0) {
    return null;
  }
  return Math.round((valor / base) * 1000) / 10;
}

/** Ranking por região: volume e participação, incluindo as regiões vazias. */
export function rankingPorRegiao(
  distribuicao: DistribuicaoGeografica,
): LinhaDeRegiao[] {
  const porRegiao = new Map<Regiao, { aliados: number; solucoes: number }>(
    REGIOES.map((regiao) => [regiao, { aliados: 0, solucoes: 0 }]),
  );

  for (const linha of distribuicao.linhas) {
    const acumulado = porRegiao.get(linha.regiao);
    if (!acumulado) {
      continue;
    }
    acumulado.aliados += linha.aliados;
    acumulado.solucoes += linha.solucoes;
  }

  return REGIOES.map((regiao) => {
    const { aliados, solucoes } = porRegiao.get(regiao)!;
    return {
      regiao,
      aliados,
      solucoes,
      participacao: participacao(aliados, distribuicao.baseDeAliados),
      // Região sem nenhum aliado é informação — a lista não a esconde (RN53).
      vazia: aliados === 0,
    };
  }).sort((a, b) => b.aliados - a.aliados || ROTULOS_REGIAO[a.regiao].localeCompare(ROTULOS_REGIAO[b.regiao], "pt-BR"));
}

// ---------------------------------------------------------------------
// Leitura do mapa (ficha §3: "derivada do recorte ativo, não texto fixo")
// ---------------------------------------------------------------------

export interface Observacao {
  /** Marcador curto exibido à esquerda da linha. */
  marcador: string;
  texto: string;
  /** Observação que aponta um problema — recebe destaque na tela. */
  alerta: boolean;
}

const FORMATO = new Intl.NumberFormat("pt-BR");

/**
 * Três a quatro observações **derivadas** do recorte ativo.
 *
 * Texto fixo aqui seria mentira assim que o filtro mudasse: a ficha §3 é
 * explícita ("não texto fixo"). Cada observação abaixo lê os números da
 * distribuição corrente; quando não há base, a lista diz isso em vez de
 * inventar uma leitura.
 */
export function lerOMapa(distribuicao: DistribuicaoGeografica): Observacao[] {
  const observacoes: Observacao[] = [];
  const ranking = rankingPorRegiao(distribuicao);
  const comVolume = ranking.filter((linha) => linha.aliados > 0);

  if (distribuicao.baseDeAliados === 0 || comVolume.length === 0) {
    return [
      {
        marcador: "—",
        texto:
          "Nenhum aliado com localização utilizável neste recorte, então não há distribuição a ler. Os filtros ativos ou a ausência do dado no cadastro explicam o vazio — o mapa não estima posição.",
        alerta: true,
      },
    ];
  }

  // 1. Concentração na região líder.
  const lider = comVolume[0]!;
  observacoes.push({
    marcador: "1",
    texto:
      lider.participacao === null
        ? `${ROTULOS_REGIAO[lider.regiao]} lidera com ${FORMATO.format(lider.aliados)} aliado(s).`
        : `${ROTULOS_REGIAO[lider.regiao]} concentra ${FORMATO.format(lider.participacao)}% da base (${FORMATO.format(lider.aliados)} de ${FORMATO.format(distribuicao.baseDeAliados)} aliados).`,
    alerta: false,
  });

  // 2. UF líder — o ponto maior do mapa, nomeado.
  const ufs = [...distribuicao.linhas]
    .filter((linha) => linha.aliados > 0)
    .sort((a, b) => b.aliados - a.aliados || a.sigla.localeCompare(b.sigla, "pt-BR"));
  const ufLider = ufs[0];
  if (ufLider) {
    observacoes.push({
      marcador: "2",
      texto: `${ufLider.nome} (${ufLider.sigla}) é a maior unidade isolada, com ${FORMATO.format(ufLider.aliados)} aliado(s) e ${FORMATO.format(ufLider.solucoes)} solução(ões). ${FORMATO.format(ufs.length)} das 27 UFs têm ao menos um.`,
      alerta: false,
    });
  }

  // 3. Regiões sem ninguém — o que o mapa mostra por ausência.
  const vazias = ranking.filter((linha) => linha.vazia);
  if (vazias.length > 0) {
    observacoes.push({
      marcador: "3",
      texto: `Sem nenhum aliado ${distribuicao.modo === "SEDE" ? "sediado" : "declarando atendimento"} em: ${vazias
        .map((linha) => ROTULOS_REGIAO[linha.regiao])
        .join(", ")}. É vazio de cadastro, não necessariamente vazio de mercado.`,
      alerta: true,
    });
  } else {
    observacoes.push({
      marcador: "3",
      texto: "As cinco regiões têm ao menos um aliado neste recorte.",
      alerta: false,
    });
  }

  // 4. O que o modo não alcança — só quando existe volume não declarado.
  if (distribuicao.naoDeclarado) {
    observacoes.push({
      marcador: "4",
      texto: `${FORMATO.format(distribuicao.naoDeclarado.aliados)} aliado(s) fora do mapa neste modo: ${distribuicao.naoDeclarado.motivo}. Não entram em nenhuma UF — a plataforma não deduz posição.`,
      alerta: true,
    });
  }

  return observacoes;
}
