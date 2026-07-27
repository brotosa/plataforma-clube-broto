# Plataforma de Administração do Clube Broto

Aplicação web administrativa do Clube Broto (Broto S.A.), em oito ondas:

| Onda | Módulo | Regras | Telas |
|---|---|---|---|
| 1 | Aliados, Soluções e Ofertas · motor de aprovação · publicação e telemetria batch (Minutrade) · carga inicial | RN01–RN12 | T1–T7 |
| 2 | Mercado & Scout · funil, avaliação com score, dossiê assistido, cobertura e metas | RN13–RN22 | T8–T14 |
| 3 | Parametrizador · listas de domínio, valores de regra e metas editáveis sem código | RN23–RN28 | T15–T17 |
| 5 | Assinantes · base patrocinada com importação, enriquecimento, segmentação e exportação controlada | RN29–RN37 | T18–T21 |
| 4 | Campanhas e Cestas · público congelado, conteúdo, peças, kit de execução e medição atribuída | RN38–RN45 | T22–T25 |
| 6 | Dashboard, Usuários e Auditoria · governança visível | RN46–RN50 | T26–T28 |
| 7 | Cobertura do portfólio e Mapa da rede · releitura do cadastro como instrumento de decisão | RN51–RN53 | T29–T30 |
| 8 | Marca do aliado, leitura de listas, falhas legíveis e arrasto no funil · sem tela nova | RN54–RN57 | ajustes em T1/T2/T8/T26 |

- Fontes da verdade funcionais: as oito fichas em `docs/especificacao/`
- Arquitetura e fases: os oito `prompt-claude-code-onda*.md`
- Especificação visual vigente: `docs/referencias/Plataforma_Broto_-_Prototipo_v9.1.html`
  (T1–T30). As versões v8.1 FINAL, v7.1, v6.1 e v2.1 permanecem apenas como histórico.
  A Onda 8 não trouxe protótipo novo — as telas dela já existiam.

**Estado atual: escopo original completo (F1–F13) e as duas ondas posteriores a
ele entregues (F14, F15) — 57 regras e 30 telas implementadas. O produto está
em produção**, e a partir da F14 toda fase carrega o dever adicional de não
regredir: reescrever cálculo já exibido exige teste provando que o número não
mudou. Desde a F15 o dever se estende ao banco — a base está povoada, então
migration que remove coluna, estreita tipo ou exige valor sobre linha
existente não entra sem condição objetiva verificada antes.

A Onda 1 (F1–F5) entregou o cadastro, o motor de aprovação com segregação
solicitante ≠ aprovador, a publicação em lote e a importação de telemetria, a
carga inicial pelas planilhas de `dados/`, e o endurecimento em acessibilidade
AAA e responsividade. A Onda 2 (F6–F9) trouxe o radar e o funil, a avaliação
com score do ScoutCB, o dossiê de due diligence assistido, a ficha M1, o mapa
de cobertura e o painel de metas — e levou avaliação e dossiê para dentro da
fila de aprovação (RN20), de modo que a promoção é decidida com o caso
completo à vista.

A **F10** tirou as réguas do código: comissão-padrão, prazos, tetos e metas
passam por um **Serviço de Configuração** com leitura cacheada e invalidação
na escrita, editado pelo papel **Administrador da Plataforma** (RN23) sempre
com auditoria e efeito prospectivo (RN25) — mudar um peso não re-pontua
avaliação fechada. A **F11** trouxe a base de assinantes com CPF protegido em
repouso e segmentação declarativa; a **F12**, a campanha com público congelado
na ativação, kit imutável versionado e medição em dois níveis, cada número com
o nível de atribuição declarado.

A **F13** fecha o produto dando tela ao que o sistema já media e gravava: o
Dashboard (T26) vira a HOME e consolida os indicadores das fichas anteriores,
Usuários (T27) dá interface ao RBAC com proteção anti-lockout e revogação
imediata de acesso, e Auditoria (T28) abre a trilha gravada desde a F1 para
consulta e extrato — ele próprio auditado.

A **F14** abre a Onda 7 e é a primeira fase depois do escopo original. Ela não
inventa número: transforma o cadastro que já existe em instrumento de decisão.
A definição de cobertura vira **fonte única** (RN51) compartilhada pela T13,
pela T29 e pelo Dashboard; a T29 mostra onde a rede é completa, frágil ou
inexistente; a T30 põe a rede no mapa **sem nunca misturar** sede com
abrangência declarada (RN52). Junto vieram quatro correções transversais: o
rodapé passa a exibir a versão lida do build, o cabeçalho volta ao desenho
aprovado da marca, a HOME ganha o panorama de oito indicadores que a ficha da
Onda 6 não chegara a enumerar, e o sino do cabeçalho deixa de ser decorativo.

A **F15** abre a Onda 8 e é a primeira nascida de **homologação com base
povoada** — cada item veio de uso real, e nenhuma tela nova entrou. A marca do
aliado deixa de ser endereço num bucket que nunca existiu e passa a ser
arquivo guardado pela plataforma (RN54); a mensagem de erro passa a nomear a
causa em vez de aconselhar o que não resolveria (RN55); a lista de aliados
troca a paginação de 8 por rolagem contínua, enquanto assinantes mantêm a
paginação — a escolha é do tamanho esperado do conjunto (RN56); e o card do
funil ganha o gesto de arrastar, que executa exatamente a operação do menu
(RN57). Junto, a célula Ofertas do painel passa a mostrar um número só, da
mesma base da vitrine viva.

Atravessando todas as ondas, o **endurecimento** iniciado na F5 e mantido
fase a fase:

- **auditoria AAA** — o axe roda em modo AAA de verdade, com as três
  regras AAA que o axe-core traz desligadas por padrão ligadas nome a nome, e
  cobrindo as telas que faltavam (abas da T2, formulários de T3/T5). O produto
  declara **AAA integral com uma exceção nomeada — o azul institucional da
  marca, que atende AA**; correções, medições e o caminho de saída estão em
  [`docs/acessibilidade-aaa.md`](docs/acessibilidade-aaa.md);
- **navegação por teclado** com prova em teste, tela a tela;
- **responsividade validada a 380px** em projeto Playwright próprio, cobrindo
  todas as telas do produto — a T26, por ser a HOME, é validada como **plena** e
  não apenas íntegra;
- **regressão como critério de aceite** a partir da F14: cálculo já exibido em
  produção só é reescrito com teste provando que o número não mudou;
- **Dockerfile** multi-stage e este README de operação e deploy.

## Stack

Next.js (App Router) + React + TypeScript `strict` · PostgreSQL + Prisma ·
Auth.js (credenciais, atrás de interface de identidade plugável para Entra ID) ·
pino · Vitest · Playwright + axe-core. Sem Tailwind e sem componentes de
terceiros: o CSS é o DSeed (`design/tokens.css`, intocável) + extensões
documentadas em `design/dseed-admin.css`.

## Rodar no GitHub Codespaces (sem instalar nada)

O repositório traz um devcontainer que sobe tudo sozinho (Node, PostgreSQL,
migrations, seed e o servidor):

1. No GitHub, clique no botão verde **Code** → aba **Codespaces** →
   **Create codespace** (na branch desejada).
2. Aguarde a preparação terminar (alguns minutos na primeira vez).
3. O servidor inicia automaticamente na porta 3000 e o preview abre
   sozinho — se não abrir, use a aba **Ports** e clique na porta 3000.
4. Entre com um usuário de desenvolvimento (tabela abaixo).

Log do servidor: `/tmp/plataforma-dev.log` dentro do Codespace.

## Subir localmente

Requisitos: Node 22+, pnpm 10+, PostgreSQL 16.

```bash
# 1. Dependências
pnpm install

# 2. Variáveis de ambiente
cp .env.example .env
# preencha DATABASE_URL e gere AUTH_SECRET, CPF_HASH_KEY e
# APP_ENCRYPTION_KEY (cada uma com: openssl rand -base64 32)

# 3. Banco: aplicar migrations e seed (taxonomias + usuários de desenvolvimento)
pnpm db:migrate:dev   # desenvolvimento (cria/aplica migrations)
pnpm db:seed

# 4. Rodar
pnpm dev              # http://localhost:3000
```

### Variáveis de ambiente

