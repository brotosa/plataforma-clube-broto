import { rotularDimensao, type Celula, type TabelaPivotada } from "@/dominio/relatorios/pivo";
import { higienizarSvg } from "@/dominio/imagens/imagem";
import { avisoDeCorte, type Procedencia } from "@/dominio/relatorios/saida";

/**
 * RN83/RN85 — o relatório como documento autônomo, calibrado para impressão.
 *
 * ## É daqui que sai o PDF, e isso é decisão
 *
 * A plataforma **não gera PDF no servidor**. Gerar exigiria um navegador sem
 * cabeça dentro da imagem de contêiner — a mesma que a esteira constrói,
 * testa e publica a cada entrega (RN61) —, multiplicando o tamanho e o tempo
 * dela para produzir o que o navegador de quem pede já faz a partir deste
 * documento, com melhor resultado.
 *
 * ## Por que o CSS vem embutido
 *
 * O documento existe para circular: vira anexo, vai para uma pasta
 * compartilhada, é aberto num computador que nunca falou com a plataforma.
 * Folha de estilo externa o transformaria em texto preto sobre branco no
 * primeiro reenvio. É o mesmo desenho do Guia autônomo
 * (`scripts/gerar-guia-autonomo.ts`), pelo mesmo motivo.
 *
 * ## O que ele NÃO faz
 *
 * Não consulta nada. Recebe tabela pronta e procedência pronta, e devolve
 * texto — a metade da RN83 que a cerca de arquitetura prende.
 */

/**
 * Escape de HTML.
 *
 * Todo texto que entra aqui vem do banco ou do catálogo, e nada disso é
 * confiável por origem: o nome de um aliado é digitado por gente, e um nome
 * com `<` quebraria o documento mesmo sem má intenção. As aspas entram
 * porque rótulo de dimensão é interpolado dentro de atributo em um ponto.
 */
