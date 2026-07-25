# Prompt para o Claude Code — Onda 2: Mercado & Scout · Fases F6–F9

> **Mesmo repositório** da Onda 1. Pré-requisito: F2 mergeada (o funil usa a entidade Empresa, o RBAC e o motor de aprovação). Anexos novos que devem estar no repositório antes da sessão: `docs/especificacao/ficha-onda2-mercado-scout.md` (**fonte da verdade funcional desta onda** — entidades, RN13–RN22, telas T8–T14), `docs/especificacao/prompt-dossie-due-diligence.md` (template versionado do dossiê), `docs/referencias/Plataforma_Broto_-_Prototipo_v6.1.html` (**fonte visual da verdade vigente** — protótipo unificado das ondas 1, 2, 3 e 5) e `design/dseed-admin.css` atualizado (inclui as classes `.kb-*`/`.age-*` da Onda 2 e os fixes reaplicados da Onda 1). O `CLAUDE.md` continua valendo integralmente.

**Primeira tarefa da F6 (manutenção de documentação):** atualizar o `CLAUDE.md` — a referência visual passa a ser o `Plataforma_Broto_-_Prototipo_v6.1.html` (remover o `Plataforma_Broto_-_Prototipo_v2.1.html`, superado), e as fontes da verdade ganham a ficha da Onda 2 e o template do dossiê. Commit próprio, mensagem "docs: referências da Onda 2".

## F6 — Funil e radar

Migrations: campos novos de `empresas` (origem obrigatória, categorias-alvo ≥1, responsável de scout, responsável comercial, notas rápidas, data de entrada no radar), `registros_negociacao`, motivos tipificados de descarte. Perfis novos no RBAC existente: Analista de Scout e Comercial, com a matriz de permissões da ficha.

Telas: **T8 Funil** — kanban pelos estágios pré-aliança com visão alternativa em tabela; card com empresa, categorias, origem, score, responsável e **"há N dias" como texto** (classes `.age-l`/`.age-f` como reforço, régua 14/30 parametrizada em constante nomeada); menu por card com "Mover para {estágio}" e "Descartar" abrindo **modal com os seis motivos tipificados** (RN17); filtros e visões "Minhas empresas"/"Minhas negociações"; movimentação grava auditoria com autor e data. **T9 Entrada no radar** — formulário mínimo (RN13) e importação de lista em três passos (upload → mapeamento de colunas → resumo com deduplicação por CNPJ/nome contra o radar e as aliadas) usando a infraestrutura de staging da F3; parser tolerante a formato — o layout real das listas existentes é **[A CONFIRMAR]** e entra como configuração de mapeamento, não como código rígido.

Regras: RN13, RN14 (assumir = virar responsável de scout), RN16 (handoff exige comercial designado), RN17 (reativação de descartada volta a Mapeada com histórico).

**Acessibilidade obrigatória com teste**: e2e Playwright percorrendo o kanban só por teclado — Tab até o card, Enter abre o menu, opções alcançáveis, Esc fecha e devolve o foco ao gatilho, mover e descartar completáveis sem mouse.

## F7 — Avaliação e score

Migrations: `indicadores` (seed fiel às duas tabelas do ScoutCB — grupos Empresa e Produto, dimensões de medição, escala 1–5, peso, ativo) e `avaliacoes_scout` **versionadas e imutáveis após fechamento** (RN18) com notas, evidências, subtotais por dimensão, total 0–100, recomendação.

Tela **T10**: formulário agrupado por dimensão com score ao vivo (subtotal por dimensão e total, pesos exibidos discretamente), comparação com a versão anterior, e as três recomendações. RN15 no serviço: *Priorizada* exige avaliação fechada **e** ação humana explícita — nenhum caminho de código promove por score. Job de reavaliação anual (RN21) somado ao job diário existente.

## F8 — Dossiê assistido

