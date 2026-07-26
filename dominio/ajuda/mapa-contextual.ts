import { SECAO_DE_ABERTURA, ehSecaoConhecida } from "@/conteudo/guia-plataforma/indice";

/**
 * Ajuda contextual — o mapa e a origem (Onda 9, ficha §1.3 e §1.4, RN59).
 *
 * Duas responsabilidades, e vale dizer por que moram juntas: o mapa decide
 * **em que seção** o guia abre, e a resolução da origem decide **para onde**
 * a barra de volta devolve. As duas leem a mesma lista de módulos, e é
 * justamente isso que impede a segunda de virar uma allowlist paralela que
 * envelhece sozinha.
 *
 * O mapa é **uma constante nomeada**, não condicionais espalhadas pelas
 * telas: a ficha §1.3 é uma tabela, e uma tabela se lê melhor como tabela.
 * Módulo que não casa com nenhuma entrada abre na seção de abertura —
 * nunca em erro, nunca em tela vazia.
 */

/** Um módulo da plataforma, do ponto de vista da ajuda. */
export interface ModuloDeAjuda {
  /**
   * Padrão de caminho, por segmento. Segmento iniciado por `:` casa com
   * qualquer valor — é como as rotas dinâmicas (`/aliados/[id]`) entram
   * sem virar regex. `/` é a HOME e casa **apenas** com a raiz.
   */
  readonly padrao: string;
  /** Valor exigido de `?aba=`, quando a leitura do módulo é uma aba. */
  readonly aba?: string;
  /** Rótulo do módulo — o mesmo da lateral, que a barra de volta exibe. */
  readonly rotulo: string;
  /** Âncora da seção do guia que responde por este módulo. */
  readonly secao: string;
}

/**
 * A tabela da ficha §1.3, traduzida para as rotas que existem.
 *
 * A ordem aqui é editorial, não funcional: quem decide o casamento é a
 * especificidade (mais segmentos vence, e aba declarada vence aba
 * ausente), calculada em `encontrarModulo`. Assim acrescentar uma linha no
 * meio não muda o comportamento das outras — que é o defeito clássico de
 * lista ordenada por precedência implícita.
 */
export const MAPA_AJUDA: ReadonlyArray<ModuloDeAjuda> = [
  // Dashboard · Cobertura · Mapa da rede · Metas do funil → 4.5 Acompanhar a rede
  { padrao: "/", rotulo: "Dashboard", secao: "j5" },
  { padrao: "/aliados/cobertura", rotulo: "Aliados & Soluções", secao: "j5" },
  { padrao: "/aliados/mapa", rotulo: "Aliados & Soluções", secao: "j5" },
  { padrao: "/mercado", aba: "cobertura", rotulo: "Mercado & Scout", secao: "j5" },
  { padrao: "/mercado", aba: "metas", rotulo: "Mercado & Scout", secao: "j5" },
  // Mercado & Scout (radar, avaliação, dossiê, ficha M1) → 4.1 Trazer um aliado novo
  { padrao: "/mercado", rotulo: "Mercado & Scout", secao: "j1" },
  // Aliados & Soluções (lista, ficha) → 4.1 Trazer um aliado novo
  { padrao: "/aliados", rotulo: "Aliados & Soluções", secao: "j1" },
  // Cadastro de solução · Ofertas → 4.2 Publicar e manter ofertas
  { padrao: "/aliados/:id/solucoes", rotulo: "Aliados & Soluções", secao: "j2" },
  { padrao: "/ofertas", rotulo: "Ofertas", secao: "j2" },
  // Assinantes (carteira, perfil, importações, segmentos) → 4.3 Base de assinantes
  { padrao: "/assinantes", rotulo: "Assinantes", secao: "j3" },
  // Campanhas & Cestas → 4.4 Rodar uma campanha
  { padrao: "/campanhas", rotulo: "Campanhas & Cestas", secao: "j4" },
  // Parametrizador → 4.6 Configurar a plataforma
  { padrao: "/parametrizador", rotulo: "Parametrizador", secao: "j6" },
  // Usuários → 5 Papéis e permissões
  { padrao: "/usuarios", rotulo: "Usuários", secao: "papeis" },
  // Aprovações · Auditoria → 3 Os seis princípios
  { padrao: "/aprovacoes", rotulo: "Aprovações", secao: "princ" },
  { padrao: "/auditoria", rotulo: "Auditoria", secao: "princ" },
  /**
   * A carga inicial não consta da tabela da ficha — e é o caso que a RN59
   * prevê: módulo conhecido, seção não atribuída, abre na abertura. Está
   * aqui, e não fora do mapa, porque a volta precisa funcionar: deixá-la
   * de fora tiraria a barra de uma tela real da plataforma.
   */
  { padrao: "/carga-inicial", rotulo: "Carga inicial", secao: SECAO_DE_ABERTURA },
];

