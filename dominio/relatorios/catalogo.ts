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

import type { DestinacaoOferta, NaturezaOferta, StatusOferta } from "@prisma/client";

import type { Acao } from "@/dominio/autorizacao/permissoes";
import { ROTULOS_DESTINACAO } from "@/dominio/campanhas/regras";
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

export const ASSUNTOS: ReadonlyArray<AssuntoRelatorio> = [OFERTAS, ALIADOS];

export function assuntoPorSlug(slug: string): AssuntoRelatorio | undefined {
  return ASSUNTOS.find((assunto) => assunto.slug === slug);
}

export function campoPorSlug(
  assunto: AssuntoRelatorio,
  slug: string,
): CampoRelatorio | undefined {
  return assunto.campos.find((campo) => campo.slug === slug);
}
