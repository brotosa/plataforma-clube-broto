import type { Papel } from "@prisma/client";
import type { Acao } from "@/dominio/autorizacao/permissoes";

/**
 * Conteúdo do **Manual do usuário** (rota `/manual`).
 *
 * **Fonte única, como o Guia (RN58).** O "o que cada papel pode fazer" NÃO
 * é escrito aqui à mão: cada seção de papel é **gerada a partir da matriz de
 * permissões** (`dominio/autorizacao/permissoes.ts`) — a mesma fonte da
 * verdade que a aplicação usa para permitir ou recusar. Este arquivo traz
 * apenas a **descrição didática** de cada ação (o que é, onde fica, o passo
 * a passo) e o resumo de cada papel. Se uma permissão mudar na matriz, o
 * manual do papel muda junto, sem edição aqui — e a cerca
 * `infra/arquitetura/manual-cobre-acoes.test.ts` quebra o build se uma ação
 * nova entrar na matriz sem descrição neste arquivo.
 *
 * Não lê dado da operação e não exige permissão (é referência, aberta a
 * todos os papéis) — mesmo desenho do Guia da Plataforma (`/ajuda`).
 */

export type ModuloManual =
  | "DASHBOARD"
  | "ALIADOS"
  | "OFERTAS"
  | "MERCADO"
  | "ASSINANTES"
  | "CAMPANHAS"
  | "PATROCINADORES"
  | "APROVACOES"
  | "PARAMETRIZADOR"
  | "USUARIOS"
  | "AUDITORIA";

export const ROTULO_MODULO: Readonly<Record<ModuloManual, string>> = {
  DASHBOARD: "Dashboard",
  ALIADOS: "Aliados & Soluções",
  OFERTAS: "Ofertas",
  MERCADO: "Mercado & Scout",
  ASSINANTES: "Assinantes",
  CAMPANHAS: "Campanhas & Cestas",
  PATROCINADORES: "Patrocinadores",
  APROVACOES: "Aprovações",
  PARAMETRIZADOR: "Parametrizador",
  USUARIOS: "Usuários",
  AUDITORIA: "Auditoria",
};

/** Ordem em que os módulos aparecem dentro da seção de cada papel. */
export const ORDEM_MODULOS: ReadonlyArray<ModuloManual> = [
  "DASHBOARD",
  "ALIADOS",
  "OFERTAS",
  "MERCADO",
  "ASSINANTES",
  "CAMPANHAS",
  "PATROCINADORES",
  "APROVACOES",
  "PARAMETRIZADOR",
  "USUARIOS",
  "AUDITORIA",
];

export interface AcaoManual {
  /** Em que módulo/tela a ação vive. */
  modulo: ModuloManual;
  /** Nome curto da ação, como o usuário a reconhece. */
  titulo: string;
  /** Uma ou duas frases: o que é e por que existe. */
  oQueE: string;
  /** Onde encontrar na tela (caminho de navegação). */
  onde: string;
  /** Passo a passo objetivo. */
  passos: ReadonlyArray<string>;
}

/**
 * A descrição de cada ação da matriz de permissões. Toda `Acao` precisa de
 * uma entrada aqui — a cerca garante a completude.
 */
