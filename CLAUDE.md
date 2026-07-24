# CLAUDE.md — Plataforma de Administração do Clube Broto

## O que é este repositório

Aplicação web administrativa do Clube Broto (Broto S.A.). Onda 1: módulo de Aliados, Soluções e Ofertas com motor de aprovação, publicação/telemetria batch (Minutrade) e carga inicial. Mantida pela TI Broto com apoio do Claude Code.

## Fontes da verdade — nesta ordem

1. `docs/especificacao/ficha-onda1-aliados-solucoes-ofertas.md` (v0.6) — entidades, campos, regras RN01–RN12, telas. Em conflito com qualquer outra coisa, a ficha vence.
2. `docs/especificacao/prompt-claude-code-onda1.md` — arquitetura, stack, fluxos, fases e critérios de aceite.
3. `docs/referencias/Plataforma_Broto_-_Prototipo_v2.1.html` — especificação visual. Reproduzir layout, tokens e microinterações.

## Regras invioláveis

- **Nunca inventar dados.** Seeds, fixtures e exemplos usam apenas os dados reais de `dados/` e das referências. Ausência de dado = estado "pendente", nunca um número plausível.
- **Pendências de negócio não se resolvem no código.** Todo `[A CONFIRMAR]` da ficha fica isolado atrás de adapter ou flag nomeada (ex.: `ExportAdapter`, `COMISSAO_CUPOM: "EM_CONFIRMACAO"`). Em dúvida sobre regra de negócio: perguntar, não supor.
- **`design/tokens.css` é intocável.** Extensões visuais só em `dseed-admin.css`, documentadas no padrão de comentários existente. Sem Tailwind, sem bibliotecas de componentes de terceiros.
- **Trabalho fase a fase** (F1→F5 do prompt). Concluir a fase, commitar, abrir PR com resumo e **parar no checkpoint** para revisão humana. Não avançar de fase sem aprovação explícita.
- **Auditoria e RBAC não são opcionais**: toda mutação de entidade de negócio grava evento com valor anterior/novo/autor; segregação solicitante ≠ aprovador (RN06) garantida em serviço.
- **Acessibilidade AAA** conforme o prompt: tokens de texto derivados, foco visível, navegação por teclado, axe-core limpo no CI. Interruptores são `<button role="switch">` nativos.
- **Idioma**: UI, mensagens, commits e documentação em português do Brasil, registro institucional.

## Convenções

TypeScript strict; testes de unidade por regra de negócio (casos positivos e negativos); migrations Prisma reversíveis; commits pequenos com mensagem descritiva; PR por fase com resumo do que foi feito, o que ficou pendente e como testar.
