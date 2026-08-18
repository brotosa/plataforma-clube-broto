# Ficha de Módulo — Onda 2: Mercado & Scout
**Plataforma de Administração e Gestão do Clube Broto** · v0.1 para validação · 24/07/2026

Decisões incorporadas (aceitas em 24/07): score v1 (nota 1–5 por indicador, pesos por dimensão, 0–100); transições com decisão humana explícita; due diligence assistida por IA com revisão humana; mapa de cobertura e reavaliação anual de aliadas. Continuidade da Onda 1: telas numeradas de T8 em diante, regras de RN13 em diante; o pipeline de estágios e o motor de aprovação já existem no schema e no produto.

---

## 1. Objetivo do módulo

Transformar o scouting artesanal (documento ScoutCB + planilhas + reuniões) em um funil gerido: entrada no radar → avaliação com score → priorização → negociação → promoção a aliada (entregue à Onda 1 via motor de aprovação) — com gestão de cobertura de portfólio por categoria e due diligence pública assistida. O módulo é o guardião da resposta à objeção "por que não construímos isso internamente?": a curadoria vira processo visível, medido e auditável.

### 1.1 Números de operação (informados em 24/07)

Até ~100 empresas/mês entram no radar. Equipe: **2 analistas** fazem scout e avaliação; **8 comerciais** conduzem negociações após o handoff. Existe **meta de novos aliados por período** (valor **[A CONFIRMAR]** — parametrizável), exibida como meta × realizado. Nota de consistência: a base de usuários da plataforma passa a ~12–15 pessoas (2 + 8 + gestão/aprovação) — sem impacto técnico sobre o dimensionamento da D4.

## 2. Usuários e permissões

| Ação | Gestor | Analista de Scout (2) | Comercial (8) | Aprovador | Leitura |
|---|---|---|---|---|---|
| Incluir empresa no radar / importar lista | ● | ● | — | — | — |
| Assumir e avaliar (notas por indicador) | ● | ● | — | — | — |
| Priorizar (decisão explícita) | ● | ● | — | — | — |
| Gerar/colar e revisar dossiê | ● | ● | ○ (ver) | — | — |
| Assumir negociação / registrar andamento | ● | — | ● | — | — |
| Solicitar promoção a Aliada ativa | ● | — | ● | — | — |
| Aprovar promoção (motor da Onda 1) | ● | — | — | ● | — |
| Definir metas e designar responsáveis | ● | — | — | — | — |
| Visualizar funil, mapa e metas | ● | ● | ● | ● | ● |

Os papéis da Onda 1 permanecem; "Analista de Scout" e "Comercial" são novos perfis no RBAC existente.

## 3. Entidades e campos

### 3.1 Empresa (entidade da Onda 1 — a Onda 2 ativa os estágios pré-aliança)

Campos adicionais: **Origem** (scouting ativo · indicação · procura espontânea · lista importada) — obrigatória (RN13); **Categorias-alvo** (taxonomia da vitrine) — ≥1 (RN13); **Responsável de scout** (um dos 2, atribuído ao assumir — RN14); **Responsável comercial** (um dos 8, designado no handoff — RN16); **Data de entrada no radar**; **Notas rápidas** (texto livre curto, histórico).

### 3.2 Avaliação de Scout (versionada)

Avaliador, data, e **nota 1–5 por indicador** com campo opcional de evidência por indicador; **score calculado**: média ponderada por dimensão de medição → subtotais por dimensão + total 0–100, recalculado ao vivo; **recomendação** (avançar · monitorar · descartar) e prioridade sugerida; comparação com a versão anterior. Edição após fechamento cria **nova versão** (RN18) — histórico íntegro para auditoria.

### 3.3 Indicador (seed derivado do ScoutCB; edição na Onda 3)