function escapar(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function celula(valor: Celula): string {
  if (valor === null) return '<td class="vazia">—</td>';
  if (typeof valor === "boolean") return `<td>${valor ? "Sim" : "Não"}</td>`;
  if (typeof valor === "number") {
    return `<td class="num">${escapar(valor.toLocaleString("pt-BR"))}</td>`;
  }
  return `<td>${escapar(String(valor))}</td>`;
}

const ESTILO = `
:root{--preto:#282313;--paragrafo:#55503f;--borda:#e3e0d6;--off:#f7f6f2;
  --azul:#465eff;--alerta:#8a5a00;--alerta-fundo:#fff6e0;--alerta-borda:#e8c87a}
*{box-sizing:border-box}
body{margin:0;padding:28px;background:#fff;color:var(--preto);
  font:14px/1.5 "Inter",system-ui,-apple-system,"Segoe UI",sans-serif}
h1{font-size:22px;line-height:1.25;margin:0 0 4px}
.proc{border-bottom:1px solid var(--borda);padding-bottom:16px;margin-bottom:18px}
.proc dl{display:grid;grid-template-columns:auto 1fr;gap:2px 14px;margin:12px 0 0;
  font-size:12.5px;color:var(--paragrafo)}
.proc dt{font-weight:600;color:var(--preto)}
.proc dd{margin:0}
.corte{background:var(--alerta-fundo);border:1px solid var(--alerta-borda);
  border-radius:6px;padding:10px 12px;margin:0 0 18px;color:var(--alerta);font-size:13px}
.desenho{margin:0 0 22px}
.desenho svg{max-width:100%;height:auto}
table{width:100%;border-collapse:collapse;font-size:13px}
caption{text-align:left;font-weight:600;padding-bottom:8px}
th,td{padding:6px 10px;border-bottom:1px solid var(--borda);text-align:left;
  vertical-align:top}
thead th{background:var(--off);border-bottom:2px solid var(--borda);font-weight:600}
td.num{text-align:right;font-variant-numeric:tabular-nums}
td.vazia{color:var(--paragrafo)}
tbody tr:nth-child(even){background:#fbfaf8}
.rodape{margin-top:22px;padding-top:12px;border-top:1px solid var(--borda);
  font-size:11.5px;color:var(--paragrafo)}
@media print{
  /* O aviso de corte IMPRIME. Pô-lo em @media screen faria o arquivo
     impresso mentir por omissão — que é o defeito que a RN85 combate. */
  body{padding:0}
  thead{display:table-header-group}
  tr{break-inside:avoid}
  .desenho{break-inside:avoid;break-after:auto}
}
`;

export interface DocumentoDeRelatorio {
  titulo: string;
  tabela: TabelaPivotada;
  procedencia: Procedencia;
  /**
   * O gráfico, já desenhado, como SVG em linha.
   *
   * Chega pronto de propósito: quem desenha é a tela (F27), e redesenhar aqui
   * criaria um segundo desenho para a mesma coisa — exatamente o defeito que
   * a RN60 nomeia ("um segundo caminho paralelo para a mesma coisa"). Ausente
   * quando o relatório está em tabela, ou quando o desenho foi recusado.
   *
   * **É entrada NÃO CONFIÁVEL, e é tratada como tal.** Ele chega pelo corpo
   * de uma requisição: o que o navegador manda é o que a tela desenhou, mas
   * o que a *rota* recebe é o que quem chamou quis mandar. Um `<script>`
   * dentro dele sairia num documento que circula por e-mail e pasta
   * compartilhada, e seria aberto por outra pessoa, noutro computador.
   *
   * Por isso passa por `higienizarSvg` — **o mesmo** da marca do aliado
   * (RN54) e da imagem do card (RN60), não um segundo. Escrever outro
   * higienizador aqui seria o defeito que a própria RN60 nomeia, e o novo
   * nasceria pior: aquele já sabe que `<script>` aberto e nunca fechado
   * engole o resto do arquivo, e que `java\tscript:` atravessa quem só
   * compara prefixo.
   */
  svg?: string;
}

export function montarDocumentoHtml(documento: DocumentoDeRelatorio): string {
  const { tabela, procedencia } = documento;
  const corte = avisoDeCorte(procedencia);

  const linhasDeProcedencia: Array<[string, string]> = [
    ["Assunto", procedencia.assunto],
    ["Gerado por", procedencia.autor],
    [
      "Gerado em",
      procedencia.geradoEm.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }),
    ],
    ["Linhas", procedencia.linhas.toLocaleString("pt-BR")],
  ];
  if (procedencia.finalidade) {
    linhasDeProcedencia.push(["Finalidade declarada", procedencia.finalidade]);
  }
  if (procedencia.filtros.length > 0) {
    linhasDeProcedencia.push(["Filtros", procedencia.filtros.join(" · ")]);
  } else {
    // "Sem filtros" é informação, e é diferente de a linha não existir:
    // quem recebe o arquivo precisa saber se está vendo o conjunto todo.
    linhasDeProcedencia.push(["Filtros", "nenhum — conjunto completo do assunto"]);
  }

  const cabecalhos = [
    ...tabela.dimensoes.map((dimensao) => ({ rotulo: dimensao.rotulo, num: false })),
    ...tabela.medidas.map((medida) => ({
      rotulo: medida.contexto ? `${medida.rotulo} · ${medida.contexto}` : medida.rotulo,
      num: true,
    })),
  ];

  const corpo = tabela.linhas
    .map((linha) => {
      const celulas = [
        ...linha.chaves.map(
          (chave, indice) =>
            `<td>${escapar(rotularDimensao(chave, tabela.dimensoes[indice]?.rotulosDeValor))}</td>`,
        ),
        ...tabela.medidas.map((medida) => celula(linha.celulas[medida.chave] ?? null)),
      ];
      return `<tr>${celulas.join("")}</tr>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapar(documento.titulo)}</title>
<style>${ESTILO}</style>
</head>
<body>
<header class="proc">
  <h1>${escapar(documento.titulo)}</h1>
  <dl>
${linhasDeProcedencia
  .map(([termo, valor]) => `    <dt>${escapar(termo)}</dt><dd>${escapar(valor)}</dd>`)
  .join("\n")}
  </dl>
</header>
${corte ? `<p class="corte" role="alert">${escapar(corte)}</p>` : ""}
${documento.svg ? `<div class="desenho">${higienizarSvg(documento.svg)}</div>` : ""}
<table>
  <caption>${escapar(documento.svg ? "Os mesmos números do gráfico acima" : "Resultado")}</caption>
  <thead>
    <tr>${cabecalhos
      .map((coluna) => `<th scope="col"${coluna.num ? ' class="num"' : ""}>${escapar(coluna.rotulo)}</th>`)
      .join("")}</tr>
  </thead>
  <tbody>
${corpo}
  </tbody>
</table>
<p class="rodape">Plataforma de gestão do Clube · Broto S.A. — documento gerado pela plataforma; confira a procedência acima antes de citá-lo.</p>
</body>
</html>
`;
}
