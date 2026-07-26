# Plataforma de Administração do Clube Broto

Aplicação web administrativa do Clube Broto (Broto S.A.), em seis ondas:

| Onda | Módulo | Regras | Telas |
|---|---|---|---|
| 1 | Aliados, Soluções e Ofertas · motor de aprovação · publicação e telemetria batch (Minutrade) · carga inicial | RN01–RN12 | T1–T7 |
| 2 | Mercado & Scout · funil, avaliação com score, dossiê assistido, cobertura e metas | RN13–RN22 | T8–T14 |
| 3 | Parametrizador · listas de domínio, valores de regra e metas editáveis sem código | RN23–RN28 | T15–T17 |
| 5 | Assinantes · base patrocinada com importação, enriquecimento, segmentação e exportação controlada | RN29–RN37 | T18–T21 |
| 4 | Campanhas e Cestas · público congelado, conteúdo, peças, kit de execução e medição atribuída | RN38–RN45 | T22–T25 |
| 6 | Dashboard, Usuários e Auditoria · governança visível | RN46–RN50 | T26–T28 |

- Fontes da verdade funcionais: as seis fichas em `docs/especificacao/`
- Arquitetura e fases: os seis `prompt-claude-code-onda*.md`
- Especificação visual vigente: `docs/referencias/Plataforma_Broto_-_Prototipo_v8.1_FINAL.html`
  (T1–T28). As versões v7.1, v6.1 e v2.1 permanecem apenas como histórico.

**Estado atual: escopo especificado completo — F1 a F13 entregues, as 50 regras
e as 28 telas implementadas.**

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
app/        rotas e telas (App Router); shell fiel ao protótipo v8.1 FINAL
dominio/    regras de negócio puras e testáveis (RBAC, auditoria, identidade)
infra/      Prisma, Auth.js, gravador de auditoria, consultas, casos de uso
prisma/     schema das seis ondas, migrations reversíveis (com down.sql), seed
design/     DSeed: tokens.css (intocável) + dseed-admin.css (extensões)
e2e/        Playwright + axe-core (fluxos, acessibilidade, teclado, 380px)
dados/      planilhas reais da carga inicial (consumidas na F3)
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
| **Gerir usuários** | `/usuarios`: criar, editar papel, inativar. Inativar derruba a sessão na hora (RN47) | Administrador |
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
| Recorte "Safra 25/26" no seletor de período da T26 | O protótipo v8.1 mostra a opção; o recorte de safra é definição de negócio (início e fim variam por cultura e região) e não consta de ficha nem do Parametrizador. O seletor entrega os três períodos computáveis (30 dias, 90 dias, 12 meses); a safra entra quando a janela for declarada. |
| Seed do perfil de cliente (porte × natureza PF/PJ) | Lista nasce vazia, com o estado explicado na tela. |

## Convenções

- Idioma de UI, mensagens, commits e documentação: português do Brasil.
- Toda mutação de entidade de negócio grava auditoria (valor anterior/novo/autor).
- Pendências de negócio `[A CONFIRMAR]` ficam atrás de adapters/flags nomeadas —
  nunca resolvidas por suposição no código.
- Nenhum dado inventado em seeds e fixtures: apenas `dados/` e as referências.
- Acessibilidade AAA: método, correções e a exceção nomeada do azul
  institucional estão em
  [`docs/acessibilidade-aaa.md`](docs/acessibilidade-aaa.md).
