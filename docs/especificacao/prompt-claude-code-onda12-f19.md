# Prompt para o Claude Code — Onda 12: Patrocinadores · Fase F19

> **Mesmo repositório.** Pré-requisito: **F1–F18 mergeadas na main** (verifique e reporte se algo faltar). Fase **funcional com migration** — a primeira desde a F13. O produto está em produção: nada aqui altera comportamento existente, exceto os ajustes declarados nas telas de Assinantes, Campanhas e no Guia. Anexos na main: `docs/especificacao/ficha-onda12-patrocinadores.md` (v0.2) e este prompt. Contrato visual: protótipo **v11.2**.

**Primeira tarefa (commit próprio de docs):** atualizar o `CLAUDE.md` — ficha da Onda 12 nas fontes da verdade, F19 no mapa de fases, **RN62–RN66** entre as regras (RN67–RN69 nascem na F20, não antecipe).

## 1. Modelo e migration

Migration nova, com `down.sql` verificado (convenção da casa). Nada de renomear ou remover coluna existente.

- **Patrocinador** — razão social, CNPJ (único, validado), segmento, contato (nome, e-mail, telefone), responsável comercial interno, status (`ativo` · `encerrado`), observações.
- **Contrato** — um por patrocinador nesta fase: minuta (arquivo), data de assinatura, vigência início/fim, preço unitário por assinatura/ano, valor total contratado, assinaturas adquiridas. **Não crie coluna de ativadas nem de saldo** (RN62).
- **VinculoPatrocinio** — patrocinador, assinante, **início** e **fim** (nulo = vigente). É o que sustenta a derivação e a rotatividade. Índice para a contagem de vigentes por patrocinador.
- **Assinante** — enum `PerfilAssinatura` (`PATROCINADA` · `PROMOCIONAL_BROTO` · `AUTOASSINATURA`), plano, periodicidade, método e preço (só fazem sentido em autoassinatura), e enum de estado do usuário (`CADASTRADO` · `FREEMIUM` · `ASSINANTE`).
- **Campanha** — patrocinador opcional; bloco de aprovação externa (aprovador, data, evidência anexada).

**Saldo é derivação, não coluna.** `adquiridas − vínculos vigentes`, calculado no serviço, com fonte única consumida por T32, T33, R1 e Dashboard — o padrão da RN51. Sem adquiridas confirmadas, o serviço devolve ausência (traço com motivo), **nunca zero**. Acrescente uma **cerca de arquitetura** (teste que quebra o build) provando que não existe saldo nem ativadas persistidos.

## 2. Minuta — terceira generalização da infraestrutura de arquivo

A F15 criou a infraestrutura para a marca do aliado; a F17 a generalizou para a imagem do card da solução. Agora ela recebe **documento PDF**, com calibragem própria (tipo, tamanho, sem redimensionamento). **Generalize, não duplique** — e mantenha as suítes de marca e de imagem da solução **intocadas, como prova de regressão**. Antes de mexer em qualquer campo compartilhado, cace todos os leitores (a F15 tinha 3; a F17, 6) e registre no PR quantos encontrou.

Substituir a minuta não apaga a anterior da trilha (RN49).

## 3. Permissões

Gestor cria, edita e inativa patrocinador e contrato; **leitura para todos os papéis**. A célula do `ADMINISTRADOR_PLATAFORMA` é explicitada na matriz, no padrão que `dominio/autorizacao/permissoes.test.ts` já exige de toda ação.

## 4. Telas — o protótipo v11.2 é contrato

