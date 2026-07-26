/**
 * Gera o asset de geometria do Brasil usado pela T30 (Onda 7).
 *
 * Por que um script e não uma busca em runtime: o prompt da Onda 7 é
 * explícito — a geometria é **asset estático versionado no repositório**,
 * nunca buscada de CDN quando a tela abre. Uma tela de produção que
 * depende de rede de terceiros para desenhar é uma tela que quebra sem
 * aviso. O script existe para a proveniência ser **reproduzível**: quem
 * duvidar do contorno roda `node scripts/gerar-geometria-brasil.mjs` e
 * compara com o arquivo commitado.
 *
 * Fonte: Natural Earth 1:50m Admin 1 — States/Provinces, domínio público,
 * pelo repositório de referência `nvkelso/natural-earth-vector`. Nenhum
 * contorno é desenhado à mão (ficha Onda 7 §3).
 *
 * Uso: node scripts/gerar-geometria-brasil.mjs
 */

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const FONTE =
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_1_states_provinces.geojson";

/**
 * Três casas decimais ≈ 100 m no equador — resolução muito acima do que um
 * mapa de 560 px de largura consegue exibir, e corta o arquivo em ~4×.
 */
const CASAS = 3;

const destino = join(
  dirname(dirname(fileURLToPath(import.meta.url))),
  "infra",
  "geografia",
  "brasil-ufs.geo.json",
);

function arredondar(valor) {
  return Number(valor.toFixed(CASAS));
}

/**
 * Arredonda o anel e remove vértices que colapsaram em duplicata — sem
 * isso o arredondamento deixa segmentos de comprimento zero, que o d3-geo
 * projeta como artefatos visíveis na costa.
 */
function arredondarAnel(anel) {
  const saida = [];
  for (const [lng, lat] of anel) {
    const ponto = [arredondar(lng), arredondar(lat)];
    const anterior = saida[saida.length - 1];
    if (anterior && anterior[0] === ponto[0] && anterior[1] === ponto[1]) {
      continue;
    }
    saida.push(ponto);
  }
  // Polígono precisa fechar: se o arredondamento separou o último do
  // primeiro, fecha explicitamente.
  const primeiro = saida[0];
  const ultimo = saida[saida.length - 1];
  if (primeiro && ultimo && (primeiro[0] !== ultimo[0] || primeiro[1] !== ultimo[1])) {
    saida.push([primeiro[0], primeiro[1]]);
  }
  // Menos de 4 posições não é anel válido (GeoJSON RFC 7946 §3.1.6).
  return saida.length >= 4 ? saida : null;
}

function arredondarGeometria(geometria) {
  if (geometria.type === "Polygon") {
    const aneis = geometria.coordinates.map(arredondarAnel).filter(Boolean);
    return aneis.length > 0 ? { type: "Polygon", coordinates: aneis } : null;
  }
  if (geometria.type === "MultiPolygon") {
    const poligonos = geometria.coordinates
      .map((poligono) => poligono.map(arredondarAnel).filter(Boolean))
      .filter((poligono) => poligono.length > 0);
    return poligonos.length > 0 ? { type: "MultiPolygon", coordinates: poligonos } : null;
  }
  throw new Error(`Geometria inesperada: ${geometria.type}`);
}

const resposta = await fetch(FONTE);
if (!resposta.ok) {
  throw new Error(`Natural Earth respondeu ${resposta.status} — geometria não gerada.`);
}
const colecao = await resposta.json();

const ufs = colecao.features
  .filter((feature) => feature.properties.iso_a2 === "BR")
  .map((feature) => ({
    sigla: feature.properties.postal,
    nome: feature.properties.name,
    geometry: arredondarGeometria(feature.geometry),
  }))
  .filter((uf) => uf.geometry !== null)
  .sort((a, b) => a.sigla.localeCompare(b.sigla, "pt-BR"));

if (ufs.length !== 27) {
  throw new Error(`Esperadas 27 unidades federativas, vieram ${ufs.length}.`);
}

const saida = {
  proveniencia:
    "Natural Earth 1:50m Admin 1 — States/Provinces (domínio público), via nvkelso/natural-earth-vector",
  fonte: FONTE,
  geradoPor: "scripts/gerar-geometria-brasil.mjs",
  casasDecimais: CASAS,
  ufs,
};

writeFileSync(destino, `${JSON.stringify(saida)}\n`);
process.stdout.write(
  `Geometria de ${ufs.length} UFs gravada em ${destino} ` +
    `(${(JSON.stringify(saida).length / 1024).toFixed(0)} kB).\n`,
);
