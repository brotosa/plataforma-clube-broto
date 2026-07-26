import { geoMercator, geoPath } from "d3-geo";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import geometria from "./brasil-ufs.geo.json";

/**
 * Projeção do mapa do Brasil para a T30 (Onda 7).
 *
 * Três decisões que valem registro:
 *
 * 1. **A geometria é asset versionado, não busca de rede.** `brasil-ufs.geo.json`
 *    é gerado por `scripts/gerar-geometria-brasil.mjs` a partir do Natural
 *    Earth 1:50m (domínio público) e vive no repositório. Tela de produção que
 *    depende de CDN de terceiro para desenhar é tela que quebra sem aviso.
 *
 * 2. **A projeção roda no SERVIDOR.** O protótipo projeta no navegador, com
 *    `d3` e `topojson` no `<helmet>` — e por isso precisa de um caminho de
 *    fallback para "a biblioteca de projeção não carregou". Aqui o componente
 *    é de servidor: o SVG chega pronto no HTML. Não há JS de mapa no cliente,
 *    não há estado de carregamento, e o axe mede a tela já assentada em vez de
 *    correr atrás de um desenho assíncrono. `d3-geo` não entra no bundle.
 *
 * 3. **Nenhum contorno é desenhado à mão** (ficha §3), e os centróides
 *    também não: saem de `geoPath.centroid()` sobre a geometria real, então
 *    a posição de cada marcador é derivada, não digitada.
 */

/** Proporções do quadro, herdadas do protótipo v9.1 (`brasil-mapa.js`). */
export const LARGURA_MAPA = 560;
export const ALTURA_MAPA = 580;

export const PROVENIENCIA_GEOMETRIA = geometria.proveniencia;

interface UfDoAsset {
  sigla: string;
  nome: string;
  geometry: Geometry;
}

const UFS = geometria.ufs as unknown as ReadonlyArray<UfDoAsset>;

const colecao: FeatureCollection = {
  type: "FeatureCollection",
  features: UFS.map(
    (uf): Feature => ({
      type: "Feature",
      id: uf.sigla,
      properties: { sigla: uf.sigla, nome: uf.nome },
      geometry: uf.geometry,
    }),
  ),
};

/**
 * Mercator ajustado ao quadro — a mesma projeção que o protótipo declara na
 * legenda ("geometria Natural Earth · projeção Mercator"). O ajuste é feito
 * uma vez, no carregamento do módulo: a geometria não muda entre requisições.
 */
const projecao = geoMercator().fitSize([LARGURA_MAPA, ALTURA_MAPA], colecao);
const caminho = geoPath(projecao);

export interface UfProjetada {
  sigla: string;
  nome: string;
  /** `d` do <path> da UF, já em coordenadas do quadro. */
  contorno: string;
  /** Centro visual da UF, para ancorar o marcador. */
  centro: { x: number; y: number };
}

/**
 * As 27 UFs projetadas. Calculado uma vez por processo — projetar 27
 * polígonos a cada requisição é trabalho repetido sobre dado imutável.
 */
export const UFS_PROJETADAS: ReadonlyArray<UfProjetada> = colecao.features.flatMap(
  (feature): UfProjetada[] => {
    const contorno = caminho(feature);
    const [x, y] = caminho.centroid(feature);
    if (!contorno || !Number.isFinite(x) || !Number.isFinite(y)) {
      // Geometria degenerada não vira marcador em posição inventada: some do
      // mapa, e a tabela por UF segue mostrando o número.
      return [];
    }
    return [
      {
        sigla: String(feature.properties?.sigla ?? feature.id ?? ""),
        nome: String(feature.properties?.nome ?? ""),
        contorno,
        centro: { x, y },
      },
    ];
  },
);

const POR_SIGLA = new Map(UFS_PROJETADAS.map((uf) => [uf.sigla, uf]));

export function ufProjetada(sigla: string): UfProjetada | undefined {
  return POR_SIGLA.get(sigla);
}

/**
 * Raio proporcional ao volume, com piso para o marcador continuar clicável e
 * legível quando o volume é 1. Área ∝ volume (daí a raiz): raio proporcional
 * ao valor exageraria as diferenças, que é o vício clássico de mapa de bolha.
 */
export function raioDoMarcador(valor: number, maior: number): number {
  if (valor <= 0 || maior <= 0) {
    return 0;
  }
  return 5 + Math.sqrt(valor / maior) * 21;
}
