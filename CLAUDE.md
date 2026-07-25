# CLAUDE.md — Plataforma de Administração do Clube Broto

## O que é este repositório

Aplicação web administrativa do Clube Broto (Broto S.A.). Onda 1: módulo de Aliados, Soluções e Ofertas com motor de aprovação, publicação/telemetria batch (Minutrade) e carga inicial. Onda 2: Mercado & Scout — funil de prospecção, avaliação com score, dossiê assistido, cobertura e metas. Ondas 3 (Parametrizador) e 5 (Assinantes) especificadas para execução futura. Mantida pela TI Broto com apoio do Claude Code.

## Fontes da verdade — nesta ordem

1. `docs/especificacao/ficha-onda1-aliados-solucoes-ofertas.md` (v0.6) — entidades, campos, regras RN01–RN12, telas T1–T7. Em conflito com qualquer outra coisa, a ficha da onda correspondente vence.
2. `docs/especificacao/ficha-onda2-mercado-scout.md` (v0.1) — fonte da verdade funcional da Onda 2: entidades, regras RN13–RN22, telas T8–T14.
3. `docs/especificacao/prompt-claude-code-onda1.md` e `docs/especificacao/prompt-claude-code-onda2.md` — arquitetura, stack, fluxos, fases e critérios de aceite de cada onda.
4. `docs/especificacao/prompt-dossie-due-diligence.md` — template versionado do dossiê de due diligence (F8).
5. `docs/referencias/Plataforma_Broto_-_Prototipo_v6.1.html` — especificação visual vigente (protótipo unificado das ondas 1, 2, 3 e 5). Reproduzir layout, tokens e microinterações. `docs/referencias/ficha-m1-viasat.html` é a referência visual do formulário M1 da Ficha Cadastral.

## Regras invioláveis

- **Nunca inventar dados.** Seeds, fixtures e exemplos usam apenas os dados reais de `dados/` e das referências. Ausência de dado = estado "pendente", nunca um número plausível.
- **Pendências de negócio não se resolvem no código.** Todo `[A CONFIRMAR]` da ficha fica isolado atrás de adapter ou flag nomeada (ex.: `ExportAdapter`, `COMISSAO_CUPOM: "EM_CONFIRMACAO"`). Em dúvida sobre regra de negócio: perguntar, não supor.
- **`design/tokens.css` é intocável.** Extensões visuais só em `dseed-admin.css`, documentadas no padrão de comentários existente. Sem Tailwind, sem bibliotecas de componentes de terceiros.
- **Trabalho fase a fase** (F1→F5 do prompt da Onda 1; F6→F9 do prompt da Onda 2). Concluir a fase, commitar, abrir PR com resumo e **parar no checkpoint** para revisão humana. Não avançar de fase sem aprovação explícita.
- **Auditoria e RBAC não são opcionais**: toda mutação de entidade de negócio grava evento com valor anterior/novo/autor; segregação solicitante ≠ aprovador (RN06) garantida em serviço.
- **Acessibilidade AAA** conforme o prompt: tokens de texto derivados, foco visível, navegação por teclado, axe-core limpo no CI. Interruptores são `<button role="switch">` nativos.
- **Idioma**: UI, mensagens, commits e documentação em português do Brasil, registro institucional.

## Convenções

TypeScript strict; testes de unidade por regra de negócio (casos positivos e negativos); migrations Prisma reversíveis; commits pequenos com mensagem descritiva; PR por fase com resumo do que foi feito, o que ficou pendente e como testar.
