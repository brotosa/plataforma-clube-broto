# Registro de melhorias — completo, PR #1 a #47 (pós-produção)

Documento único das entregas feitas **depois** da versão 1 (Ondas 1–14 / F1–F22)
já em produção — de **06/08 a 28/08/2026**, **quarenta e sete PRs** mesclados na
`main`, que é **produção** (mesclar dispara o deploy: CodeBuild → ECS
`sa-east-1`). Todo PR passou pelo CI completo (typecheck, lint, unit, integração
com banco, build, e2e + axe AAA, responsividade 380px) antes de mesclar.

**Natureza da rodada inteira:** acabamento e correção nascidos de uso real e de
homologação com a base povoada — sem onda nova. As **seis migrations** do
período foram **estritamente aditivas** (PR #3, #8, #10, #13, #23 e #32);
nenhuma removeu coluna, estreitou tipo ou exigiu valor sobre linha existente.

> **Onde está o detalhe.** Os PRs **#1–#28** têm registro **ilustrado com telas
> reais** (e exportações **PDF** e **Word**) em
> [`registro-melhorias/index.html`](./registro-melhorias/index.html); os **#1–#15**
> também em [`registro-melhorias-2026-08.md`](./registro-melhorias-2026-08.md).
> Este arquivo consolida **todos**, com o detalhe integral dos **#29–#47** (que
> ainda não tinham registro próprio).

---

## Panorama completo (#1 a #47)

| PR | Data | Título | Tema | Migration |
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
| #16 | 20/08 | Documentação das melhorias (registro pós-produção #1–#15) | Docs | Não |
| #17 | 21/08 | Fix: importação travando em "Enviando…" (conferência em rota própria) | Correção | Não |
| #18 | 21/08 | Fix: importação — dashboard não atualizava e "Corrigir" ficava em branco | Correção | Não |
| #19 | 24/08 | Fix: conferência de ofertas — pendência de cupom/modalidade sem saída para corrigir | Correção | Não |
| #20 | 24/08 | Fix: Recompensa — pendência de preço aponta o campo preenchido (Preço De/Por) | Correção | Não |
| #21 | 24/08 | Fix(deploy): imagem ops puxa do espelho AWS, não do Docker Hub (429 bloqueava o deploy) | Infra | Não |
| #22 | 24/08 | Fix(ofertas): Código/Regras do Cupom deixa de ser obrigatório | Correção | Não |
| #23 | 24/08 | Ofertas: Tipo Percentual de desconto usa campo % (substitui preço de/por) | Funcionalidade | **Sim** |
| #24 | 25/08 | RN09: imagem do card vira item opcional (não trava a publicação) | Funcionalidade | Não |
| #25 | 25/08 | Ofertas: natureza decide %/valor; renomeia Benefício e Cupom | Funcionalidade | Não |
| #26 | 25/08 | Ofertas: régua RN09 proporcional; descrição curta opcional; rótulos de natureza na T3 | UI | Não |
| #27 | 25/08 | Telemetria: botão "Baixar modelo (.csv)" na importação | Funcionalidade | Não |
| #28 | 25/08 | Ofertas: Id externo (Minutrade) editável no formulário e na importação | Funcionalidade | Não |
| #29 | 26/08 | Docs: registro ilustrado (#1–#28) e correções da auditoria de documentação | Docs | Não |
| #30 | 26/08 | Telemetria da operadora: lê o formato real de "Resgate e Compras" e recupera CPF exportado como data | Telemetria | Não |
| #31 | 26/08 | Telemetria da operadora: lê o CSV real de "Resgate e Compras" (data dd/mm/aaaa e grade vazia) | Telemetria | Não |
| #32 | 26/08 | Telemetria nas telas: Uso do assinante (RFV), card da oferta e Vitrine Viva do Dashboard | Telemetria | **Sim** |
| #33 | 27/08 | Infra: bastion opt-in (EC2 t4g.nano via SSM) para acesso ao RDS privado | Infra | Não |
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

