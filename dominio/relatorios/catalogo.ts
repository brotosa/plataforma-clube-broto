/**
 * RN75 — o catálogo de assuntos do Gerador de relatórios: a ALLOWLIST de
 * tabelas, junções, campos, operadores e agregações.
 *
 * ## O desenho, e de onde ele vem
 *
 * Este arquivo é o irmão mais velho de `dominio/segmentacao/catalogo.ts`
 * (RN33), e a herança é deliberada: lá, o construtor de segmentos já provou
 * que dá para oferecer composição livre sem oferecer uma linguagem. Aqui a
 * superfície é maior — há junção, agrupamento e agregação, que o segmento
 * não tem —, mas a garantia é a mesma e vale repetir por extenso:
 *
 * **Nenhum pedaço de SQL nasce de entrada de gente.** O texto vem
 * exclusivamente das definições deste arquivo; o que a pessoa escolhe são
 * *chaves* que o compilador procura aqui, e o que ela digita viaja como
 * parâmetro de bind. Chave que não está no catálogo é **recusada, não
 * ignorada** — ignorar devolveria um relatório a menos e o número sairia
 * menor sem ninguém perceber.
 *
 * ## Por que assunto pré-modelado, e não "escolha suas tabelas"
 *
 * A pergunta que o módulo responde é de negócio ("quais ofertas de qual
 * aliado vencem este mês?"), e quem pergunta não sabe — nem deveria — que
 * `ofertas` se liga a `empresas` passando por `solucoes`. O assunto carrega
 * esse caminho pronto.
 *
 * E há a razão dura: junção escolhida na tela é onde nasce o produto
 * cartesiano que trava o banco de produção. As junções aqui são poucas,
 * nomeadas e todas pela chave estrangeira.
 *
 * ## O que é campo indisponível, e por que ele aparece
 *
 * RN77: campo cujo dado a fonte não sustenta **fica no catálogo, apagado e
 * com o motivo escrito**, e não pode ser arrastado para gaveta nenhuma.
 * Sumir seria pior — quem não vê o campo abre chamado; quem vê, entende. A
 * assimetria em relação a uma tela fixa é o ponto: ali quem programou sabia
 * que o dado não existe; aqui quem monta não sabe.
 */

import type {
  DestinacaoOferta,
  NaturezaOferta,
  OrigemPublicoCampanha,
  StatusAvaliacao,
  StatusOferta,
  StatusPatrocinador,
  TipoMetaCampanha,
} from "@prisma/client";

import type { Acao } from "@/dominio/autorizacao/permissoes";
import { ROTULOS_RECOMENDACAO } from "@/dominio/avaliacao/regras";
import { NIVEL_EXIGIDO, ROTULOS_META, ROTULOS_NIVEL } from "@/dominio/campanhas/atribuicao";
import { ROTULOS_DESTINACAO, ROTULOS_ESTADO_CAMPANHA } from "@/dominio/campanhas/regras";
import { ROTULOS_STATUS_DOSSIE } from "@/dominio/dossie/regras";
import { ROTULOS_ESTAGIO_FUNIL, ROTULOS_ORIGEM } from "@/dominio/funil/regras";
import { ROTULO_NATUREZA } from "@/dominio/importacao-catalogo/ofertas";

/**
 * Converte um mapa de rótulos do domínio na lista de opções do catálogo.
 *
 * **Por que os valores fechados não são digitados aqui.** A primeira versão
 * deste arquivo escreveu as listas de memória, e errou três: inventou
 * `RADAR` e `QUALIFICADA` como estágios, esqueceu `BENEFICIO` — que é a
 * natureza da maior parte das ofertas reais — e criou um `EM_APROVACAO` que
 * não existe em `StatusOferta`. Nenhum teste pegou: eram strings plausíveis,
 * e o compilador só compara com a lista que ele mesmo recebeu.
 *
 * Quem pegou foi rodar a consulta contra a base de verdade, que devolveu
 * `BENEFICIO` numa coluna cuja lista dizia `RECOMPENSA`. O conserto não é
 * reescrever as listas com mais cuidado — é tirar a digitação do caminho:
 * `Record<Enum, string>` é exaustivo por construção, então valor que entrar
 * ou sair do enum do Prisma quebra a compilação em vez de sumir da tela.
 */
function opcoesDeRotulos<Chave extends string>(
  rotulos: Readonly<Record<Chave, string>>,
): ReadonlyArray<{ valor: string; rotulo: string }> {
  return (Object.keys(rotulos) as Chave[]).map((valor) => ({
    valor,
    rotulo: rotulos[valor],
  }));
}

/**
 * Situação da oferta. O mapa vive aqui porque o domínio não tinha um — a T5
 * e a busca carregam cópias locais, e unificá-las é limpeza de outra rodada.
 * O tipo garante que esta não se desencontre do enum.
 */
const ROTULOS_STATUS_OFERTA: Readonly<Record<StatusOferta, string>> = {
  RASCUNHO: "Rascunho",
  PUBLICADA: "Publicada",
  PAUSADA: "Pausada",
  ENCERRADA: "Encerrada",
  EXPIRADA: "Expirada",
};

/**
 * Os três mapas que a F25 precisou e que o domínio não tinha.
 *
 * Mesmo critério do de cima: o `Record<Enum, string>` é exaustivo por
 * construção, então valor que entre ou saia do enum do Prisma quebra a
 * compilação em vez de sumir da tela sem aviso. Eles moram aqui, e não em
 * `dominio/…/regras.ts`, porque hoje só o catálogo os usa — o dia em que uma
 * tela precisar do mesmo rótulo é o dia de movê-los, não antes.
 */
const ROTULOS_STATUS_AVALIACAO: Readonly<Record<StatusAvaliacao, string>> = {
  RASCUNHO: "Rascunho",
  FECHADA: "Fechada",
};

const ROTULOS_ORIGEM_PUBLICO: Readonly<Record<OrigemPublicoCampanha, string>> = {
  SEGMENTO_SALVO: "Segmento salvo",
  REGRAS_PROPRIAS: "Regras próprias",
};

const ROTULOS_STATUS_PATROCINADOR: Readonly<Record<StatusPatrocinador, string>> = {
  ATIVO: "Ativo",
  ENCERRADO: "Encerrado",
};

/**
 * RN43/RN65 — o tipo de meta nunca aparece sem o **nível de atribuição** ao
 * lado: "Resgates · por oferta", "Conversão % · por público".
 *
 * Não é enfeite de rótulo. A medição da campanha vive em dois níveis que
 * medem coisas diferentes, e um construtor livre é justamente onde os dois
 * cairiam na mesma coluna — alguém agrupa por tipo de meta, soma os alvos e
 * leva para a reunião um total que mistura contagem de voucher com
 * percentual de conversão. O nível colado ao rótulo não impede a soma; ele
 * faz a mistura ficar visível na própria coluna, que é o máximo que uma
 * tabela pode fazer.
 *
 * O texto sai de `NIVEL_EXIGIDO` e de `ROTULOS_NIVEL` — as constantes que a
 * F12 já usa no painel da campanha —, e não de uma segunda lista escrita
 * aqui. Duas listas divergem na primeira meta nova.
 */
const ROTULOS_META_COM_NIVEL: Readonly<Record<TipoMetaCampanha, string>> = Object.fromEntries(
  (Object.keys(ROTULOS_META) as TipoMetaCampanha[]).map((tipo) => [
    tipo,
    `${ROTULOS_META[tipo]} · ${ROTULOS_NIVEL[NIVEL_EXIGIDO[tipo]]}`,
  ]),
) as Readonly<Record<TipoMetaCampanha, string>>;

/** Tipo do campo — governa operadores, agregações e formatação na tela. */
export type TipoCampo = "TEXTO" | "NUMERO" | "DINHEIRO" | "DATA" | "BOOLEANO" | "LISTA";

export const OPERADORES_RELATORIO = [
  "igual",
  "diferente",
  "contem",
  "maior_ou_igual",
  "menor_ou_igual",
  "entre",
  "vazio",
  "preenchido",
  "nos_proximos_dias",
] as const;
export type OperadorRelatorio = (typeof OPERADORES_RELATORIO)[number];

export const ROTULOS_OPERADOR: Readonly<Record<OperadorRelatorio, string>> = {
  igual: "é",
  diferente: "não é",
  contem: "contém",
  maior_ou_igual: "de",
  menor_ou_igual: "até",
  entre: "entre",
  vazio: "está vazio",
  preenchido: "está preenchido",
  nos_proximos_dias: "nos próximos (dias)",
};

/** Quantos valores cada operador consome — o compilador cobra. */
export const ARIDADE_OPERADOR: Readonly<Record<OperadorRelatorio, number>> = {
  igual: 1,
  diferente: 1,
  contem: 1,
  maior_ou_igual: 1,
  menor_ou_igual: 1,
  entre: 2,
  vazio: 0,
  preenchido: 0,
  nos_proximos_dias: 1,
};

