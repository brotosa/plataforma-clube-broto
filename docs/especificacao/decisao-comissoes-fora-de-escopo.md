# Registro de Decisão — Comissões e Conciliação: fora do escopo da plataforma
**Plataforma de Administração e Gestão do Clube Broto** · decisão de 24/07/2026 (Superintendência Executiva) · este registro prevalece sobre as menções à "candidata a módulo próprio" nas fichas anteriores (Onda 1, §6 e §9).

## Contexto

O contrato-padrão com o Aliado prevê, para vendas fora da Plataforma, um ciclo mensal de conciliação: relatório gerencial de vouchers emitidos (até o 5º dia útil) → manifestação do aliado com vouchers resgatados e valores pagos (5 dias úteis) → nota fiscal da comissão → boleto via Operadora. Desde a análise do contrato (ficha da Onda 1, v0.3), a absorção desse ciclo pela plataforma esteve mapeada como candidata a módulo próprio ("Comissões e Conciliação").

## Decisão

**A plataforma não absorve o ciclo de conciliação.** Não gera o relatório gerencial, não registra a manifestação do aliado, não calcula comissão devida para fins de cobrança e não apoia a emissão de NF. O processo permanece na operação atual, fora da plataforma.

## O que a plataforma faz no tema (inalterado)

Exibe a **receita de comissão estimada** por aliado e por oferta no Dashboard (valor efetivamente pago × comissão % do contrato; apenas Benefícios), com caráter **informativo e gerencial** — não é apuração para cobrança. Guarda a comissão % por aliado no bloco comercial (fonte: contrato) e a telemetria de uso, que, somadas às exportações auditadas, permitem qualquer conferência manual ad hoc pelo time.

## Pendências encerradas e remanescentes

Encerradas por esta decisão: "quem produz o relatório gerencial hoje" e "a plataforma absorve o ciclo" (fichas da Onda 1). Remanescente, com urgência reduzida: a regra de comissão do **Cupom de desconto** (`COMISSAO_CUPOM: "EM_CONFIRMACAO"`) segue pendente e, até definição, cupons permanecem **excluídos da receita estimada** — o único efeito é sobre a completude do número informativo do Dashboard.

## Reversibilidade

Baixo custo: todos os dados necessários a um futuro módulo (vouchers por aliado, valores, comissão %, trilha de auditoria) já existem no modelo. A construção seria aditiva — nenhuma refação — bastando uma nova ficha e uma fase própria, no mesmo método das demais.
