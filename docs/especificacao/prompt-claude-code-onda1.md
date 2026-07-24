# Prompt para o Claude Code — Plataforma de Administração do Clube Broto · Onda 1

> Anexos obrigatórios no repositório/contexto: `ficha-onda1-aliados-solucoes-ofertas.md` (v0.6 — **fonte da verdade funcional**: entidades, campos, RN01–RN12, telas), `Plataforma_Broto_-_Prototipo_v2.1.html` (**fonte da verdade visual**), `design/tokens.css` (DSeed oficial — intocável), `design/dseed-admin.css` (extensões corrigidas — base do CSS do produto), logos SVG, `Lista_de_Sellers_1.xlsx` e `Lista_de_Ofertas_3.xlsx` (seed da carga inicial).

## Missão

Implementar o produto da Onda 1 — módulo de Aliados, Soluções e Ofertas com motor de aprovação, publicação/telemetria batch e carga inicial — fiel ao protótipo v2.1 e à ficha v0.6. O sistema será mantido pela TI da Broto com apoio do Claude Code: otimize para legibilidade, convenção e documentação, não para esperteza.

## Stack (premissa declarada — se a TI Broto padronizar diferente, adapte mantendo a arquitetura)

Next.js (App Router) + React + TypeScript `strict` · PostgreSQL (Amazon RDS) com Prisma (migrations versionadas) · S3 para anexos (contratos PDF, logos, imagens de card) · deploy containerizado (Dockerfile pronto para ECS Fargate ou App Runner) · autenticação própria com Auth.js (credenciais + sessão) atrás de uma interface de identidade que permita plugar Microsoft Entra ID sem refação · logs estruturados (pino) · testes com Vitest (unidade) e Playwright (e2e) · axe-core no CI para acessibilidade.

Volumetria de projeto: ~150 aliados, centenas de ofertas, ≤10 usuários internos — priorize simplicidade; busca server-side apenas onde a ficha indicar (futuras ondas). Idioma da UI e das mensagens: português do Brasil.

## Arquitetura

Monólito modular no Next.js: `dominio/` (entidades, regras RN01–RN12 como serviços puros testáveis), `infra/` (Prisma, S3, adapters), `app/` (rotas e telas). Três serviços transversais obrigatórios:

1. **Auditoria** — toda mutação de entidade de negócio grava evento com: entidade, id, campo, valor anterior, valor novo, autor, timestamp. Implementar como serviço chamado pelas camadas de escrita (não trigger de banco), com listagem consultável por entidade na aba Integração/histórico. Nada é excluído fisicamente após primeira publicação (RN05): soft-delete/status.
2. **RBAC** — papéis da ficha (Gestor, Analista, Aprovador, Leitura) com permissões por ação; middleware nas rotas; segregação RN06 garantida no serviço (solicitante ≠ aprovador).
3. **Motor de aprovação** — tabelas `aprovacao_regras` (tipo de entidade, exigida sim/não, aprovadores designados) e `aprovacao_solicitacoes` (entidade, id, solicitante, estado Solicitada → Aprovada | Devolvida, comentário obrigatório na devolução). Nasce com Aliado ligado e Oferta desligada; ligar Oferta em T7 passa a exigir aprovação na publicação **sem alteração de código**.

## Modelo de dados — decisões estruturais (o restante deriva da ficha v0.6, campo a campo)

- `empresas` com `estagio` (enum completo do pipeline — estágios pré-aliança existem no schema desde já, telas na Onda 2), `cnpj` UNIQUE com validação de dígito, `id_externo_minutrade` UNIQUE nullable; suspensão com `motivo_suspensao` tipificado (RN12).
- **Bloco comercial em tabela própria** `contratos_comerciais` (empresa_id, anexo S3, data_assinatura, vigencia_base, status vigente·denunciado·encerrado, comissao_pct, ambientes_pagamento) — prepara histórico de renovações; alerta de janela de não-renovação = job diário que marca contratos a ≤30 dias do aniversário.
- `solucoes` e `ofertas` conforme ficha; `ofertas.natureza` enum de **três** valores (recompensa · beneficio · cupom_desconto) com validações: recompensa ⇒ preços zero; cupom ⇒ desconto definido + campo `cupom_codigo_regras`; a regra de comissão do cupom fica **isolada e desligada** (constante `COMISSAO_CUPOM: "EM_CONFIRMACAO"` — nenhum cálculo de receita para cupom até definição).
- `telemetria_eventos` como **fatos imutáveis** (id_voucher, tipo emissao_voucher·resgate_voucher·compra_confirmada, cpf_hash, valor, data, arquivo_origem) com UNIQUE(id_voucher, tipo) para idempotência de reimportação; agregados por oferta materializados em leitura, nunca editáveis (RN07). Na Onda 1 armazene `cpf` apenas como hash (o dado pessoal pleno só entra na Onda 5 com o RBAC de PF).
- `publicacoes` (autor, data, pacote gerado, diff vs anterior) e `importacoes` (tipo, arquivo, linhas ok/erro, relatório de quarentena).
- **Staging da carga inicial**: tabelas `staging_sellers` e `staging_ofertas` + `staging_agrupamentos` para a tela de conferência antes da efetivação transacional.
- Taxonomias da v1 (categorias reais da vitrine, culturas, UFs, tipos de benefício, mecânicas) como tabelas com seed — dados, não enums de código — para o Parametrizador da Onda 3 editá-las sem migração.

## Fluxos críticos