export const MANUAL_ACOES: Readonly<Record<Acao, AcaoManual>> = {
  VISUALIZAR: {
    modulo: "DASHBOARD",
    titulo: "Consultar as telas do produto",
    oQueE:
      "Ver o Dashboard, as fichas de aliados, soluções, ofertas, campanhas e patrocinadores — os números e o cadastro, sempre só agregados quando envolvem pessoas.",
    onde: "Qualquer item do menu lateral.",
    passos: [
      "Use o menu lateral à esquerda para abrir cada módulo.",
      "Use a busca do topo para achar um aliado, solução ou oferta pelo nome.",
      "No Dashboard, troque o período (30/90/365 dias ou Todos) para recortar os indicadores.",
    ],
  },
  CRIAR_EDITAR: {
    modulo: "ALIADOS",
    titulo: "Cadastrar e editar aliados e soluções",
    oQueE:
      "Criar e manter o cadastro de aliados e das suas soluções — a base da vitrine. A régua de completude (RN09) mostra o que falta antes de publicar.",
    onde: "Aliados & Soluções → ficha do aliado → botão “Editar cadastro”; e a ficha da solução → “Editar solução”.",
    passos: [
      "Abra Aliados & Soluções e escolha o aliado (ou “+ Novo aliado”).",
      "Clique em “Editar cadastro” para abrir a tela de edição.",
      "Para uma solução, abra-a e clique em “Editar solução”; “Salvar alterações” volta para a ficha.",
      "Acompanhe a régua de completude do card — ela diz o que falta para publicar.",
    ],
  },
  COMENTAR_FICHA_ALIADO: {
    modulo: "ALIADOS",
    titulo: "Comentar e mencionar na ficha do aliado",
    oQueE:
      "Registrar comentários, abrir pendências e mencionar colegas (@) no painel de atividades da ficha — o histórico de conversa de quem opera o aliado.",
    onde: "Ficha do aliado → painel de atividades.",
    passos: [
      "Abra a ficha do aliado e o painel de atividades.",
      "Escreva o comentário; use @ para mencionar um colega (ele vê no sino).",
      "Marque como pendência quando algo precisa de ação.",
    ],
  },
  SOLICITAR_PROMOCAO: {
    modulo: "MERCADO",
    titulo: "Solicitar promoção a Aliada ativa",
    oQueE:
      "Pedir que uma empresa avaliada seja promovida a Aliada ativa. A promoção passa pelo motor de aprovação (quem solicita não aprova — RN06).",
    onde: "Mercado & Scout → ficha da empresa no funil.",
    passos: [
      "Abra a empresa no funil de Mercado & Scout.",
      "Use a ação de solicitar promoção a Aliada ativa.",
      "Acompanhe em Aprovações — outra pessoa fará a aprovação.",
    ],
  },
  APROVAR_DEVOLVER: {
    modulo: "APROVACOES",
    titulo: "Aprovar ou devolver solicitações",
    oQueE:
      "Decidir sobre as solicitações na fila (promoções, publicações que exigem aprovação). Quem aprova nunca é quem solicitou (RN06).",
    onde: "Aprovações.",
    passos: [
      "Abra Aprovações e veja a fila de pendências.",
      "Analise a solicitação e escolha Aprovar ou Devolver (com o motivo).",
      "A decisão fica registrada na auditoria (autor, antes/depois).",
    ],
  },
  CONFIGURAR_REGRAS_APROVACAO: {
    modulo: "APROVACOES",
    titulo: "Configurar as regras de aprovação",
    oQueE:
      "Definir quais mudanças exigem aprovação e por quem — o desenho do motor de aprovação.",
    onde: "Aprovações → regras.",
    passos: [
      "Abra Aprovações → regras.",
      "Ajuste as regras de quem aprova o quê.",
      "As mudanças passam a valer para as próximas solicitações.",
    ],
  },
  PUBLICAR_PAUSAR_ENCERRAR_OFERTA: {
    modulo: "OFERTAS",
    titulo: "Publicar, pausar e encerrar ofertas",
    oQueE:
      "Colocar ofertas na vitrine, pausá-las ou encerrá-las. A publicação respeita a completude do card (RN02/RN09/RN11).",
    onde: "Ofertas → ficha da oferta; e “Publicar todas as elegíveis” em massa.",
    passos: [
      "Abra a oferta e use Publicar / Pausar / Encerrar conforme o caso.",
      "Para publicar várias de uma vez, use “Publicar todas as elegíveis” na lista.",
      "Use os filtros (busca, natureza, status) para achar as ofertas certas.",
    ],
  },
  GERAR_EXPORTACAO: {
    modulo: "OFERTAS",
    titulo: "Publicar o catálogo (exportação Minutrade)",
    oQueE:
      "Gerar a exportação do catálogo para a operadora (Minutrade). A geração é registrada e limpa as pendências de republicação (RN10).",
    onde: "Ofertas → “Publicar catálogo”.",
    passos: [
      "Abra Ofertas e clique em “Publicar catálogo”.",
      "Confira o resumo antes de gerar.",
      "A exportação fica registrada; ofertas pendentes de republicação são limpas.",
    ],
  },
  IMPORTAR_TELEMETRIA: {
    modulo: "OFERTAS",
    titulo: "Importar telemetria da operadora",
    oQueE:
      "Subir os relatórios da operadora (catálogo de sellers/ofertas e o extrato nominal de resgates/compras). O tipo é reconhecido pelo cabeçalho; a identidade é o hash do conteúdo (reimportar não duplica — RN67).",
    onde: "Ofertas → “Telemetria da operadora” / “Importar telemetria”.",
    passos: [
      "Abra Ofertas → “Telemetria da operadora”.",
      "Baixe o “modelo de referência (.csv)” se tiver dúvida do formato.",
      "Envie o arquivo; veja lidas/aplicadas/recusadas por causa nomeada.",
      "Divergências são exibidas, nunca corrigidas automaticamente (RN70).",
    ],
  },
  VISUALIZAR_FUNIL: {
    modulo: "MERCADO",
    titulo: "Acompanhar o funil de prospecção",
    oQueE:
      "Ver o funil de Mercado & Scout — do radar à decisão —, a cobertura e as metas.",
    onde: "Mercado & Scout.",
    passos: [
      "Abra Mercado & Scout.",
      "Percorra os estágios do funil; abra a ficha de cada empresa.",
      "Veja cobertura e meta × realizado.",
    ],
  },
  INCLUIR_NO_RADAR: {
    modulo: "MERCADO",
    titulo: "Incluir empresas no radar",
    oQueE: "Adicionar novas empresas ao radar de prospecção, o começo do funil.",
    onde: "Mercado & Scout → radar.",
    passos: [
      "Abra Mercado & Scout → radar.",
      "Inclua a empresa com os dados mínimos.",
      "Ela passa a aparecer no funil para avaliação.",
    ],
  },
  ASSUMIR_E_AVALIAR: {
    modulo: "MERCADO",
    titulo: "Assumir e avaliar (score)",
    oQueE:
      "Assumir uma empresa do radar e avaliá-la com o questionário de score (T10), inclusive marcando “não se aplica” onde couber.",
    onde: "Mercado & Scout → ficha da empresa → avaliação.",
    passos: [
      "Abra a empresa e assuma a avaliação.",
      "Preencha o questionário; use “não se aplica” quando o item não couber.",
      "O score é calculado a partir do que foi avaliado.",
    ],
  },
  PRIORIZAR: {
    modulo: "MERCADO",
    titulo: "Priorizar a prospecção",
    oQueE: "Definir a prioridade das empresas no funil, orientando o esforço da equipe.",
    onde: "Mercado & Scout.",
    passos: ["Abra a empresa no funil.", "Ajuste a prioridade.", "A fila de trabalho reflete a nova ordem."],
  },
  GERAR_REVISAR_DOSSIE: {
    modulo: "MERCADO",
    titulo: "Gerar e revisar o dossiê de due diligence",
    oQueE:
      "Produzir e revisar o dossiê assistido da empresa (F8), a base da decisão de aliança.",
    onde: "Mercado & Scout → ficha da empresa → dossiê.",
    passos: [
      "Abra a empresa e a aba de dossiê.",
      "Gere o dossiê e revise as seções.",
      "O dossiê fica disponível para quem pode vê-lo.",
    ],
  },
  VER_DOSSIE: {
    modulo: "MERCADO",
    titulo: "Consultar o dossiê",
    oQueE: "Ler o dossiê de due diligence de uma empresa do funil.",
    onde: "Mercado & Scout → ficha da empresa → dossiê.",
    passos: ["Abra a empresa.", "Acesse o dossiê para leitura."],
  },
  ASSUMIR_NEGOCIACAO: {
    modulo: "MERCADO",
    titulo: "Assumir a negociação comercial",
    oQueE: "Tomar para si a negociação de uma empresa em prospecção.",
    onde: "Mercado & Scout → ficha da empresa.",
    passos: ["Abra a empresa no funil.", "Assuma a negociação.", "Conduza o contato até a decisão."],
  },
  DESIGNAR_RESPONSAVEIS: {
    modulo: "MERCADO",
    titulo: "Designar responsáveis",
    oQueE:
      "Atribuir responsável de scout ou comercial às empresas do funil (ato do Gestor; a definição de metas é do Administrador).",
    onde: "Mercado & Scout.",
    passos: ["Abra a empresa ou o painel de metas.", "Designe o responsável.", "A designação fica registrada."],
  },
  DEFINIR_METAS: {
    modulo: "PARAMETRIZADOR",
    titulo: "Definir metas",
    oQueE:
      "Definir as metas do funil (ex.: novos aliados/ano). É ato exclusivo do Administrador da Plataforma, com efeito prospectivo (RN25).",
    onde: "Parametrizador → metas.",
    passos: [
      "Abra o Parametrizador → metas.",
      "Ajuste a meta; a mudança vale daqui para frente, sem re-pontuar o passado.",
    ],
  },
  VISUALIZAR_PARAMETROS: {
    modulo: "PARAMETRIZADOR",
    titulo: "Consultar os parâmetros vigentes",
    oQueE:
      "Ver as listas de domínio, réguas, tetos e metas vigentes — a configuração que rege o produto (transparência da RN23).",
    onde: "Parametrizador.",
    passos: ["Abra o Parametrizador.", "Percorra listas, valores de regra e metas."],
  },
  CONFIGURAR_PARAMETROS: {
    modulo: "PARAMETRIZADOR",
    titulo: "Configurar parâmetros",
    oQueE:
      "Editar listas de domínio, réguas, tetos e comissões-padrão sem código. Exclusivo do Administrador; toda mudança é auditada e prospectiva (RN23/RN25).",
    onde: "Parametrizador → listas e valores.",
    passos: [
      "Abra o Parametrizador.",
      "Edite a lista ou o valor de regra.",
      "A mudança vale para os registros novos; nada já fechado é re-pontuado.",
    ],
  },
  VISUALIZAR_DADOS_PESSOAIS_PLENOS: {
    modulo: "ASSINANTES",
    titulo: "Ver dados pessoais plenos do assinante",
    oQueE:
      "Acessar o dado pessoal completo de um assinante (nome, contato) — acesso sensível, sempre auditado.",
    onde: "Assinantes → ficha do assinante.",
    passos: [
      "Abra Assinantes e a ficha da pessoa.",
      "O acesso pleno fica destacado e registrado na auditoria.",
    ],
  },
  EXPORTAR_LISTAS_CONTATO: {
    modulo: "ASSINANTES",
    titulo: "Exportar listas de contato (com finalidade)",
    oQueE:
      "Gerar uma exportação nominal de assinantes para uma finalidade declarada. A exportação é auditada (RN35).",
    onde: "Assinantes → exportação.",
    passos: [
      "Monte o recorte (segmento) desejado.",
      "Declare a finalidade da exportação.",
      "Gere a lista; a geração fica registrada na trilha.",
    ],
  },
  IMPORTAR_ASSINANTES: {
    modulo: "ASSINANTES",
    titulo: "Importar assinantes",
    oQueE:
      "Subir a base de assinantes por planilha, inclusive o vínculo com patrocinador. Linhas com problema vão para quarentena com a causa nomeada.",
    onde: "Assinantes → importar.",
    passos: [
      "Baixe o “modelo (.xlsx)” com o Patrocinador por ID.",
      "Preencha e envie; confira lidas/aplicadas/quarentena no passo final.",
      "Corrija as linhas em quarentena pela causa indicada e reenvie.",
    ],
  },
  GERIR_SEGMENTOS: {
    modulo: "ASSINANTES",
    titulo: "Criar e editar segmentos",
    oQueE:
      "Montar recortes de público (segmentos) a partir do catálogo de critérios (RN33), usados em campanhas e exportações.",
    onde: "Assinantes → segmentação.",
    passos: [
      "Abra o construtor de filtros/segmentos.",
      "Combine os critérios permitidos e veja a contagem.",
      "Salve o segmento para reutilizar.",
    ],
  },
  MODELAR_CAMPANHA: {
    modulo: "CAMPANHAS",
    titulo: "Modelar campanha e cestas",
    oQueE:
      "Desenhar a campanha — público congelado, conteúdo, peças e metas — e as cestas reutilizáveis.",
    onde: "Campanhas & Cestas.",
    passos: [
      "Abra Campanhas & Cestas e crie a campanha.",
      "Defina público, conteúdo e peças.",
      "Ajuste as metas da campanha.",
    ],
  },
  ATIVAR_ENCERRAR_CAMPANHA: {
    modulo: "CAMPANHAS",
    titulo: "Ativar e encerrar campanhas",
    oQueE:
      "Colocar a campanha no ar (congela o público e gera o kit de execução) e encerrá-la ao fim.",
    onde: "Campanhas & Cestas → painel da campanha.",
    passos: [
      "Abra a campanha modelada.",
      "Ative — o público é congelado e o kit é gerado.",
      "Ao fim, encerre a campanha; a medição fica no painel.",
    ],
  },
  GERIR_CESTAS: {
    modulo: "CAMPANHAS",
    titulo: "Gerir cestas",
    oQueE: "Manter as cestas reutilizáveis de conteúdo/peças usadas nas campanhas.",
    onde: "Campanhas & Cestas → cestas.",
    passos: ["Abra as cestas.", "Crie ou edite a cesta.", "Reaproveite-a nas campanhas."],
  },
  VISUALIZAR_PATROCINADORES: {
    modulo: "PATROCINADORES",
    titulo: "Consultar patrocinadores",
    oQueE:
      "Ver a lista de patrocinadores, contratos, vínculos, saldo e a aba de consumo (telemetria por CPF). O R1 é agregado (RN66).",
    onde: "Patrocinadores.",
    passos: ["Abra Patrocinadores.", "Escolha um para ver contrato, saldo, base e consumo."],
  },
  GERIR_PATROCINADORES: {
    modulo: "PATROCINADORES",
    titulo: "Gerir patrocinadores, contratos e vínculos",
    oQueE:
      "Cadastrar patrocinador, contrato (com minuta), e vincular assinantes por CPF. O saldo é derivado (adquiridas − vínculos vigentes, RN62).",
    onde: "Patrocinadores → ficha do patrocinador.",
    passos: [
      "Crie/edite o patrocinador e o contrato (anexe a minuta).",
      "Na aba Base, vincule assinantes por CPF.",
      "O saldo se atualiza sozinho; encerrar um vínculo devolve a vaga.",
    ],
  },
  GERAR_RELATORIO_PATROCINADOR: {
    modulo: "PATROCINADORES",
    titulo: "Gerar o Relatório do Patrocinador (R1)",
    oQueE:
      "Emitir o R1 — agregado, sem dado pessoal (RN66) — com período e finalidade declarados. Toda geração é auditada.",
    onde: "Patrocinadores → ficha → relatório.",
    passos: [
      "Abra a ficha do patrocinador.",
      "Escolha o período e declare a finalidade.",
      "Gere o R1; a geração fica registrada.",
    ],
  },
  GERIR_USUARIOS: {
    modulo: "USUARIOS",
    titulo: "Gerir usuários internos",
    oQueE:
      "Criar, editar e inativar os usuários da plataforma e seus papéis. Não há exclusão — quem tem histórico é inativado (RN47); o último administrador é protegido (RN46).",
    onde: "Usuários.",
    passos: [
      "Abra Usuários (ordenados por nome; use os filtros por nome, papel e situação).",
      "Use “+ Novo usuário” (nasce com credencial provisória e troca no 1º acesso).",
      "Edite o papel, inative/reative ou redefina a credencial pela linha.",
    ],
  },
  VISUALIZAR_AUDITORIA: {
    modulo: "AUDITORIA",
    titulo: "Consultar a trilha de auditoria",
    oQueE:
      "Ler a trilha completa — quem mudou o quê, antes → depois — com filtros por entidade, autor, tipo e período. Somente leitura para todos (RN48).",
    onde: "Auditoria.",
    passos: [
      "Abra Auditoria.",
      "Filtre por entidade, autor, tipo de evento ou período.",
      "Abra um evento para ver o antes → depois.",
    ],
  },
  EXPORTAR_EXTRATO_AUDITORIA: {
    modulo: "AUDITORIA",
    titulo: "Exportar o extrato de auditoria",
    oQueE:
      "Gerar o extrato da trilha em CSV para auditoria externa. A própria exportação vira um evento de auditoria (meta-trilha, RN48).",
    onde: "Auditoria → exportar.",
    passos: ["Aplique os filtros do recorte.", "Exporte o extrato em CSV.", "A exportação fica registrada na trilha."],
  },
};