export const AGREGACOES = [
  "QUANTOS",
  "QUANTOS_DISTINTOS",
  "SOMA",
  "MEDIA",
  "MINIMO",
  "MAXIMO",
] as const;
export type Agregacao = (typeof AGREGACOES)[number];

export const ROTULOS_AGREGACAO: Readonly<Record<Agregacao, string>> = {
  QUANTOS: "quantos",
  QUANTOS_DISTINTOS: "quantos diferentes",
  SOMA: "soma",
  MEDIA: "média",
  MINIMO: "menor",
  MAXIMO: "maior",
};

/**
 * A agregação que a plataforma escolhe sozinha ao soltar um campo em
 * Valores — para que ninguém precise saber que existe `AVG`.
 *
 * Número vira média e não soma de propósito: somar preço de ofertas
 * distintas não significa nada, e a média responde à pergunta que a pessoa
 * costuma ter ("quanto custa, em geral?"). Quem quer a soma troca em um
 * clique; quem recebesse a soma sem pedir levaria um número errado para a
 * reunião sem desconfiar.
 */
export function agregacaoNatural(tipo: TipoCampo): Agregacao {
  if (tipo === "NUMERO" || tipo === "DINHEIRO") return "MEDIA";
  return "QUANTOS";
}

/** Sensibilidade do campo — governa a exigência de finalidade (RN78). */
export type Sensibilidade = "OPERACIONAL" | "PESSOAL";

export interface CampoRelatorio {
  slug: string;
  rotulo: string;
  /** Agrupamento no painel de campos ("Oferta", "Aliado", "Solução"). */
  grupo: string;
  tipo: TipoCampo;
  /**
   * A expressão SQL do campo. **Texto fixo, escrito aqui** — é o coração da
   * RN75: nada nesta string vem de fora, e o compilador nunca a monta por
   * concatenação com entrada de usuário.
   */
  sql: string;
  /** Junções de que a expressão depende (chaves de `juncoes` do assunto). */
  requer?: ReadonlyArray<string>;
  operadores: ReadonlyArray<OperadorRelatorio>;
  agregacoes: ReadonlyArray<Agregacao>;
  /** Valores fechados, quando a taxonomia é conhecida; ausente = livre. */
  valores?: ReadonlyArray<{ valor: string; rotulo: string }>;
  sensibilidade: Sensibilidade;
  /**
   * Preenchido = o campo aparece apagado, com este motivo, e **não pode ser
   * usado** (RN77). Texto para gente ler, não código de erro.
   */
  indisponivel?: string;
}

export interface JuncaoRelatorio {
  /** Fragmento SQL fixo, com o alias já declarado. */
  sql: string;
  /** Junção da qual esta depende (entra antes). */
  depende?: string;
  /**
   * A junção é 1:N e **repete a linha da raiz**.
   *
   * Declarar isto não é documentação: o compilador lê esta marca para
   * recusar soma e média, que ficariam infladas, e para contar sempre pela
   * identidade do assunto. Junção nova que traga mais de uma linha por
   * registro da raiz precisa marcá-la — esquecer produz número plausível e
   * errado, que é o pior defeito possível num relatório.
   */
  multiplica?: boolean;
}

export interface ModeloRelatorio {
  slug: string;
  nome: string;
  descricao: string;
  definicao: {
    linhas: ReadonlyArray<string>;
    colunas: ReadonlyArray<string>;
    valores: ReadonlyArray<{ campo: string; agregacao: Agregacao }>;
    filtros: ReadonlyArray<{
      campo: string;
      operador: OperadorRelatorio;
      valores: ReadonlyArray<string>;
    }>;
  };
}

export interface AssuntoRelatorio {
  slug: string;
  rotulo: string;
  descricao: string;
  /** A `Acao` do RBAC que o assunto exige (RN76). */
  permissao: Acao;
  /**
   * Assunto que alcança dado pessoal exige finalidade declarada antes de
   * abrir (RN78), pelo caminho que a RN35 já criou para a exportação de
   * assinantes. Os dois assuntos da F24 são `false` — e isso é escolha de
   * sequência, não coincidência: começar pelo que não tem dado pessoal
   * deixa o vocabulário se assentar com uso real antes de o módulo tocar em
   * base de gente.
   */
  contemDadoPessoal: boolean;
  raiz: { tabela: string; alias: string };
  juncoes: Readonly<Record<string, JuncaoRelatorio>>;
  campos: ReadonlyArray<CampoRelatorio>;
  modelos: ReadonlyArray<ModeloRelatorio>;
}

// ---------------------------------------------------------------------
// Assunto 1 — Ofertas do Clube
// ---------------------------------------------------------------------

