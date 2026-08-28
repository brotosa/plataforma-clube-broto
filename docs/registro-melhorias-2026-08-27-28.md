# Registro de melhorias — rodada de 27–28/08/2026 (PR #34 a #47)

Documento de referência das entregas feitas na `main` (**produção**) entre
**27 e 28/08/2026** — quatorze PRs, do **vínculo de patrocínio por CPF** (#34)
ao **filtro da tela de Ofertas** (#47). Continua o
[`registro-melhorias-2026-08.md`](./registro-melhorias-2026-08.md) e a versão
ilustrada em [`registro-melhorias/index.html`](./registro-melhorias/index.html),
que cobrem os PRs #1–#28.

**Escopo desta rodada: correção e acabamento nascidos de homologação com a base
povoada.** Não há onda nova nem RN nova, e **nenhum PR desta rodada tocou o
schema** — a última migration é do PR #32 (`adicionar_valor_evento_resgate`).
As mudanças reaproveitam entidades, regras e componentes existentes. Cada PR
passou pelo CI completo (typecheck, lint, unit, integração com banco, build,
e2e + axe AAA, responsividade 380px) antes de mesclar, e **mesclar na `main`
dispara o deploy** (CodeBuild → ECS `sa-east-1`).

> Convenção de leitura: cada seção traz **O que mudou**, **Decisão/regra** e
> **Como testar na mão**. Nenhuma migration nesta rodada.

---

## Panorama dos PRs

| PR | Data | Título | Tema | Migration |
|----|------|--------|------|-----------|
| #34 | 27/08 | Vínculo de patrocínio por CPF, coluna Patrocinador na importação e modelo de assinantes | Patrocinadores | Não |
| #35 | 27/08 | Ofertas: publicar todas as elegíveis em massa (rascunho/pausada → publicada) | Ofertas | Não |
| #36 | 27/08 | Importador de assinantes: modelo .xlsx com Patrocinador por ID, recusa nomeada e quarentena visível | Assinantes | Não |
| #37 | 27/08 | Dashboard: corrigir destinos das células de resgates e soluções | Dashboard | Não |
| #38 | 27/08 | Dashboard: card "Resgates de benefícios" mostra o total do extrato nominal | Dashboard | Não |
| #39 | 27/08 | Carteira de assinantes (T18): ordenação por coluna, paginação numerada e filtros rápidos | Listas | Não |
| #40 | 27/08 | Dashboard: card "Resgates de cupons" também sai do extrato nominal | Dashboard | Não |
| #41 | 27/08 | Contabilizar checkout como modalidade de resgate (RN65) | Telemetria | Não |
| #42 | 28/08 | Corrigir seletor de período do dashboard (30/90/365 dias) | Dashboard | Não |
| #43 | 28/08 | Recortar cards de resgate do dashboard pela janela do período | Dashboard | Não |
| #44 | 28/08 | Editar solução em rota própria; ficha vira somente leitura | Telas | Não |
| #45 | 28/08 | Dashboard: filtro de período por data de negócio + opção "Todos" | Dashboard | Não |
| #46 | 28/08 | Usuários: ordem alfabética e filtros por nome, papel e situação | Listas | Não |
| #47 | 28/08 | Ofertas: filtros por busca, natureza e status | Listas | Não |

---

## A. Patrocinadores, assinantes e importação

### PR #34 — Vínculo de patrocínio por CPF, coluna Patrocinador e modelo de assinantes

**O que mudou.** Fechou o caminho da Onda 12/F19 que faltava na interface:
(a) criar **vínculo de patrocínio manualmente por CPF** na aba Base do
patrocinador; (b) ler a coluna nativa **`Patrocinador`** na importação de
assinantes, mapeando o valor `Broto` para o perfil `Promocional Broto`
(RN63); (c) **modelo de importação de assinantes** para download.

**Decisão/regra.** Junção por CPF-HMAC (RN36/RN69), o CPF nunca em claro; o
de-para de perfil segue o dicionário `[A CONFIRMAR — Minutrade]`. Reusa o
modelo `VinculoPatrocinio` da F19 — sem migration.

**Como testar.** Aba Base de um patrocinador → "Vincular por CPF"; e importar
uma planilha de assinantes com a coluna `Patrocinador` preenchida.

### PR #36 — Modelo .xlsx do importador com Patrocinador por ID e quarentena visível

**O que mudou.** O modelo de importação de assinantes virou **.xlsx** com o
**Patrocinador escolhido por ID** (dropdown "Nome — código"), a **recusa da
linha com causa nomeada** quando o patrocinador não existe, e o **detalhe da
quarentena** passou a aparecer no passo 4 da importação (antes só havia a
contagem, sem como ver quais linhas).

**Decisão/regra.** Causa de recusa nomeada (padrão RN55): "patrocinador
desconhecido" recusa a linha em vez de adivinhar. Nenhum dado pessoal real no
repositório — fixtures sintéticas.

**Como testar.** Importação de assinantes → "Baixar modelo (.xlsx)"; subir com
um ID de patrocinador inexistente e conferir a linha em quarentena com a causa.

### PR #35 — Publicar todas as ofertas elegíveis em massa

**O que mudou.** Botão que **publica em massa** todas as ofertas elegíveis
(status rascunho ou pausada → publicada), respeitando a elegibilidade fina por
oferta (RN02/RN09/RN11). Resolve o cenário de carga inicial com dezenas de
ofertas importadas ainda em rascunho.

**Como testar.** Tela de Ofertas → "Publicar todas as elegíveis"; confirma a
contagem antes de aplicar.

---

## B. Dashboard — telemetria de resgates

### PR #37 — Destinos corretos nas células do panorama

**O que mudou.** Corrigiu os botões/células do hero que levavam a telas que não
correspondiam ao indicador (resgates e soluções apontavam para lugares
"aleatórios"). Cada célula passa a levar à tela de origem certa.

### PR #38 e #40 — "Resgates de benefícios" e "Resgates de cupons" saem do extrato nominal

**O que mudou.** As duas células do hero passaram a exibir o **total do extrato
nominal da operadora** (eventos que casaram por CPF), em vez de depender de
campanha ativa (benefícios, errata 27/08) ou da telemetria de voucher clássica
nunca alimentada (cupons, errata 28/08). O catálogo segue como segunda opção.

**Decisão/regra.** Uma contagem só, nomeada "extrato", **jamais somada ao
catálogo** (RN68); ausência de dado é estado próprio, nunca zero (RN53). A
regra de comissão do cupom continua `[A CONFIRMAR]` — não impede contar o
resgate.

### PR #41 — Checkout é modalidade de resgate (RN65)

**O que mudou.** Por decisão do Administrador da Plataforma, os valores
`Checkout no clube` e `Checkout externo` da coluna `Tipo de Oferta` deixaram de
ser tratados como "compra" e passaram a **contar como resgate**, preservando a
**modalidade** (gratuito / checkout no clube / checkout externo). Na T33 o card
"Compras" virou "Modalidades de resgate"; a ficha do assinante e a da oferta
mostram o total com a quebra.

**Efeito medido (arquivo real de 42 resgates).** Benefícios 19 → 37, cupons
0 → 5 no dia da apuração — os 4 restantes têm `Id_oferta = #N/D` na origem e não
casam a uma natureza (pendência de correção na operadora).

**Decisão/regra.** O de-para vive em `dominio/telemetria-operadora/`; o
`tipoOferta` é gravado como veio, então corrigir a classificação quando o
dicionário `[A CONFIRMAR — Minutrade]` chegar é editar código, sem reimportar.

---

## C. Dashboard — filtro de período

### PR #42 — Seletor de período volta a funcionar

**O que mudou.** Trocar o período (30/90/365 dias) mudava a URL mas não os
números. Causa: o `<select>` usava `router.push`, uma navegação suave do App
Router que só troca a query — o mesmo defeito de **Router Cache** já
documentado no projeto. Passou a navegar por `window.location` (navegação
real), e a cerca `navegacao-por-query.test.ts` ganhou uma guarda para o caso.

### PR #43 — Cards de resgate respeitam a janela pela data do resgate

**O que mudou.** As células "Resgates de benefícios/cupons" contavam o extrato
inteiro, ignorando o período. Passaram a **recortar pela data do evento**
(`dataEvento` — a data da compra/resgate da planilha). Janela sem resgate é
**zero medido**, não salta para o número acumulado do catálogo (RN53).

### PR #45 — Cada célula filtra pela sua data de negócio + opção "Todos"

**O que mudou.** O seletor de período passou a recortar cada célula de fluxo
pela **sua** data, e ganhou a opção **"Todos"** (sem recorte):

| Célula | Data que rege o recorte |
|--------|--------------------------|
| **Aliados** | data de **assinatura do contrato** (sem contrato assinado, só aparece em "Todos") |
| **Ofertas** | **início da vigência** da oferta |
| **Resgates de benefícios/cupons** | **data da compra/resgate** (`dataEvento`) |
| Blocos (publicação, receita, funil, uso, campanhas) | já pela sua data de evento |

**Decisão/regra.** Células de **inventário** (soluções publicadas, campanhas
ativas, cestas, assinantes na base) permanecem como **total vigente** — são
estoque, não fluxo. A célula Ofertas foi **desacoplada** da vitrine viva (a
F15 as acoplava): a vitrine viva segue como o destaque próprio do hero, com a
sua janela parametrizada (RN50). `janelaDoDashboard("TODOS")` sinaliza "sem
recorte" com `dias: null`.

---

## D. Listas — ordenação e filtros

### PR #39 — Carteira de assinantes (T18): ordenação, paginação e filtros

**O que mudou.** A Carteira ganhou **ordenação por coluna** (allowlist de
expressões de ordenação no servidor), **paginação numerada** e **filtros
rápidos**. Ordenação por perfil corrigida para alfabética (o enum ordenava por
declaração no Postgres).

### PR #46 — Usuários: ordem alfabética e filtros

**O que mudou.** A tela de Usuários listava em blocos de ativo/inativo, o que
espalhava contas da mesma pessoa (a conta nova ativa `@broto.com.br` e a antiga
inativa `@brasilseg.com.br`, de uma migração de domínio) e dava aparência de
"duplicado". Passou a **ordem alfabética por nome** (e-mail como desempate), com
**filtros** por nome/e-mail, papel e situação (conjunto pequeno → filtragem no
cliente).

**Decisão/regra.** Não são duplicatas — são contas distintas; por RN47 não há
exclusão, a antiga fica inativa. Consolidar contas realmente duplicadas é
decisão de negócio (inativar uma), não código.

### PR #47 — Ofertas: filtros por busca, natureza e status

**O que mudou.** A lista transversal de Ofertas ganhou **busca** (título ou nome
do aliado), **filtro por natureza** e **por status**, com contador e "Limpar
filtros". Filtragem **no servidor por querystring** (a lista é paginada em 50),
via `<form method="get">` (navegação nativa — não esbarra no Router Cache), e
compõe com o preset "a vencer" do painel.

---

## E. Edição de solução

### PR #44 — Editar solução em rota própria; ficha vira somente leitura

**O que mudou.** A ficha da solução (T3) embutia o formulário de edição sempre
aberto: "Salvar alterações" salvava, mas nada "fechava". Alinhada ao aliado
(`/aliados/[id]/editar`) e à oferta (`/ofertas/[id]/editar`), a ficha passou a
ser **somente leitura** com um botão **"Editar solução"** que abre a rota
`/aliados/[id]/solucoes/[solucaoId]/editar`. Como a ação de salvar redireciona
para a ficha, **"Salvar" agora fecha a edição**.

---

## Pendências declaradas (fora desta rodada)

- **4 resgates com `Id_oferta = #N/D`** (seller 49634239000102): a operadora não
  informou a oferta, então não casam a uma natureza — correção na origem (RN70).
- **Modelo .xlsx do caminho de Enriquecimento** de assinantes — oferecido,
  aguardando sinal.
- **Rotação da senha do banco** que vazou — ação de infra, do lado da TI.
- **Conta duplicada do Pedro Nepomuceno e Silva** (duas contas ativas) — decisão
  de negócio (inativar uma).
- Dicionário de de-para da coluna `Tipo de Oferta` (`[A CONFIRMAR — Minutrade]`).