Nome · Grupo (Empresa · Produto) · **Dimensão de medição** (Capilaridade, Fit de Negócio, Dimensão e Maturidade, Senioridade e Compliance, Escala da operação, Sucesso da operação, GAP de Portfólio, Saúde do caixa, Tração, Relevância de Mercado, Inovação, Proposta de Valor e Eficácia, Público-alvo, Concorrência) · Tipo de resposta (v1: escala 1–5 universal) · Peso · Ativo. A carga seed reproduz as duas tabelas do ScoutCB (indicadores de Empresa e de Produto).

**Acréscimo pós-homologação — "não se aplica" (N/A).** Além da escala 1–5, cada indicador aceita a resposta **"não se aplica"** — para o indicador que não faz sentido no aliado avaliado (há aliado em que certas medições não cabem). O N/A é uma resposta distinta de "sem nota": **conta como respondido**, mas fica **fora da média** do score — nunca vira 0 nem 5. Regras: (a) o subtotal da dimensão é a média só das notas reais 1–5; dimensão inteiramente N/A **não pontua** e sai do total (não entra como zero). (b) Fechar a versão continua exigindo **ao menos uma nota real 1–5** (sem nota real não há score — pré-condição da RN15); avaliação só com N/A não fecha. (c) Ao fechar (RN18), o N/A é congelado como o resto: correção abre nova versão, que nasce **pré-preenchida com os N/A** da anterior. (d) Não altera a RN19: N/A é decisão humana do avaliador, o dossiê não a preenche. Persistência: a nota passa a ser opcional no banco e ganha a marca `naoSeAplica`, com CHECK de coerência (ou nota 1–5, ou N/A — nunca ambos). Migration aditiva/relaxante sobre base povoada.

### 3.4 Dossiê de due diligence

Empresa · data · status (gerando · pronto · falha) · conteúdo estruturado nas **10 etapas do ScoutCB** (resumo executivo, perfil, produtos, impacto para o produtor, mercado, concorrência, SWOT, gaps da pesquisa, roteiro de reunião, formato final) com **fontes citadas por afirmação** e "não foi encontrada informação pública" onde faltar · origem (gerado por IA · inserido manualmente) · flag **"requer revisão"** até um analista marcar como revisado (RN19) · registro de custo/execução.

### 3.5 Meta de período e registro de negociação

**MetaPeriodo**: período, meta de novos aliados (geral; opcional por categoria), realizado calculado (promoções efetivadas). **RegistroNegociacao**: empresa, responsável, data, tipo (reunião · proposta enviada · follow-up · outro), nota curta — deliberadamente simples: **não é um CRM** (limite de escopo, seção 9).

## 4. Regras de negócio (continuação da numeração da Onda 1)

13. **RN13** — Entrada no radar exige origem e ao menos uma categoria-alvo.
14. **RN14** — *Mapeada → Em avaliação* é ato do analista, que assume a empresa como responsável de scout.
15. **RN15** — *Priorizada* exige avaliação com score calculado **e** decisão humana explícita. O score recomenda; nunca promove automaticamente.
16. **RN16** — *Em negociação* exige responsável comercial designado (handoff do time de scout para o comercial).
17. **RN17** — *Descartada* exige motivo tipificado (sem fit de negócio · imaturidade · sobreposição com aliado atual · recusou condições · sem resposta · outro + descrição). Descartada pode ser reativada — volta a *Mapeada* preservando todo o histórico.
18. **RN18** — Avaliações são imutáveis após fechamento; correção = nova versão.
19. **RN19** — Dossiê gerado por IA nasce marcado "gerado automaticamente — requer revisão" e **jamais preenche nota de indicador**: alimenta evidência; a pontuação é sempre humana.
20. **RN20** — Promoção a *Aliada ativa* passa pelo motor de aprovação da Onda 1 (RN06); avaliação vigente e dossiê viajam anexados ao pedido — o aprovador decide vendo o caso completo.
21. **RN21** — Aliadas ativas recebem alerta de reavaliação aos 12 meses da última avaliação; a reavaliação usa o mesmo formulário e versiona.
22. **RN22** — Painel de meta exibe meta × realizado do período; realizado = promoções efetivadas no período.

## 5. Telas (insumo para o Claude Design — mesmo projeto da Onda 1)

