# Prompt para o Claude Code — Onda 5: Assinantes · Fase F11

> **Mesmo repositório.** Pré-requisito: **F3 mergeada** (infra de staging e importação). A F11 **pode rodar em paralelo a F6–F10** — não toca funil, score, dossiê nem Parametrizador; coordene merges pela main. Anexos novos no repositório: `docs/especificacao/ficha-onda5-assinantes.md` (fonte funcional — RN29–RN37, T18–T21), `docs/referencias/Plataforma_Broto_-_Prototipo_v6.1.html` (fonte visual vigente) e `design/dseed-admin.css` atualizado.

**Primeira tarefa (commit próprio de docs):** atualizar o `CLAUDE.md` — referência visual v6.1, ficha da Onda 5 nas fontes da verdade, e **um refinamento da regra de dados**: "dados de pessoa física em seeds e fixtures são sempre sintéticos, gerados e marcados como SINTÉTICO (CPFs algoritmicamente formados, jamais de pessoas reais); a proibição de inventar dados de negócio permanece integral". Nunca haverá dado real de PF neste repositório.

## Migrations e modelo

`assinantes`: `cpf_hash` determinístico (HMAC com chave própria via env) como identidade única e chave de junção com a telemetria; `cpf_cifrado` (cifragem em repouso, chave `APP_ENCRYPTION_KEY` via env — nunca no repo); núcleo (nome, endereço bruto + `uf`/`municipio` derivados, e-mail, telefone, preferência). `assinaturas` (plano, status, vencimento; coluna `origem_dado` — a fonte real é **[A CONFIRMAR: arquivo × Minutrade]**). `atributos_enriquecimento` como EAV leve com catálogo (`atributo`, `valor`, `fonte`, `data` — proveniência obrigatória; trade-off documentado: atributos ainda indefinidos pedem flexibilidade; quando estabilizarem, promover os quentes a colunas indexadas). `segmentos` (regras em JSONB). `exportacoes_lista` (autor, data, contagem, **finalidade obrigatória**, regra usada, hash do arquivo; o arquivo CSV vai para o S3 — snapshot auditável). Estender `importacoes` com família (núcleo × enriquecimento) e política (foto completa × incremental).

## Serviços e regras (testes de unidade por regra, positivos e negativos)

**Importação (RN29/RN31)** — upsert idempotente por `cpf_hash`; quarentena linha a linha com motivo; **foto completa** marca ausentes como "fora da base" somente dentro de transação com confirmação explícita em duas etapas na API (dry-run com resumo → confirmação) — o teste cobre o cenário do desastre: arquivo parcial enviado como foto completa deve exigir a confirmação mostrando quantos sairiam. **Derivação (RN32)** — UF/município por CEP quando houver (**[A CONFIRMAR]** se o arquivo traz CEP), heurística documentada como fallback, e estado honesto "não derivado" quando falhar. **Enriquecimento (RN35)** — casa por CPF, nunca sobrescreve núcleo, registra divergências. **Segmentação (RN33)** — compilador de regras JSONB → SQL **parametrizado com allowlist** de campos e operadores do catálogo (rejeitar campo fora do catálogo é teste obrigatório; jamais interpolar); contagem via `COUNT` com índices nas colunas do catálogo; o construtor da T18 pode oferecer seleções simplificadas, mas **persiste sempre a estrutura declarativa** — é ela que a Onda 4 reutiliza no simulador. **Máscara e acesso (RN30)** — o servidor responde mascarado por padrão; a exibição plena é decidida **na API** conforme permissão (nunca só no front) e gera evento de auditoria; exportação (RN34) exige a permissão específica, finalidade, e grava o snapshot. **Telemetria (RN36)** — junção por `cpf_hash` quando a granularidade chegar; até lá, os campos de uso respondem com o estado "aguardando telemetria por assinante". **Vencimento (RN37)** — filtros 30/60/90; nenhuma ação.

## Permissões novas

"Visualizar dados pessoais plenos" e "exportar listas de contato" (v1: Gestor e Administrador) sobre o RBAC existente; contagens e agregados abertos a todos os papéis.

## Telas

T18 (carteira com construtor e **contagem viva** — endpoint de contagem separado e rápido, chamado a cada mudança de regra com debounce), T19 (perfil com os dois estados de máscara, assinatura com origem sinalizada, uso, enriquecimento com proveniência), T20 (fluxo de importação em passos com pré-visualização de 5 linhas e resumo com quarentena e download de erros), T21 (segmentos salvos com contagem atual) — fiéis ao protótipo v6.1. Componente do construtor **isolado e reutilizável** (a campanha o embutirá). Estados completos; AAA; axe limpo; T18 consultável a 380px.

## Fixtures e performance

Gerador de assinantes sintéticos pt-BR (marcados SINTÉTICO; CPFs formados algoritmicamente, nunca reais) para desenvolvimento e testes; teste de performance com 50 mil sintéticos: contagem do construtor respondendo em dezenas de milissegundos com os índices do catálogo. E2e: importar arquivo sintético → mapear → política incremental → carteira → montar filtro → contagem → salvar segmento → exportar com finalidade → evento de auditoria conferido; segundo e2e da foto completa com o fluxo de confirmação em duas etapas.

## Critérios de aceite

RN29–RN37 com testes verdes; nenhum caminho de API entrega dado pleno sem permissão; exportação sempre com finalidade e auditoria; compilador de segmentos rejeitando campos fora do catálogo; contagem performática no volume de projeto; estados "aguardando telemetria" e "não derivado" presentes — nunca número inventado; zero dado real de PF em qualquer arquivo do repositório; suíte completa das fases anteriores verde.

## Mensagem para abrir a sessão (colar como está)

Verifique os anexos novos do cabeçalho de `docs/especificacao/prompt-claude-code-onda5.md`; confirme que a F3 está mergeada — se não estiver, pare e reporte. Esta fase pode rodar em paralelo às demais trilhas; coordene pela main. Leia o `CLAUDE.md`, este prompt e a ficha da Onda 5. Apresente o plano da F11 em até 10 linhas e **aguarde aprovação antes de escrever qualquer arquivo**. Execute na branch `f11-assinantes`, commits pequenos; antes do pull request, rebase da main com conflitos resolvidos na sessão (atenção à ordem de migrations e ao `CLAUDE.md`). Encerre com o PR aberto — **sem mergear e sem iniciar outra fase**.