export interface ResumoPapel {
  /** Quem é o papel, em uma frase. */
  quemE: string;
  /** O foco do dia a dia. */
  noDiaADia: string;
}

/**
 * Resumo de cada papel — o "quem é" e o "no dia a dia". A LISTA de ações de
 * cada papel não vem daqui: é derivada da matriz de permissões na tela.
 */
export const RESUMO_PAPEL: Readonly<Record<Papel, ResumoPapel>> = {
  ADMINISTRADOR_PLATAFORMA: {
    quemE:
      "O papel que configura o produto: usuários, parâmetros e metas. Por segregação, não opera o negócio (não cadastra aliado, não aprova, não opera campanha ou patrocinador).",
    noDiaADia:
      "Manter usuários e papéis, ajustar réguas e listas no Parametrizador, definir metas e acompanhar a auditoria e os dados pessoais quando necessário.",
  },
  GESTOR: {
    quemE:
      "O papel mais amplo da operação: enxerga e conduz quase tudo — aliados, ofertas, funil, assinantes, campanhas, patrocinadores e aprovações.",
    noDiaADia:
      "Conduzir a rede de aliados e a vitrine, aprovar solicitações, operar patrocinadores e campanhas, importar telemetria e exportar quando preciso.",
  },
  ANALISTA: {
    quemE:
      "Analista de Aliados: opera o cadastro e a vitrine, e as cargas do dia a dia (telemetria, assinantes, campanhas).",
    noDiaADia:
      "Cadastrar e editar aliados e soluções, publicar ofertas, importar telemetria e assinantes, montar segmentos e campanhas.",
  },
  ANALISTA_SCOUT: {
    quemE:
      "Analista de Scout: cuida da prospecção — do radar à avaliação e ao dossiê.",
    noDiaADia:
      "Incluir empresas no radar, avaliar (score), priorizar e produzir/revisar dossiês.",
  },
  COMERCIAL: {
    quemE:
      "Comercial: conduz a negociação das empresas em prospecção e solicita a promoção a Aliada ativa.",
    noDiaADia:
      "Assumir negociações, consultar dossiês e solicitar a promoção a Aliada ativa.",
  },
  APROVADOR: {
    quemE:
      "Aprovador: decide sobre as solicitações na fila, sem operar o cadastro (segregação solicitante ≠ aprovador, RN06).",
    noDiaADia: "Analisar a fila de Aprovações e aprovar ou devolver com o motivo.",
  },
  LEITURA: {
    quemE: "Leitura: acesso de consulta a todo o produto, sem alterar nada.",
    noDiaADia:
      "Acompanhar o Dashboard, as fichas, o funil, os patrocinadores e a auditoria — tudo em modo leitura.",
  },
};

