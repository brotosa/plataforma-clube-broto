# Prompt para o Claude Code — Onda 3: Parametrizador · Fase F10

> **Mesmo repositório.** Pré-requisito: **F7 mergeada** (a RN25 grava a versão de configuração usada em cada avaliação). Pode rodar **em paralelo a F8/F9** — a F10 não toca o `DossieProvider`; se F9 ainda não existir, o CRUD de metas nasce aqui e a T14 o consome depois. Coordene merges pela main. Anexos novos que devem estar no repositório: `docs/especificacao/ficha-onda3-parametrizador.md` (v0.2 — fonte funcional; RN23–RN28), `docs/referencias/Plataforma_Broto_-_Prototipo_v6.1.html` (fonte visual vigente) e `design/dseed-admin.css` atualizado. Primeira tarefa (commit próprio): atualizar o `CLAUDE.md` — confirmar a referência visual v6.1 e acrescentar a ficha da Onda 3 às fontes da verdade.

## Fundações da fase

**Serviço de Configuração** central: leitura única e cacheada (invalidação na escrita) consumida por todo o código que hoje usa constantes; escrita restrita ao papel **Administrador da Plataforma** (novo no RBAC — migração e seed; RN23), sempre auditada. **Migrations**: `valores_regra` + `valores_regra_historico` (autor, data, de/para — RN25); `configuracao_versoes` com snapshot dos parâmetros que afetam o score (indicadores, dimensões, pesos) e coluna `configuracao_versao_id` em `avaliacoes_scout` (backfill das existentes apontando para a versão-seed); papel Administrador. Listas de domínio já são tabelas desde a F1 — ganham aqui o CRUD e a flag de ativo onde faltar.

## Regras (testes de unidade obrigatórios, casos positivos e negativos)

**RN24** — Inativar exige exibir a contagem de uso antes (queries de uso por lista; nunca desnormalizar contadores); excluir não existe; itens são referenciados **por id** em todo o schema, então renomear é update simples e a "propagação" é automática — a UI apenas avisa. **RN25** — Efeito prospectivo absoluto: mudar peso jamais recalcula avaliação fechada; nova escrita em indicadores/pesos gera nova `configuracao_versao`. **RN26** — Estruturais somente leitura no hub, com justificativa (dados vindos de metadados, não hardcode na tela). **RN27** — Registrar o tipo "Parâmetro sensível" no motor de aprovação, **desligado**; quando ligado na T7, escritas em comissão-padrão, pesos, tetos e metas passam a exigir aprovação — sem código novo. **RN28** — Constraint de não-sobreposição de metas por escopo e período (aplicada no banco e na UI).

## Refatoração dos consumidores

As réguas deixam de ser constantes e passam a ler do Serviço de Configuração: envelhecimento do funil (T8 e job), oferta sem resgate e vigência a vencer (T4 e alertas), reavaliação (job RN21). Teste de regressão: alterar uma régua reflete nas telas sem retroagir sobre registros fechados.

## Seeds — valores reais confirmados em 24/07

Meta vigente: **24 novos aliados/ano, escopo geral** (sem abertura por categoria). Comissão-padrão do contrato-modelo: **5%, confirmada** — o cadastro de aliado pré-preenche 5% editável, e qualquer etiqueta "em confirmação" sobre esse valor sai da UI. **Atenção à distinção**: a constante `COMISSAO_CUPOM: "EM_CONFIRMACAO"` **permanece** — a pendência do cupom é outra e continua aberta. Réguas: 14/30 dias (funil), 90 dias (sem resgate), 15 dias (vigência), 12 meses (reavaliação). Tetos do dossiê: defaults conservadores documentados no README, com `[A CONFIRMAR TI]` mantido nos comentários da migration.

## Telas

T15 (hub com cards por família, último ajuste, seção de estruturais com justificativas, taxas com etiqueta de standby, link para T7, banner de leitura para não-administradores), T16 (lista+detalhe; indicadores como caso rico com grupo/dimensão/peso) e T17 (grupos de réguas, comissão-padrão, metas com RN28 visível, tetos; histórico por valor) — fiéis ao protótipo v4.1. Estados completos; AAA; axe limpo.

## Critérios de aceite

Administrador edita, demais leem; contagem de uso antes de inativar; renomear reflete em todos os usos; régua alterada muda o comportamento vivo sem retroagir; avaliação fechada aponta para sua versão de configuração; RN27 liga na T7 e passa a exigir aprovação sem deploy; meta 24/ano e comissão 5% vivas no produto; suíte F1–F9 verde (regressão total); nenhum valor inventado.

## Mensagem para abrir a sessão (colar como está)

Verifique os anexos novos do cabeçalho de `docs/especificacao/prompt-claude-code-onda3.md`; confirme que a F7 está mergeada — se não estiver, pare e reporte. Leia o `CLAUDE.md`, este prompt e a ficha v0.2 da Onda 3. Apresente o plano da F10 em até 10 linhas e **aguarde aprovação antes de escrever qualquer arquivo**. Outras fases rodam em paralelo em sessões separadas. Execute na branch `f10-parametrizador`, commits pequenos; antes do pull request, rebase da main com conflitos resolvidos na sessão. Encerre com o PR aberto — **sem mergear e sem iniciar outra fase**.