/**
 * Gramática de um segmento de caminho interno.
 *
 * Deliberadamente estreita: letras, dígitos e os quatro não reservados de
 * URL. Sem `%`, então nada de caminho percent-codificado — `%2F%2Fevil.com`
 * não tem como se reconstituir depois da validação. Sem `:`, então nenhum
 * esquema atravessa. Sem vazio, então `//` não forma segmento e
 * `//externo.com` morre aqui: o que viria depois da primeira barra seria
 * um segmento de comprimento zero.
 */
const SEGMENTO = /^[A-Za-z0-9._~-]+$/;

/** Tetos de sanidade — nenhuma rota real chega perto. */
const MAXIMO_DE_SEGMENTOS = 8;
const MAXIMO_DE_CARACTERES_DO_SEGMENTO = 64;
const MAXIMO_DE_PARAMETROS = 10;
const MAXIMO_DA_QUERY = 256;

/** Origem reconhecida: para onde a barra de volta devolve, e com que nome. */
export interface OrigemDaAjuda {
  /**
   * Caminho **reconstruído** a partir dos segmentos validados — nunca o
   * texto que veio na URL. Reconstruir é o que garante que a saída seja
   * exatamente aquilo que a validação aprovou.
   */
  readonly destino: string;
  /** Rótulo do módulo, para "← Voltar para {módulo}". */
  readonly rotulo: string;
  /** Seção do guia correspondente ao módulo. */
  readonly secao: string;
}

interface CaminhoValidado {
  readonly segmentos: ReadonlyArray<string>;
  readonly parametros: ReadonlyArray<readonly [string, string]>;
}

/**
 * Quebra e valida o caminho bruto vindo da URL.
 *
 * O caminho de origem chega por `?de=` e é, portanto, **entrada de
 * usuário**: quem digita o endereço escolhe o valor. Verificação de prefixo
 * não serve para nada aqui — `//externo.com` e `https://externo.com`
 * atravessam qualquer checagem ingênua de "começa com barra" ou "não
 * começa com http" e viram redirecionamento aberto. Por isso a validação é
 * estrutural: quebra em segmentos, exige a gramática de cada um e só então
 * consulta a allowlist.
 */
function validarCaminho(bruto: string): CaminhoValidado | null {
  if (bruto.length === 0 || bruto.length > 512) {
    return null;
  }
  // Fragmento não pertence à origem: a âncora da rota de ajuda é outra
  // coisa, e aceitar `#` aqui só criaria ambiguidade.
  if (bruto.includes("#") || bruto.includes("\\")) {
    return null;
  }
  const separador = bruto.indexOf("?");
  const caminho = separador === -1 ? bruto : bruto.slice(0, separador);
  const query = separador === -1 ? "" : bruto.slice(separador + 1);

  if (!caminho.startsWith("/")) {
    return null;
  }
  // "/" é a HOME: zero segmentos, e não um segmento vazio.
  const partes = caminho === "/" ? [] : caminho.slice(1).split("/");
  if (partes.length > MAXIMO_DE_SEGMENTOS) {
    return null;
  }
  for (const parte of partes) {
    if (parte.length > MAXIMO_DE_CARACTERES_DO_SEGMENTO || !SEGMENTO.test(parte)) {
      return null;
    }
    // `.` e `..` passam na gramática mas quebram a promessa central: o
    // navegador normaliza a travessia, e o destino de fato deixaria de ser
    // o caminho que a allowlist aprovou — a barra diria "Aliados" e levaria
    // a outro lugar. Recusado.
    if (parte === "." || parte === "..") {
      return null;
    }
  }

  if (query.length > MAXIMO_DA_QUERY) {
    return null;
  }
  const lidos = new URLSearchParams(query);
  const parametros = [...lidos.entries()];
  if (parametros.length > MAXIMO_DE_PARAMETROS) {
    return null;
  }
  return { segmentos: partes, parametros };
}

