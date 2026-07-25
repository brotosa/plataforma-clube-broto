# Prompt para o Claude Code — Onda 6: Dashboard, Usuários e Auditoria · Fase F13 (final)

> **Mesmo repositório. Esta é a última fase do escopo especificado** — o Dashboard colhe de todas as ondas, então o pré-requisito é total: **F1–F12 mergeadas na main** (verifique cada uma; se qualquer fase faltar, pare e reporte qual). Anexos: `docs/especificacao/ficha-onda6-dashboard-usuarios-auditoria.md` deve estar na main; o **protótipo `Plataforma_Broto_-_Prototipo_v8.1_FINAL.html` chega anexado à mensagem desta sessão** (o upload web de HTML está bloqueado na rede do operador) — **commite-o em `docs/referencias/` como parte do primeiro commit**.

**Primeira tarefa (commit próprio de docs):** atualizar o `CLAUDE.md` — referência visual v8.1 FINAL (removendo a v7.1) e a ficha da Onda 6 nas fontes da verdade. No `design/dseed-admin.css` **do repositório** (canônico desde a F6): mesclar **por união** as classes novas do dashboard extraídas do v8.1, preservando integralmente os fixes existentes; e **promover a tokens** as duas derivações AAA que o Design documentou — `--azul-superficie-aaa: #3242C4` e `--azul-superficie-hover: #4052E0` — mantendo o comentário original da derivação OKLCH e substituindo os hexes soltos pelas variáveis.

## T26 — Dashboard (HOME)

Rota inicial pós-login; "Dashboard" como primeiro item da sidebar. Duas camadas conforme a ficha (títulos **da ficha** — a referência visual encurtou dois): a faixa **"Exige ação hoje"** com cartões clicáveis levando à origem, cada contagem vinda de query real (aprovações pendentes, cadastros incompletos RN09, vigências ≤15d, janelas contratuais ≤30d, reavaliações RN21 vencidas, quarentenas), e o estado positivo explícito quando zerada; e os **quatro blocos** com seletor de período, cada indicador implementado com a fonte exata da ficha §2 — nenhuma métrica além delas (RN50). Estados "aguarda telemetria por assinante" onde a granularidade por CPF não existir; etiquetas de atribuição nos números de campanha; meta × realizado lendo o valor do Parametrizador (24/ano seed da F10). Queries agregadas com índices adequados; a HOME carrega em menos de 1s com os volumes de projeto.

## T27 — Usuários

CRUD restrito ao Administrador sobre o RBAC existente; credencial própria com troca obrigatória no primeiro acesso. **RN46 com teste dedicado**: impossível inativar ou rebaixar o último usuário Administrador — a API recusa e a UI explica ("designe outro antes"). **RN47**: inativação revoga acesso **imediatamente** — invalide as sessões ativas do usuário no Auth.js (não apenas bloqueie o próximo login) — com e2e provando: usuário logado, inativado por outro navegador, próxima requisição derrubada; histórico e autoria preservados em tudo.

## T28 — Auditoria

Consulta paginada com filtros (entidade, registro, autor, tipo, período) sobre a trilha existente; expansão por evento com a visão **antes → depois** em duas colunas e diferenças destacadas; marcador nos eventos sensíveis (acesso pleno a PF, exportações, parâmetros, regras de aprovação). "Exportar extrato (CSV)" restrito a Gestor/Administrador e **gerando o próprio evento de auditoria** (RN48 — teste cobrindo a meta-trilha). RN49: nenhuma purga; comentário na migration apontando o **[A CONFIRMAR — jurídico]** da retenção.

## Qualidade e encerramento

Testes de unidade RN46–RN50 (positivos e negativos); e2e: login → HOME → clicar pendência → tela de origem; inativar usuário → sessão derrubada; tentativa de rebaixar o último admin → bloqueio explicado; exportar extrato → evento conferido. Axe limpo nas três telas; T26 plena a 380px; suíte completa **F1–F12 verde** (regressão total — este PR fecha o produto). **README final**: seção "Operação da plataforma" consolidando subir/deploy, carga inicial, importações, publicação, kit de campanha, dossiê, variáveis de ambiente e os `[A CONFIRMAR]` remanescentes com seus donos (Minutrade, jurídico, TI).

## Mensagem para abrir a sessão (colar como está, anexando o v8.1 FINAL)

Verifique que **F1–F12 estão todas mergeadas na main** — liste o status de cada uma; se qualquer fase faltar, pare e reporte. Confirme a ficha da Onda 6 em `docs/especificacao/`; o protótipo v8.1 FINAL está anexado a esta mensagem — commite-o em `docs/referencias/` no primeiro commit. Leia o `CLAUDE.md`, este prompt (`docs/especificacao/prompt-claude-code-onda6.md`) e a ficha da Onda 6. Apresente o plano da F13 em até 10 linhas e **aguarde minha aprovação antes de escrever qualquer arquivo**. Execute na branch provisionada (título do PR: "F13 — Dashboard, Usuários e Auditoria"), commits pequenos; rebase da main antes do PR. Encerre com o PR aberto — **sem mergear**. Esta é a última fase do escopo: o PR deve declarar o produto completo contra os critérios de aceite.