**Publicação (export batch).** Ação do Gestor gera pacote com aliados/soluções/ofertas publicáveis. Implementar atrás de `interface ExportAdapter` com implementação inicial `GenericJsonCsvAdapter` — o layout real da Minutrade é **[A CONFIRMAR]** e entrará como novo adapter sem tocar o domínio. O pacote registra diff, limpa flags *Pendente de republicação* (RN10) e inclui despublicações em cascata (RN04).

**Importação de telemetria.** Parser do layout-alvo da ficha (CSV `data_hora; cpf; id_seller; id_oferta; id_voucher; tipo_evento; valor; canal`), com validação linha a linha, quarentena de erros com motivo, idempotência, e relatório pós-carga. Distinguir na UI "voucher resgatado aguardando conciliação" (fora da Plataforma) de "compra confirmada".

**Carga inicial.** Parser das duas planilhas reais anexas → staging → **tela de conferência** (revisar/ajustar agrupamentos produto→solução propostos pela heurística "mesmo seller + mesmo texto", aprovar em lote ou item a item) → efetivação transacional criando empresas (Aliada ativa), soluções, ofertas e telemetria histórica ("acumulado até a data da carga"). Campos ausentes ficam pendentes e alimentam a régua de completude (RN09). Deixe o parser tolerante a uma futura terceira fonte: o dump do catálogo Minutrade (categoria, descrição, imagem, tipo) — **[A CONFIRMAR]**, chegando, enriquece o staging antes da conferência.

**Job diário**: expiração de vigências (RN03) + marcação de janelas contratuais.

## Interface

O protótipo v2.1 é a especificação visual: reproduza layout, tokens e microinterações. Regras duras: `tokens.css` intocado; `dseed-admin.css` é a base (evolua-o com parcimônia, documentando extensões no mesmo padrão de comentários); **sem Tailwind, sem biblioteca de componentes de terceiros** — CSS da entrega + CSS Modules onde precisar de escopo. Telas T1–T7 e estados vazio/carregando/erro/sem-resultados conforme protótipo e ficha.

Duas correções que o protótipo não cobre e aqui são obrigatórias:
1. **T4 mobile**: colapso completo em cards com `data-label` em todas as células (o protótipo usa rolagem contida como paliativo). E a T4 desktop inclui a coluna **Natureza** (o protótipo omitiu; a ficha manda).
2. **Interruptores (T7)**: `<button role="switch" aria-checked>` nativo, acionável por Space/Enter, com anel de foco visível, alcançável por Tab — teste e2e cobrindo navegação por teclado da T7 inteira.

## Acessibilidade — AAA conforme política da rodada 2

Tokens de texto derivados já presentes no CSS (`--azul-texto-aaa #1735FF`, `--paragrafo-aaa #5C5950`, `--erro-texto-aaa #B00000`) aplicados a texto normal; azul puro em botões/superfícies (label 14px bold = texto grande); laranja jamais como cor de texto; `h1` único por tela + `h2` nas seções; `alt` em toda imagem (ou `aria-hidden` decorativo); foco visível em todo interativo; navegação 100% por teclado; axe-core no CI sem violações; largura de linha de texto corrido ~80ch.

Responsividade: T1/T4/T6 plenamente usáveis a 380px; T2/T3/T5/T7 íntegras com aviso de edição preferencial em desktop.

## Qualidade e entrega

TypeScript strict sem `any` gratuito; testes de unidade cobrindo RN01–RN12 (uma suíte por regra, casos positivos e negativos); e2e Playwright dos fluxos: criar empresa → solicitar promoção → aprovar (usuário distinto) → criar solução → criar oferta → publicar → importar telemetria → conferir agregados; e2e da carga inicial com as planilhas reais; seed de desenvolvimento com os dados reais; migrations reversíveis; `README.md` de operação (subir local, variáveis de ambiente, deploy, rodar carga inicial); Dockerfile multi-stage; zero dados inventados em qualquer seed ou fixture.

## Plano de execução em fases — trabalhe fase a fase, com checkpoint ao final de cada uma

**F1 Fundação**: projeto, CI, Prisma + migrations do schema completo, Auth.js + RBAC, auditoria, layout base (sidebar com módulos futuros desabilitados, header, navegação). Pronto = login, papéis aplicados, evento de auditoria gravando.
**F2 Domínio**: CRUD Empresas/Contratos/Soluções/Ofertas com RN01–RN12, motor de aprovação, T1/T2/T3/T5/T6/T7. Pronto = fluxo e2e principal verde.
**F3 Carga inicial**: parsers, staging, tela de conferência, efetivação. Pronto = base real carregada com conferência demonstrável.
**F4 Integração**: publicação com ExportAdapter, importação de telemetria com quarentena, T4 completa com performance e alertas. Pronto = ciclo publicar→telemetria→agregados verde.
**F5 Endurecimento**: AAA auditado (axe + teclado), responsividade validada, testes completos, README, Docker. Pronto = critérios de aceite abaixo.

## Critérios de aceite finais

Fluxo completo operável por um analista sem manual; RN01–RN12 com testes verdes; auditoria consultável com before/after; motor de aprovação reconfigurável em T7 sem deploy; carga inicial reproduzível do zero com as planilhas; axe-core limpo e navegação por teclado íntegra (incluindo os switches); T1/T4/T6 usáveis a 380px; nenhum dado inventado; `[A CONFIRMAR]` do projeto isolados atrás de adapters/flags nomeados, nunca resolvidos por suposição no código.