const OFERTAS: AssuntoRelatorio = {
  slug: "ofertas",
  rotulo: "Ofertas do Clube",
  descricao:
    "Tudo o que está publicado ou em preparo na vitrine: benefício, cupom, vigência, e de qual aliado e solução cada oferta vem.",
  permissao: "VISUALIZAR",
  contemDadoPessoal: false,
  raiz: { tabela: "ofertas", alias: "o" },
  juncoes: {
    solucao: { sql: "JOIN solucoes s ON s.id = o.solucao_id" },
    aliado: { sql: "JOIN empresas e ON e.id = s.empresa_id", depende: "solucao" },
    categoria: {
      sql: "LEFT JOIN categorias c ON c.id = s.categoria_id",
      depende: "solucao",
    },
    beneficio: { sql: "JOIN tipos_beneficio tb ON tb.id = o.tipo_beneficio_id" },
    mecanica: { sql: "JOIN mecanicas m ON m.id = o.mecanica_id" },
  },
  campos: [
    {
      slug: "oferta-titulo",
      rotulo: "Título da oferta",
      grupo: "Oferta",
      tipo: "TEXTO",
      sql: "o.titulo",
      operadores: ["igual", "diferente", "contem", "vazio", "preenchido"],
      agregacoes: ["QUANTOS", "QUANTOS_DISTINTOS"],
      sensibilidade: "OPERACIONAL",
    },
    {
      slug: "oferta-status",
      rotulo: "Situação",
      grupo: "Oferta",
      tipo: "LISTA",
      sql: "o.status::text",
      operadores: ["igual", "diferente"],
      agregacoes: ["QUANTOS", "QUANTOS_DISTINTOS"],
      valores: opcoesDeRotulos(ROTULOS_STATUS_OFERTA),
      sensibilidade: "OPERACIONAL",
    },
    {
      slug: "oferta-natureza",
      rotulo: "Natureza",
      grupo: "Oferta",
      tipo: "LISTA",
      sql: "o.natureza::text",
      operadores: ["igual", "diferente"],
      agregacoes: ["QUANTOS", "QUANTOS_DISTINTOS"],
      valores: opcoesDeRotulos<NaturezaOferta>(ROTULO_NATUREZA),
      sensibilidade: "OPERACIONAL",
    },
    {
      slug: "oferta-beneficio",
      rotulo: "Tipo de benefício",
      grupo: "Oferta",
      tipo: "TEXTO",
      sql: "tb.nome",
      requer: ["beneficio"],
      operadores: ["igual", "diferente", "contem"],
      agregacoes: ["QUANTOS", "QUANTOS_DISTINTOS"],
      sensibilidade: "OPERACIONAL",
    },
    {
      slug: "oferta-mecanica",
      rotulo: "Mecânica de resgate",
      grupo: "Oferta",
      tipo: "TEXTO",
      sql: "m.nome",
      requer: ["mecanica"],
      operadores: ["igual", "diferente", "contem"],
      agregacoes: ["QUANTOS", "QUANTOS_DISTINTOS"],
      sensibilidade: "OPERACIONAL",
    },
    {
      slug: "oferta-destinacao",
      rotulo: "Destinação",
      grupo: "Oferta",
      tipo: "LISTA",
      sql: "o.destinacao::text",
      operadores: ["igual", "diferente"],
      agregacoes: ["QUANTOS", "QUANTOS_DISTINTOS"],
      valores: opcoesDeRotulos<DestinacaoOferta>(ROTULOS_DESTINACAO),
      sensibilidade: "OPERACIONAL",
    },
    {
      slug: "oferta-preco-por",
      rotulo: "Preço por",
      grupo: "Oferta",
      tipo: "DINHEIRO",
      sql: "o.preco_por",
      operadores: ["igual", "maior_ou_igual", "menor_ou_igual", "entre", "vazio", "preenchido"],
      agregacoes: ["MEDIA", "SOMA", "MINIMO", "MAXIMO", "QUANTOS"],
      sensibilidade: "OPERACIONAL",
    },
    {
      slug: "oferta-percentual-desconto",
      rotulo: "Percentual de desconto",
      grupo: "Oferta",
      tipo: "NUMERO",
      sql: "o.percentual_desconto",
      operadores: ["igual", "maior_ou_igual", "menor_ou_igual", "entre", "vazio", "preenchido"],
      agregacoes: ["MEDIA", "MINIMO", "MAXIMO", "QUANTOS"],
      sensibilidade: "OPERACIONAL",
    },
    {
      slug: "oferta-vigencia-inicio",
      rotulo: "Início da vigência",
      grupo: "Oferta",
      tipo: "DATA",
      sql: "o.vigencia_inicio",
      operadores: ["igual", "maior_ou_igual", "menor_ou_igual", "entre"],
      agregacoes: ["MINIMO", "MAXIMO", "QUANTOS"],
      sensibilidade: "OPERACIONAL",
    },
    {
      slug: "oferta-vigencia-fim",
      rotulo: "Fim da vigência",
      grupo: "Oferta",
      tipo: "DATA",
      sql: "o.vigencia_fim",
      operadores: [
        "igual",
        "maior_ou_igual",
        "menor_ou_igual",
        "entre",
        "vazio",
        "preenchido",
        "nos_proximos_dias",
      ],
      agregacoes: ["MINIMO", "MAXIMO", "QUANTOS"],
      sensibilidade: "OPERACIONAL",
    },
    {
      slug: "oferta-pendente-republicacao",
      rotulo: "Pendente de republicação",
      grupo: "Oferta",
      tipo: "BOOLEANO",
      sql: "o.pendente_republicacao",
      operadores: ["igual"],
      agregacoes: ["QUANTOS"],
      valores: [
        { valor: "true", rotulo: "Sim" },
        { valor: "false", rotulo: "Não" },
      ],
      sensibilidade: "OPERACIONAL",
    },
    {
      slug: "solucao-nome",
      rotulo: "Solução",
      grupo: "Solução",
      tipo: "TEXTO",
      sql: "s.nome",
      requer: ["solucao"],
      operadores: ["igual", "diferente", "contem"],
      agregacoes: ["QUANTOS", "QUANTOS_DISTINTOS"],
      sensibilidade: "OPERACIONAL",
    },
    {
      slug: "solucao-categoria",
      rotulo: "Categoria da solução",
      grupo: "Solução",
      tipo: "TEXTO",
      sql: "c.nome",
      requer: ["categoria"],
      operadores: ["igual", "diferente", "contem", "vazio", "preenchido"],
      agregacoes: ["QUANTOS", "QUANTOS_DISTINTOS"],
      sensibilidade: "OPERACIONAL",
    },
    {
      slug: "aliado-nome",
      rotulo: "Aliado",
      grupo: "Aliado",
      tipo: "TEXTO",
      sql: "e.nome_fantasia",
      requer: ["aliado"],
      operadores: ["igual", "diferente", "contem"],
      agregacoes: ["QUANTOS", "QUANTOS_DISTINTOS"],
      sensibilidade: "OPERACIONAL",
    },
    {
      slug: "aliado-uf",
      rotulo: "UF da sede do aliado",
      grupo: "Aliado",
      tipo: "TEXTO",
      sql: "e.endereco_uf",
      requer: ["aliado"],
      operadores: ["igual", "diferente", "vazio", "preenchido"],
      agregacoes: ["QUANTOS", "QUANTOS_DISTINTOS"],
      sensibilidade: "OPERACIONAL",
    },
    /*
     * RN77 em ato, e vale ler o motivo: o contador de catálogo da operadora
     * existe no banco (`ContadorDeOfertaTelemetria`, F20) e SERIA fácil
     * expô-lo aqui. Não entra na F24 porque a RN68 diz que ele e o extrato
     * nominal medem coisas diferentes e divergem — 227 contra 38 —, e num
     * construtor livre nada impediria alguém de somar os dois numa coluna
     * só. Entra na F26, com a cerca que a ficha §5 exige, ou não entra.
     */
    {
      slug: "oferta-resgates",
      rotulo: "Resgates",
      grupo: "Telemetria",
      tipo: "NUMERO",
      sql: "NULL::int",
      operadores: [],
      agregacoes: [],
      sensibilidade: "OPERACIONAL",
      indisponivel:
        "As duas contagens de resgate da operadora medem coisas diferentes e divergem (RN68). Entram na fase da Telemetria, com a proteção que impede somá-las.",
    },
  ],
  modelos: [
    {
      slug: "ofertas-por-aliado",
      nome: "Ofertas publicadas por aliado",
      descricao: "Quantas ofertas cada aliado tem no ar hoje.",
      definicao: {
        linhas: ["aliado-nome"],
        colunas: [],
        valores: [{ campo: "oferta-titulo", agregacao: "QUANTOS" }],
        filtros: [{ campo: "oferta-status", operador: "igual", valores: ["PUBLICADA"] }],
      },
    },
    {
      slug: "vencimentos-proximos",
      nome: "Vigências a vencer em 30 dias",
      descricao: "O que sai da vitrine no próximo mês, por aliado.",
      definicao: {
        linhas: ["aliado-nome", "oferta-titulo"],
        colunas: [],
        valores: [{ campo: "oferta-vigencia-fim", agregacao: "MINIMO" }],
        filtros: [
          { campo: "oferta-status", operador: "igual", valores: ["PUBLICADA"] },
          { campo: "oferta-vigencia-fim", operador: "nos_proximos_dias", valores: ["30"] },
        ],
      },
    },
    {
      slug: "natureza-por-categoria",
      nome: "Natureza da oferta por categoria",
      descricao: "Recompensa e cupom lado a lado, categoria a categoria.",
      definicao: {
        linhas: ["solucao-categoria"],
        colunas: ["oferta-natureza"],
        valores: [{ campo: "oferta-titulo", agregacao: "QUANTOS" }],
        filtros: [],
      },
    },
  ],
};

// ---------------------------------------------------------------------
// Assunto 2 — Rede de Aliados
// ---------------------------------------------------------------------