- **T32 Patrocinadores (lista)** — nome, CNPJ, status, vigência com selo (`vencendo ≤30 d` · `vencida`), adquiridas × ativadas × saldo, campanhas ativas; busca e filtros; linha abre a T33; item na sidebar **após Assinantes**.
- **T33 Detalhe** — abas Contrato (campos + dropzone da minuta; `sem minuta — pendência` quando ausente), Base (tabela de assinantes reusada, pré-filtrada, CPF mascarado por padrão), **Consumo** (os seis cards da RN65, cada um com seu selo e motivo: `vivo` para base por perfil e ativação; `aguarda chave` para resgates, compras e funil; `aguarda fonte` para acessos e consumo de soluções), Campanhas (lista filtrada + "Nova campanha para este patrocinador" com público já recortado). Ação **Gerar relatório** (modal: período + finalidade).
- **R1 Relatório do Patrocinador** — documento imprimível no padrão da Ficha M1: capa, período, base, campanhas, consumo com os mesmos selos. **Agregado: nenhum dado pessoal identificável** (RN66). Geração auditada com período e finalidade.
- **Ajustes** — Assinantes ganha coluna e filtro de Perfil e Patrocinador; a importação ganha as colunas no mapeamento; a segmentação ganha o recorte "base do patrocinador"; Campanhas exibem a etiqueta e o bloco de aprovação externa (sem registro: "pendente de registro", e **o kit sai carimbado com a pendência**, não bloqueado); Guia ganha a **seção 4.7** pela fonte única (a cerca existente vale — nenhuma cópia paralela).
- **Fora desta fase:** card de Patrocinadores no Dashboard (desenhado no v11.2, implementado na F20).

## 5. CSS — instrução literal

Parta do `design/dseed-admin.css` **do repositório**. Acrescente ao final **apenas** o bloco `/* ---- Extensão (Onda 12 · Patrocinadores): dropzone da minuta ---- */`, seis linhas, seletor único `.pt-drop`, extraído do protótipo v11.2. **Não copie o `dseed-admin.css` da entrega do Design por cima do arquivo do repositório** — a entrega está sem os patches F16/F17 (`gd-volta`, `kb-arrasto-aviso`, `kb-descarte`, `mapa-caixa`) e a cópia os apagaria em silêncio. Todo o resto da onda reusa componentes existentes (`tbl`, `pill`, `kpi-row`/`kpi-cel`, `tab-it`, `cont-it`, `aviso-inline`); não crie classe paralela.

## 6. Honestidade de dado

Transversal e inegociável nesta fase, porque ela nasce com quase tudo por confirmar: campo sem valor é **traço com motivo**, nunca zero, nunca estimativa. Os cards em espera exibem o selo e a razão da espera. Onde o dado depende da operadora, o texto é o do protótipo — "requisição enviada à operadora em 27/07" —, nunca "carta pendente".

## 7. Qualidade e encerramento

Testes de unidade e integração para: derivação do saldo (inclusive vínculo encerrado devolvendo vaga e ausência sem adquiridas), permissões da RN62, vigência e seus selos, R1 sem dado pessoal (varredura do corpo gerado por CPF, e-mail e telefone, no padrão do teste de vazamento da RN61), registro de aprovação externa. E2e com axe-core AAA e viewport 380px nas telas novas. **Suíte F1–F18 integralmente verde** — em particular as de marca do aliado e imagem da solução, que provam que a generalização do §2 não regrediu nada. PR aberto **sem merge**, com o resumo declarando: quantos leitores do campo compartilhado foram encontrados, o que a migration cria, e o que ficou para a F20.

## Mensagem para abrir a sessão (colar como está)

Verifique que **F1–F18 estão mergeadas na main** — se algo faltar, pare e reporte. Confirme a ficha da Onda 12 (v0.2) em `docs/especificacao/`. Leia o `CLAUDE.md`, o prompt `docs/especificacao/prompt-claude-code-onda12-f19.md` e a ficha, nesta ordem. Esta é fase **funcional com migration** — a primeira desde a F13 —, e o contrato visual é o protótipo **v11.2**. Três pontos de atenção declarados: **saldo é derivação, nunca coluna**; a infraestrutura de arquivo é **generalizada** para PDF, com as suítes antigas intocadas como prova de regressão; e o `dseed-admin.css` canônico é **o do repositório**, recebendo apenas o bloco `.pt-drop` da Onda 12. Apresente o plano da F19 em até 10 linhas e **aguarde minha aprovação antes de escrever qualquer arquivo**. Execute na branch provisionada (título do PR: "F19 — Patrocinadores"), commits pequenos; rebase da main antes do PR. Encerre com o PR aberto — **sem mergear**.
