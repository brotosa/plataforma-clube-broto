# CLAUDE.md — Plataforma de Administração do Clube Broto

## O que é este repositório

Aplicação web administrativa do Clube Broto (Broto S.A.). Onda 1: módulo de Aliados, Soluções e Ofertas com motor de aprovação, publicação/telemetria batch (Minutrade) e carga inicial. Onda 2: Mercado & Scout — funil de prospecção, avaliação com score, dossiê assistido, cobertura e metas. Onda 3 (F10): Parametrizador — listas de domínio, valores de regra e metas editáveis sem código, com histórico e efeito prospectivo. Onda 5 (antecipada, F11): módulo de Assinantes — base patrocinada com importação, enriquecimento, segmentação e exportação controlada. Onda 4 (Campanhas & Cestas) especificada para execução futura. Mantida pela TI Broto com apoio do Claude Code.

## Fontes da verdade — nesta ordem

1. `docs/especificacao/ficha-onda1-aliados-solucoes-ofertas.md` (v0.6) — entidades, campos, regras RN01–RN12, telas T1–T7. Em conflito com qualquer outra coisa, a ficha da onda correspondente vence.
2. `docs/especificacao/ficha-onda2-mercado-scout.md` (v0.1) — fonte da verdade funcional da Onda 2: entidades, regras RN13–RN22, telas T8–T14.
3. `docs/especificacao/ficha-onda3-parametrizador.md` (v0.2) — fonte da verdade funcional da Onda 3: papel Administrador da Plataforma, as três classes de parâmetro, regras RN23–RN28, telas T15–T17. Traz **errata sobre a ficha da Onda 2**: a definição de metas é do Administrador da Plataforma, não do Gestor — a designação de responsáveis continua com o Gestor.
4. `docs/especificacao/ficha-onda5-assinantes.md` (v0.1) — fonte da verdade funcional da Onda 5: entidades, regras RN29–RN37, telas T18–T21.
5. `docs/especificacao/prompt-claude-code-onda1.md`, `prompt-claude-code-onda2.md`, `prompt-claude-code-onda3.md` e `prompt-claude-code-onda5.md` — arquitetura, stack, fluxos, fases e critérios de aceite de cada onda.
6. `docs/especificacao/prompt-dossie-due-diligence.md` — template versionado do dossiê de due diligence (F8).
7. `docs/referencias/Plataforma_Broto_-_Prototipo_v6.1.html` — especificação visual vigente (protótipo unificado das ondas 1, 2, 3 e 5), incluindo as telas T15–T17 do Parametrizador. Reproduzir layout, tokens e microinterações. Onde o prompt da Onda 3 cita "protótipo v4.1" na seção de telas, leia-se **v6.1**: é a versão vigente declarada no próprio cabeçalho daquele prompt e a única que contém T15–T17. `docs/referencias/ficha-m1-viasat.html` é a referência visual do formulário M1 da Ficha Cadastral. O `Plataforma_Broto_-_Prototipo_v2.1.html` permanece apenas como histórico da Onda 1.

## Regras invioláveis

- **Nunca inventar dados.** Seeds, fixtures e exemplos usam apenas os dados reais de `dados/` e das referências. Ausência de dado = estado "pendente", nunca um número plausível. Refinamento (Onda 5): dados de pessoa física em seeds e fixtures são sempre sintéticos, gerados e marcados como SINTÉTICO (CPFs algoritmicamente formados, jamais de pessoas reais); a proibição de inventar dados de negócio permanece integral. Nunca haverá dado real de PF neste repositório.
- **Pendências de negócio não se resolvem no código.** Todo `[A CONFIRMAR]` da ficha fica isolado atrás de adapter ou flag nomeada (ex.: `ExportAdapter`, `COMISSAO_CUPOM: "EM_CONFIRMACAO"`). Em dúvida sobre regra de negócio: perguntar, não supor.
- **`design/tokens.css` é intocável.** Extensões visuais só em `dseed-admin.css`, documentadas no padrão de comentários existente. Sem Tailwind, sem bibliotecas de componentes de terceiros.
- **Trabalho fase a fase** (F1→F5 do prompt da Onda 1; F6→F9 do prompt da Onda 2; F10 do prompt da Onda 3; F11 do prompt da Onda 5). Concluir a fase, commitar, abrir PR com resumo e **parar no checkpoint** para revisão humana. Não avançar de fase sem aprovação explícita. Fases de ondas distintas podem correr em trilhas paralelas; a coordenação é sempre pela main.
- **Parâmetro configurável não vira constante.** A partir da F10, toda régua, teto, comissão-padrão e meta é lida do Serviço de Configuração; escrita só pelo Administrador da Plataforma (RN23), sempre auditada e com efeito prospectivo — nenhuma mudança de parâmetro re-pontua registro já fechado (RN25).
- **Auditoria e RBAC não são opcionais**: toda mutação de entidade de negócio grava evento com valor anterior/novo/autor; segregação solicitante ≠ aprovador (RN06) garantida em serviço.
- **Acessibilidade AAA** conforme o prompt: tokens de texto derivados, foco visível, navegação por teclado, axe-core limpo no CI. Interruptores são `<button role="switch">` nativos.
- **Idioma**: UI, mensagens, commits e documentação em português do Brasil, registro institucional.

## Convenções

TypeScript strict; testes de unidade por regra de negócio (casos positivos e negativos); migrations Prisma reversíveis; commits pequenos com mensagem descritiva; PR por fase com resumo do que foi feito, o que ficou pendente e como testar.