const ALIADOS: AssuntoRelatorio = {
  slug: "aliados",
  rotulo: "Rede de Aliados",
  descricao:
    "As empresas do funil e da rede: estágio, origem, sede, score de scouting e quantas soluções cada uma trouxe.",
  permissao: "VISUALIZAR",
  contemDadoPessoal: false,
  raiz: { tabela: "empresas", alias: "e" },
  juncoes: {
    /*
     * As duas junções desta seção são 1:N, e é por isso que TODO campo que
     * as usa agrega com DISTINCT. Sem isso, um aliado com três soluções e
     * duas categorias apareceria seis vezes e "quantos aliados" devolveria
     * seis — o produto cartesiano em miniatura, que é o defeito clássico de
     * relatório montado sobre junção.
     */
    solucoes: { sql: "LEFT JOIN solucoes s ON s.empresa_id = e.id", multiplica: true },
    categorias: {
      sql:
        "LEFT JOIN empresa_categorias ec ON ec.empresa_id = e.id " +
        "LEFT JOIN categorias c ON c.id = ec.categoria_id",
      multiplica: true,
    },
  },
  campos: [
    {
      slug: "aliado-nome",
      rotulo: "Nome fantasia",
      grupo: "Aliado",
      tipo: "TEXTO",
      sql: "e.nome_fantasia",
      operadores: ["igual", "diferente", "contem"],
      agregacoes: ["QUANTOS", "QUANTOS_DISTINTOS"],
      sensibilidade: "OPERACIONAL",
    },
    {
      slug: "aliado-estagio",
      rotulo: "Estágio",
      grupo: "Aliado",
      tipo: "LISTA",
      sql: "e.estagio::text",
      operadores: ["igual", "diferente"],
      agregacoes: ["QUANTOS", "QUANTOS_DISTINTOS"],
      valores: opcoesDeRotulos(ROTULOS_ESTAGIO_FUNIL),
      sensibilidade: "OPERACIONAL",
    },
    {
      slug: "aliado-origem",
      rotulo: "Origem",
      grupo: "Aliado",
      tipo: "LISTA",
      sql: "e.origem::text",
      operadores: ["igual", "diferente", "vazio", "preenchido"],
      agregacoes: ["QUANTOS", "QUANTOS_DISTINTOS"],
      valores: opcoesDeRotulos(ROTULOS_ORIGEM),
      sensibilidade: "OPERACIONAL",
    },
    {
      slug: "aliado-uf",
      rotulo: "UF da sede",
      grupo: "Sede",
      tipo: "TEXTO",
      sql: "e.endereco_uf",
      operadores: ["igual", "diferente", "vazio", "preenchido"],
      agregacoes: ["QUANTOS", "QUANTOS_DISTINTOS"],
      sensibilidade: "OPERACIONAL",
    },
    {
      slug: "aliado-municipio",
      rotulo: "Município da sede",
      grupo: "Sede",
      tipo: "TEXTO",
      sql: "e.endereco_municipio",
      operadores: ["igual", "diferente", "contem", "vazio", "preenchido"],
      agregacoes: ["QUANTOS", "QUANTOS_DISTINTOS"],
      sensibilidade: "OPERACIONAL",
    },
    {
      slug: "aliado-score",
      rotulo: "Score de scouting",
      grupo: "Aliado",
      tipo: "NUMERO",
      sql: "e.score_scouting",
      operadores: ["igual", "maior_ou_igual", "menor_ou_igual", "entre", "vazio", "preenchido"],
      agregacoes: ["MEDIA", "MINIMO", "MAXIMO", "QUANTOS"],
      sensibilidade: "OPERACIONAL",
    },
    {
      slug: "aliado-reavaliacao-pendente",
      rotulo: "Reavaliação pendente",
      grupo: "Aliado",
      tipo: "BOOLEANO",
      sql: "e.reavaliacao_pendente",
      operadores: ["igual"],
      agregacoes: ["QUANTOS"],
      valores: [
        { valor: "true", rotulo: "Sim" },
        { valor: "false", rotulo: "Não" },
      ],
      sensibilidade: "OPERACIONAL",
    },
    {
      slug: "aliado-data-entrada",
      rotulo: "Data de entrada",
      grupo: "Aliado",
      tipo: "DATA",
      sql: "e.data_entrada",
      operadores: ["igual", "maior_ou_igual", "menor_ou_igual", "entre", "vazio", "preenchido"],
      agregacoes: ["MINIMO", "MAXIMO", "QUANTOS"],
      sensibilidade: "OPERACIONAL",
    },
    {
      slug: "aliado-categoria",
      rotulo: "Categoria",
      grupo: "Categoria",
      tipo: "TEXTO",
      sql: "c.nome",
      requer: ["categorias"],
      operadores: ["igual", "diferente", "contem", "vazio", "preenchido"],
      agregacoes: ["QUANTOS", "QUANTOS_DISTINTOS"],
      sensibilidade: "OPERACIONAL",
    },
    {
      slug: "solucao-nome",
      rotulo: "Solução",
      grupo: "Solução",
      tipo: "TEXTO",
      sql: "s.nome",
      requer: ["solucoes"],
      operadores: ["igual", "diferente", "contem", "vazio", "preenchido"],
      agregacoes: ["QUANTOS_DISTINTOS", "QUANTOS"],
      sensibilidade: "OPERACIONAL",
    },
  ],
  modelos: [
    {
      slug: "funil-por-estagio",
      nome: "Rede por estágio",
      descricao: "Quantas empresas há em cada degrau do funil.",
      definicao: {
        linhas: ["aliado-estagio"],
        colunas: [],
        valores: [{ campo: "aliado-nome", agregacao: "QUANTOS" }],
        filtros: [],
      },
    },
    {
      slug: "aliados-por-uf",
      nome: "Aliados ativos por UF",
      descricao: "Onde a rede está, pela sede declarada.",
      definicao: {
        linhas: ["aliado-uf"],
        colunas: [],
        valores: [{ campo: "aliado-nome", agregacao: "QUANTOS" }],
        filtros: [{ campo: "aliado-estagio", operador: "igual", valores: ["ALIADA_ATIVA"] }],
      },
    },
    {
      slug: "solucoes-por-aliado",
      nome: "Soluções por aliado",
      descricao: "Quantas soluções distintas cada aliado ativo trouxe.",
      definicao: {
        linhas: ["aliado-nome"],
        colunas: [],
        valores: [{ campo: "solucao-nome", agregacao: "QUANTOS_DISTINTOS" }],
        filtros: [{ campo: "aliado-estagio", operador: "igual", valores: ["ALIADA_ATIVA"] }],
      },
    },
  ],
};

// ---------------------------------------------------------------------
// Assunto 3 — Funil de prospecção (F25)
// ---------------------------------------------------------------------

/**
 * A raiz é `empresas`, a mesma da Rede de Aliados — e isso é escolha, não
 * repetição por descuido.
 *
 * Os dois assuntos olham para a mesma tabela com perguntas incompatíveis. A
 * Rede responde "onde a rede está e o que ela traz": sede, categoria,
 * soluções. O Funil responde "como a prospecção anda": quem assumiu, há
 * quanto tempo o registro está parado no degrau, o que a avaliação fechada
 * recomendou, se o dossiê foi revisado, por que a empresa foi descartada.
 *
 * Um assunto só, com todos esses campos juntos, teria oito grupos e obrigaria
 * quem quer contar aliados por UF a passar por junções de avaliação e dossiê
 * que multiplicam as linhas — e que fariam soma e média serem recusadas em
 * perguntas onde elas fazem todo o sentido. Assunto é recorte de pergunta, e
 * essas são duas.
 */