| Variável | Obrigatória | Para que serve |
|---|---|---|
| `DATABASE_URL` | sim | PostgreSQL (Amazon RDS em produção). Inclua `?schema=public` |
| `AUTH_SECRET` | sim | segredo de sessão do Auth.js — `openssl rand -base64 32` |
| `CPF_HASH_KEY` | sim | HMAC de CPF — ver seção seguinte |
| `APP_ENCRYPTION_KEY` | sim | cifragem de CPF em repouso — ver seção seguinte |
| `AUTH_URL` | em produção | URL pública da aplicação (Auth.js atrás de proxy/balanceador) |
| `AUTH_TRUST_HOST` | atrás de proxy | `true` quando o host chega por cabeçalho encaminhado |
| `BUILD_STANDALONE` | só no Docker | `true` liga `output: "standalone"`; na Vercel **não** usar |
| `SENHA_USUARIOS_DEV` | não | sobrescreve a senha dos usuários de desenvolvimento |
| `PORT` / `HOSTNAME` | não | porta e interface do servidor (a imagem já define 3000 / 0.0.0.0) |
| `AMBIENTE_APP` | não | rótulo do ambiente no rodapé fora de produção. Sem ela, cai para `VERCEL_ENV` e depois `NODE_ENV`; em `production` a linha não é renderizada |
| `COMMIT_SHA` | não | commit exibido no rodapé fora de produção. Sem ela, cai para `VERCEL_GIT_COMMIT_SHA` ou `GITHUB_SHA` |
| `CHROMIUM_EXECUTAVEL` | não | caminho de um Chromium próprio para o Playwright (contêineres) |
| `PW_REUSAR_SERVIDOR` | não | `1` aponta o e2e para um servidor já em execução |

Nenhum segredo entra na imagem: o `.dockerignore` exclui `.env*`, e as
variáveis são injetadas pelo orquestrador em execução.

### Chaves de proteção de dados pessoais

Duas chaves obrigatórias, ambas só por ambiente — nunca no repositório e
sem valor padrão embutido: faltando qualquer uma, a operação que a usaria
falha com mensagem explícita em vez de gravar dado protegido por um
segredo conhecido.

| Chave | Para que serve | Ao girar |
|---|---|---|
| `CPF_HASH_KEY` | HMAC-SHA-256 de CPF de **toda** a plataforma: identidade do assinante (Onda 5) e `cpf_hash` da telemetria (Onda 1), que delega ao mesmo serviço (`infra/assinantes/protecao-cpf.ts`). Chave única é o que sustenta a junção telemetria ↔ assinante (RN36). | Re-identifica a base inteira e desliga a junção — só com plano de recarga |
| `APP_ENCRYPTION_KEY` | Cifragem do CPF em repouso (AES-256-GCM) na tabela `assinantes` | CPFs já cifrados deixam de ser legíveis — exige recarga do núcleo |

### Usuários de desenvolvimento (seed, nunca criados em produção)

| E-mail | Papel |
|---|---|
| `gestor@dev.clubebroto.local` | Gestor do Clube |
| `analista@dev.clubebroto.local` | Analista de Aliados |
| `scout@dev.clubebroto.local` | Analista de Scout (Onda 2) |
| `comercial@dev.clubebroto.local` | Comercial (Onda 2) |
| `aprovador@dev.clubebroto.local` | Aprovador |
| `leitura@dev.clubebroto.local` | Leitura |
| `administrador@dev.clubebroto.local` | Administrador da Plataforma |

Senha de todos: `clube-broto-dev` (sobrescrevível com `SENHA_USUARIOS_DEV`).

## Scripts

| Comando | O que faz |
|---|---|
| `pnpm dev` / `pnpm build` / `pnpm start` | desenvolvimento / build / produção |
| `pnpm typecheck` · `pnpm lint` | verificação estática |
| `pnpm test` | testes de unidade (regras de negócio) e integração* |
| `pnpm e2e` | e2e Playwright + axe-core AAA (exige build e banco com seed) |
| `pnpm e2e --project=desktop` | só as suítes de fluxo e acessibilidade |
| `pnpm e2e --project=mobile-380` | só a suíte de responsividade a 380px |
| `pnpm db:migrate` | aplica migrations (produção/CI) |
| `pnpm db:migrate:dev` | cria/aplica migrations (desenvolvimento) |
| `pnpm db:seed` | seed de taxonomias, indicadores, regras do motor, valores de regra, meta vigente e usuários dev |
| `pnpm job:diario` | job diário: expira vigências (RN03), janela contratual e reavaliação (RN21) |
| `pnpm guia:gerar` | regera `public/guia-da-plataforma.html` a partir de `conteudo/guia-plataforma`. **Não roda no build** — a saída é versionada, e um teste reprova se ela ficar atrás da fonte (ver *Guia da Plataforma*) |
| `node scripts/gerar-geometria-brasil.mjs` | regenera o asset de geometria do mapa (T30) a partir do Natural Earth. **Não roda no build** — a saída é versionada; o script existe para a proveniência ser reproduzível |

\* os testes de integração (auditoria com banco) só executam quando
`DATABASE_URL` está definida; sem banco, são pulados.

Cada migration tem `down.sql` verificado — ver `prisma/migrations/LEIA-ME.md`.

## Carga inicial (base real)

A carga lê as duas planilhas de `dados/`, monta o *staging*, passa pela **tela
de conferência** e só então efetiva — nada é criado sem revisão humana.

