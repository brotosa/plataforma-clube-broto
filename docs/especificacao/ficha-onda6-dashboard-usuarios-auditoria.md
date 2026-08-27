# Ficha de Módulo — Onda 6: Dashboard, Usuários e Auditoria
**Plataforma de Administração e Gestão do Clube Broto** · v0.1 para validação · 24/07/2026

Natureza desta onda: **consolidação, não invenção** — todos os indicadores do Dashboard vêm das seções de métricas das fichas validadas das Ondas 1–5; Usuários é a interface do RBAC existente; Auditoria é a consulta da trilha gravada desde a F1. Continuidade: telas T26–T28, regras RN46–RN50. O Dashboard (T26) passa a ser a **HOME** da plataforma (rota inicial pós-login).

---

## 1. Objetivo do módulo

Dar tela ao que o sistema já mede e grava: o painel de gestão que consolida as métricas do Clube — as mesmas que sustentam a tese comercial junto aos patrocinadores (vitrine viva, uso da base, adensamento) —, a gestão de usuários internos e a consulta da trilha de auditoria. É a onda que transforma instrumentação em governança visível.

## 2. T26 — Dashboard (HOME)

**Estrutura em duas camadas.** No topo, a faixa **"Exige ação hoje"**: fila de aprovação pendente, cadastros incompletos bloqueando publicação (RN09), vigências de oferta a vencer (15 dias), janelas contratuais de não-renovação (30 dias), reavaliações vencidas (RN21), importações em quarentena. Abaixo, **quatro blocos por domínio**, com seletor de período:

| Bloco | Indicadores (fonte: fichas validadas) |
|---|---|
| **Rede e Aliados** (Onda 1 §8) | % de aliados com cadastro completo · tempo mediano rascunho→publicação · % de ofertas ativas com resgate em 90 dias (**vitrine viva**) · cobertura de categorias · receita de comissão estimada (valor pago × comissão %, Benefícios; cupom excluído até definição da regra) |
| **Mercado e Funil** (Onda 2 §8) | tempo mediano radar→decisão · % do funil avaliado · envelhecimento por estágio · conversão radar→aliada · gaps de cobertura · **meta × realizado (24 aliados/ano)** |
| **Assinantes e Uso** (Onda 5 §8) | % da base com contato válido · cobertura de enriquecimento · % de assinantes com uso em 90 dias · distribuição por UF e preferência · vencimentos 30/60/90 |
| **Campanhas** (Onda 4 §7) | campanhas ativas · taxa de metas atingidas · % de ofertas de campanha com resgate na vigência |

**Honestidade estrutural (RN50):** todo indicador que depende de telemetria por CPF exibe o estado "aguarda telemetria por assinante"; números de campanha carregam a etiqueta de nível de atribuição; o Dashboard **jamais calcula o que a fonte não sustenta** — indisponibilidade é estado de primeira classe, nunca aproximação. Visível a todos os papéis: só agregados, nenhum dado pessoal (coerente com RN33).

## 3. T27 — Usuários

CRUD dos usuários internos (nome, e-mail corporativo, papel, ativo/inativo), exclusivo do **Administrador da Plataforma** (papel da Onda 3). Credencial própria com troca obrigatória no primeiro acesso (premissa v1; SSO Entra ID permanece decisão futura — D3, arquitetura já abstraída). Ficha do usuário com atalho "atividade recente" (auditoria filtrada por autor). Não existe exclusão: usuário com histórico é **inativado** (RN47).

## 4. T28 — Auditoria

Consulta da trilha completa: filtros por entidade, registro, autor, tipo de evento e período; visão **antes → depois** por evento; destaque visual para eventos sensíveis (acesso pleno a dados PF, exportações de lista, alterações de parâmetro e de regra de aprovação). Exportação do extrato em CSV para auditoria externa — **a própria exportação gera evento de auditoria** (meta-trilha). Somente leitura para todos os papéis.

## 5. Regras de negócio

46. **RN46** — Gestão de usuários exclusiva do Administrador; **proteção do último administrador**: o sistema impede rebaixar ou inativar o único usuário com papel Administrador (anti-lockout).
47. **RN47** — Inativação revoga o acesso imediatamente (sessões derrubadas) e preserva integralmente o histórico e a autoria nos registros.
48. **RN48** — Auditoria é somente leitura; exportar o extrato exige papel Gestor ou Administrador e é auditado.
49. **RN49** — Nenhum evento de auditoria é apagado na v1; política formal de retenção **[A CONFIRMAR — jurídico/compliance]**, com a premissa de retenção integral até definição.
50. **RN50** — O Dashboard exibe apenas indicadores com fonte sustentada; estados de indisponibilidade explícitos e etiquetas de atribuição obrigatórias; nenhum indicador novo entra sem constar de ficha validada. **Errata de 26/08 — fonte da "vitrine viva":** o numerador "ofertas ativas com resgate na janela" deixou de sair do voucher clássico (Onda 1, `telemetriaEvento`, nunca alimentado em produção) e passou a sair do **extrato nominal da operadora** (Onda 12, `eventoDeResgateTelemetria`), casado à oferta por `id_oferta`. Escolheu-se o **extrato**, e não o **catálogo**, porque só o extrato tem **data por evento** — e a janela de 90 dias é da definição da métrica. "Com resgate" conta o evento classificado como RESGATE (mesma leitura da T33/T34). A célula "Ofertas" do hero continua sendo o mesmo numerador (F15), agora desta fonte. Não é indicador novo: é troca de fonte de um indicador existente, e a RN68 segue intocada (catálogo e extrato jamais somados). **Errata de 27/08 — escopo do card "Resgates de benefícios" (hero):** por decisão do Administrador da Plataforma, a célula deixou de medir "resgates na campanha ativa" e passou a exibir o **total do extrato nominal** de RECOMPENSA + BENEFÍCIO (`resgatesNominaisGlobais`), com o catálogo como segunda opção — assim o número acende com o dado que já existe (os eventos que casaram por CPF), sem depender de haver campanha ativa. Continua sendo **uma** contagem, nomeada "extrato", jamais somada ao catálogo (RN68); a campanha ativa deixa de alimentar esta célula (a medição por campanha permanece na T25/painel da campanha, RN43).

## 6. Fora de escopo

SSO (decisão pendente da D3); alertas por e-mail/push (a faixa "exige ação" é dentro do produto); exportação analítica/BI externo; qualquer métrica que não conste das fichas das Ondas 1–5.

## 7. Pendências

**[A CONFIRMAR]**: política de retenção da auditoria (jurídico); eventual priorização/corte de indicadores do Dashboard por você — como todos vêm de fichas já validadas, o conjunto acima segue como aprovado salvo corte explícito.
