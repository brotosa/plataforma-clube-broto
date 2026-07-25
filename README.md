# Plataforma de Administração do Clube Broto

Aplicação web administrativa do Clube Broto (Broto S.A.). **Onda 1**: módulo de
Aliados, Soluções e Ofertas com motor de aprovação, publicação/telemetria batch
(Minutrade) e carga inicial.

- Fonte da verdade funcional: `docs/especificacao/ficha-onda1-aliados-solucoes-ofertas.md` (v0.6)
- Arquitetura e fases: `docs/especificacao/prompt-claude-code-onda1.md`
- Especificação visual: `docs/referencias/Plataforma_Broto_-_Prototipo_v6.1.html`

**Estado atual: F5 — Endurecimento** (F1–F4 concluídas; a Onda 2 avança em
paralelo a partir da F6). Sobre o domínio completo (RN01–RN12, motor de
aprovação, T1–T7), a carga inicial pelas planilhas de `dados/` e o ciclo batch
com a operadora (publicação atrás de `ExportAdapter`, telemetria com quarentena
e idempotência, T4 completa), a F5 fecha a Onda 1 com:

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
# preencha DATABASE_URL e gere AUTH_SECRET (openssl rand -base64 32)

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
| `AUTH_URL` | em produção | URL pública da aplicação (Auth.js atrás de proxy/balanceador) |
| `AUTH_TRUST_HOST` | atrás de proxy | `true` quando o host chega por cabeçalho encaminhado |
| `BUILD_STANDALONE` | só no Docker | `true` liga `output: "standalone"`; na Vercel **não** usar |
| `SENHA_USUARIOS_DEV` | não | sobrescreve a senha dos usuários de desenvolvimento |
| `PORT` / `HOSTNAME` | não | porta e interface do servidor (a imagem já define 3000 / 0.0.0.0) |
| `CHROMIUM_EXECUTAVEL` | não | caminho de um Chromium próprio para o Playwright (contêineres) |
| `PW_REUSAR_SERVIDOR` | não | `1` aponta o e2e para um servidor já em execução |

Nenhum segredo entra na imagem: o `.dockerignore` exclui `.env*`, e as
variáveis são injetadas pelo orquestrador em execução.

### Usuários de desenvolvimento (seed, nunca criados em produção)

| E-mail | Papel |
|---|---|
| `gestor@dev.clubebroto.local` | Gestor do Clube |
| `analista@dev.clubebroto.local` | Analista de Aliados |
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

## Convenções

- Idioma de UI, mensagens, commits e documentação: português do Brasil.
- Toda mutação de entidade de negócio grava auditoria (valor anterior/novo/autor).
- Pendências de negócio `[A CONFIRMAR]` ficam atrás de adapters/flags nomeadas —
  nunca resolvidas por suposição no código.
- Nenhum dado inventado em seeds e fixtures: apenas `dados/` e as referências.
- Acessibilidade AAA: método, correções e a exceção nomeada do azul
  institucional estão em
  [`docs/acessibilidade-aaa.md`](docs/acessibilidade-aaa.md).
