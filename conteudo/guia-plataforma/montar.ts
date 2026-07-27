import { INDICE_DO_GUIA, SECAO_DE_ABERTURA } from "./indice";
import { carregarGuia } from "./guia";

/**
 * Montagem do Guia da Plataforma (Onda 9, ficha §1.6).
 *
 * A fonte única não é só o texto: é o **documento montado**. Se a rota
 * armasse o sumário de um jeito e o autônomo de outro, a numeração das
 * seções divergiria na primeira correção editorial — que é exatamente o
 * defeito que a ficha manda evitar. Então há uma função, e os dois
 * destinos a chamam.
 *
 * O que difere entre eles é só a moldura: o shell da plataforma de um
 * lado, um HTML fechado do outro. O miolo é este.
 */

/** Escapa texto que vai para dentro do HTML montado. */
function escapar(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Ícone do sumário recolhido — o mesmo traço do documento original. */
const ICONE_SUMARIO =
  '<svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" ' +
  'stroke="currentColor" stroke-width="2" stroke-linecap="round">' +
  '<path d="M4 6h16M4 12h16M4 18h10"></path></svg>';

/**
 * Sumário recolhido do mobile — `<details>` fechado por padrão, para não
 * empurrar o texto para baixo da primeira dobra.
 */
function sumarioMobile(secaoAtiva: string): string {
  const rotuloAtivo =
    INDICE_DO_GUIA.find((entrada) => entrada.id === secaoAtiva)?.rotulo ??
    INDICE_DO_GUIA[0]?.rotulo ??
    "";
  let grupoAnterior = "";
  const itens = INDICE_DO_GUIA.map((entrada) => {
    const abre = entrada.grupo !== grupoAnterior;
    grupoAnterior = entrada.grupo;
    const grupo = abre ? `<div class="g">${escapar(entrada.grupo)}</div>` : "";
    const ativa = entrada.id === secaoAtiva;
    return (
      `${grupo}<a href="#${entrada.id}"${ativa ? ' class="on" aria-current="true"' : ""}>` +
      `${escapar(entrada.rotulo)}</a>`
    );
  }).join("\n      ");

  return `<details class="gd-idx-mob">
    <summary>
      ${ICONE_SUMARIO}
      Neste guia<span class="cap" style="margin-left:auto" data-guia-atual>${escapar(rotuloAtivo)}</span>
    </summary>
    <div class="lista">
      ${itens}
    </div>
  </details>`;
}

/** Sumário fixo da coluna à direita — índice da página, não segunda barra. */
function sumarioDeColuna(secaoAtiva: string): string {
  let grupoAnterior = "";
  const itens = INDICE_DO_GUIA.map((entrada) => {
    const abre = entrada.grupo !== grupoAnterior;
    grupoAnterior = entrada.grupo;
    const grupo = abre ? `<li class="g">${escapar(entrada.grupo)}</li>\n      ` : "";
    const ativa = entrada.id === secaoAtiva;
    return (
      `${grupo}<li><a href="#${entrada.id}"${ativa ? ' class="on" aria-current="true"' : ""}>` +
      `${escapar(entrada.rotulo)}</a></li>`
    );
  }).join("\n      ");

  return `<nav class="gd-idx" aria-label="Sumário do guia">
    <div class="gd-idx-t">Neste guia</div>
    <ol>
      ${itens}
    </ol>
  </nav>`;
}

export interface OpcoesDaMontagem {
  /**
   * Seção marcada como ativa na renderização do servidor. A rota conhece a
   * seção do módulo de origem; o documento autônomo abre na abertura. Em
   * ambos o realce se corrige sozinho na primeira rolagem.
   */
  readonly secaoAtiva?: string;
}

/**
 * Monta o miolo do guia — tudo que vive dentro de `.gd`.
 *
 * Ordem do documento original: atalho de teclado, capa, corpo em duas
 * colunas (documento e sumário) com o sumário recolhido do mobile no topo
 * da coluna de texto.
 */
export function montarGuiaHtml({ secaoAtiva = SECAO_DE_ABERTURA }: OpcoesDaMontagem = {}): string {
  const { capa, secoes } = carregarGuia();
  return `<a class="skip" href="#guia">Pular para o conteúdo</a>

${capa.trim()}

<div class="gd-corpo">
  <div class="gd-doc" id="guia">
  ${sumarioMobile(secaoAtiva)}

${secoes.trim()}
  </div>

  ${sumarioDeColuna(secaoAtiva)}
</div>`;
}

/**
 * Realce da seção corrente — comportamento, e também de fonte única.
 *
 * Vai como texto porque os dois destinos precisam do **mesmo** script: na
 * rota ele entra por `next/script`, no autônomo por uma `<script>` inline.
 * Reimplementá-lo em TSX de um lado e em JS do outro seria a mesma
 * divergência que a ficha combate no texto, só que em outro arquivo.
 *
 * Duas coisas o protótipo já tinha resolvido e valem repetir: um
 * `IntersectionObserver` sozinho não serve, porque dentro do shell quem
 * rola é o `<main>` e não a janela; e a âncora precisa ser posicionada no
 * container certo quando o navegador não o faz.
 */
export const SCRIPT_DO_SUMARIO = `(function () {
  var secoes = ${JSON.stringify(INDICE_DO_GUIA.map((entrada) => entrada.id))};
  var raiz = document.querySelector('.gd');
  if (!raiz) return;

  // O container rolável: dentro do shell é o <main>; no documento autônomo
  // é a própria página.
  var container = raiz.closest('main') || document.scrollingElement || document.documentElement;
  var links = raiz.querySelectorAll('.gd-idx a, .gd-idx-mob a');
  var atualLabel = raiz.querySelector('[data-guia-atual]');
  var ativo = '';

  function marcar(id) {
    if (id === ativo) return;
    ativo = id;
    for (var i = 0; i < links.length; i++) {
      var link = links[i];
      var casa = link.getAttribute('href') === '#' + id;
      link.classList.toggle('on', casa);
      if (casa) {
        link.setAttribute('aria-current', 'true');
        if (atualLabel) atualLabel.textContent = link.textContent;
      } else {
        link.removeAttribute('aria-current');
      }
    }
  }

  function calcular() {
    // A seção corrente é a última cujo topo já passou da faixa de leitura.
    var faixa = window.innerHeight * 0.28;
    var corrente = secoes[0];
    for (var i = 0; i < secoes.length; i++) {
      var el = document.getElementById(secoes[i]);
      if (el && el.getBoundingClientRect().top <= faixa) corrente = secoes[i];
    }
    marcar(corrente);
  }

  var agendado = 0;
  function agendar() {
    if (agendado) return;
    agendado = requestAnimationFrame(function () {
      agendado = 0;
      calcular();
    });
  }

  function posicionar(id) {
    var el = document.getElementById(id);
    if (!el) return;
    if (container === document.scrollingElement || container === document.documentElement) {
      el.scrollIntoView();
    } else {
      // Rolagem do container, não da janela: a diferença entre os topos é o
      // deslocamento a aplicar, com a folga que a régua de .gd-sec declara.
      var folga = 20;
      container.scrollTop += el.getBoundingClientRect().top - container.getBoundingClientRect().top - folga;
    }
    marcar(id);
  }

  // No mobile o sumário é um <details>: escolher um destino deve fechá-lo.
  for (var i = 0; i < links.length; i++) {
    links[i].addEventListener('click', function (evento) {
      var recolhido = evento.currentTarget.closest('details');
      if (recolhido) recolhido.open = false;
      var alvo = (evento.currentTarget.getAttribute('href') || '').slice(1);
      if (alvo && document.getElementById(alvo)) {
        evento.preventDefault();
        history.replaceState(null, '', '#' + alvo);
        posicionar(alvo);
      }
    });
  }

  container.addEventListener('scroll', agendar, { passive: true });
  window.addEventListener('scroll', agendar, { passive: true });
  window.addEventListener('resize', agendar, { passive: true });

  var inicial = (location.hash || '').slice(1);
  if (inicial && secoes.indexOf(inicial) >= 0) {
    posicionar(inicial);
  } else {
    calcular();
  }
})();`;
