import type { Papel } from "@prisma/client";

/**
 * Ações de negócio das Ondas 1, 2, 3 e 5, conforme as tabelas de
 * permissões das fichas §2. Os papéis da Onda 1 permanecem com suas
 * permissões; a Onda 2 acrescenta ANALISTA_SCOUT e COMERCIAL com a matriz
 * própria do funil; a Onda 3 acrescenta ADMINISTRADOR_PLATAFORMA (RN23); a
 * Onda 5 acrescenta as ações de dados de PF dos Assinantes.
 * A segregação solicitante ≠ aprovador (RN06) não é uma permissão estática:
 * é garantida no serviço do motor de aprovação.
 *
 * **Onda 15 — o papel de administração se desdobrou em dois.** O
 * `ADMINISTRADOR_PLATAFORMA` passou a ter **acesso total** e o `ADMIN` nasceu
 * com exatamente as permissões que ele tinha até então. Ver
 * `PAPEIS_COM_ACESSO_TOTAL` abaixo, que é onde o "total" está escrito.
 */
export type Acao =
  | "VISUALIZAR"
  | "CRIAR_EDITAR"
  | "SOLICITAR_PROMOCAO"
  | "APROVAR_DEVOLVER"
  | "CONFIGURAR_REGRAS_APROVACAO"
  | "PUBLICAR_PAUSAR_ENCERRAR_OFERTA"
  | "GERAR_EXPORTACAO"
  | "IMPORTAR_TELEMETRIA"
  // Onda 2 — Mercado & Scout (ficha §2)
  | "VISUALIZAR_FUNIL"
  | "INCLUIR_NO_RADAR"
  | "ASSUMIR_E_AVALIAR"
  | "PRIORIZAR"
  | "GERAR_REVISAR_DOSSIE"
  | "VER_DOSSIE"
  | "ASSUMIR_NEGOCIACAO"
  // A ficha da Onda 2 §2 trazia uma célula única "definir metas e
  // designar". A ficha da Onda 3 v0.2 é errata explícita sobre ela: as
  // metas passam ao Administrador da Plataforma; a designação de
  // responsáveis continua sendo ato do Gestor. Uma célula virou duas.
  | "DESIGNAR_RESPONSAVEIS"
  | "DEFINIR_METAS"
  // Onda 3 — Parametrizador (ficha §2, RN23).
  | "VISUALIZAR_PARAMETROS"
  | "CONFIGURAR_PARAMETROS"
  // Configurações do portal (segurança) — o ADMIN e o acesso total.
  | "CONFIGURAR_PORTAL"
  // Onda 5 — Assinantes (ficha §2). Contagens e agregados são VISUALIZAR.
  | "VISUALIZAR_DADOS_PESSOAIS_PLENOS"
  | "EXPORTAR_LISTAS_CONTATO"
  | "IMPORTAR_ASSINANTES"
  | "GERIR_SEGMENTOS"
  // Onda 4 — Campanhas e Cestas (ficha §2).
  | "MODELAR_CAMPANHA"
  | "ATIVAR_ENCERRAR_CAMPANHA"
  | "GERIR_CESTAS"
  // Onda 6 — Dashboard, Usuários e Auditoria (ficha §3 e §4, RN46/RN48).
  | "GERIR_USUARIOS"
  | "VISUALIZAR_AUDITORIA"
  | "EXPORTAR_EXTRATO_AUDITORIA"
  // Onda 12 — Patrocinadores (ficha §4, RN62 e RN66).
  | "VISUALIZAR_PATROCINADORES"
  | "GERIR_PATROCINADORES"
  | "GERAR_RELATORIO_PATROCINADOR"
  // Pós-homologação — painel de atividades da ficha do aliado. Comentar é
  // ato de quem opera a ficha; Leitura só lê (e Aprovador/Administrador,
  // que observam, não comentam). Ler o feed é VISUALIZAR (todos).
  | "COMENTAR_FICHA_ALIADO"
  // Mesmo painel na ficha do patrocinador — os mesmos papéis do aliado, por
  // decisão registrada ("igual ao aliado"); ler o feed é VISUALIZAR (todos).
  | "COMENTAR_FICHA_PATROCINADOR";