| # | Tela | Conteúdo essencial |
|---|---|---|
| T8 | **Funil de mercado** | Visão primária em kanban por estágio (alternativa tabela com filtros); card: empresa, categorias-alvo, origem, score, responsável, **dias no estágio** com alerta de envelhecimento; filtros por responsável ("minhas empresas" / "minhas negociações"), categoria, origem, score |
| T9 | **Entrada no radar** | Formulário mínimo (nome, site, origem, categorias-alvo) + **importação de lista** (upload com mapeamento de colunas e deduplicação por CNPJ/nome) |
| T10 | **Avaliação** | Formulário de indicadores 1–5 agrupado por dimensão, evidência por indicador, score ao vivo por dimensão e total, recomendação, comparação com versão anterior |
| T11 | **Dossiê** | Botão "gerar dossiê" (assíncrono, com status) ou inserção manual; leitura nas 10 seções com fontes; ação "marcar como revisado"; anexado à ficha da empresa |
| T12 | **Ficha da empresa pré-aliança** | A mesma T2 da Onda 1 com as abas Scouting e Dossiê ativas nos estágios anteriores; o **formulário M1 da Ficha Cadastral do Aliado v1** é preenchido aqui no estágio *Em negociação* |
| T13 | **Mapa de cobertura** | Matriz categoria × (aliadas ativas · em funil por estágio); célula vazia = gap de portfólio; clique filtra o funil na categoria |
| T14 | **Metas** | Meta × realizado por período, geral e por categoria; simples e visual |

Estados obrigatórios (vazio · carregando · erro · sem resultados) em todas; padrão visual DSeed claro + dseed-admin.css; acessibilidade AAA conforme política vigente; T8 plenamente usável no celular (o comercial consulta o funil em campo), demais íntegras.

## 6. Due diligence assistida — arquitetura

Adapter `DossieProvider`; implementação v1 chama a API Anthropic (Claude com busca na web), com prompt derivado das 10 etapas do ScoutCB (o prompt já existe no documento — vira template versionado no repositório), saída estruturada por seção com fontes, execução assíncrona com status e nova tentativa. Entrada manual (colar/anexar) sempre disponível como alternativa e como fallback. **[A CONFIRMAR TI]**: chave de API, orçamento por dossiê e teto mensal (até 100 empresas/mês × dossiê sob demanda — gerar apenas quando o analista pedir, nunca automático em massa).

## 7. Carga inicial

Importação das **listas de prospects existentes** (confirmado que existem — **[A CONFIRMAR]** formato; enviar os arquivos para mapeamento como fizemos com as planilhas de sellers). Entram como *Mapeada*, origem "lista importada", com deduplicação contra empresas já cadastradas (incluindo as 46 aliadas da Onda 1). Se as listas contiverem notas ou critérios de avaliação prévios, a conversão para o score v1 será definida na análise dos arquivos — sem conversão inventada.

## 8. Métricas de sucesso do módulo

Tempo mediano radar → decisão (priorizar ou descartar); percentual do funil com avaliação; envelhecimento por estágio; taxa de conversão radar → aliada ativa; cobertura de categorias (gaps fechados); aderência à meta do período.

## 9. Fora de escopo da Onda 2

CRM de negociação completo (pipeline comercial detalhado, e-mails, propostas — o registro simples da 3.5 é o limite); notificações por e-mail/push (v1: listas "minhas pendências" dentro do produto); edição de indicadores, pesos e metas-padrão (Onda 3 — Parametrizador); qualquer automação que decida por humano (RN15/RN19 são invioláveis).

## 10. Premissas e pendências

**[A CONFIRMAR] consolidado:** valor das metas por período (e se há metas por categoria); formato e conteúdo das listas de prospects existentes (inclusive se contêm notas de avaliação prévias); existência de planilha de avaliação com mecânica de score já praticada (se houver, o modelo v1 se ajusta a ela, não o contrário); chave, orçamento e teto de uso da API para dossiês (TI).
