import type { RegraSegmento } from "../segmentacao/catalogo";

/**
 * RN42 — matching ASSISTIVO entre o conteúdo (taxonomias da solução) e o
 * público (atributos do segmento). Este módulo só produz SUGESTÕES com o
 * motivo à vista; não existe aqui — nem em lugar nenhum — caminho que
 * aplique uma sugestão sozinho. A decisão é sempre humana, o mesmo
 * princípio das RN15/RN19.
 *
 * Os sinais usam apenas taxonomias que existem nos dados:
 * - cultura: culturas da solução × culturas pedidas no público;
 * - cobertura: cobertura nacional ou UF da solução × UF do público;
 * - preferência: correspondência entre a taxonomia de culturas da Onda 1
 *   e a preferência do assinante da Onda 5 (ver AFINIDADE abaixo).
 *
 * A categoria da solução NÃO vira sinal: o catálogo de segmentação
 * (RN33) não tem campo de categoria, então não há com o que casá-la sem
 * supor. Ela viaja apenas no texto do item, para leitura humana.
 */

/**
 * Única correspondência declarada do matching: na taxonomia de culturas
 * semeada na Onda 1 ("Todas · Grãos · Cana · Café · Pecuária · HF"),
 * "Pecuária" é a cultura pecuária e as demais são agrícolas; "Todas" não
 * distingue lado. Do lado do público, a preferência da Onda 5 é
 * agricultura · pecuária · ambos. Nada além disto é inferido.
 */
const CULTURA_PECUARIA = "pecuária";
const CULTURA_TODAS = "todas";

/** Taxonomias da solução por trás de uma oferta ou cesta candidata. */
export interface TaxonomiasDoConteudo {
  categoria: string | null;
  culturas: ReadonlyArray<string>;
  coberturaNacional: boolean;
  ufs: ReadonlyArray<string>;
}

/** Item candidato à sugestão (oferta avulsa ou cesta). */
export interface CandidatoSugestao {
  id: string;
  nome: string;
  taxonomias: TaxonomiasDoConteudo;
}

/** Atributos do público extraídos das regras declarativas do segmento. */
export interface AtributosDoPublico {
  ufs: ReadonlyArray<string>;
  culturas: ReadonlyArray<string>;
  preferencias: ReadonlyArray<string>;
}

export type SinalMatching = "cultura" | "cobertura" | "preferencia";

export interface Sugestao {
  id: string;
  nome: string;
  sinais: SinalMatching[];
  /** Texto curto exibido na etiqueta "sugerida · {motivo}" (T23/T24). */
  motivo: string;
}

const normalizar = (texto: string) => texto.trim().toLowerCase();

/**
 * Lê do conjunto de regras do público os valores que o matching usa.
 * Só regras de igualdade ("é") entram: "não é" restringe, não descreve o
 * que o público quer, e usá-la como afinidade inverteria o sentido.
 */
export function atributosDoPublico(
  regras: ReadonlyArray<RegraSegmento>,
): AtributosDoPublico {
  const ufs: string[] = [];
  const culturas: string[] = [];
  const preferencias: string[] = [];

  for (const regra of regras) {
    if (regra.operador !== "e") {
      continue;
    }
    const valor = normalizar(regra.valor);
    if (!valor) {
      continue;
    }
    if (regra.campo === "uf") {
      ufs.push(valor);
    } else if (regra.campo === "cultura") {
      culturas.push(valor);
    } else if (regra.campo === "preferencia") {
      preferencias.push(valor);
    }
  }

  return { ufs, culturas, preferencias };
}

/** A solução atende alguma das culturas pedidas pelo público? */
function casaCultura(
  taxonomias: TaxonomiasDoConteudo,
  publico: AtributosDoPublico,
): string | null {
  if (publico.culturas.length === 0) {
    return null;
  }
  const culturasDaSolucao = taxonomias.culturas.map(normalizar);
  if (culturasDaSolucao.includes(CULTURA_TODAS)) {
    return "atende todas as culturas";
  }
  const encontrada = publico.culturas.find((cultura) => culturasDaSolucao.includes(cultura));
  return encontrada ? `cultura ${encontrada}` : null;
}

/** A cobertura da solução alcança as UFs do público? */
function casaCobertura(
  taxonomias: TaxonomiasDoConteudo,
  publico: AtributosDoPublico,
): string | null {
  if (publico.ufs.length === 0) {
    return null;
  }
  if (taxonomias.coberturaNacional) {
    return "cobertura nacional";
  }
  const ufsDaSolucao = taxonomias.ufs.map(normalizar);
  const encontrada = publico.ufs.find((uf) => ufsDaSolucao.includes(uf));
  return encontrada ? encontrada.toUpperCase() : null;
}

/** A preferência do público casa com o lado (agrícola/pecuário) da solução? */
function casaPreferencia(
  taxonomias: TaxonomiasDoConteudo,
  publico: AtributosDoPublico,
): string | null {
  if (publico.preferencias.length === 0 || taxonomias.culturas.length === 0) {
    return null;
  }
  const culturas = taxonomias.culturas.map(normalizar);
  const temPecuaria = culturas.includes(CULTURA_PECUARIA);
  const temAgricola = culturas.some(
    (cultura) => cultura !== CULTURA_PECUARIA && cultura !== CULTURA_TODAS,
  );
  const semDistincao = culturas.includes(CULTURA_TODAS);

  for (const preferencia of publico.preferencias) {
    if (preferencia === "ambos" || semDistincao) {
      return `preferência ${preferencia}`;
    }
    if (preferencia === "pecuaria" && temPecuaria) {
      return "preferência pecuária";
    }
    if (preferencia === "agricultura" && temAgricola) {
      return "preferência agricultura";
    }
  }
  return null;
}

/**
 * RN42 — sugestões para o público, da mais aderente à menos. Candidatos
 * sem nenhum sinal ficam de fora: sugerir tudo é não sugerir nada. Em
 * empate de sinais, ordem alfabética — nada de desempate arbitrário.
 */
export function sugerirParaPublico(
  candidatos: ReadonlyArray<CandidatoSugestao>,
  publico: AtributosDoPublico,
): Sugestao[] {
  const sugestoes: Sugestao[] = [];

  for (const candidato of candidatos) {
    const motivos: Array<[SinalMatching, string]> = [];
    const cultura = casaCultura(candidato.taxonomias, publico);
    if (cultura) {
      motivos.push(["cultura", cultura]);
    }
    const cobertura = casaCobertura(candidato.taxonomias, publico);
    if (cobertura) {
      motivos.push(["cobertura", cobertura]);
    }
    const preferencia = casaPreferencia(candidato.taxonomias, publico);
    if (preferencia) {
      motivos.push(["preferencia", preferencia]);
    }
    if (motivos.length === 0) {
      continue;
    }
    sugestoes.push({
      id: candidato.id,
      nome: candidato.nome,
      sinais: motivos.map(([sinal]) => sinal),
      motivo: motivos.map(([, texto]) => texto).join(" · "),
    });
  }

  return sugestoes.sort(
    (a, b) => b.sinais.length - a.sinais.length || a.nome.localeCompare(b.nome, "pt-BR"),
  );
}