const FUNIL: AssuntoRelatorio = {
  slug: "funil",
  rotulo: "Funil de prospecção",
  descricao:
    "Como a prospecção anda: estágio e tempo parado nele, quem assumiu, o que a avaliação fechada recomendou, situação do dossiê e motivo do descarte.",
  permissao: "VISUALIZAR_FUNIL",
  contemDadoPessoal: false,
  raiz: { tabela: "empresas", alias: "e" },
  juncoes: {
    scout: { sql: "LEFT JOIN usuarios us ON us.id = e.responsavel_scout_id" },
    comercial: { sql: "LEFT JOIN usuarios uc ON uc.id = e.responsavel_comercial_id" },
    descarte: { sql: "LEFT JOIN motivos_descarte md ON md.id = e.motivo_descarte_id" },
    /*
     * **Só as avaliações FECHADAS**, e o filtro está no ON, não no WHERE.
     *
     * No WHERE ele transformaria o LEFT JOIN em INNER — empresa sem avaliação
     * nenhuma sumiria do relatório —, e some justamente quem mais interessa a
     * quem pergunta "o que ainda não foi avaliado?".
     *
     * Fechadas porque é o que a RN18 chama de avaliação: rascunho é trabalho
     * em curso de um analista, e contá-lo aqui misturaria intenção com fato.
     * A `multiplica` é verdadeira porque a empresa tem uma avaliação fechada
     * por versão — a vigente é a de maior número, e recortá-la exigiria
     * subconsulta correlacionada, que é trabalho de outra fase.
     */
    avaliacoes: {
      sql: "LEFT JOIN avaliacoes_scout av ON av.empresa_id = e.id AND av.status = 'FECHADA'",
      multiplica: true,
    },
    // `ds` e não `do`: DO é palavra reservada do Postgres, e o alias passaria
    // pela revisão para falhar no banco, em produção, na combinação de campos
    // que ninguém montou em teste.
    dossies: { sql: "LEFT JOIN dossies ds ON ds.empresa_id = e.id", multiplica: true },
  },
  campos: [
    {
      slug: "empresa-nome",
      rotulo: "Empresa",
      grupo: "Empresa",
      tipo: "TEXTO",
      sql: "e.nome_fantasia",
      operadores: ["igual", "diferente", "contem"],
      agregacoes: ["QUANTOS", "QUANTOS_DISTINTOS"],
      sensibilidade: "OPERACIONAL",
    },
    {
      slug: "empresa-estagio",
      rotulo: "Estágio",
      grupo: "Funil",
      tipo: "LISTA",
      sql: "e.estagio::text",
      operadores: ["igual", "diferente"],
      agregacoes: ["QUANTOS", "QUANTOS_DISTINTOS"],
      valores: opcoesDeRotulos(ROTULOS_ESTAGIO_FUNIL),
      sensibilidade: "OPERACIONAL",
    },
    {
      slug: "empresa-origem",
      rotulo: "Origem no radar",
      grupo: "Funil",
      tipo: "LISTA",
      sql: "e.origem::text",
      operadores: ["igual", "diferente", "vazio", "preenchido"],
      agregacoes: ["QUANTOS", "QUANTOS_DISTINTOS"],
      valores: opcoesDeRotulos(ROTULOS_ORIGEM),
      sensibilidade: "OPERACIONAL",
    },
    {
      slug: "empresa-entrada-radar",
      rotulo: "Entrada no radar",
      grupo: "Funil",
      tipo: "DATA",
      sql: "e.data_entrada_radar",
      operadores: ["igual", "maior_ou_igual", "menor_ou_igual", "entre", "vazio", "preenchido"],
      agregacoes: ["MINIMO", "MAXIMO", "QUANTOS"],
      sensibilidade: "OPERACIONAL",
    },
    {
      slug: "empresa-estagio-desde",
      rotulo: "No estágio desde",
      grupo: "Funil",
      tipo: "DATA",
      sql: "e.estagio_desde",
      operadores: ["igual", "maior_ou_igual", "menor_ou_igual", "entre", "vazio", "preenchido"],
      agregacoes: ["MINIMO", "MAXIMO", "QUANTOS"],
      sensibilidade: "OPERACIONAL",
    },
    {
      /*
       * O "há N dias" que a T8 escreve em cada card, agora agregável.
       *
       * A subtração de datas do Postgres devolve inteiro de dias, e o
       * `estagio_desde` nulo — empresa anterior ao rastreamento da F6 —
       * propaga nulo, que é o certo: a tela mostra traço e a média ignora a
       * linha. Estimar a data de entrada no estágio a partir do `criado_em`
       * daria um número plausível para uma coisa que ninguém registrou.
       */
      slug: "empresa-dias-no-estagio",
      rotulo: "Dias no estágio atual",
      grupo: "Funil",
      tipo: "NUMERO",
      sql: "(CURRENT_DATE - e.estagio_desde::date)",
      operadores: ["igual", "maior_ou_igual", "menor_ou_igual", "entre", "vazio", "preenchido"],
      agregacoes: ["MEDIA", "MINIMO", "MAXIMO", "QUANTOS"],
      sensibilidade: "OPERACIONAL",
    },
    {
      slug: "empresa-score",
      rotulo: "Score de scouting",
      grupo: "Funil",
      tipo: "NUMERO",
      sql: "e.score_scouting",
      operadores: ["igual", "maior_ou_igual", "menor_ou_igual", "entre", "vazio", "preenchido"],
      agregacoes: ["MEDIA", "MINIMO", "MAXIMO", "QUANTOS"],
      sensibilidade: "OPERACIONAL",
    },
    {
      slug: "empresa-reavaliacao-pendente",
      rotulo: "Reavaliação pendente",
      grupo: "Funil",
      tipo: "BOOLEANO",
      sql: "e.reavaliacao_pendente",
      operadores: ["igual"],
      agregacoes: ["QUANTOS"],
      valores: [
        { valor: "true", rotulo: "Sim" },
        { valor: "false", rotulo: "Não" },
      ],
      sensibilidade: "OPERACIONAL",
    },
    {
      slug: "empresa-uf",
      rotulo: "UF da sede",
      grupo: "Empresa",
      tipo: "TEXTO",
      sql: "e.endereco_uf",
      operadores: ["igual", "diferente", "vazio", "preenchido"],
      agregacoes: ["QUANTOS", "QUANTOS_DISTINTOS"],
      sensibilidade: "OPERACIONAL",
    },
    {
      slug: "empresa-municipio",
      rotulo: "Município da sede",
      grupo: "Empresa",
      tipo: "TEXTO",
      sql: "e.endereco_municipio",
      operadores: ["igual", "diferente", "contem", "vazio", "preenchido"],
      agregacoes: ["QUANTOS", "QUANTOS_DISTINTOS"],
      sensibilidade: "OPERACIONAL",
    },
    {
      /*
       * Responsável é usuário INTERNO da plataforma, e o nome dele já aparece
       * na T8, na ficha do aliado e na galeria de relatórios. Não é o dado
       * pessoal de que trata a RN78 — aquele é o do assinante, pessoa física
       * externa —, e por isso o assunto segue `contemDadoPessoal: false`.
       */
      slug: "scout-nome",
      rotulo: "Responsável de scout",
      grupo: "Responsáveis",
      tipo: "TEXTO",
      sql: "us.nome",
      requer: ["scout"],
      operadores: ["igual", "diferente", "contem", "vazio", "preenchido"],
      agregacoes: ["QUANTOS", "QUANTOS_DISTINTOS"],
      sensibilidade: "OPERACIONAL",
    },
    {
      slug: "comercial-nome",
      rotulo: "Responsável comercial",
      grupo: "Responsáveis",
      tipo: "TEXTO",
      sql: "uc.nome",
      requer: ["comercial"],
      operadores: ["igual", "diferente", "contem", "vazio", "preenchido"],
      agregacoes: ["QUANTOS", "QUANTOS_DISTINTOS"],
      sensibilidade: "OPERACIONAL",
    },
    {
      slug: "descarte-motivo",
      rotulo: "Motivo do descarte",
      grupo: "Funil",
      tipo: "TEXTO",
      sql: "md.nome",
      requer: ["descarte"],
      operadores: ["igual", "diferente", "contem", "vazio", "preenchido"],
      agregacoes: ["QUANTOS", "QUANTOS_DISTINTOS"],
      sensibilidade: "OPERACIONAL",
    },
    {
      slug: "avaliacao-recomendacao",
      rotulo: "Recomendação da avaliação",
      grupo: "Avaliação",
      tipo: "LISTA",
      sql: "av.recomendacao::text",
      requer: ["avaliacoes"],
      operadores: ["igual", "diferente", "vazio", "preenchido"],
      agregacoes: ["QUANTOS", "QUANTOS_DISTINTOS"],
      valores: opcoesDeRotulos(ROTULOS_RECOMENDACAO),
      sensibilidade: "OPERACIONAL",
    },
    {
      slug: "avaliacao-situacao",
      rotulo: "Situação da avaliação",
      grupo: "Avaliação",
      tipo: "LISTA",
      sql: "av.status::text",
      requer: ["avaliacoes"],
      operadores: ["igual", "diferente"],
      agregacoes: ["QUANTOS", "QUANTOS_DISTINTOS"],
      valores: opcoesDeRotulos(ROTULOS_STATUS_AVALIACAO),
      sensibilidade: "OPERACIONAL",
    },
    {
      slug: "avaliacao-total",
      rotulo: "Total da avaliação",
      grupo: "Avaliação",
      tipo: "NUMERO",
      sql: "av.total",
      requer: ["avaliacoes"],
      operadores: ["igual", "maior_ou_igual", "menor_ou_igual", "entre", "vazio", "preenchido"],
      agregacoes: ["MEDIA", "MINIMO", "MAXIMO", "QUANTOS"],
      sensibilidade: "OPERACIONAL",
    },
    {
      slug: "avaliacao-fechada-em",
      rotulo: "Avaliação fechada em",
      grupo: "Avaliação",
      tipo: "DATA",
      sql: "av.fechada_em",
      requer: ["avaliacoes"],
      operadores: ["igual", "maior_ou_igual", "menor_ou_igual", "entre", "vazio", "preenchido"],
      agregacoes: ["MINIMO", "MAXIMO", "QUANTOS"],
      sensibilidade: "OPERACIONAL",
    },
    {
      slug: "dossie-situacao",
      rotulo: "Situação do dossiê",
      grupo: "Dossiê",
      tipo: "LISTA",
      sql: "ds.status::text",
      requer: ["dossies"],
      operadores: ["igual", "diferente", "vazio", "preenchido"],
      agregacoes: ["QUANTOS", "QUANTOS_DISTINTOS"],
      valores: opcoesDeRotulos(ROTULOS_STATUS_DOSSIE),
      sensibilidade: "OPERACIONAL",
    },
    {
      slug: "dossie-revisado",
      rotulo: "Dossiê revisado",
      grupo: "Dossiê",
      tipo: "BOOLEANO",
      sql: "ds.revisado",
      requer: ["dossies"],
      operadores: ["igual"],
      agregacoes: ["QUANTOS"],
      valores: [
        { valor: "true", rotulo: "Sim" },
        { valor: "false", rotulo: "Não" },
      ],
      sensibilidade: "OPERACIONAL",
    },
  ],
  modelos: [
    {
      slug: "funil-por-responsavel",
      nome: "Funil por responsável de scout",
      descricao: "Quantas empresas cada analista de scout tem em mãos, por estágio.",
      definicao: {
        linhas: ["scout-nome"],
        colunas: ["empresa-estagio"],
        valores: [{ campo: "empresa-nome", agregacao: "QUANTOS" }],
        filtros: [],
      },
    },
    {
      slug: "tempo-parado-por-estagio",
      nome: "Tempo médio parado em cada estágio",
      descricao: "Onde a prospecção trava — média de dias no degrau atual.",
      definicao: {
        linhas: ["empresa-estagio"],
        colunas: [],
        valores: [{ campo: "empresa-dias-no-estagio", agregacao: "MEDIA" }],
        filtros: [],
      },
    },
    {
      slug: "descartes-por-motivo",
      nome: "Descartes por motivo",
      descricao: "Por que as empresas saem do funil (RN17).",
      definicao: {
        linhas: ["descarte-motivo"],
        colunas: [],
        valores: [{ campo: "empresa-nome", agregacao: "QUANTOS" }],
        filtros: [{ campo: "empresa-estagio", operador: "igual", valores: ["DESCARTADA"] }],
      },
    },
  ],
};

// ---------------------------------------------------------------------
// Assunto 4 — Campanhas e Cestas (F25)
// ---------------------------------------------------------------------