/**
 * Ordem de exibição dos papéis no manual — do que configura ao que só lê.
 */
export const ORDEM_PAPEIS: ReadonlyArray<Papel> = [
  "ADMINISTRADOR_PLATAFORMA",
  "GESTOR",
  "ANALISTA",
  "ANALISTA_SCOUT",
  "COMERCIAL",
  "APROVADOR",
  "LEITURA",
];

/** A introdução comum, mostrada antes das seções por papel. */
export const INTRODUCAO = {
  titulo: "Primeiros passos (vale para todos)",
  itens: [
    {
      titulo: "Entrar",
      texto:
        "Acesse com o seu e-mail corporativo e a senha. No primeiro acesso a senha é provisória e a troca é obrigatória. Se esquecer, o Administrador redefine a credencial.",
    },
    {
      titulo: "Navegar",
      texto:
        "O menu à esquerda lista os módulos que você pode abrir — ele já respeita o seu papel. Use o botão “Recolher” para ganhar espaço.",
    },
    {
      titulo: "Buscar",
      texto:
        "A busca no topo encontra aliados, soluções e ofertas pelo nome, de qualquer tela.",
    },
    {
      titulo: "Sino de pendências",
      texto:
        "O sino mostra o que exige ação hoje e as menções (@) endereçadas a você.",
    },
    {
      titulo: "Ajuda e manual",
      texto:
        "No canto direito do topo, o “?” abre o Guia da Plataforma (conceitos e jornadas) e o botão de manual abre este Manual do usuário (o que cada papel faz).",
    },
    {
      titulo: "O que você pode fazer",
      texto:
        "O menu e os botões já se ajustam ao seu papel: o que não aparece, o seu papel não faz. As seções abaixo detalham, papel a papel, cada ação.",
    },
  ],
} as const;
