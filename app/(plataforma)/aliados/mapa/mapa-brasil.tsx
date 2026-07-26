import type { LinhaDeUf, ModoGeografico } from "@/dominio/geografia/distribuicao";
import { ROTULOS_MODO } from "@/dominio/geografia/distribuicao";
import {
  ALTURA_MAPA,
  LARGURA_MAPA,
  UFS_PROJETADAS,
  raioDoMarcador,
  ufProjetada,
} from "@/infra/geografia/projecao";

/**
 * Mapa do Brasil da T30 — SVG montado no servidor.
 *
 * Sem componente de cliente e sem biblioteca no navegador: a geometria já
 * chega projetada de `infra/geografia/projecao.ts`. O SVG é conteúdo, não
 * aplicação.
 *
 * Acessibilidade: o mapa é `role="img"` com descrição do que ele contém, e o
 * texto é explícito em dizer que os MESMOS números estão no ranking por
 * região e na tabela por UF logo ao lado. Mapa é apoio visual — quem navega
 * por leitor de tela não perde informação alguma, porque ela existe em forma
 * tabular na mesma tela.
 */

const FORMATO = new Intl.NumberFormat("pt-BR");

/** Quantos maiores recebem rótulo — mais que isso vira sopa de letras. */
const ROTULADOS = 5;

export function MapaBrasil({
  linhas,
  modo,
}: {
  linhas: ReadonlyArray<LinhaDeUf>;
  modo: ModoGeografico;
}) {
  const comVolume = [...linhas]
    .filter((linha) => linha.aliados > 0)
    .sort((a, b) => b.aliados - a.aliados || a.sigla.localeCompare(b.sigla, "pt-BR"));

  const maior = comVolume[0]?.aliados ?? 0;
  const total = comVolume.reduce((soma, linha) => soma + linha.aliados, 0);
  const paraRotular = new Set(comVolume.slice(0, ROTULADOS).map((linha) => linha.sigla));

  const descricao =
    comVolume.length === 0
      ? `Mapa do Brasil sem nenhum marcador: nenhuma UF tem aliado neste recorte, na leitura por ${ROTULOS_MODO[modo].toLowerCase()}. A tabela por UF ao lado traz as 27 unidades zeradas.`
      : `Mapa do Brasil com ${FORMATO.format(total)} registro(s) distribuídos em ${FORMATO.format(comVolume.length)} unidade(s) federativa(s), na leitura por ${ROTULOS_MODO[modo].toLowerCase()}. Os mesmos números estão no ranking por região e na tabela por UF, ao lado.`;

  return (
    <div className="mapa-caixa">
      <svg
        className="mapa-svg"
        viewBox={`0 0 ${LARGURA_MAPA} ${ALTURA_MAPA}`}
        role="img"
        aria-label={descricao}
      >
        {/* Contorno real das 27 UFs (Natural Earth) — o desenho de base. */}
        <g>
          {UFS_PROJETADAS.map((uf) => (
            <path
              key={uf.sigla}
              d={uf.contorno}
              fill="var(--off)"
              stroke="var(--borda)"
              strokeWidth={0.8}
              strokeLinejoin="round"
            />
          ))}
        </g>

        {/* Marcadores proporcionais, do maior para o menor: o menor fica por
            cima e continua alcançável pelo ponteiro. */}
        <g>
          {comVolume.map((linha) => {
            const uf = ufProjetada(linha.sigla);
            if (!uf) {
              return null;
            }
            const raio = raioDoMarcador(linha.aliados, maior);
            return (
              <g key={linha.sigla} className="mapa-pt" opacity={0.86}>
                <circle
                  cx={uf.centro.x.toFixed(1)}
                  cy={uf.centro.y.toFixed(1)}
                  r={raio.toFixed(1)}
                  fill="var(--azul)"
                  fillOpacity={0.72}
                  stroke="#fff"
                  strokeWidth={1.6}
                />
                <title>
                  {`${linha.nome} (${linha.sigla}) — ${FORMATO.format(linha.aliados)} aliado(s), ${FORMATO.format(linha.solucoes)} solução(ões)`}
                </title>
              </g>
            );
          })}
        </g>

        {/* Rótulos dos maiores; o lado do texto muda perto da borda direita
            para o nome não sair do quadro. */}
        <g aria-hidden="true">
          {comVolume
            .filter((linha) => paraRotular.has(linha.sigla))
            .map((linha) => {
              const uf = ufProjetada(linha.sigla);
              if (!uf) {
                return null;
              }
              const raio = raioDoMarcador(linha.aliados, maior);
              const paraDireita = uf.centro.x <= LARGURA_MAPA * 0.62;
              const x = uf.centro.x + (paraDireita ? raio + 7 : -(raio + 7));
              return (
                <text
                  key={linha.sigla}
                  x={x.toFixed(1)}
                  y={(uf.centro.y + 4).toFixed(1)}
                  textAnchor={paraDireita ? "start" : "end"}
                  fontSize={12}
                  fontWeight={600}
                  fill="var(--preto)"
                >
                  {linha.sigla}{" "}
                  <tspan fill="var(--paragrafo-aaa)" fontWeight={400}>
                    {FORMATO.format(linha.aliados)}
                  </tspan>
                </text>
              );
            })}
        </g>
      </svg>
    </div>
  );
}
