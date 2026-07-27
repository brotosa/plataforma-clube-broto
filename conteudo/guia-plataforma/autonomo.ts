import { readFileSync } from "node:fs";
import { join } from "node:path";
import { montarGuiaHtml, SCRIPT_DO_SUMARIO } from "./montar";

/**
 * Documento autônomo do Guia da Plataforma (Onda 9, ficha §1.6).
 *
 * O segundo destino do mesmo conteúdo: o arquivo que circula por e-mail e
 * vira PDF pelo navegador. Ele **não** tem texto próprio — chama
 * `montarGuiaHtml`, exatamente como a rota. O que ele acrescenta é a
 * moldura que a rota recebe do shell: `<html>`, as folhas de estilo e as
 * fontes.
 *
 * Autocontido de verdade: estilos embutidos e fontes em `data:`. Um
 * documento que circula e abre sem rede com a tipografia quebrada é um
 * documento pior do que o que o Design entregou — e o que o Design
 * entregou também embutia as fontes.
 *
 * Determinístico por obrigação: nada de data de geração nem de hash de
 * build no arquivo. É o que permite ao teste de sincronia regerar e
 * comparar, e é assim que o documento que já saiu de casa não envelhece
 * calado.
 */

export const CAMINHO_DO_AUTONOMO = "public/guia-da-plataforma.html";

/** Estilos que o shell dá à rota e o documento precisa declarar sozinho. */
const BASE_DO_DOCUMENTO = `
html{scroll-behavior:smooth}
body{margin:0;background:var(--off);color:var(--preto);font-family:'Inter',system-ui,sans-serif}
a{color:var(--azul-texto-aaa)}
a:hover{color:var(--azul)}
@media (prefers-reduced-motion:reduce){html{scroll-behavior:auto}}
`.trim();

function ler(caminhoRelativo: string): string {
  return readFileSync(join(process.cwd(), caminhoRelativo), "utf8");
}

/**
 * Troca `url("/fontes/x.woff2")` por `data:` — o mesmo conjunto que a
 * plataforma auto-hospeda, embutido para o arquivo viajar sozinho.
 */
function embutirFontes(css: string): string {
  return css.replace(/url\("\/fontes\/([^"]+)"\)/g, (_todo, arquivo: string) => {
    const bytes = readFileSync(join(process.cwd(), "public/fontes", arquivo));
    return `url("data:font/woff2;base64,${bytes.toString("base64")}")`;
  });
}

/**
 * Monta o documento autônomo completo.
 *
 * Pura de propósito: recebe do disco só o que é fonte (conteúdo, estilos e
 * fontes) e devolve texto. Quem escreve o arquivo é o script de geração —
 * assim o teste de sincronia pode chamar esta função sem tocar no disco de
 * saída.
 */
export function montarDocumentoAutonomo(): string {
  const tokens = ler("design/tokens.css");
  const admin = ler("design/dseed-admin.css");
  const fontes = embutirFontes(ler("app/fontes.css"));

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Guia da Plataforma — Gestão do Clube Broto</title>
<!--
  Documento gerado a partir de conteudo/guia-plataforma — não edite aqui.
  O texto vive em capa.html e secoes.html, o sumário em indice.ts, e este
  arquivo é regerado por "pnpm guia:gerar". Uma correção feita direto aqui
  se perde na próxima geração, e até lá faz o documento divergir da rota
  /ajuda, que é o defeito que a ficha §1.6 existe para impedir.
-->
<style>
${fontes}
</style>
<style>
${tokens}
</style>
<style>
${admin}
</style>
<style>
${BASE_DO_DOCUMENTO}
</style>
</head>
<body>

<div class="gd">
${montarGuiaHtml()}
</div>

<script>
${SCRIPT_DO_SUMARIO}
</script>

</body>
</html>
`;
}