const CAMPANHAS: AssuntoRelatorio = {
  slug: "campanhas",
  rotulo: "Campanhas e Cestas",
  descricao:
    "O que foi modelado e o que está no ar: estado, vigência, tamanho do público congelado, cestas e ofertas, metas com o nível de atribuição e o registro da aprovação externa.",
  /*
   * `VISUALIZAR`, e não `MODELAR_CAMPANHA`. A T22 não fecha a leitura da
   * lista a papel nenhum — só o botão de modelar é gateado —, e a RN76 diz
   * que o Gerador entrega o que a pessoa já alcança, nunca menos. Exigir a
   * ação de escrita aqui esconderia de Leitura e Aprovador um relatório sobre
   * uma tela que eles abrem todo dia.
   */
  permissao: "VISUALIZAR",
  contemDadoPessoal: false,
  raiz: { tabela: "campanhas", alias: "cp" },
  juncoes: {
    autor: { sql: "JOIN usuarios ua ON ua.id = cp.autor_id" },
    patrocinador: { sql: "LEFT JOIN patrocinadores pt ON pt.id = cp.patrocinador_id" },
    publico: { sql: "LEFT JOIN exportacoes_lista ex ON ex.id = cp.publico_snapshot_id" },
    metas: { sql: "LEFT JOIN metas_campanha mc ON mc.campanha_id = cp.id", multiplica: true },
    cestas: {
      sql:
        "LEFT JOIN campanha_cestas cc ON cc.campanha_id = cp.id " +
        "LEFT JOIN cestas ce ON ce.id = cc.cesta_id",
      multiplica: true,
    },
    ofertas: {
      sql:
        "LEFT JOIN campanha_ofertas co ON co.campanha_id = cp.id " +
        "LEFT JOIN ofertas ofc ON ofc.id = co.oferta_id",
      multiplica: true,
    },
  },
  campos: [
    {
      slug: "campanha-nome",
      rotulo: "Campanha",
      grupo: "Campanha",
      tipo: "TEXTO",
      sql: "cp.nome",
      operadores: ["igual", "diferente", "contem"],
      agregacoes: ["QUANTOS", "QUANTOS_DISTINTOS"],
      sensibilidade: "OPERACIONAL",
    },
    {
      slug: "campanha-estado",
      rotulo: "Estado",
      grupo: "Campanha",
      tipo: "LISTA",
      sql: "cp.estado::text",
      operadores: ["igual", "diferente"],
      agregacoes: ["QUANTOS", "QUANTOS_DISTINTOS"],
      valores: opcoesDeRotulos(ROTULOS_ESTADO_CAMPANHA),
      sensibilidade: "OPERACIONAL",
    },
    {
      slug: "campanha-origem-publico",
      rotulo: "Origem do público",
      grupo: "Público",
      tipo: "LISTA",
      /*
       * `"origemPublico"` entre aspas, e não `origem_publico`: esta coluna
       * nasceu na F12 **sem `@map`**, então o Prisma a criou em camelCase e o
       * Postgres exige as aspas para não dobrá-la em minúsculas. É a única
       * assim em `campanhas`, e a vizinha `regras_publico` tem o `@map` —
       * o que torna o descuido invisível a olho nu. Apareceu ao rodar a
       * consulta contra a base; nenhuma leitura do schema o teria mostrado.
       */
      sql: 'cp."origemPublico"::text',
      operadores: ["igual", "diferente"],
      agregacoes: ["QUANTOS", "QUANTOS_DISTINTOS"],
      valores: opcoesDeRotulos(ROTULOS_ORIGEM_PUBLICO),
      sensibilidade: "OPERACIONAL",
    },
    {
      /*
       * A contagem do snapshot congelado na ativação (RN38) — número
       * agregado da exportação, jamais a lista. Campanha em rascunho não tem
       * snapshot e o campo vem nulo: "ainda não congelou", não "público de
       * zero pessoa".
       */
      slug: "campanha-publico-congelado",
      rotulo: "Público congelado",
      grupo: "Público",
      tipo: "NUMERO",
      sql: "ex.contagem",
      requer: ["publico"],
      operadores: ["igual", "maior_ou_igual", "menor_ou_igual", "entre", "vazio", "preenchido"],
      agregacoes: ["SOMA", "MEDIA", "MINIMO", "MAXIMO", "QUANTOS"],
      sensibilidade: "OPERACIONAL",
    },
    {
      slug: "campanha-vigencia-inicio",
      rotulo: "Início da vigência",
      grupo: "Campanha",
      tipo: "DATA",
      sql: "cp.vigencia_inicio",
      operadores: ["igual", "maior_ou_igual", "menor_ou_igual", "entre", "vazio", "preenchido"],
      agregacoes: ["MINIMO", "MAXIMO", "QUANTOS"],
      sensibilidade: "OPERACIONAL",
    },
    {
      slug: "campanha-vigencia-fim",
      rotulo: "Fim da vigência",
      grupo: "Campanha",
      tipo: "DATA",
      sql: "cp.vigencia_fim",
      operadores: [
        "igual",
        "maior_ou_igual",
        "menor_ou_igual",
        "entre",
        "vazio",
        "preenchido",
        "nos_proximos_dias",
      ],
      agregacoes: ["MINIMO", "MAXIMO", "QUANTOS"],
      sensibilidade: "OPERACIONAL",
    },
    {
      slug: "campanha-ativada-em",
      rotulo: "Ativada em",
      grupo: "Campanha",
      tipo: "DATA",
      sql: "cp.ativada_em",
      operadores: ["maior_ou_igual", "menor_ou_igual", "entre", "vazio", "preenchido"],
      agregacoes: ["MINIMO", "MAXIMO", "QUANTOS"],
      sensibilidade: "OPERACIONAL",
    },
    {
      slug: "campanha-encerrada-em",
      rotulo: "Encerrada em",
      grupo: "Campanha",
      tipo: "DATA",
      sql: "cp.encerrada_em",
      operadores: ["maior_ou_igual", "menor_ou_igual", "entre", "vazio", "preenchido"],
      agregacoes: ["MINIMO", "MAXIMO", "QUANTOS"],
      sensibilidade: "OPERACIONAL",
    },
    {
      slug: "campanha-autor",
      rotulo: "Autor",
      grupo: "Campanha",
      tipo: "TEXTO",
      sql: "ua.nome",
      requer: ["autor"],
      operadores: ["igual", "diferente", "contem"],
      agregacoes: ["QUANTOS", "QUANTOS_DISTINTOS"],
      sensibilidade: "OPERACIONAL",
    },
    {
      /*
       * RN64 — patrocinador é ETIQUETA, não dono. O campo existe para
       * recortar ("as campanhas sob medida da Yamer"), e o vazio significa
       * campanha do Clube, não campanha órfã.
       */
      slug: "campanha-patrocinador",
      rotulo: "Patrocinador (etiqueta)",
      grupo: "Patrocínio",
      tipo: "TEXTO",
      sql: "pt.razao_social",
      requer: ["patrocinador"],
      operadores: ["igual", "diferente", "contem", "vazio", "preenchido"],
      agregacoes: ["QUANTOS", "QUANTOS_DISTINTOS"],
      sensibilidade: "OPERACIONAL",
    },
    {
      /*
       * RN64 — a aprovação externa foi REGISTRADA? O booleano deriva da
       * existência da data, que é o que a T22 já lê para escrever "pendente
       * de registro". Não há estado novo de campanha, e nada bloqueia: este
       * campo serve para achar o que falta registrar, não para reprovar.
       */
      slug: "campanha-aprovacao-registrada",
      rotulo: "Aprovação externa registrada",
      grupo: "Patrocínio",
      tipo: "BOOLEANO",
      sql: "(cp.aprovacao_data IS NOT NULL)",
      operadores: ["igual"],
      agregacoes: ["QUANTOS"],
      valores: [
        { valor: "true", rotulo: "Sim" },
        { valor: "false", rotulo: "Não" },
      ],
      sensibilidade: "OPERACIONAL",
    },
    {
      slug: "campanha-aprovador",
      rotulo: "Quem aprovou (externo)",
      grupo: "Patrocínio",
      tipo: "TEXTO",
      sql: "cp.aprovacao_aprovador",
      operadores: ["igual", "diferente", "contem", "vazio", "preenchido"],
      agregacoes: ["QUANTOS", "QUANTOS_DISTINTOS"],
      sensibilidade: "OPERACIONAL",
    },
    {
      slug: "meta-tipo",
      rotulo: "Tipo de meta",
      grupo: "Metas",
      tipo: "LISTA",
      sql: "mc.tipo::text",
      requer: ["metas"],
      operadores: ["igual", "diferente", "vazio", "preenchido"],
      agregacoes: ["QUANTOS", "QUANTOS_DISTINTOS"],
      // O rótulo carrega o nível de atribuição junto — ver
      // `ROTULOS_META_COM_NIVEL` e a RN43.
      valores: opcoesDeRotulos(ROTULOS_META_COM_NIVEL),
      sensibilidade: "OPERACIONAL",
    },
    {
      slug: "meta-alvo",
      rotulo: "Alvo da meta",
      grupo: "Metas",
      tipo: "NUMERO",
      sql: "mc.alvo",
      requer: ["metas"],
      operadores: ["igual", "maior_ou_igual", "menor_ou_igual", "entre"],
      // Nem SOMA nem MEDIA: o alvo de "Resgates" é uma contagem e o de
      // "Conversão %" é um percentual. Somá-los não produz grandeza nenhuma,
      // e o compilador recusaria de qualquer forma quando a junção de metas
      // estivesse aberta — o que é sempre, já que o campo depende dela.
      agregacoes: ["MINIMO", "MAXIMO", "QUANTOS"],
      sensibilidade: "OPERACIONAL",
    },
    {
      slug: "cesta-nome",
      rotulo: "Cesta",
      grupo: "Conteúdo",
      tipo: "TEXTO",
      sql: "ce.nome",
      requer: ["cestas"],
      operadores: ["igual", "diferente", "contem", "vazio", "preenchido"],
      agregacoes: ["QUANTOS_DISTINTOS", "QUANTOS"],
      sensibilidade: "OPERACIONAL",
    },
    {
      slug: "oferta-avulsa-titulo",
      rotulo: "Oferta avulsa",
      grupo: "Conteúdo",
      tipo: "TEXTO",
      sql: "ofc.titulo",
      requer: ["ofertas"],
      operadores: ["igual", "diferente", "contem", "vazio", "preenchido"],
      agregacoes: ["QUANTOS_DISTINTOS", "QUANTOS"],
      sensibilidade: "OPERACIONAL",
    },
    /*
     * RN77, e este é o caso mais importante dos três assuntos da F25.
     *
     * O realizado da campanha EXISTE — o painel da T22/T24 o exibe. Ele não
     * entra aqui por duas razões que se somam:
     *
     * 1. **Ele não é coluna, é cálculo** (`dominio/campanhas/atribuicao.ts`),
     *    e cada número sai com o nível de atribuição colado (RN43). Reescrevê-lo
     *    em SQL criaria a segunda fonte que a casa proíbe desde a RN51 — e a
     *    divergência entre painel e relatório apareceria tarde, num número
     *    que alguém já teria levado para fora.
     * 2. **A conversão % depende da telemetria por CPF, que não existe**
     *    (RN44). O painel responde "indisponível"; uma coluna de relatório
     *    responderia `0`, e zero afirma que ninguém converteu.
     *
     * Quando a granularidade por CPF chegar, o realizado entra por uma fase
     * própria, com medida por subconsulta e o nível etiquetado na projeção —
     * não colando uma expressão a mais neste arquivo.
     */
    {
      slug: "campanha-realizado",
      rotulo: "Realizado das metas",
      grupo: "Metas",
      tipo: "NUMERO",
      sql: "NULL::int",
      operadores: [],
      agregacoes: [],
      sensibilidade: "OPERACIONAL",
      indisponivel:
        "A medição da campanha tem dois níveis de atribuição e cada número viaja com o seu (RN43); a conversão % ainda aguarda a telemetria por CPF (RN44). O painel da campanha é a fonte — aqui o número viraria uma coluna somável que misturaria os dois níveis.",
    },
  ],
  modelos: [
    {
      slug: "campanhas-por-estado",
      nome: "Campanhas por estado",
      descricao: "Quantas estão em rascunho, no ar e encerradas.",
      definicao: {
        linhas: ["campanha-estado"],
        colunas: [],
        valores: [{ campo: "campanha-nome", agregacao: "QUANTOS" }],
        filtros: [],
      },
    },
    {
      slug: "publico-por-campanha-ativa",
      nome: "Público congelado das campanhas no ar",
      descricao: "O tamanho do público de cada campanha ativa, maior primeiro.",
      definicao: {
        linhas: ["campanha-nome"],
        colunas: [],
        valores: [{ campo: "campanha-publico-congelado", agregacao: "MAXIMO" }],
        filtros: [{ campo: "campanha-estado", operador: "igual", valores: ["ATIVA"] }],
      },
    },
    {
      slug: "aprovacao-externa-pendente",
      nome: "Campanhas de patrocinador sem aprovação registrada",
      descricao: "O que o kit sairia carimbado como pendente (RN64).",
      definicao: {
        linhas: ["campanha-patrocinador", "campanha-nome"],
        colunas: [],
        valores: [{ campo: "campanha-nome", agregacao: "QUANTOS" }],
        filtros: [
          { campo: "campanha-patrocinador", operador: "preenchido", valores: [] },
          { campo: "campanha-aprovacao-registrada", operador: "igual", valores: ["false"] },
        ],
      },
    },
  ],
};

