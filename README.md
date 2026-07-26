# Plataforma de Administração do Clube Broto

Aplicação web administrativa do Clube Broto (Broto S.A.). **Onda 1**: módulo de
Aliados, Soluções e Ofertas com motor de aprovação, publicação/telemetria batch
(Minutrade) e carga inicial. **Onda 2**: Mercado & Scout — funil de prospecção,
avaliação com score, dossiê assistido, cobertura e metas.

- Fonte da verdade funcional: `docs/especificacao/ficha-onda1-aliados-solucoes-ofertas.md` (v0.6)
  e `docs/especificacao/ficha-onda2-mercado-scout.md` (v0.1)
- Arquitetura e fases: `docs/especificacao/prompt-claude-code-onda1.md` e
  `docs/especificacao/prompt-claude-code-onda2.md`
- Especificação visual: `docs/referencias/Plataforma_Broto_-_Prototipo_v6.1.html`

**Estado atual: Onda 2 concluída (F6 a F9)**, sobre a Onda 1 inteira
(RN01–RN12, motor de aprovação, T1–T7, publicação e telemetria batch, carga
inicial pelas planilhas de `dados/`). A Onda 2 entregou o radar e o funil
(T8/T9), a avaliação com score do ScoutCB (T10), o dossiê de due diligence
assistido (T11), a ficha da empresa com Scouting, Dossiê e o formulário M1
(T12), o mapa de cobertura (T13) e o painel de metas (T14) — e levou a
avaliação e o dossiê para dentro da fila de aprovação (RN20), de modo que a
promoção a Aliada ativa é decidida com o caso completo à vista. As demais ondas
avançam em frentes próprias (o módulo de Assinantes, da Onda 5, já vive no
repositório).

**F5 — Endurecimento** fecha a Onda 1 por cima disso com:

- **auditoria AAA** — o axe passa a rodar em modo AAA de verdade, com as três
  regras AAA que o axe-core traz desligadas por padrão ligadas nome a nome, e
  cobrindo as telas que faltavam (abas da T2, formulários de T3/T5). O produto
  declara **AAA integral com uma exceção nomeada — o azul institucional da
  marca, que atende AA**; correções, medições e o caminho de saída estão em
  [`docs/acessibilidade-aaa.md`](docs/acessibilidade-aaa.md);
- **navegação por teclado** com prova em teste para T2, T4, T5 e T6 (T7 e T8 já
  tinham desde F2/F6);
- **responsividade validada a 380px** em projeto Playwright próprio;
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
| `pnpm db:seed` | seed de taxonomias, regras RN06 e usuários dev |
| `pnpm job:diario` | job diário: expira vigências (RN03) e marca a janela contratual |

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
app/        rotas e telas (App Router); shell fiel ao protótipo v6.1
dominio/    regras de negócio puras e testáveis (RBAC, auditoria, identidade)
infra/      Prisma, Auth.js, gravador de auditoria, logger
prisma/     schema completo da Onda 1, migrations reversíveis, seed
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
registrado. Os valores dos tetos passam a ser editáveis sem código no
Parametrizador (Onda 3, T17).

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

## Convenções

- Idioma de UI, mensagens, commits e documentação: português do Brasil.
- Toda mutação de entidade de negócio grava auditoria (valor anterior/novo/autor).
- Pendências de negócio `[A CONFIRMAR]` ficam atrás de adapters/flags nomeadas —
  nunca resolvidas por suposição no código.
- Nenhum dado inventado em seeds e fixtures: apenas `dados/` e as referências.
- Acessibilidade AAA: método, correções e a exceção nomeada do azul
  institucional estão em
  [`docs/acessibilidade-aaa.md`](docs/acessibilidade-aaa.md).