/**
 * Um padrão casa quando seus segmentos são prefixo dos do caminho.
 *
 * A raiz é a exceção e precisa ser dita: como padrão de zero segmentos,
 * `/` seria prefixo de *todo* caminho e o Dashboard responderia por rotas
 * que não existem. Casa só com a raiz.
 */
function padraoCasa(padrao: string, segmentos: ReadonlyArray<string>): number | null {
  if (padrao === "/") {
    return segmentos.length === 0 ? 0 : null;
  }
  const doPadrao = padrao.slice(1).split("/");
  if (doPadrao.length > segmentos.length) {
    return null;
  }
  for (const [indice, esperado] of doPadrao.entries()) {
    if (!esperado.startsWith(":") && esperado !== segmentos[indice]) {
      return null;
    }
  }
  return doPadrao.length;
}

/**
 * Encontra o módulo mais específico que responde por um caminho.
 *
 * Mais segmentos vence; entre empates, quem declara `aba` vence quem não
 * declara — é o que faz `/mercado?aba=metas` cair em 4.5 e `/mercado` em
 * 4.1, como a ficha §1.3 pede.
 */
function encontrarModulo(caminho: CaminhoValidado): ModuloDeAjuda | null {
  let melhor: ModuloDeAjuda | null = null;
  let melhorPeso = -1;
  for (const modulo of MAPA_AJUDA) {
    const casados = padraoCasa(modulo.padrao, caminho.segmentos);
    if (casados === null) {
      continue;
    }
    if (modulo.aba !== undefined) {
      const aba = caminho.parametros.find(([chave]) => chave === "aba")?.[1];
      if (aba !== modulo.aba) {
        continue;
      }
    }
    const peso = casados * 2 + (modulo.aba === undefined ? 0 : 1);
    if (peso > melhorPeso) {
      melhor = modulo;
      melhorPeso = peso;
    }
  }
  return melhor;
}

/**
 * Resolve a origem declarada em `?de=`.
 *
 * Devolve `null` quando o caminho não é interno, não obedece à gramática
 * ou não casa com nenhum módulo do `MAPA_AJUDA` — e `null` significa
 * exatamente o que a RN59 manda: **sem barra de volta**, sem destino
 * inventado. O acesso direto pela URL cai aqui, e é o comportamento certo.
 */
export function resolverOrigem(bruto: string | null | undefined): OrigemDaAjuda | null {
  if (typeof bruto !== "string") {
    return null;
  }
  const caminho = validarCaminho(bruto);
  if (!caminho) {
    return null;
  }
  const modulo = encontrarModulo(caminho);
  if (!modulo) {
    return null;
  }
  // Reconstrução: o destino sai dos segmentos aprovados, e a query volta
  // reserializada pelo `URLSearchParams`, que percent-codifica tudo. Em
  // nenhum ponto o texto original é repassado adiante.
  const reconstruido = `/${caminho.segmentos.join("/")}`;
  const query = new URLSearchParams(caminho.parametros.map(([c, v]) => [c, v])).toString();
  return {
    destino: query ? `${reconstruido}?${query}` : reconstruido,
    rotulo: modulo.rotulo,
    secao: modulo.secao,
  };
}

/**
 * Seção em que a ajuda abre para um caminho de origem.
 *
 * Separada de `resolverOrigem` porque as duas perguntas têm respostas
 * independentes: um caminho desconhecido não tem volta, mas ainda assim
 * abre o guia — na abertura.
 */
export function secaoParaOrigem(bruto: string | null | undefined): string {
  const origem = resolverOrigem(bruto);
  if (!origem || !ehSecaoConhecida(origem.secao)) {
    return SECAO_DE_ABERTURA;
  }
  return origem.secao;
}