/**
 * Papéis de **acesso total**: podem toda ação, inclusive as que forem
 * criadas depois desta linha.
 *
 * Desdobramento da Onda 15. Até aqui o `ADMINISTRADOR_PLATAFORMA` tinha 12
 * das 35 ações, por uma segregação deliberada — "quem configura o produto
 * não opera o negócio" — que aparece escrita em vários comentários da matriz
 * abaixo. **Essa segregação foi revertida por decisão da TI**, e o papel
 * passou a ser o superusuário da plataforma; o papel `ADMIN`, criado na mesma
 * rodada, herdou exatamente as 12 ações e é quem mantém o desenho anterior.
 * Os comentários históricos permanecem na matriz, marcados, porque a reversão
 * foi uma escolha e não um descuido — e quem for reabrir o assunto merece
 * saber o que se pensava antes.
 *
 * **Por que aqui e não repetido nas 35 linhas.** "Acesso total" é uma
 * propriedade do papel, não 35 concessões que por acaso coincidem. Escrito
 * como regra, uma ação nova nasce já coberta — que é o que "total" significa.
 * Escrito como 35 repetições, bastaria alguém esquecer uma para o
 * superusuário perder acesso em silêncio.
 *
 * A explicitação célula a célula que a casa exige **não se perde**: a
 * `TABELA_DA_FICHA`, em `permissoes.test.ts`, continua declarando a decisão
 * de TODOS os papéis em TODAS as ações, e a cerca
 * `acesso-total-cobre-todas-as-acoes` quebra o build se esta regra deixar de
 * valer.
 */
const PAPEIS_COM_ACESSO_TOTAL: ReadonlyArray<Papel> = ["ADMINISTRADOR_PLATAFORMA"];

/**
 * Tabelas das fichas §2 — papéis × ações (fonte da verdade).
 *
 * Onda 5, v1: "visualizar dados pessoais plenos" e "exportar listas de
 * contato" pertencem a Gestor e Administrador. O papel Administrador da
 * Plataforma chegou com a Onda 3 (F10) e está incluído nas duas linhas,
 * como a própria F11 previu ao deixá-las com o Gestor sozinho.
 *
 * **Leia junto com `PAPEIS_COM_ACESSO_TOTAL`.** Desde a Onda 15 o
 * `ADMINISTRADOR_PLATAFORMA` não aparece nesta matriz: ele pode tudo, por
 * regra, e repeti-lo em 35 linhas só criaria ruído e chance de esquecimento.
 * Onde ele estava escrito, hoje está o `ADMIN`, que herdou as mesmas células.
 * Esta matriz responde, portanto, **quem mais** além do acesso total.
 */
