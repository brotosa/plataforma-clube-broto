"use client";

import { useEffect, useRef, useState } from "react";

import type { TabelaPivotada } from "@/dominio/relatorios/pivo";
import {
  type MarcaDoDesenho,
  type Visualizacao,
  marcasDoDesenho,
} from "@/dominio/relatorios/visualizacao";

/**
 * O desenho da visualização (RN81/RN82) — SVG escrito à mão.
 *
 * ## Por que à mão
 *
 * O `CLAUDE.md` proíbe biblioteca de componentes de terceiros, e a proibição
 * vale aqui: uma biblioteca de gráficos traz o próprio sistema de cores, a
 * própria tipografia e as próprias decisões sobre o que fazer com um valor
 * ausente — as três coisas que esta plataforma decide de outro jeito. A que
 * mais importa é a terceira: toda biblioteca que eu conheça desenha `null`
 * como zero, ou pula o ponto, e nenhuma das duas é o que a RN53 manda.
 *
 * ## O que este arquivo NÃO decide
 *
 * Qual tipo serve, se a forma comporta, se há recusa. Tudo isso é
 * `dominio/relatorios/visualizacao.ts`, e chega aqui decidido. Este arquivo
 * pega marcas e produz geometria.
 *
 * ## A largura vem do DOM, não do `viewBox`
 *
 * Um `viewBox` com `width: 100%` seria bem mais curto de escrever, e escala o
 * texto junto: num painel estreito os rótulos ficariam ilegíveis, e num largo
 * ficariam enormes. Medir o contêiner custa um `ResizeObserver` e mantém o
 * texto no tamanho que a plataforma usa em todo lugar.
 */

/** Paleta das séries. Escuras porque recebem rótulo por cima e ao lado. */
const SERIES = [
  "var(--rel-serie-1)",
  "var(--rel-serie-2)",
  "var(--rel-serie-3)",
  "var(--rel-serie-4)",
  "var(--rel-serie-5)",
  "var(--rel-serie-6)",
];

const EIXO = "var(--paragrafo-aaa)";
const GRADE = "var(--borda)";
const FONTE = "Inter, system-ui, sans-serif";