1. Entrar como Gestor e abrir **/carga-inicial** (ou o botão "Importar carga
   inicial" na T1).
2. **Iniciar leitura das planilhas** — popula o staging e mostra contadores e
   quarentena. Reexecutar substitui o staging ainda não efetivado.
3. Conferir os agrupamentos produto→solução propostos: renomear, mover oferta
   entre agrupamentos do mesmo seller, aprovar/rejeitar em lote ou item a item.
4. **Efetivar** — cria empresas (Aliada ativa), soluções, ofertas e a
   telemetria histórica numa transação. É **idempotente por id externo**:
   reimportar não duplica.

Campos que não existem na origem (CNPJ, contratos, categorias, imagens) ficam
**pendentes** e aparecem na régua de completude (RN09) — nunca preenchidos por
suposição.

## Job diário

`pnpm job:diario` expira vigências (RN03) e marca contratos na janela de
não-renovação (≤30 dias do aniversário). É idempotente e auditado por um
usuário de sistema. Em produção, agende-o uma vez por dia (EventBridge
Scheduler → task do ECS, ou cron do App Runner). Há também uma rota manual
restrita ao Gestor.

## Docker

Imagem multi-stage (`Dockerfile`): dependências → build standalone → runtime
sem toolchain, rodando como usuário `node`.

```bash
docker build -t clube-broto-admin .

docker run --rm -p 3000:3000 \
  -e DATABASE_URL="postgresql://usuario:senha@host:5432/clube_broto?schema=public" \
  -e AUTH_SECRET="$(openssl rand -base64 32)" \
  -e AUTH_URL="http://localhost:3000" \
  -e AUTH_TRUST_HOST=true \
  clube-broto-admin
```

O contêiner **não** aplica migrations no start — ver abaixo.

## Deploy (ECS Fargate ou App Runner)

1. **Construir e publicar a imagem** no ECR (`docker build` + `docker push`).
2. **Aplicar as migrations como passo separado**, antes de trocar a versão em
   execução: `pnpm db:migrate` (ou `npx prisma migrate deploy`) numa task
   pontual com a mesma `DATABASE_URL`. Fazer isso no start do contêiner faria
   várias instâncias subindo em paralelo disputarem o schema.
3. **Seed**: `pnpm db:seed` popula taxonomias e o estado de nascimento das
   regras do motor (RN06). Rodar **uma vez**, no primeiro deploy do ambiente.
   Os usuários de desenvolvimento não são criados fora de desenvolvimento.
4. **Subir o serviço** com as variáveis da tabela acima. A aplicação escuta em
   `0.0.0.0:3000`; aponte o health check para `/entrar` (rota pública).
5. **Agendar o job diário** (seção anterior).
6. **Rollback**: voltar a imagem anterior. Se a versão nova trouxe migration,
   aplicar o `down.sql` correspondente (`prisma/migrations/*/down.sql`, todos
   verificados) antes de voltar.

## Estrutura

```
app/        rotas e telas (App Router); shell fiel ao protótipo v9.1
dominio/    regras de negócio puras e testáveis (RBAC, auditoria, cobertura, geografia)
infra/      Prisma, Auth.js, gravador de auditoria, consultas, casos de uso
infra/geografia/  geometria Natural Earth versionada + projeção no servidor (T30)
prisma/     schema das oito ondas, migrations reversíveis (com down.sql), seed
design/     DSeed: tokens.css (intocável) + dseed-admin.css (extensões)
e2e/        Playwright + axe-core (fluxos, acessibilidade, teclado, 380px)
dados/      planilhas reais da carga inicial (consumidas na F3)
scripts/    job diário e geração do asset de geometria do mapa
Dockerfile  imagem multi-stage de produção (standalone)
```

## Dossiê assistido (Onda 2 — F8)

Due diligence **pública** da empresa em dez etapas, na tela T11
(`/mercado/{empresaId}/dossie`, também alcançável pelo menu do card no
funil). Duas formas de produzir o dossiê, pela mesma porta `DossieProvider`:

- **Automática** — API da Anthropic com busca na web. O prompt é montado a
  partir do template versionado `docs/especificacao/prompt-dossie-due-diligence.md`
  (alterar o arquivo é alterar produto: a versão usada fica registrada em
  cada execução) e a resposta é validada contra o schema do template antes
  de ser gravada.
- **Manual** — o analista cola o dossiê produzido fora da plataforma. A
  T11 mostra o prompt pronto para copiar. Sempre disponível: é a
  alternativa permanente e o caminho quando a chave não está configurada.

Regras que valem em qualquer caminho:

- **Só sob demanda.** A geração parte sempre de um analista, uma por
  empresa de cada vez; não existe rotina que gere dossiês em lote.
- **RN19.** O dossiê nasce marcado "gerado automaticamente — requer
  revisão" e só sai desse estado pela ação "marcar como revisado", que
  grava autor e data. **Nenhum campo do dossiê preenche nota de
  indicador** — ele alimenta evidência; a pontuação é sempre humana. Um
  teste de arquitetura (`infra/arquitetura/independencia-dossie.test.ts`)
  falha se a avaliação passar a enxergar dossiê.
- **Custo e duração por execução**, inclusive nas tentativas que falham —
  visíveis na própria T11.

### Configuração (variáveis de ambiente, nunca commitadas)

| Variável | O que é |
|---|---|
| `ANTHROPIC_API_KEY` | Chave da API (secret do ambiente/CI) |
| `DOSSIE_TETO_MENSAL_BRL` | Teto de gasto do mês **[A CONFIRMAR TI]** |
| `DOSSIE_CUSTO_MAX_UNITARIO_BRL` | Teto por dossiê **[A CONFIRMAR TI]** |
| `DOSSIE_CUSTO_ENTRADA_BRL_MTOK` | Tarifa de entrada, R$ por milhão de tokens **[A CONFIRMAR TI]** |
| `DOSSIE_CUSTO_SAIDA_BRL_MTOK` | Tarifa de saída, R$ por milhão de tokens **[A CONFIRMAR TI]** |

Não há valor padrão embutido para nenhuma delas — e não haverá: sem tarifa
não se apura custo, e sem custo o teto seria decoração. **Faltando
qualquer variável, a geração automática fica indisponível** com mensagem
clara na T11 (dizendo o que falta) e a inserção manual segue operando. É
esse o estado esperado em desenvolvimento: nenhuma chave de teste é
embutida no repositório.

Como os tetos agem: antes de chamar a API, o custo do pior caso da
execução é comparado ao teto por dossiê e ao consumo já realizado no mês —
acima de qualquer um, a geração é bloqueada com a mensagem dizendo quanto
resta. Durante a pesquisa, o custo é reapurado a cada rodada de busca e a
execução é interrompida ao ultrapassar o teto unitário, com o gasto
registrado.

**Desde a F10, os dois tetos são editáveis sem código no Parametrizador
(T17).** A precedência é: teto definido na T17 vence o do ambiente; ausente
lá, o ambiente responde; ausente nos dois, falta configuração e a geração
automática segue indisponível. A chave da API e as duas tarifas continuam
exclusivamente no ambiente — são segredo e conversão cambial da TI, não
parâmetro de produto, e por isso não aparecem na T17.
## Parametrizador — o que é configurável e o que não é

O hub (`/parametrizador`) separa três classes de parâmetro, conforme a ficha da
Onda 3 §3:

- **Listas de domínio** (T16): categorias, culturas, abrangência, motivos de
  suspensão e de descarte, tipos de benefício, indicadores de scout e perfil de
  cliente. Editáveis, com integridade referencial. *Abrangência* não recebe
  itens novos: a malha de UFs é fato público e fechado — inventar uma unidade
  federativa não é configurar. *Perfil de cliente* nasce **vazia**: o seed de
  porte × natureza (PF/PJ) ainda não foi definido pelo negócio.
- **Valores de regra** (T17): réguas de 14/30 dias (funil), 90 (oferta sem
  resgate), 15 (vigência a vencer) e 12 meses (reavaliação); comissão-padrão de
  **5%** (confirmada em 24/07); metas por período; tetos do dossiê.
- **Estruturais** (somente leitura no hub): naturezas da oferta, estágios do
  pipeline, status, mecânicas de resgate, dimensões de medição e ambientes de
  pagamento. A contagem de cada um vem dos metadados do schema, não de números
  digitados na tela — acrescentar um estágio muda o hub sozinho.

### Pendências declaradas (não resolvidas no código)

| Parâmetro | Situação |
|---|---|
| Tetos do dossiê (mensal em R$ e custo máximo unitário) | **[A CONFIRMAR TI]** — nascem **sem valor** no Parametrizador. A T17 exibe o campo vazio com etiqueta de pendência, e nenhum default plausível é gravado no lugar de uma decisão que o negócio não tomou. Definir o teto na T17 **ou** na variável de ambiente correspondente habilita a geração automática do dossiê; enquanto os dois estiverem vazios, a T11 segue dizendo o que falta e só a inserção manual opera. |
| Comissão do Cupom de desconto | **[A CONFIRMAR]** desde a Onda 1 — segue aberta atrás de `COMISSAO_CUPOM: "EM_CONFIRMACAO"`. Não confundir com a comissão-padrão do contrato-modelo, que foi confirmada em 5%. |
| Taxas transacionais do meio de pagamento | **Em standby** por decisão de 24/07: exibidas como referência informativa, sem edição habilitada. |
| Seed do perfil de cliente (porte × natureza PF/PJ) | A definir com o negócio; a lista nasce vazia com o estado explicado na tela. |

### Regiões de cobertura

A ficha cita "cobertura (UFs/regiões)". Estão implementadas as **UFs**, que são
o que o schema referencia hoje (`solucao_ufs`) e o que as telas consomem.
Regiões não foram criadas: nenhuma entidade as consome, e uma lista editável
que não governa nada seria configuração morta. Quando a cobertura por região
entrar em alguma onda, ela se pluga aqui como mais uma família.

## Cobertura, metas e ficha cadastral (Onda 2 — F9)

**T13 — Mapa de cobertura** (`/mercado?aba=cobertura`). Matriz categoria ×
(aliadas ativas · funil por estágio). *Gap de portfólio* é a categoria sem
nenhuma aliada ativa; *gap descoberto* é o gap que também não tem ninguém no
funil — onde o scouting rende mais. Ambos são **derivados da contagem real**,
nunca escritos à mão, e qualquer célula do funil abre a T8 já filtrada na
categoria. Enquanto a carga inicial não for classificada, o rodapé diz quantas
aliadas ativas ainda estão sem categoria: um gap pode significar portfólio não
classificado, e a tela não deixa confundir as duas coisas.

**T14 — Metas** (`/mercado?aba=metas`). Meta × realizado do período, geral e
por categoria. O valor da meta vem sempre da tabela `metas_periodo`; não há
meta escrita em código, e sem meta configurada a tela mostra só o realizado e
diz que a definição é do Administrador da Plataforma. *Realizado* (RN22) é
**promoção efetivada no período**, contada na trilha de auditoria pela mudança
de estágio para Aliada ativa com valor anterior preenchido — as 46 aliadas da
carga inicial nasceram ativas e por isso não contam.

A tela é somente leitura nesta onda: criar e editar metas é do Administrador da
Plataforma no Parametrizador (Onda 3, T17, RN28). A tabela já nasce no formato
que esse editor espera — período, janela, categoria opcional, valor e a
`origem` da decisão —, e o seed grava a meta vigente (24 novos aliados no ano
de 2026) de forma idempotente, sem sobrescrever o que já existir.

**RN20 — o caso completo na fila.** O pedido de promoção congela, no momento em
que é feito, a avaliação fechada vigente e o dossiê pronto da empresa. A T6
mostra os dois ao aprovador: score explicado por dimensão, recomendação, autor
e data; e o estado de revisão do dossiê. Quando faltam, a tela diz que faltam —
promoção não exige avaliação nem dossiê, mas quem aprova precisa saber que
decidiu sem eles. O que o aprovador vê é o que foi submetido, não o que mudou
enquanto o pedido esperava.

**T12 — Ficha Cadastral M1** (aba *Ficha M1* da ficha da empresa, estágio *Em
negociação*), conforme `docs/especificacao/ficha-cadastral-aliado-v1.md`. Vale
a **obrigatoriedade progressiva**: o medidor por seção mostra o que falta para
M1 sem bloquear a gravação, e CNPJ, endereço completo e contrato assinado
seguem exigidos só na promoção (M2, régua da Onda 1). Dois pontos merecem
atenção de quem opera:

- os **indicadores da seção D** são declarações datadas e marcadas como
  autodeclaradas; guardam histórico (o número de um ano não corrige o do
  anterior), aparecem na aba Scouting e **nunca preenchem nota de indicador**;
- cada **oferta pretendida** da seção F vira, na promoção, um rascunho de
  Solução + Oferta pendente de curadoria — zero redigitação. A linha que não
  tiver tipo de benefício e mecânica definidos permanece como intenção: nada é
  inventado para completar o rascunho.

As abas *Scouting* e *Dossiê* da ficha **reaproveitam** os componentes da T10 e
da T11 — a ficha é uma segunda porta para a mesma informação, não uma segunda
implementação dela.

**Fora desta fase, por decisão de operação:** a carga inicial do funil. As
listas reais de prospects ainda não estão disponíveis e nenhum mapeamento foi
inventado; quando os arquivos chegarem, a importação da T9 (com mapeador
configurável, entregue na F6) já cobre a operação.

## Dashboard, Usuários e Auditoria (Onda 6 — F13)

**T26 — Dashboard**, a HOME (rota `/`, primeiro item da sidebar). Duas camadas.
No topo, a faixa **"Exige ação hoje"**: aprovações pendentes, cadastros
incompletos bloqueando publicação (RN09), vigências a vencer, janelas
contratuais de não-renovação, reavaliações vencidas (RN21) e importações em
quarentena — cada contagem de query real, cada cartão clicável levando à tela
onde se resolve. Faixa zerada não some: afirma o estado positivo. Abaixo, os
quatro blocos por domínio com seletor de período.

A **RN50** governa o painel inteiro e é o que o diferencia de um relatório:
todo indicador vem de uma ficha validada das Ondas 1–5 (o catálogo é fechado
em código, e um teste confere que as fichas citadas existem mesmo), e
indicador sem fonte sustentada exibe **o motivo**, nunca um número aproximado.
Percentual com denominador zero é "sem base de cálculo", não 0% — "0% de
vitrine viva" acusaria uma rede parada onde a verdade é que não há oferta
ativa para medir. Todo número de campanha viaja com a etiqueta de atribuição
(RN43). O painel é leitura pura: não grava nada, e é visível a todos os papéis
porque só exibe agregados (coerente com a RN33).

**T27 — Usuários** (`/usuarios`). Leitura de todos os papéis; escrita
exclusiva do Administrador da Plataforma (**RN46**). Duas garantias:

- **anti-lockout**: o último administrador ATIVO não pode ser rebaixado nem
  inativado. A tela desabilita o botão com o motivo, e o serviço recusa de
  todo jeito — avaliando o retrato lido dentro da transação, com a linha do
  alvo travada, para que dois administradores se rebaixando ao mesmo tempo não
  deixem a plataforma sem nenhum;
- **RN47 — revogação imediata**: inativar (e trocar de papel) incrementa a
  *época de sessão* do usuário. O token carrega a época em que foi emitido e
  ela é reconferida a cada leitura de sessão, então a sessão aberta cai na
  requisição seguinte. Não existe exclusão de usuário: quem tem histórico é
  inativado, e a autoria dele nos registros e na trilha permanece.

Credencial própria com **troca obrigatória no primeiro acesso**: o usuário
nasce provisório e, enquanto não definir a própria senha, só navega para
`/trocar-senha`. A senha provisória é exibida ao Administrador uma única vez —
nem ela nem o hash entram na trilha de auditoria. SSO Entra ID segue como
decisão futura (D3), com a interface de identidade já abstraída.

**T28 — Auditoria** (`/auditoria`). Consulta paginada da trilha completa, com
filtros por entidade, registro, autor, tipo de evento e período — tudo na
querystring, para que a consulta seja compartilhável e o extrato saia com
exatamente os mesmos parâmetros da tela. Cada evento expande na visão
**antes → depois** em duas colunas, com as diferenças destacadas (evento cujo
valor é JSON é decomposto chave a chave: destacar tudo seria não destacar
nada). Eventos sensíveis levam marcador — acesso pleno a dados de PF,
exportações, alterações de parâmetro e de regra de aprovação.

**RN48**: a trilha é somente leitura, o extrato CSV exige papel Gestor ou
Administrador, e **a própria exportação gera evento de auditoria** (a
meta-trilha), classificado como sensível. **RN49**: nenhum evento é apagado —
não há purga em lugar nenhum do código de produção, e um teste de arquitetura
quebra o build se alguém escrever a primeira.

## Cobertura, Mapa da rede e as correções transversais (Onda 7 — F14)

### RN51 — a cobertura passa a ter fonte única

Antes da F14 a definição de cobertura morava em `dominio/metas/cobertura.ts` e
só a T13 a usava; o Dashboard consumia o resultado dela. Com a T29 pedindo a
mesma verdade sob outra pergunta, três telas contariam lacunas por caminhos
próprios — que é como um número diverge do outro sem ninguém perceber.

A definição agora vive em **um lugar só**, em duas camadas:

| Camada | Onde | O quê |
|---|---|---|
| **Fato** | `infra/consultas/cobertura.ts` | uma apuração: aliados ativos, soluções publicadas e funil por estágio, por categoria — sem juízo |
| **Lentes** | `dominio/cobertura/cobertura.ts` | cada tela deriva do mesmo fato o recorte da sua pergunta |

As lentes **não colapsam em uma**, e isso é deliberado: a T13 pergunta *onde
falta gente* (gap = categoria sem aliado ativo) e a T29 pergunta *onde a
prateleira é rasa*. Categoria com um aliado ativo e nada publicado é **frágil**
para a T29 e **não é gap** para a T13.

**O vocabulário, definido uma vez e exibido na tela:**

| Situação | Critério |
|---|---|
| **Coberta** | dois ou mais aliados ativos e ao menos uma solução publicada |
| **Frágil** | um único aliado ativo, **ou** aliados sem nenhuma solução publicada |
| **Descoberta no funil** | nenhum aliado ativo, mas há empresa em prospecção |
| **Sem cobertura** | nenhum aliado ativo e ninguém no funil |

"Frágil" é o único critério que a ficha não fecha em número; o adotado está em
`CRITERIOS_SITUACAO` **e aparece na interface**, porque régua que só vive no
código vira conhecimento tribal.

**Prova de que a T13 não mudou.** `infra/consultas/cobertura.regressao.test.ts`
mantém a implementação da F9 congelada no próprio arquivo e roda as duas contra
o mesmo banco, campo a campo. Não é *golden file*: número gravado à mão alguém
"atualiza" quando fica vermelho, que é como uma regressão vira commit.

### T29 — Cobertura do portfólio (`/aliados/cobertura`)

Faixa de quatro indicadores (com alerta quando há vazios), distribuição por
categoria em barra dupla com o critério de ordenação **escrito na tela**,
"Onde faltam" com **"Buscar no radar"**, concentração nas três maiores e a
matriz Categoria × cultura.

O caminho que a RN51 desenha fecha ponta a ponta e está testado assim:
**T29 → "Buscar no radar" → T8 filtrada pela categoria → (se vazia) "+ Entrar
no radar" → T9 com a categoria já marcada.** Verificar antes de prospectar só
é regra se o caminho inteiro existir; sem o último passo, a verificação termina
num beco.

Duas notas da matriz são **obrigatórias** pela ficha e estão no corpo da tela,
não em rodapé: sem a primeira, quem lê soma a linha e erra (uma solução serve
mais de uma cultura); sem a segunda, atribui à matriz um recorte de região que
ela não tem.

**O funil não é recortado por cultura**, e isso é decisão: empresa em
prospecção não tem solução cadastrada, logo não declara cultura. Aplicar o
filtro zeraria a coluna e faria toda categoria parecer descoberta. A tela
declara a ressalva quando o filtro está ativo.

### T30 — Mapa da rede (`/aliados/mapa`)

**RN52 é o eixo:** sede e abrangência são consultas diferentes porque são
perguntas diferentes. Não existe caminho comum que "resolva" as duas.

| Modo | Fonte no cadastro | O que NÃO é |
|---|---|---|
| **Sede do aliado** | `empresas.endereco_uf` | não é alcance de atendimento |
| **Abrangência declarada** | cobertura das soluções publicadas (`cobertura_nacional` ou `solucao_ufs`) | não é presença física |

**Sobre a abrangência não ser campo do aliado:** o cadastro guarda a cobertura
na *solução*, e a abrangência do aliado é a união das coberturas das soluções
que ele publicou — a única declaração de alcance que o cadastro sustenta hoje.
Aliado sem cobertura declarada **não cai para a sede**: vira volume não
declarado, com o motivo na tela. É a pendência herdada da ficha §10, agora
visível em vez de silenciosa.

**Geometria e projeção.** O mapa usa Natural Earth 1:50m (domínio público),
gerado por `scripts/gerar-geometria-brasil.mjs` e **versionado** em
`infra/geografia/brasil-ufs.geo.json` — nada é buscado de CDN quando a tela
abre. A projeção (`d3-geo`, Mercator) roda **no servidor**: o SVG chega pronto
no HTML, sem JS de mapa no cliente, sem estado de carregamento e sem o caminho
de falha "a biblioteca não carregou" que o protótipo precisa ter. Os centróides
também não são digitados — saem de `geoPath.centroid()` sobre a geometria real.

Para conferir a proveniência: rode o script e compare com o arquivo commitado.

### Rodapé versionado (ficha §4)

O rodapé exibia "Ondas 1–2 · Aliados, Ofertas e Mercado" — factualmente
incorreto desde a Onda 3 e impróprio para usuário final. Passa a exibir
**"Elaborado por Broto S.A. · v{versão}"**, com a versão vindo do `version` do
`package.json`, injetada no build por `next.config.ts`. **Nunca digitada**: um
literal no componente envelheceria do mesmo jeito.

**Convenção de versionamento adotada.** `package.json` foi de `0.1.0` a
**1.0.0** na F14, por decisão registrada na ficha §4: o escopo especificado
(F1–F13) está completo e em produção, e `0.x` deixaria de descrever a
realidade. O 1.0.0 é, portanto, o **marco do escopo original**, e a Onda 7
entra dentro dele — não como a versão seguinte.

Daqui em diante, [SemVer](https://semver.org/lang/pt-BR/) lido pelo produto,
não pela API:

| Parte | Quando muda | Exemplo |
|---|---|---|
| **MAIOR** | quebra de contrato com quem consome a plataforma | mudar o formato do export ou do kit para a Minutrade; remover tela ou rota |
| **MENOR** | onda ou fase que acrescenta capacidade | a próxima onda vai a `1.1.0` |
| **CORREÇÃO** | correção sem capacidade nova | ajuste de cálculo, defeito de tela, correção de acessibilidade |

A versão é elevada **uma vez por fase**, junto com a atualização do
`CLAUDE.md`, para o número valer durante toda a fase e aparecer no rodapé de
qualquer preview daquela fase.

Em ambiente **não-produção**, uma segunda linha discreta mostra ambiente e
commit curto (`NEXT_PUBLIC_AMBIENTE`, `NEXT_PUBLIC_COMMIT_CURTO`), para ninguém
apresentar uma preview acreditando estar na plataforma no ar. Em produção a
linha não é renderizada.

### Fidelidade do cabeçalho (ficha §5)

A implementação divergia do protótipo aprovado: a área de marca dentro da
`<aside>` era branca e, somada ao header branco, produzia uma faixa clara
atravessando o topo, com o logo na variante azul/verde. O protótipo define o
contrário — o **azul institucional da lateral sobe até o topo**, envolvendo a
marca, com o logo **amarelo/verde** (a variante que existe justamente para
fundo azul; foi a inversão dela que produziu a faixa branca).

A entrega do Design ofereceu duas variantes de topo. **Decisão da
Superintendência: apenas a azul permanece** — sem alternador e sem código
morto, então a variante clara não existe no arquivo.

Preservados e testados: o alternador de recolher a lateral, a navegação entre
módulos, o marco de landmark e o comportamento a 380px.

### HOME em três camadas (ficha §6)

O panorama de oito indicadores do hero **não existia**. A causa foi de
especificação, não de execução: a ficha da Onda 6 §2 descreveu "faixa + quatro
blocos" e não enumerou as células do hero, então a F13 usou o hero para as
pendências. A ficha da Onda 7 §6 fecha a lacuna.

| Camada | O quê |
|---|---|
| 1 — hero | número-tese da vitrine viva, seletor de período e **panorama de 8 células** clicáveis, cada uma com rótulo, número e nota de procedência |
| 2 — pendências | "Pendências · exige ação hoje" como cartões próprios, **fora** do hero |
| 3 — blocos | os quatro blocos por domínio, **preservados integralmente**, com a meta × realizado no de Mercado |

**Nenhuma consulta de negócio nova.** Onde o número já existe, a célula
reaproveita: "Aliados" é o denominador da completude que o bloco de Rede já
calcula, "Assinantes" o do contato válido, "Soluções" vem do serviço único de
cobertura, e campanhas/kit/resgates vêm de `listarCampanhas`. Este último
merece nota: `resgatesNaVigencia` a medição da F12 **já apurava e descartava** —
expô-lo é o oposto de uma consulta nova.

Célula sem base exibe o motivo, **jamais zero**: sem campanha ativa não há
"resgates na campanha ativa" para apurar, e isso é ausência de base, não zero
resgates.

`infra/consultas/dashboard.panorama.test.ts` prova a regressão dos quatro
blocos (mesmos indicadores, mesma ordem, meta × realizado no lugar, nenhuma
chave de panorama vazando) e as igualdades que comprovam a fonte compartilhada.

### Sino de pendências (ficha §7)

O botão de notificações era decorativo — tinha até um `title` prometendo
alertas que nunca chegariam. Agora é **atalho do que a plataforma já calcula**.

O que ele deliberadamente **não** é: sistema de notificação. Sem fila
persistente, sem lido/não-lido, sem preferências — nada disso está em ficha, e
inventar essa infraestrutura criaria um segundo lugar onde pendência mora, com
estado próprio para divergir do primeiro.

O número sai de `totalDePendencias`, **a mesma função dos cartões da HOME**, e
o layout apura uma vez e passa pronto: o sino não consulta nada por conta
própria. Pendência indisponível não entra na soma (RN53). Acessibilidade como
critério de aceite, não acabamento: estado de expansão declarado, texto
acessível no marcador, Esc fecha devolvendo o foco ao botão, clique fora fecha,
foco contido no painel enquanto aberto, marcador em AAA e largura útil a 380px.

**Custo operacional declarado:** apurar as pendências no layout significa
executar as seis contagens em **toda** renderização de página autenticada. São
`count`s indexados (a F13 criou `@@index([estagio, reavaliacao_pendente])`
exatamente para isso), mas é custo real e consciente — o marcador precisa
existir sem interação, então não há como adiá-lo para o clique.

## Marca do aliado, listas, falhas legíveis e arrasto (Onda 8 — F15)

Primeira onda nascida de **homologação com base povoada**: cada item veio de
uso real, não de especulação. Nenhuma tela nova — seis ajustes sobre telas
que já existiam.

### RN54 — a marca do aliado passa a ser arquivo da plataforma

O cadastro pedia o **endereço de um objeto no S3**, de um bucket que a TI
nunca provisionou: na prática, nenhum logo existia. A marca passou a ser
enviada na própria tela e guardada pela plataforma.

**A decisão vale para este caso específico**, e os limites são a condição
dela: poucas dezenas de arquivos, pequenos, com consistência transacional de
graça e zero dependência externa. **O S3 e o `ExportAdapter` continuam
existindo para o que é volumoso — as peças de campanha (Onda 4) —, onde banco
não serve.**

| Limite | Valor | Por quê |
|---|---|---|
| Tamanho | **200 KB** por arquivo | É a premissa que torna guardar binário no banco defensável. |
| Formatos | **PNG, JPG, WEBP, SVG** | Cobrem o que ferramenta de design exporta. |
| Tipo | apurado pelo **conteúdo**, nunca pela extensão | Renomear `.html` para `.svg` não muda o que o arquivo é. |
| SVG | **higienizado** antes de gravar | Sai script, manipulador de evento, `<foreignObject>` e referência externa. |
| Dimensão de uso | **320 px** | Maior caixa do produto (132 px na ficha) em tela de alta densidade. |

Esses números vivem em `dominio/marca/marca.ts`, **não no Parametrizador**:
não são régua de negócio (RN23), são a condição de arquitetura da decisão.
Afrouxá-los pela tela derrubaria a premissa sem que ninguém a revisse.

**Modelagem:** o binário fica em `marcas_aliado`, tabela própria com relação
1:1 com a empresa — **nunca coluna de `empresas`**. O Prisma seleciona
escalares por padrão: um `BYTEA` ali faria a lista, o funil, o mapa e o painel
carregarem o arquivo em toda consulta. Lista e funil trafegam só o **hash**.

**Entrega:** `GET /api/aliados/{id}/marca`, com permissão espelhada na do
aliado e `ETag` igual ao SHA-256 do conteúdo — a troca invalida o cache
sozinha, numa URL estável. Para SVG são **três camadas**: higienização na
gravação, `nosniff` + CSP `default-src 'none'` na entrega, e `<img>` nas telas
(onde script em SVG não executa). Sanitizador por texto é bom, não infalível;
as três juntas é que sustentam a decisão.

**Onde aparece:** ficha do aliado, lista de aliados, cards do funil (T8) e
kits de oferta e campanha (pasta `marcas/` no zip, declarada em chave **nova**
do manifesto — as antigas seguem intactas e kit sem marca sai byte a byte
igual ao de antes da F15). Sem marca: placa com a inicial, nunca espaço
quebrado.

**Envio pela tela:** o navegador encolhe imagem grande por `canvas` antes de
enviar — **é conveniência de cliente e está declarado como tal no código**.
Tamanho, tipo real e higienização são decididos no servidor, sempre, sobre os
bytes que chegarem. **Não se aplica a SVG**: rasterizar destruiria o vetor e
mudaria o tipo real do conteúdo.

### RN55 — a mensagem de erro nomeia a causa

Um erro de configuração ausente chegava à tela como *"Não foi possível
concluir a ação. Tente novamente."* — genérico e, pior, **conselho errado**:
tentar de novo nunca criaria a variável de ambiente. Custou meia hora de
homologação.

A convenção agora, em `infra/erros/falha-para-mensagem.ts`, valendo para as
**15 server actions**:

- **Erro de classe conhecida** — validação, permissão, configuração ausente,
  layout/limite de arquivo, segmento inválido, template, provedor, marca —
  propaga a **própria mensagem** até a interface.
- **Qualquer outra exceção** vira mensagem genérica **sem sugerir repetição**,
  dizendo onde o detalhe está (log do servidor) e o que informar à TI.
- **Nunca chegam à interface:** rastro de pilha, caminho de arquivo, SQL,
  identificador interno ou **valor** de variável de ambiente. Nomear a
  variável ausente é desejável — `ErroDeConfiguracao` recebe só o nome dela,
  e a proibição é garantida pela forma, não pela disciplina de quem chama.
- **Permissão é a única exceção** entre as classes conhecidas: a mensagem dela
  cita papel e ação internos, então cada tela escreve a sua, com a referência
  da ficha.

A distinção é **por classe, jamais por texto**. Mensagem de erro do Prisma
carrega tabela e SQL; `Error` de biblioteca carrega caminho. Nenhum dos dois é
instância das classes conhecidas — nenhum dos dois chega à tela. Uma cerca de
arquitetura reprova server action que volte a decidir sozinha ou a dizer
"tente novamente".

### RN56 — a leitura é do tamanho do conjunto

| Lista | Leitura | Por quê |
|---|---|---|
| **Aliados** (T1) | rolagem contínua, blocos de 20 | Conjunto contido (46 hoje, centenas no horizonte) e ler a rede inteira é gesto frequente. |
| **Assinantes**, eventos, auditoria | paginação no servidor | Base de dezenas de milhares: carga total quebraria a tela no dia da carga real. |

A consulta **continua paginada no servidor** — o primeiro bloco vem
renderizado (a tela pinta sem esperar JavaScript) e os seguintes chegam por
server action, sempre com `skip`/`take`. Filtros, busca e a contagem total
são preservados. **Teclado:** "Carregar mais" fica no fluxo natural do Tab
depois da última linha; a carga automática por proximidade nunca move o foco.

### RN57 — arrastar card no funil (T8)

Conveniência de mouse, **não caminho novo de decisão**. Soltar chama o mesmo
caso de uso do menu, com as mesmas validações, permissões e auditoria. A
decisão de quem pode mover o quê vive em `dominio/funil/regras.ts`
(`podeMoverNoFunil`, `podeDescartarNoFunil`) e é lida pelos **dois lados** —
não há cópia da regra no cliente.

- Destino não permitido a partir da origem **não aceita** o card (a coluna
  nem autoriza o soltar — a recusa é do gesto, antes de qualquer requisição).
- **Priorizada** sem avaliação fechada recusa (RN15); o card fica onde estava
  e a mensagem da regra aparece.
- **Descartar** abre o modal dos seis motivos e só conclui com um (RN17). A
  área de descarte existe **só durante o gesto** — o protótipo v9.1 não tem
  lane Descartada, então o layout em repouso continua o mesmo.
- **Em aprovação** não aceita nem cede card: o motor governa.
- Card fora da permissão do papel **não é arrastável**.

**Sem reposicionamento otimista, de propósito:** o card só muda de coluna
depois que a ação volta e a rota revalida. É a leitura mais estrita de "nunca
deixar o card no destino errado". Arrasto nativo, **sem biblioteca** — a
escolha é defensável porque o menu já é o caminho por teclado e por toque, e
**nenhuma função existe apenas no arrasto**.

### Célula "Ofertas" do painel (T26)

O destaque era `148 de 192`, dois números disputando a leitura. Passou a ser o
número de **ofertas ativas publicadas com resgate no período** — mesma base da
vitrine viva, **mesmo serviço** (`kpiVitrineViva`), com teste provando a
concordância entre os dois. "de N ativas" desceu para a nota de procedência.
Sem oferta publicada, traço com motivo (RN50).

## Guia da Plataforma e ajuda contextual (Onda 9 — F16)

### Fonte única — a regra que organiza a fase

O texto do guia existe **uma vez** no repositório, em `conteudo/guia-plataforma`:

| Arquivo | O que é |
|---|---|
| `capa.html` · `secoes.html` | o texto, transcrito do documento entregue pelo Design. **Imutável nesta onda** — corrigir o guia é decisão editorial, não de código |
| `indice.ts` | o sumário: doze entradas, com as âncoras que a rota e o mapa contextual usam |
| `montar.ts` | monta o documento (capa, corpo, sumário) e o script do realce de seção |
| `autonomo.ts` | acrescenta a moldura que a rota recebe do shell — `<html>`, estilos e fontes embutidas |

Dois destinos consomem essa fonte: a rota `/ajuda`, dentro do shell, e o
documento autônomo `public/guia-da-plataforma.html`, que circula por e-mail e
vira PDF pelo navegador. **Nenhum dos dois guarda cópia do texto.**

Depois de mexer no conteúdo — ou no `dseed-admin.css`, que o autônomo embute —
rode `pnpm guia:gerar` e commite o resultado. Esquecer não passa: o teste de
sincronia em `infra/arquitetura/guia-fonte-unica.test.ts` regenera e compara.
É a cerca contra o risco real desta onda, que é o arquivo que já saiu de casa
envelhecer sem ninguém notar.

O mesmo arquivo de teste prende mais três coisas: as doze seções com suas
âncoras, o texto conferido **frase a frase** contra
`docs/referencias/Guia_da_Plataforma_v1.html`, e o escopo da camada de leitura
— nenhum seletor do bloco `.gd` do `dseed-admin.css` vale fora de `.gd`, porque
a tipografia de 16px/1,7 do documento não pode vazar para os 14/24 do produto.

### RN58 — a ajuda é leitura, para todos

`/ajuda` vive dentro do shell e não exige papel algum: pede sessão como toda
tela, e nada além disso. Não consulta o banco e não exibe dado da operação —
é conteúdo editorial. Não há caminho de edição pela interface.

Rota e não modal (ficha §1.1, decisão fechada): doze seções e leitura longa
pedem rolagem, âncora por seção, endereço compartilhável, botão voltar do
navegador e impressão. `/ajuda#j4` é endereço publicado — trocar um
identificador de âncora quebra link já compartilhado.

### RN59 — contexto orienta, nunca aprisiona

O botão **"?"** fica no cabeçalho, à esquerda do sino — ajuda antes do alerta.
Leva à seção do módulo de origem pelo `MAPA_AJUDA`
(`dominio/ajuda/mapa-contextual.ts`), **uma constante nomeada** com a tabela da
ficha §1.3. Módulo sem mapeamento abre na abertura; nunca em erro.

A origem viaja em `?de=` e a seção na âncora. Como o caminho chega pela URL,
ele é **entrada não confiável** e a validação é estrutural, não por prefixo:

1. gramática por segmento (sem `%`, sem `:`, sem `..`), que já derruba
   `//externo.com` e `https://externo.com` — os dois que atravessam qualquer
   checagem ingênua de "começa com barra" e viram redirecionamento aberto;
2. allowlist: algum módulo do `MAPA_AJUDA` precisa casar;
3. o destino é **reconstruído** dos segmentos aprovados, nunca ecoado.

Caminho não reconhecido: sem barra de volta, sem adivinhação. Acesso direto
pela URL cai nesse caso, e é o comportamento certo.

Em Mercado & Scout a query **é** a tela — Funil, Cobertura e Metas diferem só
pelo `?aba=` —, então ela viaja junto e a volta devolve à aba certa. O botão e
a barra de volta são **âncoras nativas**, pela convenção de navegação por query
registrada no `CLAUDE.md`; a cerca de `navegacao-por-query.test.ts` cobre os
dois arquivos.

### Duas correções de AAA sobre o documento entregue

Achadas pelos testes desta fase, e ambas de marcação — nenhuma palavra do texto
mudou:

- **salto de nível de cabeçalho**: `<h4>` logo depois do `<h2>` da seção, no
  cartão e no item de princípio. Promovidos a `<h3>`, com o CSS distinguindo
  por contexto para o desenho não mudar. Preso por teste, porque quem comparar
  a transcrição com o documento vai achar que é erro de transcrição;
- **célula de prosa a 380px**: o colapso do `.tbl-resp` põe a célula em
  `display:flex`, e aí cada `<em>` vira um item próprio — a frase era disposta
  como caixas lado a lado que não quebram, estourava a largura e o cartão
  virava região rolável inalcançável por teclado. Dentro de `.gd` a célula
  volta a ser bloco, com o rótulo acima do valor. As tabelas do produto não
  foram tocadas.

Como a fonte é única, as duas correções chegaram de graça ao arquivo que
circula.

### Rótulo institucional (ficha §2)

O descritivo da lateral passou a **"Plataforma de gestão do Clube"**; no login e
nos metadados do documento, **"Plataforma de gestão do Clube Broto"**. O nome
formal do sistema — *Plataforma de Administração e Gestão do Clube Broto* — não
muda: segue neste README, no `CLAUDE.md`, nas fichas e no cabeçalho do kit
entregue à Minutrade. O que mudou é rótulo de interface.

## Imagem do card da solução (Onda 10 — F17)

### RN60 — a imagem passa a ser arquivo da plataforma

O cadastro da solução pedia o **endereço** de uma imagem (`imagemCardUrl`),
apontando para um bucket que nunca foi provisionado — o mesmo impasse que o
logotipo tinha antes da Onda 8, e a razão de nenhum card de solução ter
imagem. Agora é upload na própria tela, arquivo guardado pela plataforma e
servido por rota própria com ETag pelo hash.

**A infraestrutura é a da marca, generalizada — não uma segunda cópia.** O
núcleo de validação vive em `dominio/imagens/imagem.ts`, parametrizado por
`PerfilDeImagem`; `dominio/marca/marca.ts` e `dominio/solucoes/imagem-card.ts`
são só calibragem. A tela é `app/(plataforma)/cartao-de-imagem.tsx`, dividida
pelos dois usos.

| | Marca do aliado (RN54) | Imagem do card (RN60) |
|---|---|---|
| Limite | 200 KB | 400 KB |
| Formatos | PNG, JPG, WEBP, SVG | PNG, JPG, WEBP — **sem SVG** |
| Maior dimensão de uso | 320 px | 640 px |
| Papel | identidade da empresa | ilustração do que a solução é |

SVG fica fora do card por decisão: imagem de card é fotográfica por
natureza, o vetor não traz ganho e traria de volta toda a superfície de
higienização. A recusa **nomeia o formato** em vez de dizer que o arquivo é
inválido — porque não é: ele só não serve aqui.

**Decisão de arquitetura, para não se rediscutir a cada imagem nova:**
*imagem pequena, pouca e identitária vive no banco da plataforma; imagem
grande, numerosa e descartável vive em armazenamento de objetos.* Marca e
card de solução são do primeiro tipo; **peças de campanha** seguem no S3 via
`ExportAdapter`, sem alteração nesta onda.

Onde a imagem aparece: formulário e ficha da solução, pré-visualização do
card, cards de oferta e o kit de campanha (pasta `imagens-solucao/`, ao lado
de `marcas/`). Onde não houver, o lugar mantém o tratamento neutro — nunca
espaço quebrado.

### Posição do botão de ajuda

O **"?"** passou da esquerda do sino para a **extremidade direita** do
cabeçalho, como último elemento, depois do bloco de identidade e do papel
(ficha Onda 10 §2). Inverte o racional da Onda 9 por decisão da
Superintendência; a consequência é desejável — a ajuda fecha a ordem de
tabulação, e ajuda não é ação urgente. Rótulo, destino contextual e
comportamento seguem iguais.

### O payload da ação que às vezes é descartado

**Medido nesta fase, com número.** No cartão de imagem da solução, ~5 de 30
envios voltavam **200** do servidor e o cliente descartava o payload
inteiro: nem o valor de retorno da ação nem a re-renderização chegavam (o
`src` da imagem permanecia o antigo). O usuário via o arquivo gravado e
nenhuma confirmação. Na tela da marca, 0 de 20 — é específico desta tela, e
o mecanismo continua sem isolamento.

É a mesma assinatura que a seção *Convenções* do `CLAUDE.md` já registra
para navegação por query ("o payload RSC vinha 200 e era descartado").

**O que foi feito:** o cartão deixou de usar `useActionState` e passou a
guardar o resultado em estado próprio — a promessa da ação resolve no
cliente, então a confirmação é consequência do que o componente recebeu, e
não do que o roteador conseguiu aplicar. A versão do arquivo (hash, ou
`null` na remoção) viaja no retorno da ação, então a miniatura do cartão
também não depende da re-renderização. Depois disso: **0 de 30 sem
confirmação**.

**O que continua aberto:** a pré-visualização do card dentro do formulário
da solução é componente *irmão* do cartão — não vê esse estado, e só se
atualiza quando a re-renderização pousa. Na prática: o cartão mostra a
imagem nova na hora, a pré-visualização ao lado pode levar até a próxima
navegação. Fechar isso exige subir o estado da imagem para um pai cliente
comum, o que é mudança de desenho da T3 e merece fase própria.

### Dívidas nomeadas

**1. `solucoes.imagem_card_url` — coluna obsoleta.** Segue o caminho de
`empresas.logo_url`: deixou de ser escrita, e a leitura prefere a imagem
nova usando a antiga como retaguarda enquanto houver valor. Não foi
derrubada porque a queda é irreversível e não é exigida pela ficha.

*Condição objetiva de execução:* nenhuma solução com valor na coluna.

```sql
SELECT count(*) FROM solucoes WHERE imagem_card_url IS NOT NULL;
```

Zero → a migration de queda pode ser escrita, reversível, em fase própria.

**Cuidado que já quase custou dado:** o campo saiu do formulário, mas a ação
continuava lendo `imagemCardUrl` do `FormData`, e o ajudante `texto()`
devolve `null` para campo ausente. Cada edição de nome ou descrição gravaria
`null` sobre o endereço legado, e a solução perderia o ponto da régua RN09
que já tinha. A chave saiu do caminho de escrita, com teste de comportamento
e cerca no código: `infra/casos-de-uso/solucoes.integracao.test.ts`.

**2. A régua da RN09 está implementada duas vezes.** `calcularCompletudeCard`
em `dominio/ofertas/regras.ts` é a fonte que a T4 e a T5 exibem e que a RN02
usa; `contarCadastrosBloqueandoPublicacao` em `infra/consultas/dashboard.ts`
**reimplementa os mesmos oito itens inline**, para contar rascunhos no painel
sem instanciar a estrutura por linha.

A extração para fonte única **não** foi feita na F17, e por decisão: mexer
no cálculo que produz percentual em produção para arrumar arquitetura troca
um risco pequeno por um grande. O risco real — as duas listas divergirem em
silêncio — está coberto por
`infra/consultas/completude-equivalente.regressao.test.ts`, que monta a
tabela-verdade dos oito itens e confere que a contagem do painel bate com a
régua do domínio linha a linha.

*Quando extrair:* em fase própria, com o teste acima como rede, provando
antes e depois que os percentuais não se moveram.

## Operação da plataforma

Roteiro único de quem opera. Cada item aponta para a seção com o detalhe.

| O quê | Como | Quem |
|---|---|---|
| **Subir local** | `pnpm install` → `.env` (ver *Variáveis de ambiente*) → `pnpm db:migrate` → `pnpm db:seed` → `pnpm dev` | TI |
| **Deploy** | imagem no ECR → `pnpm db:migrate` como passo separado → subir serviço → agendar job diário (ver *Deploy*) | TI |
| **Job diário** | `pnpm job:diario` uma vez por dia: expira vigências (RN03), marca janela contratual e reavaliação vencida (RN21) | agendador |
| **Carga inicial** | T-carga (`/carga-inicial`): planilhas de `dados/` → staging → conferência → efetivação (ver *Carga inicial*) | Gestor |
| **Importar telemetria** | `/ofertas/telemetria`: arquivo da Minutrade → validação linha a linha → quarentena por motivo. Fatos são imutáveis (RN07) | Gestor · Analista |
| **Importar prospects** | `/mercado/radar`: lista de prospects em três passos, com mapeador de colunas configurável | Gestor · Analista de Scout |
| **Importar assinantes** | `/assinantes/importacoes`: núcleo e enriquecimento, política foto completa × incremental (RN29) | Gestor · Analista |
| **Publicar catálogo** | `/ofertas/publicacao`: gera o pacote da vitrine, registra diff e limpa *Pendente de republicação* (RN10) | Gestor |
| **Kit de campanha** | `/campanhas/{id}`: ativar congela o público (RN38) e gera o kit v1; ajuste gera nova versão, nunca edita a anterior (RN45) | Gestor · Analista |
| **Dossiê** | `/mercado/{id}/dossie`: geração assistida sob teto de custo, ou inserção manual (ver *Dossiê assistido*) | Gestor · Analista de Scout |
| **Exportar lista de contato** | T21: exige finalidade declarada e gera exportação auditada (RN34) | Gestor · Administrador |
| **Configurar parâmetros** | `/parametrizador`: réguas, comissão-padrão, tetos, metas e listas de domínio (RN23) | Administrador |
| **Enviar a marca do aliado** | `/aliados/{id}/editar`, cartão *Marca do aliado*: PNG/JPG/WEBP/SVG até 200 KB, tipo conferido pelo conteúdo e SVG higienizado (RN54) | Gestor · Analista |
| **Enviar a imagem do card** | `/aliados/{id}/solucoes/{solucaoId}`, cartão *Imagem do card*: PNG/JPG/WEBP até 400 KB, sem SVG, tipo conferido pelo conteúdo (RN60) | Gestor · Analista |
| **Gerir usuários** | `/usuarios`: criar, editar papel, inativar. Inativar derruba a sessão na hora (RN47) | Administrador |
| **Abrir a ajuda** | botão **?** no cabeçalho, à esquerda do sino: abre `/ajuda` na seção do módulo em que se estava (RN59). O guia também circula como arquivo: `public/guia-da-plataforma.html` | todos |
| **Consultar auditoria** | `/auditoria`: filtros, antes → depois, extrato CSV auditado (RN48) | todos leem · Gestor/Administrador exportam |

### Pendências abertas, com dono

Nada aqui está resolvido por suposição no código: cada item vive atrás de um
adapter, de uma flag nomeada ou de um estado explícito na tela.

**Minutrade** — quatro pendências, com o efeito de cada uma no produto:

| Pendência | Efeito hoje |
|---|---|
| Layout e meio de entrega do arquivo de importação do catálogo | A publicação sai pelo `GenericJsonCsvAdapter` (JSON/CSV genérico) atrás da porta `ExportAdapter`. O layout real entra como novo adapter, sem tocar o domínio nem as telas. |
| Cardápio real de eventos de telemetria, periodicidade, e o que "Resgates" significa na base atual (emissão × resgate efetivo) | O parser trabalha com os três degraus do funil contratual (`emissao_voucher`, `resgate_voucher`, `compra_confirmada`). Enquanto a semântica não for confirmada, os agregados da T4 e o KPI de vitrine viva refletem o que o arquivo declara — sem reinterpretação. |
| **Granularidade por CPF na telemetria** (a mais cara das quatro) | Condiciona a RN36, o nível "por público" da RN43, a conversão da RN44 e o indicador de uso em 90 dias da T26. Sem ela, as três telas exibem **"aguarda telemetria por assinante"** em vez de número — e a T26 não calcula a conversão de campanha. |
| Canal de entrega e formato do kit de campanha | O kit sai no padrão v1 (zip com CSV do público, manifesto, peças e instruções) atrás da porta `KitAdapter`. |

Continuam abertas, com a Minutrade, as pendências menores já registradas na
ficha da Onda 1 §11: suporte a limite de resgates por oferta, disponibilidade
do dump completo do catálogo e a tag "Recompensa" em cards pagos na vitrine.

**Jurídico / compliance:**

| Pendência | Efeito hoje |
|---|---|
| **Política de retenção da auditoria** (RN49) | Premissa de **retenção integral**: nenhum evento é apagado, não há rotina de purga, e o `[A CONFIRMAR]` está declarado no cabeçalho da migration da Onda 6. Quando a política vier, entra como migration própria com o prazo declarado — nunca como limpeza silenciosa embutida em outra mudança. |
| Regra de comissão do **Cupom de desconto** | `COMISSAO_CUPOM: "EM_CONFIRMACAO"`: nenhuma receita é calculada para cupom, na T4 e no Dashboard. |
| Alinhamento do contrato-modelo (Anexo I prevê duas categorias; a operação pratica três) | Registrado para a próxima revisão jurídica; não bloqueia operação. |

**TI Broto:**

| Pendência | Efeito hoje |
|---|---|
| **Imagem Docker não construída** (herdada da F5) | O `Dockerfile` multi-stage está escrito e revisado, mas **`docker build` nunca foi executado** em nenhum ambiente deste repositório — não há daemon Docker no ambiente de desenvolvimento usado. A TI deve rodar `docker build -t clube-broto-admin .` e conferir a imagem no primeiro deploy, antes de depender dela. O deploy na Vercel, usado para a demonstração, não passa por essa imagem. |
| **Chaves de ambiente** | Sem `CPF_HASH_KEY` e `APP_ENCRYPTION_KEY` a plataforma **falha alto** ao hashear ou cifrar CPF — não há fallback embutido, de propósito. Girar a `CPF_HASH_KEY` re-identifica a base inteira e desliga a junção telemetria ↔ assinante (RN36): não girar sem plano de recarga. `AUTH_SECRET` é obrigatória para a sessão. |
| **Chave e tarifas do dossiê** | `ANTHROPIC_API_KEY`, `DOSSIE_TETO_MENSAL_BRL`, `DOSSIE_CUSTO_MAX_UNITARIO_BRL`, `DOSSIE_CUSTO_ENTRADA_BRL_MTOK` e `DOSSIE_CUSTO_SAIDA_BRL_MTOK` são **[A CONFIRMAR TI]** e nunca commitadas. Faltando qualquer uma, a T11 exibe o provedor automático como indisponível dizendo o que falta, e só a inserção manual do dossiê opera. As tarifas em real dependem da cotação adotada pela TI — por isso são configuração, não constante. |
| Recorte "Safra 25/26" no seletor de período da T26 | O protótipo mostra a opção; o recorte de safra é definição de negócio (início e fim variam por cultura e região) e não consta de ficha nem do Parametrizador. O seletor entrega os três períodos computáveis (30 dias, 90 dias, 12 meses); a safra entra quando a janela for declarada. |
| Seed do perfil de cliente (porte × natureza PF/PJ) | Lista nasce vazia, com o estado explicado na tela. |
| **Custo das pendências no layout** (F14) | O sino apura as seis contagens em toda renderização autenticada, porque o marcador precisa existir sem interação. São `count`s indexados, mas é custo real: se a base crescer a ponto de pesar, o caminho é cache curto no Serviço de Configuração, não remover o marcador. |
| **Dívida: queda da coluna `empresas.logo_url`** (F15) | A coluna guardava o endereço S3 do logotipo e está **obsoleta desde a F15**: não é mais escrita por lugar nenhum, e é lida **apenas como fallback** da régua de completude, para que nenhum aliado que porventura a tenha preenchida perca o ponto que já contava. Ela **não foi derrubada** de propósito: a base está em produção e queda de coluna é irreversível. **Condição objetiva para executar:** `SELECT count(*) FROM empresas WHERE logo_url IS NOT NULL` retornar **0**. Satisfeita a condição, a queda sai em **migration própria e reversível**, junto com a remoção do fallback em `calcularCompletudeCard`, `calcularCompletudeAliado` e na apuração do painel — nunca embutida em outra mudança. |

**Operação (Onda 7):**

| Pendência | Efeito hoje |
|---|---|
| **Carga inicial do portfólio de soluções** (herdada) | A T29 reflete apenas o que está cadastrado, e **declara isso na tela**. Categorias sem solução publicada aparecem como frágeis ou sem cobertura — pode ser portfólio não classificado, não portfólio ausente, e o volume de aliados sem categoria é exibido junto para não induzir leitura errada. |
| **Abrangência declarada por aliado** (herdada) | Não existe campo de abrangência no aliado: o cadastro guarda a cobertura na *solução*, e o modo Abrangência da T30 usa a união das coberturas das soluções publicadas. Aliado sem nenhuma declaração entra como **volume não declarado**, com o motivo na tela — nunca deduzido da sede (RN52). Preenchimento é trabalho operacional, não de código. |

## Convenções

- Idioma de UI, mensagens, commits e documentação: português do Brasil.
- Toda mutação de entidade de negócio grava auditoria (valor anterior/novo/autor).
- Pendências de negócio `[A CONFIRMAR]` ficam atrás de adapters/flags nomeadas —
  nunca resolvidas por suposição no código.
- Nenhum dado inventado em seeds e fixtures: apenas `dados/` e as referências.
- Acessibilidade AAA: método, correções e a exceção nomeada do azul
  institucional estão em
  [`docs/acessibilidade-aaa.md`](docs/acessibilidade-aaa.md).
