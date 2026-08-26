# Registro de melhorias — pós-produção (06 a 20/08/2026)

> **Versão completa e ilustrada (PR #1 a #28):** este arquivo é a **primeira
> versão** do registro e cobre apenas os PRs #1–#15. O registro **atualizado
> até o PR #28**, com telas reais, está em
> [`docs/registro-melhorias/index.html`](./registro-melhorias/index.html) —
> também disponível em **PDF** e **Word** na mesma pasta.

Documento de referência das entregas feitas **depois** da versão 1 (Ondas 1–14 /
F1–F22) já em produção. Cobre da **edição de contrato vigente** (PR #1) até o
**autocomplete de `@menção`** (PR #14/#15) — quinze PRs mesclados na `main`
entre 06/08 e 20/08/2026.

Escopo desta rodada: **acabamento e correções nascidos de uso real e de
homologação com a base povoada.** Não há onda nova nem RN nova — as mudanças
reaproveitam entidades, regras e componentes existentes. Cada PR passou pelo CI
completo (typecheck, lint, unit, integração com banco, build, e2e + axe AAA,
responsividade 380px e imagem de contêiner) antes de mesclar, e **a `main` é
produção** (mesclar dispara o deploy).

> Convenção de leitura: cada seção traz **O que mudou** (funcional),
> **Decisões/regras**, **Arquivos**, **Banco** (migrations), **Testes** e
> **Como testar na mão**.

---

## Panorama dos PRs

| PR | Data | Título | Tipo | Migration |
|----|------|--------|------|-----------|
| #1 | 06/08 | Aba Comercial: editar contrato vigente | Funcionalidade | Não |
| #2 | 06/08 | Unificação de produção (feature + infra AWS 1.5.0) | Infra | Não |
| #3 | 07/08 | Anexo do contrato em PDF (Nível 2), editar contato, fix do funil | Funcionalidade | **Sim** |
| #4 | 07/08 | Buildspec versionado + migrations automáticas no deploy | Infra | Não |
| #5 | 07/08 | Acabamento da ficha (anexo clicável, botões, edição, vão à direita) | UI | Não |
| #6 | 07/08 | Recusa de tamanho no cliente só para documento (fix de regressão) | Correção | Não |
| #7 | 18/08 | Scouting pós-homologação: reavaliar + histórico, pendências filtram, quarentena visível | Funcionalidade | Não |
| #8 | 18/08 | Scouting: recomendação na gaveta + "não se aplica" na avaliação (T10) | Funcionalidade | **Sim** |
| #9 | 18/08 | Busca global do cabeçalho passa a funcionar | Funcionalidade | Não |
| #10 | 18/08 | Painel de atividades (comentários, pendências, @menção) | Funcionalidade | **Sim** |
| #11 | 18/08 | Ficha do aliado: painel no laptop, gaveta em linha, abas em âncora | UI | Não |
| #12 | 18/08 | Painel abre sozinho só em tela grande (≥1600px) | UI | Não |
| #13 | 19/08 | Importação de catálogo por planilha: soluções e ofertas | Funcionalidade | **Sim** |
| #14 | 20/08 | Menção por `@` inline no painel de atividades | UI/UX | Não |
| #15 | 20/08 | Fix: caixa de `@menção` fechada sobrepondo a dica | Correção | Não |

**Migrations no período:** três (PR #3 anexo do contrato; PR #8 "não se aplica";
PR #10 comentários/menções) e uma no PR #13 (staging de importação). Todas
**estritamente aditivas** — nenhuma removeu coluna, estreitou tipo ou exigiu
valor sobre linha existente, conforme o dever de base povoada.

---

## 1. Aba Comercial — editar contrato vigente (PR #1)

**O que mudou.** A aba Comercial da ficha do aliado passou a permitir **editar o
contrato vigente** (comissão, vigência e demais campos do contrato-modelo),
incluindo o preenchimento do anexo. Antes o contrato só era criado; não havia
caminho de correção pela interface.

**Decisões/regras.** A edição passa pela server action com **auditoria** (valor
anterior/novo/autor) e respeita o RBAC — apenas papéis com permissão de escrita
comercial editam; Leitura vê e não altera. Nenhuma mudança de parâmetro
re-pontua registro fechado.

**Arquivos.** `app/(plataforma)/aliados/[id]/page.tsx`,
`app/(plataforma)/aliados/[id]/paineis.tsx`, `app/(plataforma)/aliados/acoes.ts`.

**Testes.** `infra/casos-de-uso/contatos-contratos.integracao.test.ts` (fluxo
positivo e negativo com banco).

**Como testar.** Ficha de um aliado → aba **Comercial** → **Editar contrato** →
alterar comissão/vigência → salvar → conferir o valor atualizado e o evento na
trilha de auditoria.

---

## 2. Unificação de produção e infraestrutura AWS 1.5.0 (PR #2) + esteira de deploy (PR #4)

**O que mudou.** Consolidou a feature de contrato com a **infraestrutura AWS**
(versão 1.5.0): Terraform de rede, ALB, ECS, ECR, RDS, IAM, security groups e
secrets, mais o `Dockerfile`/`.dockerignore` de produção e a documentação de
custos e de implantação real. O **PR #4** tornou o `buildspec.yml` um arquivo
versionado que **aplica as migrations automaticamente no deploy** pelo caminho
real (não por atalho).

**Decisões/regras.** A `main` é produção; o deploy roda migrations pelo caminho
de deploy verdadeiro. Imagem base passou a vir de espelho público da AWS (evita
o *rate limit* 429 do Docker Hub, incidente registrado à época).

**Arquivos.** `terraform/aws/*` (alb, ecs, ecr, rds, iam, network, secrets,
security_groups, outputs), `Dockerfile`, `.dockerignore`, `buildspec.yml`,
`docs/perfis-de-acesso.md`, `terraform/aws/CUSTOS.md`,
`terraform/aws/IMPLANTACAO-REAL.md`.

**Banco.** Sem migration (infraestrutura).

**Como testar.** Esteira de CI/CD: um push na `main` constrói a imagem, aplica
migrations e publica; a rota de saúde responde e a tela de entrada carrega.

---

## 3. Anexo do contrato em PDF, editar contato e fix do funil (PR #3)

**O que mudou.**
- **Anexo do contrato (Nível 2):** cada contrato pode receber um **PDF anexo**
  (a minuta assinada), com cartão de upload na ficha e rota de leitura própria.
- **Editar contato:** os contatos do aliado passaram a ser **editáveis** (não só
  criar/remover).
- **Fix do funil:** corrigida a proporção do funil de prospecção.

**Decisões/regras.** O anexo é **arquivo guardado pela plataforma** (binário em
tabela própria, no mesmo desenho da marca do aliado), servido por rota dedicada;
upload e troca **auditados**. Validação de tipo pelo conteúdo.

**Arquivos.** `app/(plataforma)/aliados/[id]/cartao-anexo-contrato.tsx`,
`app/(plataforma)/aliados/[id]/contrato/anexo/route.ts`, `dominio/contratos/anexo.ts`,
`infra/casos-de-uso/contatos-contratos.ts`, `infra/casos-de-uso/empresas.ts`,
`infra/consultas/aliados.ts`, `app/(plataforma)/aliados/[id]/page.tsx`,
`app/(plataforma)/aliados/[id]/paineis.tsx`, `design/dseed-admin.css`.

**Banco.** Migration **aditiva** para o anexo do contrato (tabela própria 1:1,
com `down.sql` reversível).

**Testes.** `infra/casos-de-uso/contatos-contratos.integracao.test.ts`.

**Como testar.** Aba Comercial → cartão do anexo → subir um PDF → recarregar e
abrir o anexo pelo link. Editar um contato e conferir a persistência.

---

## 4. Acabamento da ficha do aliado (PR #5) + correção da recusa de tamanho (PR #6)

**O que mudou (PR #5).** Rodada de acabamento visual/UX na ficha:
- o **link do anexo** deixou de quebrar o layout e virou clicável;
- **contatos:** botão *Editar* ao lado de *Remover*, centralizados;
- **texto centralizado** em todos os botões;
- botão **Cancelar** na edição (contrato e contato);
- eliminado o **vão em branco à direita** em telas largas.

**O que mudou (PR #6).** Correção de regressão: a **recusa de tamanho no cliente**
passou a valer **só para documento** (PDF do anexo), não para imagem/marca — o
limite genérico estava barrando upload de imagem indevidamente.

**Arquivos.** `app/(plataforma)/aliados/[id]/abre-edicao.tsx`,
`app/(plataforma)/aliados/[id]/gestao-contatos.tsx`,
`app/(plataforma)/cartao-de-arquivo.tsx`, `design/dseed-admin.css`,
`next.config.ts`.

**Banco.** Sem migration.

**Como testar.** Abrir a ficha em tela larga (sem vão à direita); editar
contato/contrato e usar *Cancelar*; subir uma imagem de marca (não deve ser
barrada pelo limite de documento) e um PDF grande de anexo (deve recusar com
mensagem).

---

## 5. Scouting pós-homologação (PR #7) + recomendação e "não se aplica" (PR #8)

**O que mudou (PR #7).** Ajustes do módulo Mercado & Scout vindos da primeira
homologação com base povoada:
- **reavaliar aliado ativo** e **gaveta de histórico** na aba Scouting (Modelo C);
- **cartões de pendência do Dashboard** passaram a **filtrar a lista de destino**
  ao serem clicados;
- **radar** deixou de esconder prospects em **quarentena** — o histórico mostra
  as linhas em quarentena.

**O que mudou (PR #8).**
- a **gaveta de histórico** passou a exibir a **recomendação** de cada versão da
  avaliação;
- a avaliação de scout (T10) ganhou a opção **"não se aplica" (N/A)** por
  indicador.

**Decisões/regras.** O **N/A** é estado de primeira classe: fica registrado por
indicador, **é excluído do cálculo do score** (não conta como zero) e o
fechamento da avaliação considera apenas as notas reais. A regra foi registrada
na **ficha da Onda 2** (`docs/especificacao/ficha-onda2-mercado-scout.md`). Nota
passou a ser anulável no schema.

**Arquivos.** `app/(plataforma)/aliados/[id]/abas-scout.tsx`,
`app/(plataforma)/aliados/[id]/historico-avaliacao.tsx`,
`app/(plataforma)/mercado/[empresaId]/avaliacao/formulario-avaliacao.tsx`,
`app/(plataforma)/mercado/radar/historico-prospects.tsx`,
`dominio/avaliacao/regras.ts`, `infra/casos-de-uso/avaliacoes.ts`,
`infra/consultas/avaliacoes.ts`, `design/dseed-admin.css`.

**Banco.** Migration **aditiva** (PR #8): nota anulável + campo `naoSeAplica`.

**Testes.** `dominio/avaliacao/regras.test.ts`,
`infra/casos-de-uso/avaliacoes.integracao.test.ts`,
`e2e/avaliacao-score.spec.ts` (inclui o caso N/A fora do score).

**Como testar.** Avaliar um prospect (T10) → marcar um indicador como **N/A** →
conferir que o **score ignora** aquele item; reavaliar um aliado ativo e abrir a
**gaveta de histórico** para ver a recomendação por versão.

---

## 6. Busca global do cabeçalho (PR #9)

**O que mudou.** A **busca global** do cabeçalho — que existia visualmente mas
não retornava resultados — passou a **funcionar**, consultando as entidades e
levando à tela/registro correspondente.

**Arquivos.** `app/(plataforma)/busca/page.tsx`,
`app/(plataforma)/shell-plataforma.tsx`, `infra/consultas/busca-global.ts`,
`design/dseed-admin.css`.

**Banco.** Sem migration.

**Testes.** `infra/consultas/busca-global.integracao.test.ts`,
`e2e/busca-global.spec.ts`.

**Como testar.** Digitar um termo no campo de busca do cabeçalho → conferir os
resultados e a navegação até o item.

---

## 7. Painel de atividades da ficha do aliado (PR #10, #11, #12)

Bloco de três PRs que introduziu e refinou o **painel de atividades** — uma
coluna recuável, presente em todas as abas da ficha, onde a equipe registra
comentários, marca pendências e menciona pessoas.

### 7.1 Comentários, pendências e @menção (PR #10)

**O que mudou.**
- **Composer** para escrever comentário na ficha, visível em todas as abas;
- marcar comentário como **pendência** e **resolver/reabrir**;
- **@menção** de usuários (na versão inicial, por seletor de caixas);
- **editar/apagar** o próprio comentário (apagado some do painel, permanece na
  auditoria);
- o **sino de pendências** ganhou a linha derivada *"pendências que mencionam
  você"*.

**Decisões/regras.** Nova permissão **`COMENTAR_FICHA_ALIADO`** no RBAC; toda
mutação (criar/editar/apagar/pendência/menção) é **auditada**. Leitura vê o feed
e não escreve. O painel vive no **shell** da ficha (persistente entre abas).

**Arquivos.** `app/(plataforma)/aliados/[id]/painel-atividades.tsx`,
`app/(plataforma)/aliados/[id]/acoes-comentarios.ts`,
`dominio/comentarios/regras.ts`, `dominio/autorizacao/permissoes.ts`,
`infra/casos-de-uso/comentarios.ts`, `infra/consultas/comentarios.ts`,
`app/(plataforma)/sino-pendencias.tsx`, `app/(plataforma)/shell-plataforma.tsx`,
`design/dseed-admin.css`.

**Banco.** Migration **aditiva**: estende a nota rápida e cria a tabela de
menções.

**Testes.** `dominio/autorizacao/permissoes.test.ts`,
`infra/casos-de-uso/comentarios.integracao.test.ts`,
`e2e/painel-atividades.spec.ts`.

### 7.2 Responsividade: laptop, gaveta em linha, abas em âncora (PR #11)

**O que mudou.** O painel ficou **visível no laptop** (não escondido), a gaveta
passou a abrir **em linha**, e as **abas da ficha** passaram a navegar por
**âncora nativa** em vez de `<Link>` (convenção do projeto para troca que altera
só a query string, medida como necessária).

**Arquivos.** `painel-atividades.tsx`, `abas-scout.tsx`, `formulario-m1.tsx`,
`historico-avaliacao.tsx`, `page.tsx` (todos em `aliados/[id]/`).

### 7.3 Abertura automática só em tela grande (PR #12)

**O que mudou.** O painel passou a **abrir sozinho apenas em telas ≥1600px**; no
laptop (1280–1599) nasce recolhido numa faixa flutuante que não come conteúdo, e
vira coluna quando o usuário abre. A escolha é **lembrada por usuário**
(localStorage).

**Arquivos.** `painel-atividades.tsx`, `design/dseed-admin.css`.

**Como testar (7.x).** Abrir a ficha de um aliado → painel **Atividades** →
escrever um comentário, marcar como pendência, **resolver**; mencionar alguém;
conferir o sino. Testar em 1680px (abre sozinho), 1440px (faixa flutuante) e
recolher/reabrir (a escolha persiste).

---

## 8. Importação de catálogo por planilha (PR #13)

**O que mudou.** Dois **importadores self-service por planilha**, um para
**soluções** (em `/aliados/importar-solucoes`) e um para **ofertas** (em
`/ofertas/importar`): baixar um **modelo `.xlsx` pré-preenchido**, enviar,
**conferir** numa tela de revisão com correção leve linha a linha e **efetivar**.

**Decisões/regras.** A efetivação **reaproveita os casos de uso existentes**
(`criarSolucao`/`atualizarSolucao`, `criarOferta`/`atualizarOferta`) — mesmas
validações, RBAC e auditoria; a importação não é um caminho de escrita paralelo.
Cada linha é classificada como **criar** ou **enriquecer**; a oferta aponta a
solução por **ID**. Migration **aditiva** de *staging* (tabelas de importação e
enums), separada do cadastro efetivo.

**Arquivos.** `app/(plataforma)/aliados/importar-solucoes/{page,conferencia,acoes,modelo/route}.tsx|ts`,
`app/(plataforma)/ofertas/importar/{page,conferencia,acoes,modelo/route}.tsx|ts`,
`dominio/importacao-catalogo/{solucoes,ofertas}.ts`,
`infra/casos-de-uso/importar-{solucoes,ofertas}.ts`,
`docs/especificacao/importacao-catalogo.md`.

**Banco.** Migration **aditiva** (staging de soluções e ofertas + enums).

**Testes.** `dominio/importacao-catalogo/{solucoes,ofertas}.test.ts`,
`infra/casos-de-uso/importar-{solucoes,ofertas}.integracao.test.ts`,
`e2e/importar-catalogo.spec.ts`.

**Como testar.** `/aliados/importar-solucoes` → **baixar modelo** → preencher →
**enviar** → conferência (corrigir uma linha) → **efetivar** → conferir as
soluções criadas/enriquecidas. Idem em `/ofertas/importar` (a oferta referencia
a solução por ID).

> Nota de CI: o teste e2e teve um ajuste de *locator* (o texto "criar" casava o
> selo da tabela **e** a palavra na frase-guia da tela); a asserção foi escopada
> à tabela. Sem impacto no produto.

---

## 9. Menção por `@` inline (PR #14) + correção de sobreposição (PR #15)

**O que mudou (PR #14).** A menção no painel de atividades deixou de exigir um
botão separado com caixas de seleção. Agora, **digitando `@`** no próprio
comentário abre uma **lista filtrada** de quem mencionar — o padrão da maioria
dos apps. Escolher (por **teclado**: ↑/↓, Enter/Tab, Esc; ou **mouse**) insere
`@Nome ` no texto e registra a menção. Os **chips** abaixo continuam para
conferir e remover, e uma **dica** ("Digite @ para mencionar…") preserva a
descoberta.

**Decisões/regras.**
- **Contrato do backend inalterado:** o editor continua enviando `texto` +
  `mencionados[]`; o `@Nome` no corpo é conveniência visual, a menção real é o id
  no array — RBAC, auditoria e o sino seguem idênticos.
- **Acessibilidade (AAA):** o campo continua `textbox` com `aria-autocomplete`,
  `aria-activedescendant`, `aria-controls`/`aria-haspopup` apontando o `listbox`;
  navegação e seleção 100% por teclado. **Não** se usa `role="combobox"` no
  `<textarea>` — a ARIA não permite (o CI acusou `aria-allowed-role`), e a opção
  ativa é anunciada pelo `aria-activedescendant`.
- Busca **sem acento** e por **qualquer parte** do nome.

**O que mudou (PR #15).** Correção visual: a caixa de sugestões, mesmo **fechada
e vazia**, aparecia sobreposta à dica. Causa: `.pa-sug-lista` reaproveita
`.pa-mencao-lista`, cujo `display:flex` vencia o `display:none` do atributo
`hidden`. Regra `.pa-sug-lista[hidden]{display:none}` faz o `hidden` vencer.

**Arquivos.** `app/(plataforma)/aliados/[id]/painel-atividades.tsx`,
`design/dseed-admin.css`, `e2e/painel-atividades.spec.ts`,
`public/guia-da-plataforma.html` (regenerado — embute o CSS).

**Banco.** Sem migration.

**Testes.** `e2e/painel-atividades.spec.ts` cobre o fluxo: digitar `@` abre o
`listbox`, escolher pelo teclado insere o nome, a tag aparece no feed e persiste
após recarregar; **axe (AAA) limpo com o popup aberto**.

**Como testar.** Ficha do aliado → painel Atividades → escrever um comentário e
digitar `@` seguido de parte de um nome → escolher (Enter ou clique) → conferir
`@Nome` inserido, o chip e, após comentar, a tag de menção no feed. Fechado, a
dica aparece inteira (sem sobreposição).

---

## Notas transversais desta rodada

- **Guia autônomo (`public/guia-da-plataforma.html`)** embute o `dseed-admin.css`;
  toda mudança de CSS exige regenerá-lo com `pnpm guia:gerar` (uma cerca de
  arquitetura, `guia-fonte-unica.test.ts`, quebra o build se ficar defasado).
- **Falso-positivo local do axe:** em Chromium local, a varredura AAA acusa
  `color-contrast` em `.cap > span` da barra lateral (#dadfff/#465eff); esse item
  **não aparece no CI** (renderiza ≥4.5) e não é regressão desta rodada.
- **Testes *flaky* pré-existentes** (login `CredentialsSignin` em
  `fluxo-principal`/`integracao`/`cobertura-metas`; FK de `dossie_execucoes`)
  passam na *retry* do CI e não são causados por estas mudanças.
- **`design/tokens.css` permaneceu intocado**; toda extensão visual entrou em
  `dseed-admin.css`, no padrão de comentários existente.

---

_Documento gerado em 20/08/2026 pela TI Broto com apoio do Claude Code. Fonte da
verdade dos detalhes: os PRs #1–#15 na `main` e as fichas em `docs/especificacao/`._