const PERMISSOES: Readonly<Record<Acao, ReadonlyArray<Papel>>> = {
  // Onda 1. VISUALIZAR ganha os papéis novos: o fluxo do funil abre a
  // ficha da empresa (T2/T12) e a ficha Onda 2 dá leitura geral a todos.
  VISUALIZAR: [
    "GESTOR",
    "ANALISTA",
    "ANALISTA_SCOUT",
    "COMERCIAL",
    "APROVADOR",
    "LEITURA",
    "ADMIN",
  ],
  CRIAR_EDITAR: ["GESTOR", "ANALISTA"],
  // "Solicitar promoção a Aliada ativa": Gestor e Comercial (ficha Onda 2
  // §2); o Analista de Aliados mantém a permissão da Onda 1.
  SOLICITAR_PROMOCAO: ["GESTOR", "ANALISTA", "COMERCIAL"],
  APROVAR_DEVOLVER: ["GESTOR", "APROVADOR"],
  CONFIGURAR_REGRAS_APROVACAO: ["GESTOR"],
  PUBLICAR_PAUSAR_ENCERRAR_OFERTA: ["GESTOR", "ANALISTA"],
  GERAR_EXPORTACAO: ["GESTOR"],
  // Nasceu na F4 (telemetria batch da Minutrade) e a F20 a reusa para a
  // esteira dos quatro relatórios da operadora — é a mesma ação de
  // negócio, com os mesmos dois papéis (ficha da Onda 12 §8). Ler o histórico
  // e as divergências é de todos os papéis, e por isso não há ação de leitura.
  // [Histórico, Onda 15] Aqui se lia que "o ADMINISTRADOR_PLATAFORMA fica de
  // fora de propósito: o papel dele é parametrizar (RN23), não operar carga".
  // Deixou de valer para ele — é acesso total — e passou a valer para o ADMIN,
  // que herdou o desenho.
  IMPORTAR_TELEMETRIA: ["GESTOR", "ANALISTA"],
  // Onda 2 — matriz da ficha §2, célula a célula.
  VISUALIZAR_FUNIL: [
    "GESTOR",
    "ANALISTA",
    "ANALISTA_SCOUT",
    "COMERCIAL",
    "APROVADOR",
    "LEITURA",
    "ADMIN",
  ],
  INCLUIR_NO_RADAR: ["GESTOR", "ANALISTA_SCOUT"],
  ASSUMIR_E_AVALIAR: ["GESTOR", "ANALISTA_SCOUT"],
  PRIORIZAR: ["GESTOR", "ANALISTA_SCOUT"],
  GERAR_REVISAR_DOSSIE: ["GESTOR", "ANALISTA_SCOUT"],
  VER_DOSSIE: ["GESTOR", "ANALISTA_SCOUT", "COMERCIAL"],
  ASSUMIR_NEGOCIACAO: ["GESTOR", "COMERCIAL"],
  // Designar responsável de scout/comercial segue sendo ato do Gestor.
  DESIGNAR_RESPONSAVEIS: ["GESTOR"],
  // Errata da ficha Onda 3 v0.2 sobre a ficha da Onda 2: metas são
  // definidas SOMENTE pelo Administrador da Plataforma — nem o Gestor
  // escreve aqui. Ver também §3.2 (meta vigente 24 novos aliados/ano).
  DEFINIR_METAS: ["ADMIN"],
  // RN23 — leitura do hub para todos (transparência da configuração
  // vigente); escrita exclusiva do Administrador da Plataforma.
  VISUALIZAR_PARAMETROS: [
    "GESTOR",
    "ANALISTA",
    "ANALISTA_SCOUT",
    "COMERCIAL",
    "APROVADOR",
    "LEITURA",
    "ADMIN",
  ],
  CONFIGURAR_PARAMETROS: ["ADMIN"],
  CONFIGURAR_PORTAL: ["ADMIN"],
  // Onda 5 — os papéis do funil (Onda 2) não operam dados de PF.
  VISUALIZAR_DADOS_PESSOAIS_PLENOS: ["GESTOR", "ADMIN"],
  EXPORTAR_LISTAS_CONTATO: ["GESTOR", "ADMIN"],
  // Cargas de assinantes seguem o padrão operacional das demais
  // importações da plataforma (Gestor e Analista).
  IMPORTAR_ASSINANTES: ["GESTOR", "ANALISTA"],
  // Salvar/editar segmentos segue CRIAR_EDITAR; contagem é aberta a
  // todos os papéis (RN33) e por isso fica sob VISUALIZAR.
  GERIR_SEGMENTOS: ["GESTOR", "ANALISTA"],
  // Onda 4 (ficha §2): "modelagem e ativação: Gestor e Analista". Se um
  // papel de marketing for criado ([A CONFIRMAR] da ficha §2), ele entra
  // nestas três linhas e em mais nada.
  // [Histórico, Onda 15] Aqui se lia que "o Administrador da Plataforma (RN23)
  // fica DE FORA por segregação: o papel da Onda 3 configura o produto, não
  // opera campanha". A segregação foi revertida para ele por decisão da TI; o
  // ADMIN a mantém.
  MODELAR_CAMPANHA: ["GESTOR", "ANALISTA"],
  ATIVAR_ENCERRAR_CAMPANHA: ["GESTOR", "ANALISTA"],
  GERIR_CESTAS: ["GESTOR", "ANALISTA"],
  // Onda 6 (ficha §3, RN46): a gestão de usuários é exclusiva do
  // Administrador da Plataforma — nem o Gestor escreve aqui. É a mesma
  // exclusividade da escrita no Parametrizador, e pelo mesmo motivo:
  // quem configura quem pode o quê não pode ser quem opera.
  GERIR_USUARIOS: ["ADMIN"],
  // Onda 6 (ficha §4): "somente leitura para TODOS os papéis". A trilha é
  // o contrapeso do RBAC — esconder a auditoria de quem é auditado
  // esvaziaria a governança que esta onda existe para tornar visível.
  VISUALIZAR_AUDITORIA: [
    "GESTOR",
    "ANALISTA",
    "ANALISTA_SCOUT",
    "COMERCIAL",
    "APROVADOR",
    "LEITURA",
    "ADMIN",
  ],
  // RN48 — o extrato sai do produto e vira artefato de auditoria externa;
  // só Gestor e Administrador exportam, e a exportação é ela própria
  // auditada (meta-trilha garantida no caso de uso).
  EXPORTAR_EXTRATO_AUDITORIA: ["GESTOR", "ADMIN"],
  // Onda 12 (RN62): "Gestor cria, edita e inativa; leitura para todos os
  // papéis". A leitura aberta é coerente com o resto da plataforma — o
  // patrocinador é contraparte comercial do Clube, não dado sensível, e o
  // R1 é agregado por definição (RN66).
  VISUALIZAR_PATROCINADORES: [
    "GESTOR",
    "ANALISTA",
    "ANALISTA_SCOUT",
    "COMERCIAL",
    "APROVADOR",
    "LEITURA",
    "ADMIN",
  ],
  // Escrita de patrocinador, contrato, minuta e vínculo — tudo o que muda
  // a base do saldo. A célula está explicitada na matriz do teste, como a
  // ficha manda, e não herdada por omissão.
  // [Histórico, Onda 15] Aqui se lia que "o ADMINISTRADOR_PLATAFORMA fica DE
  // FORA pela mesma segregação que já o exclui de campanha: quem configura o
  // produto não opera o negócio". Revertido para ele; o ADMIN mantém.
  GERIR_PATROCINADORES: ["GESTOR"],
  /**
   * RN66 — gerar o R1.
   *
   * **A ficha não enumerou esta célula**, e a decisão aqui é a leitura
   * mais restritiva compatível com o que ela diz. O relatório é agregado e
   * não carrega dado pessoal, mas SAI da plataforma e vai às mãos do
   * patrocinador, e toda geração é auditada com período e finalidade — a
   * mesma forma de `GERAR_EXPORTACAO` e `EXPORTAR_EXTRATO_AUDITORIA`, que
   * o produto já restringe. Como a ficha atribui ao Gestor tudo o que é do
   * patrocinador, é dele a geração.
   *
   * Ampliar depois é uma linha; ter aberto a todos e descobrir que não
   * podia, não. Se o negócio decidir que o Analista também gera, esta é a
   * única linha a mudar.
   */
  GERAR_RELATORIO_PATROCINADOR: ["GESTOR"],
  // Pós-homologação — comentar na ficha do aliado (painel de atividades). Os
  // papéis que operam a ficha em qualquer módulo: Gestor, Analista (Aliados),
  // Analista de Scout e Comercial. Leitura, Aprovador e ADMIN leem o feed
  // (VISUALIZAR), mas não escrevem — o acesso total escreve.
  COMENTAR_FICHA_ALIADO: ["GESTOR", "ANALISTA", "ANALISTA_SCOUT", "COMERCIAL"],
  // Comentar na ficha do patrocinador — os MESMOS papéis do aliado, por
  // decisão explícita ("igual ao aliado"). A célula está aqui na matriz de
  // propósito, não herdada por omissão, como a ficha da Onda 12 exige.
  COMENTAR_FICHA_PATROCINADOR: ["GESTOR", "ANALISTA", "ANALISTA_SCOUT", "COMERCIAL"],
};

