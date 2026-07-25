# Prompt para o Claude Code — Onda 4: Campanhas e Cestas · Fase F12

> **Mesmo repositório.** Pré-requisitos: **F4 e F11 mergeadas** na main — a F12 consome a publicação/telemetria da F4 e o motor de segmentação, os segmentos e a exportação auditada da F11. Roda em paralelo às demais trilhas; coordene pela main. Anexos novos no repositório: `docs/especificacao/ficha-onda4-campanhas-cestas.md` (fonte funcional — RN38–RN45, T22–T25 e o ajuste retroativo da T5) e `docs/referencias/Plataforma_Broto_-_Prototipo_v7.1.html` (fonte visual vigente — as cinco ondas unificadas) e `design/dseed-admin.css` atualizado.

**Primeira tarefa (commit próprio de docs):** atualizar o `CLAUDE.md` — referência visual v7.1 (removendo a v6.1) e a ficha da Onda 4 nas fontes da verdade.

## Migrations e modelo

`campanhas` (nome, objetivo, segmento vinculado, snapshot do público na ativação — reutilizando o padrão de exportação da F11 —, vigência, instruções, estado *Rascunho → Ativa → Encerrada* com porta de aprovação ligável no motor); `cestas` + junção com ofertas; junções campanha↔cestas e campanha↔ofertas avulsas; `pecas` (formato — **lista de domínio nova** "Formatos de peça" com seed e-mail · banner · push · WhatsApp; se a F10 já estiver na main, ela entra automaticamente no editor T16; senão, nasce como tabela seed e o Parametrizador a absorve depois — deixe nota no PR); título, texto, imagem em S3, ordem); `metas_campanha` (tipo: resgates · conversao_pct · aliados_participantes · ofertas_ativas; alvo); `kits` **versionados e imutáveis** (conteúdo, autor, data, hash, diff textual vs anterior — RN45). **Migration retroativa na `ofertas`**: campo `destinacao` (vitrine · campanha · cesta) com vínculo opcional e vigência sugerida; ajuste correspondente na T5 **integrado ao formulário existente, sem reorganizá-lo** (teste de regressão do formulário obrigatório).

## Regras (testes de unidade, positivos e negativos)

**RN38** — ativar exige público com contagem > 0, ≥1 oferta publicada vinculada (direta ou via cesta) e vigência; a ativação congela o público (snapshot com finalidade = campanha, herdando RN34) e gera o kit v1. **RN39** — peças pertencem à campanha e vão no kit; **nenhum caminho de disparo existe**. **RN40** — encerrar a campanha pausa por padrão as ofertas com destinação exclusiva a ela, com aviso prévio listando quais, e reversão manual; ofertas de vitrine apenas se desvinculam (validada em 24/07 via protótipo aprovado). **RN41** — cesta só entra em campanha com todas as ofertas ativas publicadas; oferta encerrada sai da cesta com aviso registrado. **RN42** — serviço de matching assistivo (taxonomias da solução × atributos do segmento: categoria, cultura, cobertura, perfil × preferência, UF), retornando sugestões **nunca auto-aplicadas** — decisão sempre humana. **RN43** — medição em dois níveis com o nível gravado por número: *por oferta* (agregados existentes das ofertas vinculadas dentro da vigência — disponível já) e *por público* (join do snapshot com `telemetria_eventos` via `cpf_hash` — só quando a granularidade existir). **RN44** — conversão % exige o nível público; sem ele, o painel responde "indisponível — aguarda telemetria por CPF"; nunca aproximar. **RN45** — kit imutável; alterações pós-ativação geram nova versão com diff, auditadas.

## Kit de execução

Gerador que empacota (zip): CSV do público (via caso de uso de exportação da F11, com finalidade autopreenchida e auditoria), `manifesto.json` (ofertas/cestas com ids externos Minutrade, vigências, naturezas), peças (imagens + textos), e `instrucoes.md`. Formato de entrega definitivo à Minutrade é **[A CONFIRMAR]** — isole a montagem atrás de `KitAdapter` com a implementação genérica atual.

## Telas

T22 (lista com estado, público, resumo metas × realizado etiquetado, versão do kit), T23 (seções: Público com o **componente de filtros da F11 importado, não copiado**; Conteúdo com busca e a assistência RN42 rotulada como sugestão; Peças com upload/pré-visualização; Metas; Revisão e ativação com validações RN38 explicadas), T24 (cestas com pré-visualização dos cards e RN41 visível), T25 (painel com etiqueta de atribuição em cada número, desempenho por oferta, kit com download e histórico) — fiéis ao v7.1. Estados completos; AAA; axe limpo; T22/T25 a 380px.

## Qualidade

E2e do ciclo completo: criar campanha → simular público → conteúdo com sugestão aceita manualmente → peças → metas → ativar (validações + kit v1) → painel nos dois níveis (público com estado "aguarda") → encerrar com RN40 exibindo o aviso das exclusivas. Suíte completa das fases anteriores verde; nenhum dado inventado (peças de exemplo genéricas Broto; públicos sintéticos da F11).

## Mensagem para abrir a sessão (colar como está)

Verifique os anexos do cabeçalho de `docs/especificacao/prompt-claude-code-onda4.md`; confirme que **F4 e F11 estão mergeadas na main** — se qualquer uma não estiver, pare e reporte. Outras fases rodam em paralelo em sessões separadas. Leia o `CLAUDE.md`, este prompt e a ficha da Onda 4, nesta ordem. Apresente o plano da F12 em até 10 linhas e **aguarde minha aprovação antes de escrever qualquer arquivo**. Execute na branch `f12-campanhas`, commits pequenos; antes do pull request, rebase da main com conflitos resolvidos nesta sessão (atenção à ordem de migrations e ao `CLAUDE.md`); em conflito com trilha alheia, pare e reporte. Encerre com o PR aberto — **sem mergear e sem iniciar outra fase**.
