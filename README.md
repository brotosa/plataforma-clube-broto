# Plataforma de Administração do Clube Broto

Aplicação web administrativa do Clube Broto (Broto S.A.). **Onda 1**: módulo de
Aliados, Soluções e Ofertas com motor de aprovação, publicação/telemetria batch
(Minutrade) e carga inicial.

- Fonte da verdade funcional: `docs/especificacao/ficha-onda1-aliados-solucoes-ofertas.md` (v0.6)
- Arquitetura e fases: `docs/especificacao/prompt-claude-code-onda1.md`
- Especificação visual: `docs/referencias/Plataforma_Broto_-_Prototipo_v2.1.html`

**Estado atual: F3 — Carga inicial** (F1 e F2 concluídas). Além do domínio
completo (RN01–RN12, motor de aprovação, T1–T7 exceto T4 plena), a base real
entra pelas planilhas de `dados/`: staging → tela de conferência
(`/carga-inicial`, com ajuste de agrupamentos) → efetivação transacional com
telemetria acumulada. A integração batch (F4) é a próxima fase.

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
| `pnpm e2e` | e2e Playwright + axe-core (exige build e banco com seed) |
| `pnpm db:migrate` | aplica migrations (produção/CI) |
| `pnpm db:migrate:dev` | cria/aplica migrations (desenvolvimento) |
| `pnpm db:seed` | seed de taxonomias, regras RN06 e usuários dev |
| `pnpm job:diario` | job diário: expira vigências (RN03) e marca a janela contratual |

\* os testes de integração (auditoria com banco) só executam quando
`DATABASE_URL` está definida; sem banco, são pulados.

Cada migration tem `down.sql` verificado — ver `prisma/migrations/LEIA-ME.md`.

## Estrutura

```
app/        rotas e telas (App Router); shell fiel ao protótipo v2.1
dominio/    regras de negócio puras e testáveis (RBAC, auditoria, identidade)
infra/      Prisma, Auth.js, gravador de auditoria, logger
prisma/     schema completo da Onda 1, migrations reversíveis, seed
design/     DSeed: tokens.css (intocável) + dseed-admin.css (extensões)
e2e/        Playwright + axe-core (fluxos e acessibilidade)
dados/      planilhas reais da carga inicial (consumidas na F3)
```

## Convenções

- Idioma de UI, mensagens, commits e documentação: português do Brasil.
- Toda mutação de entidade de negócio grava auditoria (valor anterior/novo/autor).
- Pendências de negócio `[A CONFIRMAR]` ficam atrás de adapters/flags nomeadas —
  nunca resolvidas por suposição no código.
- Nenhum dado inventado em seeds e fixtures: apenas `dados/` e as referências.