function formatar(valor: number): string {
  return valor.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

/** Largura do contêiner, observada. Zero até a primeira medição. */
function useLargura(): [React.RefObject<HTMLDivElement | null>, number] {
  const referencia = useRef<HTMLDivElement | null>(null);
  const [largura, setLargura] = useState(0);
  useEffect(() => {
    const no = referencia.current;
    if (!no) return;
    const observador = new ResizeObserver(([entrada]) => {
      if (entrada) setLargura(entrada.contentRect.width);
    });
    observador.observe(no);
    return () => observador.disconnect();
  }, []);
  return [referencia, largura];
}

/**
 * Escala "bonita" para o eixo: o maior valor arredondado para cima até 1, 2 ou
 * 5 vezes uma potência de dez.
 *
 * Sem isso o topo do eixo seria o próprio máximo, e a marca de grade diria
 * "1.251" em vez de "1.500" — legível, mas ruim de comparar entre dois
 * gráficos do mesmo relatório.
 */
function tetoBonito(maximo: number): number {
  if (maximo <= 0) return 1;
  const potencia = 10 ** Math.floor(Math.log10(maximo));
  for (const passo of [1, 2, 2.5, 5, 10]) {
    if (maximo <= passo * potencia) return passo * potencia;
  }
  return 10 * potencia;
}

interface Serie {
  nome: string;
  cor: string;
}

/** Agrupa as marcas por categoria, preservando a ordem em que vieram. */
function porCategoria(marcas: ReadonlyArray<MarcaDoDesenho>) {
  const mapa = new Map<string, Map<string, number | null>>();
  for (const marca of marcas) {
    if (!mapa.has(marca.rotulo)) mapa.set(marca.rotulo, new Map());
    mapa.get(marca.rotulo)!.set(marca.serie, marca.valor);
  }
  return mapa;
}

/** A hachura da LACUNA — `null` nunca vira barra de altura zero (RN82). */
function Lacuna({ x, y, largura, altura }: { x: number; y: number; largura: number; altura: number }) {
  return (
    <>
      <rect
        x={x}
        y={y}
        width={Math.max(2, largura)}
        height={Math.max(2, altura)}
        fill="none"
        stroke="var(--cinza)"
        strokeDasharray="3 3"
      />
      <title>sem registro</title>
    </>
  );
}

// ---------------------------------------------------------------------
// Barras horizontais
// ---------------------------------------------------------------------

function Barras({
  marcas,
  series,
  largura,
  rotulosDeDado,
}: {
  marcas: ReadonlyArray<MarcaDoDesenho>;
  series: ReadonlyArray<Serie>;
  largura: number;
  rotulosDeDado: boolean;
}) {
  const grupos = porCategoria(marcas);
  const categorias = [...grupos.keys()];
  const valores = marcas.map((m) => m.valor).filter((v): v is number => v !== null);
  const teto = tetoBonito(Math.max(0, ...valores));

  const colunaRotulo = Math.min(190, Math.max(90, largura * 0.22));
  const folgaValor = rotulosDeDado ? 58 : 12;
  const eixo = Math.max(40, largura - colunaRotulo - folgaValor);
  const alturaBarra = series.length > 1 ? 13 : 17;
  const alturaGrupo = series.length * (alturaBarra + 3) + 12;
  const altura = categorias.length * alturaGrupo + 26;
  const marcasDeGrade = [0, 0.5, 1];

  return (
    <svg width={largura} height={altura} style={{ display: "block" }} aria-hidden="true">
      {marcasDeGrade.map((fracao) => {
        const x = colunaRotulo + eixo * fracao;
        return (
          <g key={fracao}>
            <line x1={x} y1={0} x2={x} y2={altura - 22} stroke={GRADE} />
            <text x={x} y={altura - 6} fontSize="10" fill={EIXO} textAnchor="middle" fontFamily={FONTE}>
              {formatar(teto * fracao)}
            </text>
          </g>
        );
      })}
      {categorias.map((categoria, indice) => {
        const base = indice * alturaGrupo + 6;
        return (
          <g key={categoria}>
            <text
              x={colunaRotulo - 8}
              y={base + alturaGrupo / 2 - 4}
              fontSize="11"
              fill="var(--preto)"
              textAnchor="end"
              fontFamily={FONTE}
            >
              {categoria.length > 26 ? `${categoria.slice(0, 25)}…` : categoria}
            </text>
            {series.map((serie, si) => {
              const valor = grupos.get(categoria)?.get(serie.nome) ?? null;
              const y = base + si * (alturaBarra + 3);
              if (valor === null) {
                return (
                  <Lacuna key={serie.nome} x={colunaRotulo} y={y} largura={22} altura={alturaBarra} />
                );
              }
              const comprimento = Math.max(2, (eixo * valor) / teto);
              return (
                <g key={serie.nome}>
                  <rect
                    x={colunaRotulo}
                    y={y}
                    width={comprimento}
                    height={alturaBarra}
                    rx={3}
                    fill={serie.cor}
                  />
                  {rotulosDeDado ? (
                    <text
                      x={colunaRotulo + comprimento + 6}
                      y={y + alturaBarra - 3}
                      fontSize="11"
                      fill={EIXO}
                      fontFamily={FONTE}
                    >
                      {formatar(valor)}
                    </text>
                  ) : null}
                </g>
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------------
// Colunas — agrupadas, empilhadas e 100%
// ---------------------------------------------------------------------

function Colunas({
  marcas,
  series,
  largura,
  rotulosDeDado,
  empilhamento,
}: {
  marcas: ReadonlyArray<MarcaDoDesenho>;
  series: ReadonlyArray<Serie>;
  largura: number;
  rotulosDeDado: boolean;
  empilhamento: "AGRUPADO" | "EMPILHADO" | "CEM_POR_CENTO";
}) {
  const grupos = porCategoria(marcas);
  const categorias = [...grupos.keys()];
  const altura = 280;
  const esquerda = 52;
  const base = altura - 44;
  const topo = 14;

  const somaDaCategoria = (categoria: string) =>
    series.reduce((soma, serie) => {
      const valor = grupos.get(categoria)?.get(serie.nome);
      // Lacuna não entra na soma: ela não é zero, é ausência.
      return soma + (typeof valor === "number" ? valor : 0);
    }, 0);

  const percentual = empilhamento === "CEM_POR_CENTO";
  const empilhado = empilhamento !== "AGRUPADO";
  const maximo = percentual
    ? 100
    : empilhado
      ? Math.max(...categorias.map(somaDaCategoria))
      : Math.max(0, ...marcas.map((m) => m.valor ?? 0));
  const teto = percentual ? 100 : tetoBonito(maximo);

  const faixa = (largura - esquerda - 16) / Math.max(1, categorias.length);
  const larguraColuna = empilhado
    ? Math.min(54, faixa * 0.55)
    : Math.min(40, (faixa * 0.8) / series.length);

  return (
    <svg width={largura} height={altura} style={{ display: "block" }} aria-hidden="true">
      {[0, 0.5, 1].map((fracao) => {
        const y = base - (base - topo) * fracao;
        return (
          <g key={fracao}>
            <line x1={esquerda} y1={y} x2={largura - 16} y2={y} stroke={GRADE} />
            <text x={esquerda - 8} y={y + 4} fontSize="10" fill={EIXO} textAnchor="end" fontFamily={FONTE}>
              {percentual ? `${teto * fracao}%` : formatar(teto * fracao)}
            </text>
          </g>
        );
      })}
      {categorias.map((categoria, ci) => {
        const centro = esquerda + faixa * ci + faixa / 2;
        const total = somaDaCategoria(categoria);
        let acumulado = 0;
        return (
          <g key={categoria}>
            {series.map((serie, si) => {
              const bruto = grupos.get(categoria)?.get(serie.nome) ?? null;
              if (bruto === null) {
                if (empilhado) return null;
                const x = centro - (larguraColuna * series.length) / 2 + si * larguraColuna;
                return <Lacuna key={serie.nome} x={x + 2} y={base - 18} largura={larguraColuna - 4} altura={18} />;
              }
              const valor = percentual && total > 0 ? (bruto / total) * 100 : bruto;
              const comprimento = Math.max(2, ((base - topo) * valor) / teto);
              const x = empilhado
                ? centro - larguraColuna / 2
                : centro - (larguraColuna * series.length) / 2 + si * larguraColuna;
              const y = empilhado ? base - acumulado - comprimento : base - comprimento;
              if (empilhado) acumulado += comprimento;
              return (
                <g key={serie.nome}>
                  <rect
                    x={empilhado ? x : x + 2}
                    y={y}
                    width={empilhado ? larguraColuna : larguraColuna - 4}
                    height={comprimento}
                    rx={2}
                    fill={serie.cor}
                  />
                  {rotulosDeDado && !empilhado ? (
                    <text
                      x={x + larguraColuna / 2}
                      y={y - 5}
                      fontSize="10.5"
                      fill={EIXO}
                      textAnchor="middle"
                      fontFamily={FONTE}
                    >
                      {formatar(bruto)}
                    </text>
                  ) : null}
                </g>
              );
            })}
            <text x={centro} y={base + 18} fontSize="10.5" fill="var(--preto)" textAnchor="middle" fontFamily={FONTE}>
              {categoria.length > 14 ? `${categoria.slice(0, 13)}…` : categoria}
            </text>
          </g>
        );
      })}
      <line x1={esquerda} y1={base} x2={largura - 16} y2={base} stroke={EIXO} />
    </svg>
  );
}

// ---------------------------------------------------------------------
// Linha e área
// ---------------------------------------------------------------------

function LinhaOuArea({
  marcas,
  series,
  largura,
  comArea,
  marcadores,
}: {
  marcas: ReadonlyArray<MarcaDoDesenho>;
  series: ReadonlyArray<Serie>;
  largura: number;
  comArea: boolean;
  marcadores: boolean;
}) {
  const grupos = porCategoria(marcas);
  const categorias = [...grupos.keys()];
  const altura = 250;
  const esquerda = 52;
  const base = altura - 36;
  const topo = 14;
  const teto = tetoBonito(Math.max(0, ...marcas.map((m) => m.valor ?? 0)));
  const passo = categorias.length > 1 ? (largura - esquerda - 20) / (categorias.length - 1) : 0;

  const pontoX = (indice: number) => esquerda + passo * indice;
  const pontoY = (valor: number) => base - ((base - topo) * valor) / teto;

  return (
    <svg width={largura} height={altura} style={{ display: "block" }} aria-hidden="true">
      {[0, 0.5, 1].map((fracao) => {
        const y = base - (base - topo) * fracao;
        return (
          <g key={fracao}>
            <line x1={esquerda} y1={y} x2={largura - 20} y2={y} stroke={GRADE} />
            <text x={esquerda - 8} y={y + 4} fontSize="10" fill={EIXO} textAnchor="end" fontFamily={FONTE}>
              {formatar(teto * fracao)}
            </text>
          </g>
        );
      })}
      {series.map((serie) => {
        /*
         * A lacuna INTERROMPE a linha, e não a atravessa. Ligar dois pontos
         * por cima de um mês sem registro desenharia uma variação que ninguém
         * mediu — e é justamente a leitura que a linha sugere com mais força.
         */
        const trechos: Array<Array<[number, number]>> = [];
        let atual: Array<[number, number]> = [];
        categorias.forEach((categoria, indice) => {
          const valor = grupos.get(categoria)?.get(serie.nome) ?? null;
          if (valor === null) {
            if (atual.length > 0) trechos.push(atual);
            atual = [];
            return;
          }
          atual.push([pontoX(indice), pontoY(valor)]);
        });
        if (atual.length > 0) trechos.push(atual);

        return (
          <g key={serie.nome}>
            {trechos.map((trecho, ti) => {
              const d = trecho.map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
              return (
                <g key={ti}>
                  {comArea && trecho.length > 1 ? (
                    <path
                      d={`${d} L ${trecho[trecho.length - 1]![0].toFixed(1)} ${base} L ${trecho[0]![0].toFixed(1)} ${base} Z`}
                      fill={serie.cor}
                      opacity={0.14}
                    />
                  ) : null}
                  <path d={d} fill="none" stroke={serie.cor} strokeWidth={2.2} strokeLinejoin="round" />
                  {marcadores
                    ? trecho.map(([x, y], i) => (
                        <circle key={i} cx={x} cy={y} r={2.8} fill={serie.cor} />
                      ))
                    : null}
                </g>
              );
            })}
          </g>
        );
      })}
      {categorias.map((categoria, indice) => (
        <text
          key={categoria}
          x={pontoX(indice)}
          y={altura - 8}
          fontSize="10"
          fill={EIXO}
          textAnchor="middle"
          fontFamily={FONTE}
        >
          {categoria.length > 10 ? `${categoria.slice(0, 9)}…` : categoria}
        </text>
      ))}
      <line x1={esquerda} y1={base} x2={largura - 20} y2={base} stroke={EIXO} />
    </svg>
  );
}

// ---------------------------------------------------------------------
// Rosca
// ---------------------------------------------------------------------

function Rosca({ marcas, largura }: { marcas: ReadonlyArray<MarcaDoDesenho>; largura: number }) {
  const fatias = marcas.filter((m): m is MarcaDoDesenho & { valor: number } => m.valor !== null);
  const total = fatias.reduce((soma, fatia) => soma + fatia.valor, 0);
  const tamanho = Math.min(230, Math.max(150, largura * 0.4));
  const raio = tamanho / 2 - 4;
  const centro = tamanho / 2;
  const espessura = Math.max(26, tamanho * 0.17);

  let acumulado = 0;
  return (
    <div style={{ display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
      <svg width={tamanho} height={tamanho} style={{ display: "block", flex: "none" }} aria-hidden="true">
        {fatias.map((fatia, indice) => {
          const inicio = (acumulado / total) * 2 * Math.PI - Math.PI / 2;
          acumulado += fatia.valor;
          const fim = (acumulado / total) * 2 * Math.PI - Math.PI / 2;
          const arcoGrande = fim - inicio > Math.PI ? 1 : 0;
          const ponto = (angulo: number, r: number) =>
            `${(centro + r * Math.cos(angulo)).toFixed(2)} ${(centro + r * Math.sin(angulo)).toFixed(2)}`;
          return (
            <path
              key={fatia.rotulo}
              d={
                `M ${ponto(inicio, raio)} A ${raio} ${raio} 0 ${arcoGrande} 1 ${ponto(fim, raio)} ` +
                `L ${ponto(fim, raio - espessura)} A ${raio - espessura} ${raio - espessura} 0 ${arcoGrande} 0 ${ponto(inicio, raio - espessura)} Z`
              }
              fill={SERIES[indice % SERIES.length]}
            />
          );
        })}
        <text
          x={centro}
          y={centro - 1}
          textAnchor="middle"
          fontSize="22"
          fontWeight="700"
          fill="var(--preto)"
          fontFamily="Readex Pro, sans-serif"
        >
          {formatar(total)}
        </text>
        <text x={centro} y={centro + 16} textAnchor="middle" fontSize="10" fill={EIXO} fontFamily={FONTE}>
          total
        </text>
      </svg>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {fatias.map((fatia, indice) => (
          <span key={fatia.rotulo} className="rel-legenda-item">
            <i style={{ background: SERIES[indice % SERIES.length] }} />
            {fatia.rotulo} <strong>{formatar(fatia.valor)}</strong>
            <span className="rel-legenda-pct">
              {total > 0 ? `${((fatia.valor / total) * 100).toFixed(1)}%` : "—"}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// O componente
// ---------------------------------------------------------------------

export function GraficoDoRelatorio({
  tabela,
  visual,
  rotularCategoria,
}: {
  tabela: TabelaPivotada;
  visual: Visualizacao;
  rotularCategoria: (linha: TabelaPivotada["linhas"][number]) => string;
}) {
  const [referencia, largura] = useLargura();
  const marcas = marcasDoDesenho(tabela, visual, rotularCategoria);
  const nomesDeSerie = [...new Set(marcas.map((marca) => marca.serie))];
  const series: Serie[] = nomesDeSerie.map((nome, indice) => ({
    nome,
    cor: SERIES[indice % SERIES.length]!,
  }));

  /*
   * O resumo textual. A alternativa de verdade é a TABELA abaixo (RN81) — este
   * texto existe para quem chega no desenho pelo leitor de tela e precisa
   * saber o que ele é antes de decidir descer até ela.
   */
  const resumo =
    `Gráfico de ${visual.tipo.toLowerCase()} com ${marcas.length} valores. ` +
    "Os mesmos números estão na tabela abaixo.";

  const ajustes = visual.ajustes;
  const rotulosDeDado = ajustes.rotulosDeDado !== false;

  return (
    <div className="rel-grafico" ref={referencia} role="img" aria-label={resumo}>
      {largura > 0 ? (
        <>
          {visual.tipo === "NUMERO" ? (
            <GrandeNumero marcas={marcas} />
          ) : visual.tipo === "ROSCA" ? (
            <Rosca marcas={marcas} largura={largura} />
          ) : visual.tipo === "BARRAS" ? (
            <Barras marcas={marcas} series={series} largura={largura} rotulosDeDado={rotulosDeDado} />
          ) : visual.tipo === "COLUNAS" ? (
            <Colunas
              marcas={marcas}
              series={series}
              largura={largura}
              rotulosDeDado={rotulosDeDado}
              empilhamento={ajustes.empilhamento ?? "AGRUPADO"}
            />
          ) : (
            <LinhaOuArea
              marcas={marcas}
              series={series}
              largura={largura}
              comArea={visual.tipo === "AREA"}
              marcadores={ajustes.marcadores !== false}
            />
          )}
          {series.length > 1 && visual.tipo !== "ROSCA" ? (
            <div className="rel-legenda">
              {series.map((serie) => (
                <span key={serie.nome} className="rel-legenda-item">
                  <i style={{ background: serie.cor }} />
                  {serie.nome}
                </span>
              ))}
              {/* A lacuna entra na legenda: sem isto, a hachura é um enigma. */}
              {marcas.some((marca) => marca.valor === null) ? (
                <span className="rel-legenda-item">
                  <i className="rel-legenda-lacuna" />
                  sem registro
                </span>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function GrandeNumero({ marcas }: { marcas: ReadonlyArray<MarcaDoDesenho> }) {
  const marca = marcas[0];
  return (
    <div className="rel-numerao">
      <span className="rel-numerao-v">{marca?.valor === null || marca === undefined ? "—" : formatar(marca.valor)}</span>
      <span className="rel-numerao-r">{marca?.serie ?? ""}</span>
    </div>
  );
}