// ---------------------------------------------------------------------
// Assunto 5 — Patrocinadores (F25)
// ---------------------------------------------------------------------

const PATROCINADORES: AssuntoRelatorio = {
  slug: "patrocinadores",
  rotulo: "Patrocinadores",
  descricao:
    "Quem patrocina, o que o contrato comprou, quantas vagas estão ocupadas e quais campanhas levam a etiqueta de cada um.",
  permissao: "VISUALIZAR_PATROCINADORES",
  /*
   * Os contatos do patrocinador (nome, e-mail e telefone do interlocutor)
   * **não entram**. São dados de pessoa física de uma contraparte comercial,
   * e um construtor livre é o caminho mais curto entre eles e uma planilha
   * exportada sem finalidade declarada. Quem precisa do contato abre a ficha
   * do patrocinador, que é onde ele é útil e onde o acesso é pontual.
   */
  contemDadoPessoal: false,
  raiz: { tabela: "patrocinadores", alias: "p" },
  juncoes: {
    contrato: { sql: "LEFT JOIN contratos_patrocinio ct ON ct.patrocinador_id = p.id" },
    responsavel: { sql: "LEFT JOIN usuarios ur ON ur.id = p.responsavel_comercial_id" },
    vinculos: {
      sql: "LEFT JOIN vinculos_patrocinio vp ON vp.patrocinador_id = p.id",
      multiplica: true,
    },
    campanhas: {
      sql: "LEFT JOIN campanhas cpp ON cpp.patrocinador_id = p.id",
      multiplica: true,
    },
  },
  campos: [
    {
      slug: "patrocinador-razao-social",
      rotulo: "Patrocinador",
      grupo: "Patrocinador",
      tipo: "TEXTO",
      sql: "p.razao_social",
      operadores: ["igual", "diferente", "contem"],
      agregacoes: ["QUANTOS", "QUANTOS_DISTINTOS"],
      sensibilidade: "OPERACIONAL",
    },
    {
      slug: "patrocinador-cnpj",
      rotulo: "CNPJ",
      grupo: "Patrocinador",
      tipo: "TEXTO",
      sql: "p.cnpj",
      operadores: ["igual", "contem"],
      agregacoes: ["QUANTOS", "QUANTOS_DISTINTOS"],
      sensibilidade: "OPERACIONAL",
    },
    {
      slug: "patrocinador-segmento",
      rotulo: "Segmento",
      grupo: "Patrocinador",
      tipo: "TEXTO",
      sql: "p.segmento",
      operadores: ["igual", "diferente", "contem", "vazio", "preenchido"],
      agregacoes: ["QUANTOS", "QUANTOS_DISTINTOS"],
      sensibilidade: "OPERACIONAL",
    },
    {
      slug: "patrocinador-status",
      rotulo: "Situação",
      grupo: "Patrocinador",
      tipo: "LISTA",
      sql: "p.status::text",
      operadores: ["igual", "diferente"],
      agregacoes: ["QUANTOS", "QUANTOS_DISTINTOS"],
      valores: opcoesDeRotulos(ROTULOS_STATUS_PATROCINADOR),
      sensibilidade: "OPERACIONAL",
    },
    {
      slug: "patrocinador-responsavel",
      rotulo: "Responsável comercial",
      grupo: "Patrocinador",
      tipo: "TEXTO",
      sql: "ur.nome",
      requer: ["responsavel"],
      operadores: ["igual", "diferente", "contem", "vazio", "preenchido"],
      agregacoes: ["QUANTOS", "QUANTOS_DISTINTOS"],
      sensibilidade: "OPERACIONAL",
    },
    {
      /*
       * O único número de vaga que é DADO: o que o contrato comprou. Nulo
       * enquanto os valores do contrato não forem confirmados (ficha §7) — e
       * nulo é o que a tela precisa ver, não zero.
       */
      slug: "contrato-adquiridas",
      rotulo: "Assinaturas adquiridas",
      grupo: "Contrato",
      tipo: "NUMERO",
      sql: "ct.assinaturas_adquiridas",
      requer: ["contrato"],
      operadores: ["igual", "maior_ou_igual", "menor_ou_igual", "entre", "vazio", "preenchido"],
      agregacoes: ["SOMA", "MEDIA", "MINIMO", "MAXIMO", "QUANTOS"],
      sensibilidade: "OPERACIONAL",
    },
    {
      slug: "contrato-preco-unitario",
      rotulo: "Preço unitário",
      grupo: "Contrato",
      tipo: "DINHEIRO",
      sql: "ct.preco_unitario",
      requer: ["contrato"],
      operadores: ["igual", "maior_ou_igual", "menor_ou_igual", "entre", "vazio", "preenchido"],
      agregacoes: ["MEDIA", "MINIMO", "MAXIMO", "QUANTOS"],
      sensibilidade: "OPERACIONAL",
    },
    {
      slug: "contrato-valor-total",
      rotulo: "Valor total contratado",
      grupo: "Contrato",
      tipo: "DINHEIRO",
      sql: "ct.valor_total_contratado",
      requer: ["contrato"],
      operadores: ["igual", "maior_ou_igual", "menor_ou_igual", "entre", "vazio", "preenchido"],
      agregacoes: ["SOMA", "MEDIA", "MINIMO", "MAXIMO", "QUANTOS"],
      sensibilidade: "OPERACIONAL",
    },
    {
      slug: "contrato-assinatura",
      rotulo: "Data de assinatura",
      grupo: "Contrato",
      tipo: "DATA",
      sql: "ct.data_assinatura",
      requer: ["contrato"],
      operadores: ["igual", "maior_ou_igual", "menor_ou_igual", "entre", "vazio", "preenchido"],
      agregacoes: ["MINIMO", "MAXIMO", "QUANTOS"],
      sensibilidade: "OPERACIONAL",
    },
    {
      slug: "contrato-vigencia-inicio",
      rotulo: "Início da vigência",
      grupo: "Contrato",
      tipo: "DATA",
      sql: "ct.vigencia_inicio",
      requer: ["contrato"],
      operadores: ["igual", "maior_ou_igual", "menor_ou_igual", "entre", "vazio", "preenchido"],
      agregacoes: ["MINIMO", "MAXIMO", "QUANTOS"],
      sensibilidade: "OPERACIONAL",
    },
    {
      slug: "contrato-vigencia-fim",
      rotulo: "Fim da vigência",
      grupo: "Contrato",
      tipo: "DATA",
      sql: "ct.vigencia_fim",
      requer: ["contrato"],
      operadores: [
        "igual",
        "maior_ou_igual",
        "menor_ou_igual",
        "entre",
        "vazio",
        "preenchido",
        "nos_proximos_dias",
      ],
      agregacoes: ["MINIMO", "MAXIMO", "QUANTOS"],
      sensibilidade: "OPERACIONAL",
    },
    {
      /*
       * `fim IS NULL` é a definição de vínculo vigente que a RN62 usa, e
       * contar as linhas com este campo em "Sim" é contar vagas ocupadas —
       * que é medição, não derivação de saldo.
       */
      slug: "vinculo-vigente",
      rotulo: "Vínculo vigente",
      grupo: "Vínculos",
      tipo: "BOOLEANO",
      sql: "(vp.fim IS NULL)",
      requer: ["vinculos"],
      operadores: ["igual"],
      agregacoes: ["QUANTOS"],
      valores: [
        { valor: "true", rotulo: "Sim" },
        { valor: "false", rotulo: "Não" },
      ],
      sensibilidade: "OPERACIONAL",
    },
    {
      slug: "vinculo-inicio",
      rotulo: "Início do vínculo",
      grupo: "Vínculos",
      tipo: "DATA",
      sql: "vp.inicio",
      requer: ["vinculos"],
      operadores: ["igual", "maior_ou_igual", "menor_ou_igual", "entre"],
      agregacoes: ["MINIMO", "MAXIMO", "QUANTOS"],
      sensibilidade: "OPERACIONAL",
    },
    {
      slug: "vinculo-fim",
      rotulo: "Fim do vínculo",
      grupo: "Vínculos",
      tipo: "DATA",
      sql: "vp.fim",
      requer: ["vinculos"],
      operadores: ["igual", "maior_ou_igual", "menor_ou_igual", "entre", "vazio", "preenchido"],
      agregacoes: ["MINIMO", "MAXIMO", "QUANTOS"],
      sensibilidade: "OPERACIONAL",
    },
    {
      slug: "vinculo-motivo-fim",
      rotulo: "Motivo do encerramento",
      grupo: "Vínculos",
      tipo: "TEXTO",
      sql: "vp.motivo_fim",
      requer: ["vinculos"],
      operadores: ["igual", "diferente", "contem", "vazio", "preenchido"],
      agregacoes: ["QUANTOS", "QUANTOS_DISTINTOS"],
      sensibilidade: "OPERACIONAL",
    },
    {
      slug: "patrocinio-campanha",
      rotulo: "Campanha etiquetada",
      grupo: "Campanhas",
      tipo: "TEXTO",
      sql: "cpp.nome",
      requer: ["campanhas"],
      operadores: ["igual", "diferente", "contem", "vazio", "preenchido"],
      agregacoes: ["QUANTOS_DISTINTOS", "QUANTOS"],
      sensibilidade: "OPERACIONAL",
    },
    /*
     * RN62, e o campo que mais gente vai procurar aqui.
     *
     * Saldo é `adquiridas − vínculos vigentes`, derivado num lugar só
     * (`dominio/patrocinio/saldo.ts`) e consumido por T32, T33, R1 e
     * Dashboard. Escrever a subtração neste arquivo criaria a quinta fonte —
     * e a cerca `saldo-derivado` quebra o build justamente para isso.
     *
     * O motivo de fundo é melhor que a cerca: a derivação **não devolve
     * apenas um número**. Sem `assinaturasAdquiridas` confirmada ela devolve
     * ausência com motivo escrito, porque zero afirmaria que não há vaga
     * quando a verdade é que ninguém sabe quantas foram compradas. Uma
     * coluna de SQL não tem como carregar esse estado: `NULL - 3` é `NULL`, e
     * a célula sairia como traço sem dizer por quê — exatamente o número
     * plausível e mudo que a RN50 e a RN53 proíbem.
     *
     * O que fica no lugar é honesto e serve: **Assinaturas adquiridas** é
     * dado, **Vínculo vigente** conta as vagas ocupadas, e a T32 mostra o
     * saldo com o estado certo.
     */
    {
      slug: "patrocinador-saldo",
      rotulo: "Saldo de vagas",
      grupo: "Contrato",
      tipo: "NUMERO",
      sql: "NULL::int",
      operadores: [],
      agregacoes: [],
      sensibilidade: "OPERACIONAL",
      indisponivel:
        "O saldo é derivado numa fonte única (RN62) e carrega o estado de ausência: sem as assinaturas adquiridas confirmadas ele responde “não se sabe”, e não zero. Numa coluna de relatório essa distinção se perderia. Use Assinaturas adquiridas e Vínculo vigente, ou a ficha do patrocinador.",
    },
  ],
  modelos: [
    {
      slug: "vagas-ocupadas-por-patrocinador",
      nome: "Vagas ocupadas por patrocinador",
      descricao: "Quantos vínculos estão vigentes em cada patrocinador hoje.",
      definicao: {
        linhas: ["patrocinador-razao-social"],
        colunas: [],
        valores: [{ campo: "vinculo-vigente", agregacao: "QUANTOS" }],
        filtros: [{ campo: "vinculo-vigente", operador: "igual", valores: ["true"] }],
      },
    },
    {
      slug: "contratos-a-vencer",
      nome: "Contratos a vencer em 90 dias",
      descricao: "Quais patrocínios precisam de conversa de renovação.",
      definicao: {
        linhas: ["patrocinador-razao-social"],
        colunas: [],
        valores: [{ campo: "contrato-vigencia-fim", agregacao: "MINIMO" }],
        filtros: [
          { campo: "patrocinador-status", operador: "igual", valores: ["ATIVO"] },
          { campo: "contrato-vigencia-fim", operador: "nos_proximos_dias", valores: ["90"] },
        ],
      },
    },
    {
      slug: "campanhas-por-patrocinador",
      nome: "Campanhas etiquetadas por patrocinador",
      descricao: "Quantas campanhas sob medida cada patrocinador já teve (RN64).",
      definicao: {
        linhas: ["patrocinador-razao-social"],
        colunas: [],
        valores: [{ campo: "patrocinio-campanha", agregacao: "QUANTOS_DISTINTOS" }],
        filtros: [],
      },
    },
  ],
};

export const ASSUNTOS: ReadonlyArray<AssuntoRelatorio> = [
  OFERTAS,
  ALIADOS,
  FUNIL,
  CAMPANHAS,
  PATROCINADORES,
];

export function assuntoPorSlug(slug: string): AssuntoRelatorio | undefined {
  return ASSUNTOS.find((assunto) => assunto.slug === slug);
}

export function campoPorSlug(
  assunto: AssuntoRelatorio,
  slug: string,
): CampoRelatorio | undefined {
  return assunto.campos.find((campo) => campo.slug === slug);
}