Interface `DossieProvider` com duas implementações: `AnthropicDossieProvider` (SDK oficial da Anthropic, modelo com busca na web, prompt montado a partir do **template versionado** do repositório, resposta validada contra o schema JSON, execução assíncrona com status gerando → pronto/falha e nova tentativa) e `ManualDossieProvider` (colar/anexar). Regras duras: geração **somente sob demanda** do analista (nunca em lote); RN19 — dossiê nasce "gerado automaticamente — requer revisão", ação "marcar como revisado" com autor/data, e **nenhum campo do dossiê preenche nota de indicador**; custo e duração registrados por execução, com telemetria consultável.

Configuração por variáveis de ambiente — **nunca commitadas**: `ANTHROPIC_API_KEY` (secret do ambiente/CI), `DOSSIE_TETO_MENSAL_BRL` e `DOSSIE_CUSTO_MAX_UNITARIO_BRL` (a geração é bloqueada com mensagem clara ao atingir o teto; valores **[A CONFIRMAR TI]** — defaults conservadores e documentados no README). Tela **T11** conforme protótipo: dez seções com fontes por afirmação e "Não foi encontrada informação pública" onde faltar.

## F9 — Cobertura, metas, aprovação enriquecida e carga do funil

**T13 Mapa de cobertura** (matriz categoria × aliadas ativas × funil por estágio, gaps destacados, clique filtra o funil) e **T14 Metas** (`metas_periodo`, RN22 — realizado = promoções efetivadas; valor da meta **[A CONFIRMAR]**, parametrizado). **RN20**: o pedido de promoção que cai na fila T6 passa a anexar a avaliação vigente e o dossiê — o aprovador vê o caso completo; evoluir a T6 sem quebrar o fluxo da Onda 1 (teste de regressão obrigatório). **T12**: abas Scouting e Dossiê ativas nos estágios pré-aliança e o formulário M1 da Ficha Cadastral (seções e validações conforme `ficha-cadastral-aliado-v1.md`; referência visual no protótipo e no arquivo `Ficha M1 Viasat` da entrega do Design). Carga inicial do funil: importação das listas existentes pela T9 quando os arquivos chegarem —**sem conversão inventada** de notas prévias (se as listas tiverem avaliações, parar e perguntar o mapeamento). Endurecimento: axe-core limpo nas sete telas novas, e2e dos fluxos radar → avaliação → priorização → handoff → promoção com anexos, README atualizado (incluindo operação do dossiê e dos tetos).

## Critérios de aceite da onda

Fluxo completo operável pelos dois times sem manual; RN13–RN22 com testes de unidade (positivos e negativos); kanban 100% operável por teclado com e2e verde; dossiê gerado, revisado e jamais pontuando indicador; score explicável olhando a T10; movimentações e descartes auditáveis com motivo tipificado; F1–F5 sem regressão (suíte completa verde); nenhum dado inventado; pendências atrás de configuração nomeada.

## Mensagem para abrir a sessão (colar como está)

Este repositório contém a Onda 1 em construção e a especificação das Ondas 2, 3 e 5. Pré-requisito desta fase: **F2 mergeada** — verifique; se não estiver, pare e reporte. Verifique também os anexos do cabeçalho de `docs/especificacao/prompt-claude-code-onda2.md`; se algo faltar, pare e reporte. Outras fases rodam **em paralelo** em sessões separadas. Leia o `CLAUDE.md`, o prompt da Onda 2 e a ficha da Onda 2, nesta ordem. Apresente em até 10 linhas o plano da F6 e **aguarde minha aprovação antes de escrever qualquer arquivo**. Execute na branch `f6-funil-radar`, commits pequenos; antes de abrir o pull request, faça rebase da main e resolva conflitos nesta sessão (atenção à ordem de migrations e ao `CLAUDE.md`); se encontrar na main código de outra trilha conflitando com sua especificação, pare e reporte em vez de corrigi-lo. Encerre com o PR aberto — **sem mergear e sem iniciar a F7**.
