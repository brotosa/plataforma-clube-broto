# Plataforma de Administração do Clube Broto

Aplicação web administrativa do Clube Broto (Broto S.A.). **Onda 1**: módulo de
Aliados, Soluções e Ofertas com motor de aprovação, publicação/telemetria batch
(Minutrade) e carga inicial.

- Fonte da verdade funcional: `docs/especificacao/ficha-onda1-aliados-solucoes-ofertas.md` (v0.6)
- Arquitetura e fases: `docs/especificacao/prompt-claude-code-onda1.md`
- Especificação visual: `docs/referencias/Plataforma_Broto_-_Prototipo_v2.1.html`

**Estado atual: F4 — Integração** (F1, F2 e F3 concluídas). Sobre o domínio
completo (RN01–RN12, motor de aprovação, T1–T7) e a carga inicial pelas
planilhas de `dados/`, a F4 fecha o ciclo batch com a operadora: **publicação**
do catálogo atrás de `ExportAdapter` (`GenericJsonCsvAdapter` até o layout
Minutrade [A CONFIRMAR]), com diff (RN10) e despublicações em cascata (RN04);
**importação de telemetria** (parser tolerante, quarentena com motivo,
idempotência por `idVoucher+tipo`, CPF só como hash); e a **T4 completa** com
agregados por oferta (RN07 — derivam só dos eventos importados), KPI de vitrine
viva e a distinção fora-da-Plataforma (aguardando conciliação) × compra
confirmada. O endurecimento final (F5) é a próxima fase.

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

## Convenções

- Idioma de UI, mensagens, commits e documentação: português do Brasil.
- Toda mutação de entidade de negócio grava auditoria (valor anterior/novo/autor).
- Pendências de negócio `[A CONFIRMAR]` ficam atrás de adapters/flags nomeadas —
  nunca resolvidas por suposição no código.
- Nenhum dado inventado em seeds e fixtures: apenas `dados/` e as referências.