/**
 * Todas as ações declaradas, para quem precisa varrer a matriz inteira.
 *
 * Existe por causa do teste de completude: sem uma lista enumerável, uma
 * ação nova podia entrar no tipo `Acao` e no mapa acima sem nunca aparecer
 * na tabela da ficha — e a matriz deixaria de ser "célula a célula" sem
 * que nada acusasse.
 */
export const ACOES = Object.keys(PERMISSOES) as ReadonlyArray<Acao>;

/**
 * Verifica se o papel pode executar a ação.
 *
 * Acesso total vem primeiro e por regra (ver `PAPEIS_COM_ACESSO_TOTAL`): o
 * superusuário pode toda ação, inclusive as criadas depois. Os demais papéis
 * respondem pela matriz, célula a célula.
 *
 * **A RN06 continua valendo para o acesso total, e não é contradição.** A
 * segregação solicitante ≠ aprovador nunca foi permissão de papel: ela é
 * verificada por registro, comparando `solicitanteId` com quem decide
 * (`dominio/aprovacao/motor.ts`). Poder aprovar não é poder aprovar o que se
 * pediu — o superusuário aprova o pedido dos outros e continua barrado no
 * próprio.
 */
export function podeExecutar(papel: Papel, acao: Acao): boolean {
  if (temAcessoTotal(papel)) {
    return true;
  }
  return PERMISSOES[acao].includes(papel);
}

/**
 * O papel pode toda ação da plataforma?
 *
 * Exposto porque a interface precisa **distinguir** o acesso total dos demais
 * — a T27 o marca com o degrau mais forte da pílula de papel, já que é a
 * atribuição de maior consequência da tela. Sem esta função a tela repetiria
 * o literal `"ADMINISTRADOR_PLATAFORMA"`, que foi exatamente o padrão que a
 * renomeação da Onda 15 mostrou ser frágil: nome muda, comparação literal fica
 * para trás em silêncio.
 *
 * **Não serve para decidir permissão** — para isso existe `podeExecutar`, que
 * responde pela ação concreta. Esta responde "quanto pesa este papel", que é
 * pergunta de apresentação.
 */
export function temAcessoTotal(papel: Papel): boolean {
  return PAPEIS_COM_ACESSO_TOTAL.includes(papel);
}

/** Erro padronizado para negativas de autorização. */
export class ErroDeAutorizacao extends Error {
  readonly acao: Acao;
  readonly papel: Papel;

  constructor(papel: Papel, acao: Acao) {
    super(`Papel ${papel} não tem permissão para a ação ${acao}.`);
    this.name = "ErroDeAutorizacao";
    this.acao = acao;
    this.papel = papel;
  }
}

/** Lança ErroDeAutorizacao quando o papel não pode executar a ação. */
export function exigirPermissao(papel: Papel, acao: Acao): void {
  if (!podeExecutar(papel, acao)) {
    throw new ErroDeAutorizacao(papel, acao);
  }
}