# Parte I — PRs #1 a #28 (detalhe ilustrado no registro próprio)

> Estes vinte e oito PRs têm **descrição completa, decisões, arquivos, banco,
> testes e telas reais** no
> [registro ilustrado](./registro-melhorias/index.html) (também em PDF e Word).
> Abaixo, o resumo de uma linha por PR, para este documento conter todos.

**Contrato e ficha do aliado (#1–#6).** #1 editar contrato vigente na aba
Comercial; #2 unificação de produção (infra AWS 1.5.0); #3 anexo do contrato em
PDF, editar contato e fix do funil (**migration**); #4 buildspec versionado com
migrations no deploy; #5 acabamento da ficha (anexo clicável, botões, vão à
direita); #6 recusa de tamanho no cliente só para documento (fix de regressão).

**Scouting, busca e painel de atividades (#7–#15).** #7 reavaliar + histórico,
pendências filtram, quarentena visível; #8 recomendação na gaveta + "não se
aplica" na T10 (**migration**); #9 busca global do cabeçalho funcionando; #10
painel de atividades — comentários, pendências, @menção (**migration**); #11–#12
ajustes de layout do painel; #13 importação de catálogo por planilha — soluções
e ofertas (**migration**); #14–#15 @menção inline e o fix da caixa sobrepondo a
dica.

**Documentação e correções de importação/ofertas (#16–#28).** #16 registro de
melhorias (#1–#15); #17–#18 correções da importação (travava em "Enviando…", o
dashboard não atualizava); #19–#20 conferência de ofertas com saída para
corrigir a pendência; #21 deploy puxa a imagem ops do espelho AWS (contorna o
429 do Docker Hub); #22 Código/Regras do Cupom deixa de ser obrigatório; #23
Tipo Percentual de desconto usa campo % (**migration**); #24 imagem do card vira
opcional (RN09); #25 natureza decide %/valor e renomeia Benefício/Cupom; #26
régua RN09 proporcional e descrição curta opcional; #27 "Baixar modelo (.csv)"
na telemetria; #28 Id externo (Minutrade) editável.

---

# Parte II — PRs #29 a #33 (telemetria da operadora e infra)

### PR #29 — Registro ilustrado (#1–#28) e auditoria de documentação

**O que mudou.** Gerou o registro ilustrado com telas reais (HTML/PDF/Word) e
corrigiu inconsistências apontadas na auditoria da documentação.

### PR #30 e #31 — Leitura do arquivo real de "Resgate e Compras"

**O que mudou.** O parser da telemetria da operadora passou a ler o **formato
real** do relatório de resgates/compras: data `dd/mm/aaaa`, grade vazia, e a
recuperação do **CPF exportado como data** (Excel converte alguns CPFs). Higiene
no parser, nunca na origem.

### PR #32 — Telemetria nas telas (RFV, card da oferta, Vitrine Viva) — **migration**

**O que mudou.** A telemetria da operadora chegou às telas: **Uso do assinante**
(recência/frequência/valor — RFV), o **card de telemetria por oferta** e a
**Vitrine Viva** do Dashboard. Migration aditiva: coluna `valor` no evento de
resgate.

### PR #33 — Bastion opt-in para o RDS privado

**O que mudou.** Um bastion **sob demanda** (EC2 `t4g.nano` via SSM, sem porta
aberta) para acessar o RDS privado quando necessário — infra, sem tocar a
aplicação.

---

# Parte III — PRs #34 a #47 (rodada de 27–28/08, detalhe integral)

## A. Patrocinadores, assinantes e importação

### PR #34 — Vínculo de patrocínio por CPF, coluna Patrocinador e modelo de assinantes

**O que mudou.** Fechou o caminho da Onda 12/F19 que faltava na interface:
(a) criar **vínculo de patrocínio manualmente por CPF** na aba Base do
patrocinador; (b) ler a coluna nativa **`Patrocinador`** na importação de
assinantes, mapeando `Broto` para o perfil `Promocional Broto` (RN63); (c)
**modelo de importação de assinantes** para download.

**Decisão/regra.** Junção por CPF-HMAC (RN36/RN69), o CPF nunca em claro; o
de-para de perfil segue o dicionário `[A CONFIRMAR — Minutrade]`. Reusa o modelo
`VinculoPatrocinio` da F19 — sem migration.

**Como testar.** Aba Base de um patrocinador → "Vincular por CPF"; importar uma
planilha de assinantes com a coluna `Patrocinador` preenchida.

### PR #36 — Modelo .xlsx com Patrocinador por ID e quarentena visível

**O que mudou.** O modelo de importação virou **.xlsx** com o **Patrocinador por
ID** (dropdown "Nome — código"), a **recusa da linha com causa nomeada** quando
o patrocinador não existe, e o **detalhe da quarentena** no passo 4 (antes só
havia a contagem).

**Decisão/regra.** Causa de recusa nomeada (RN55); nenhum dado pessoal real no
repositório — fixtures sintéticas.

**Como testar.** Importação → "Baixar modelo (.xlsx)"; subir com um ID de
patrocinador inexistente e ver a linha em quarentena com a causa.

### PR #35 — Publicar todas as ofertas elegíveis em massa

**O que mudou.** Botão que **publica em massa** as ofertas elegíveis (rascunho
ou pausada → publicada), respeitando a elegibilidade fina por oferta
(RN02/RN09/RN11). Resolve a carga inicial com dezenas de ofertas em rascunho.

**Como testar.** Tela de Ofertas → "Publicar todas as elegíveis" (confirma a
contagem antes de aplicar).

## B. Dashboard — telemetria de resgates

### PR #37 — Destinos corretos nas células do panorama

**O que mudou.** Corrigiu os botões/células do hero que levavam a telas erradas
(resgates e soluções apontavam para lugares "aleatórios"). Cada célula leva à
tela de origem certa.

### PR #38 e #40 — "Resgates de benefícios" e "de cupons" saem do extrato nominal

**O que mudou.** As duas células passaram a exibir o **total do extrato nominal
da operadora** (eventos que casaram por CPF), em vez de depender de campanha
ativa (benefícios, errata 27/08) ou da telemetria de voucher clássica nunca
alimentada (cupons, errata 28/08). O catálogo segue como segunda opção.

**Decisão/regra.** Uma contagem só, "extrato", **jamais somada ao catálogo**
(RN68); ausência é estado próprio, nunca zero (RN53). A regra de comissão do
cupom continua `[A CONFIRMAR]` — não impede contar o resgate.

### PR #41 — Checkout é modalidade de resgate (RN65)

**O que mudou.** Por decisão do Administrador da Plataforma, `Checkout no clube`
e `Checkout externo` deixaram de ser "compra" e passaram a **contar como
resgate**, preservando a **modalidade** (gratuito / checkout no clube / checkout
externo). Na T33 o card "Compras" virou "Modalidades de resgate"; a ficha do
assinante e a da oferta mostram o total com a quebra.

**Efeito medido (arquivo real de 42 resgates).** Benefícios 19 → 37, cupons 0 →
5 no dia da apuração — os 4 restantes têm `Id_oferta = #N/D` na origem e não
casam a uma natureza (correção na operadora).

**Decisão/regra.** O de-para vive em `dominio/telemetria-operadora/`; o
`tipoOferta` é gravado como veio, então corrigir a classificação quando o
dicionário `[A CONFIRMAR — Minutrade]` chegar é editar código, sem reimportar.

## C. Dashboard — filtro de período

### PR #42 — Seletor de período volta a funcionar

**O que mudou.** Trocar o período mudava a URL mas não os números. Causa: o
`<select>` usava `router.push`, navegação suave do App Router que só troca a
query — o defeito de **Router Cache** já documentado. Passou a navegar por
`window.location` (navegação real), com guarda na cerca
`navegacao-por-query.test.ts`.

### PR #43 — Cards de resgate respeitam a janela pela data do resgate

**O que mudou.** As células de resgate contavam o extrato inteiro, ignorando o
período. Passaram a **recortar pela data do evento** (`dataEvento`). Janela sem
resgate é **zero medido**, não salta para o catálogo (RN53).

### PR #45 — Cada célula filtra pela sua data de negócio + opção "Todos"

**O que mudou.** O seletor passou a recortar cada célula de fluxo pela **sua**
data, e ganhou a opção **"Todos"** (sem recorte):

| Célula | Data que rege o recorte |
|--------|--------------------------|
| **Aliados** | data de **assinatura do contrato** (sem contrato, só em "Todos") |
| **Ofertas** | **início da vigência** da oferta |
| **Resgates de benefícios/cupons** | **data da compra/resgate** (`dataEvento`) |
| Blocos (publicação, receita, funil, uso, campanhas) | já pela sua data de evento |

**Decisão/regra.** Células de **inventário** (soluções publicadas, campanhas
ativas, cestas, assinantes na base) permanecem como **total vigente** — são
estoque, não fluxo. A célula Ofertas foi **desacoplada** da vitrine viva (que
segue como o destaque próprio do hero, com a sua janela parametrizada, RN50).

## D. Listas — ordenação e filtros

### PR #39 — Carteira de assinantes (T18)

**O que mudou.** **Ordenação por coluna** (allowlist no servidor), **paginação
numerada** e **filtros rápidos**. Ordenação por perfil corrigida para alfabética.

### PR #46 — Usuários: ordem alfabética e filtros

**O que mudou.** A tela listava em blocos de ativo/inativo, espalhando contas da
mesma pessoa (a nova ativa `@broto.com.br` e a antiga inativa `@brasilseg.com.br`
de uma migração de domínio) — parecendo "duplicado". Passou a **ordem
alfabética** por nome, com **filtros** por nome/e-mail, papel e situação.

**Decisão/regra.** Não são duplicatas — são contas distintas; por RN47 não há
exclusão, a antiga fica inativa. Consolidar contas realmente duplicadas é
decisão de negócio.

### PR #47 — Ofertas: filtros por busca, natureza e status

**O que mudou.** **Busca** (título ou aliado), **natureza** e **status**, com
contador e "Limpar filtros". Filtragem **no servidor por querystring** (lista
paginada em 50), via `<form method="get">` (navegação nativa) que compõe com o
preset "a vencer" do painel.

## E. Edição de solução

### PR #44 — Editar solução em rota própria; ficha vira somente leitura

**O que mudou.** A ficha (T3) embutia o formulário sempre aberto: "Salvar"
salvava mas nada "fechava". Alinhada ao aliado e à oferta, a ficha virou
**somente leitura** com um botão **"Editar solução"** → rota
`/aliados/[id]/solucoes/[solucaoId]/editar`; como a ação redireciona para a
ficha, **"Salvar" fecha a edição**.

---

## Pendências declaradas (fora desta rodada)

- **4 resgates com `Id_oferta = #N/D`** (seller 49634239000102): a operadora não
  informou a oferta, então não casam a uma natureza — correção na origem (RN70).
- **Modelo .xlsx do caminho de Enriquecimento** de assinantes — oferecido,
  aguardando sinal.
- **Rotação da senha do banco** que vazou — ação de infra, do lado da TI.
- **Conta duplicada do Pedro Nepomuceno e Silva** (duas contas ativas) — decisão
  de negócio (inativar uma).
- **Dicionário de de-para** da coluna `Tipo de Oferta` (`[A CONFIRMAR —
  Minutrade]`).
