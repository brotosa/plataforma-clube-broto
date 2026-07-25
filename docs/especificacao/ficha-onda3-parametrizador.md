# Ficha de Módulo — Onda 3: Parametrizador
**Plataforma de Administração e Gestão do Clube Broto** · v0.2 · 24/07/2026 — pendências de negócio fechadas: comissão-padrão e meta

Decisões incorporadas (24/07): escrita exclusiva do novo papel **Administrador da Plataforma**; metas definidas somente pelo Administrador (**errata sobre a ficha da Onda 2**, que atribuía ao Gestor — esta ficha prevalece); taxas transacionais do meio de pagamento em **standby** (fora do escopo até nova ordem); aprovação dupla para parâmetros sensíveis não obrigatória na v1, porém **ligável** via motor de aprovação (nasce desligada). Continuidade: telas T15–T17, regras RN23–RN28.

---

## 1. Objetivo do módulo

Ser o painel de configuração da plataforma: as listas de domínio e os valores de regra que as Ondas 1–2 marcaram como configuráveis passam a ser editáveis sem código — com integridade referencial, histórico e auditoria — enquanto os parâmetros estruturais (que carregam regra de código e contrato) aparecem como somente leitura, com a explicação honesta de que mudá-los é release, não configuração.

## 2. Papel novo e permissões

**Administrador da Plataforma** (RBAC): único com escrita no Parametrizador e na definição de metas. Todos os demais papéis: leitura do hub (transparência de configuração vigente). A gestão completa de usuários permanece na Onda 6; o papel nasce agora por migração simples. Toda escrita gera evento de auditoria com valor anterior/novo/autor (serviço existente).

## 3. Escopo — três classes de parâmetro

### 3.1 Listas de domínio (editor genérico T16)

Categorias de solução (seed: as 11 da vitrine) · Culturas · Cobertura (UFs/regiões) · Perfil de cliente (porte × natureza PF/PJ) · Tipos de benefício · Motivos de suspensão (RN12) e de descarte (RN17) · **Indicadores de scout** (nome, grupo Empresa/Produto, dimensão de medição, peso, ativo — o caso mais rico do editor).

### 3.2 Valores de regra (editor T17)

Régua de envelhecimento do funil (leve/forte — hoje 14/30 dias) · Réguas da vitrine (oferta sem resgate — hoje 90 dias; vigência a vencer — hoje 15 dias) · Alerta de reavaliação anual (hoje 12 meses) · Comissão-padrão do contrato-modelo: **5%, confirmado como padrão em 24/07** (pré-preenche o cadastro do aliado, editável por contrato; não confundir com a regra de comissão do Cupom de desconto, que segue pendente desde a Onda 1) · **Metas de novos aliados** por período (mensal · trimestral · anual; geral e por categoria) — **meta vigente confirmada em 24/07: 24 novos aliados/ano, geral, sem abertura por categoria por enquanto** · Tetos do dossiê (mensal em R$ e custo máximo unitário).

### 3.3 Somente leitura (exibidos no hub T15 com explicação)

Naturezas da oferta, estágios do pipeline, status, mecânicas de resgate, dimensões de medição, ambientes de pagamento — carregam validações, comissão e integração Minutrade: alteração é release versionado. **Regras de aprovação**: link para a T7 existente. **Taxas transacionais**: exibidas como referência informativa com etiqueta "em standby — edição não habilitada".

## 4. Regras de negócio

23. **RN23** — Escrita exclusiva do Administrador da Plataforma; leitura para todos; tudo auditado.
24. **RN24** — Item de lista em uso jamais é excluído: apenas inativado. A UI exibe a contagem de uso antes da ação ("esta categoria está em N soluções"); renomear propaga para todos os usos; item inativo some das seleções novas e permanece nos registros históricos com badge.
25. **RN25** — Valor de regra tem histórico e **efeito prospectivo**: mudança de peso de indicador nunca re-pontua avaliações fechadas (complementa RN18) — cada avaliação grava a versão de configuração usada; réguas novas valem dali em diante.
26. **RN26** — Parâmetros estruturais são somente leitura no Parametrizador, cada um com a justificativa visível de uma linha.
27. **RN27** — A família sensível (comissão-padrão, pesos de indicadores, tetos do dossiê, metas) pode ter exigência de aprovação ligada na T7 sem código; nasce desligada.
28. **RN28** — Metas não se sobrepõem para o mesmo escopo e período (uma meta geral vigente por período; uma por categoria por período).

## 5. Telas

| # | Tela | Conteúdo essencial |
|---|---|---|
| T15 | **Hub do Parametrizador** | Cards por família com contagem de itens, último ajuste (autor/data) e acesso; seção "estruturais — somente leitura" com justificativas; taxas com etiqueta de standby; link para Regras de aprovação (T7) |
| T16 | **Editor de listas de domínio** | Padrão lista+detalhe com busca; criar, renomear (com aviso de propagação), inativar/reativar com contagem de uso; para Indicadores: campos de grupo, dimensão e peso |
| T17 | **Editor de valores de regra** | Grupos: réguas do funil e da vitrine · comissão-padrão · metas por período (criação com validação RN28) · tetos do dossiê; cada valor com histórico ("alterado por X em D, de A para B") e nota de efeito prospectivo |

Estados vazio/carregando/erro/sem resultados; AAA vigente; desktop-first com telas íntegras no celular (módulo de administrador — sem exigência de uso pleno móvel).

## 6. Carga inicial

Seed = os valores já em uso nas Ondas 1–2: as 11 categorias da vitrine, culturas e UFs, tipos de benefício, motivos tipificados, as duas tabelas de indicadores do ScoutCB com pesos v1, réguas 14/30/90/15 dias e 12 meses, tetos default do dossiê documentados. Nada nasce vazio; nada nasce inventado.

## 7. Fora de escopo

Edição de taxas transacionais (standby por decisão de 24/07); edição de parâmetros estruturais; gestão de usuários completa (Onda 6); qualquer parâmetro de campanha (Onda 4 trará os seus e os plugará neste módulo).

## 8. Pendências

**[A CONFIRMAR]**: valores definitivos dos tetos do dossiê (TI). Fechadas em 24/07: comissão-padrão 5% confirmada; meta vigente 24 novos aliados/ano (geral).
