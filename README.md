# Plataforma de Administração do Clube Broto

Aplicação web administrativa do Clube Broto (Broto S.A.). **Onda 1**: módulo de
Aliados, Soluções e Ofertas com motor de aprovação, publicação/telemetria batch
(Minutrade) e carga inicial. **Onda 2**: Mercado & Scout — funil de prospecção,
avaliação com score, dossiê assistido, cobertura e metas. **Onda 3**:
Parametrizador — listas de domínio, valores de regra e metas editáveis sem
código.

- Fontes da verdade funcionais: `docs/especificacao/ficha-onda1-aliados-solucoes-ofertas.md`
  (v0.6), `ficha-onda2-mercado-scout.md` (v0.1) e `ficha-onda3-parametrizador.md` (v0.2)
- Arquitetura e fases: `docs/especificacao/prompt-claude-code-onda1.md` e os prompts
  das ondas 2 e 3
- Especificação visual: `docs/referencias/Plataforma_Broto_-_Prototipo_v6.1.html`

**Estado atual: Onda 2 concluída (F6 a F9) e Onda 3 na F10.** Sobre a Onda 1
inteira (RN01–RN12, motor de aprovação, T1–T7, publicação e telemetria batch,
carga inicial pelas planilhas de `dados/`), a Onda 2 entregou o radar e o funil
(T8/T9), a avaliação com score do ScoutCB (T10), o dossiê de due diligence
assistido (T11), a ficha da empresa com Scouting, Dossiê e o formulário M1
(T12), o mapa de cobertura (T13) e o painel de metas (T14) — e levou a
avaliação e o dossiê para dentro da fila de aprovação (RN20), de modo que a
promoção a Aliada ativa é decidida com o caso completo à vista.

A **F10** fecha o círculo: as réguas, a comissão-padrão e as metas deixaram de
ser constantes de código e passam por um **Serviço de Configuração** com
leitura cacheada e invalidação na escrita, editadas nas telas T15–T17 pelo novo
papel **Administrador da Plataforma** (RN23), sempre com auditoria e histórico
por valor. Toda alteração é **prospectiva** (RN25): mudar um peso não re-pontua
avaliação fechada — cada avaliação guarda a versão de configuração que a
produziu. Itens de lista nunca são excluídos, só inativados, e a contagem de
uso é exibida antes (RN24). A família sensível — comissão-padrão, pesos, tetos
e metas — pode passar a exigir aprovação ligando a regra na T7, sem deploy
(RN27). As metas que a T14 lê são as mesmas que a T17 escreve: uma tabela só.

As demais ondas avançam em frentes próprias (o módulo de Assinantes, da Onda 5,
já vive no repositório).

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
| `pnpm e2e` | e2e Playwright + axe-core (exige build e banco com seed) |
| `pnpm db:migrate` | aplica migrations (produção/CI) |
| `pnpm db:migrate:dev` | cria/aplica migrations (desenvolvimento) |
| `pnpm db:seed` | seed de taxonomias, indicadores, regras do motor, valores de regra, meta vigente e usuários dev |
| `pnpm job:diario` | job diário: expira vigências (RN03), janela contratual e reavaliação (RN21) |

\* os testes de integração (auditoria com banco) só executam quando
`DATABASE_URL` está definida; sem banco, são pulados.

Cada migration tem `down.sql` verificado — ver `prisma/migrations/LEIA-ME.md`.

## Estrutura

```
app/        rotas e telas (App Router); shell fiel ao protótipo v6.1
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

## Convenções

- Idioma de UI, mensagens, commits e documentação: português do Brasil.
- Toda mutação de entidade de negócio grava auditoria (valor anterior/novo/autor).
- Pendências de negócio `[A CONFIRMAR]` ficam atrás de adapters/flags nomeadas —
  nunca resolvidas por suposição no código.
- Nenhum dado inventado em seeds e fixtures: apenas `dados/` e as referências.
