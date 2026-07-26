# Prompt para o Claude Code — Onda 9: Ajuda contextual e rótulo institucional · Fase F16

> **Mesmo repositório.** Pré-requisito: **F1–F15 mergeadas na main** (verifique e reporte se algo faltar). Produto **em produção com base povoada** — nenhuma regressão é aceitável. Anexos: `docs/especificacao/ficha-onda9-ajuda-contextual.md` deve estar na main; o **protótipo `Plataforma_Broto_-_Prototipo_v10.1.html` chega anexado a esta mensagem** (a rota de ajuda já está implementada nele, com o mapa contextual e a volta identificada — é a referência de comportamento) e o **`Guia da Plataforma.html`** também vai anexado (o mesmo conteúdo fora do shell). Commite os dois em `docs/referencias/` no primeiro commit.

**Primeira tarefa (commit próprio de docs):** atualizar o `CLAUDE.md` — referência visual v10.1 vigente (v9.1 vira histórico), ficha da Onda 9 nas fontes da verdade, F16 no mapa de fases, RN58–RN59 entre as regras.

## 1. Rota de ajuda (T31, RN58)

Criar `/ajuda` **dentro do shell da plataforma** — não modal, não gaveta, não link externo (o racional está na ficha §1.1 e vale como decisão fechada). Rota **sem exigência de permissão**, acessível a todos os papéis; nenhum dado da operação é lido ou exibido.

**Fonte única, e isto é o requisito estrutural da fase (ficha §1.6):** o conteúdo do guia vive em **um** artefato do repositório, consumido tanto pela rota quanto pelo documento autônomo. Proponha no plano como fará isso — arquivo de conteúdo único renderizado nos dois destinos, ou geração do autônomo a partir da mesma fonte. **Duas cópias do texto é defeito**, não atalho: elas divergem na primeira correção.

**Transcrição fiel:** as 12 seções do guia (`oquee`, `vocab`, `princ`, `j1`–`j6`, `papeis`, `faltam`, `glossario`), com os mesmos identificadores de âncora do protótipo, para que `/ajuda#j4` funcione. **O texto é imutável** — não reescreva, não resuma, não acrescente exemplo. Divergência de uma frase é regressão.

## 2. Acesso e contexto (RN59)

**Botão "?" no cabeçalho, à esquerda do sino**, com rótulo acessível "Ajuda — abrir o guia da plataforma". O clique leva à seção correspondente ao módulo atual, conforme o **mapa da ficha §1.3** — que deve viver em **uma constante nomeada**, não espalhado em condicionais. Módulo sem mapeamento abre na seção de abertura; **nunca erro, nunca tela vazia**.

**Volta identificada:** barra no topo com "← Voltar para {módulo}", devolvendo à **tela exata de origem**. Sem origem conhecida (URL digitada, favorito), a barra não aparece — não invente destino.

**Atenção ao defeito conhecido do projeto:** o `CLAUDE.md` registra que **navegação que altera apenas a query string** pode não re-renderizar página que lê `searchParams` no servidor (hipótese: Router Cache do cliente; contorno vigente: âncora nativa). Se o contexto da ajuda viajar por query, aplique a convenção registrada e cubra com teste; se viajar por caminho ou âncora, o problema não se aplica — declare no PR qual caminho escolheu e por quê.

## 3. Apresentação (replicar do protótipo, não reinventar)

Camada de leitura **escopada** — corpo 16px/1,7, medida de ~68ch — que **não vaza** para o resto da plataforma: os tokens do produto continuam valendo em todas as outras telas; garanta isso com teste ou com escopo de classe verificável. Blocos de destaque (nota, atenção, trava) distinguíveis por **ícone, rótulo e estilo de régua**, nunca só por cor. Tabelas no padrão `tbl-resp`, com rótulo de coluna por célula a 380px. Linha do tempo das jornadas com o número do passo acima do título em telas estreitas. Sumário no mobile fechado por padrão. **Âncora rola no container certo** — dentro do shell a rolagem acontece no `<main>`, não na janela; posicione a seção nesse container com folga. **Seção ativa no sumário** recalculada no scroll do container rolável, marcada por **peso e régua**, não apenas cor. **AAA integral:** nenhum texto em cinza claro; rótulos de grupo e setas de fluxo usam o token de parágrafo AAA.

Extensões novas de CSS vão **apenas** no `design/dseed-admin.css` do repositório (canônico — parta dele, preserve os blocos "PATCH DO REPO"), no padrão de comentários. `tokens.css` intocado.

## 4. Rótulo institucional (ficha §2)

Substituir o descritivo da barra lateral por **"Plataforma de gestão do Clube"**; onde o rótulo aparece com o nome completo — tela de login (`app/entrar/page.tsx`) e os dois campos de metadados de `app/layout.tsx` — usar **"Plataforma de gestão do Clube Broto"**. Atualizar o e2e que afirma o texto na lateral. **Não** alterar `README.md`, `CLAUDE.md`, o cabeçalho do `KitAdapter` nem os documentos de especificação: ali o nome formal do sistema permanece. Garantir **quebra de linha controlada** (sem palavra órfã, sem estouro) na lateral expandida, recolhida e a 380px, e conferir contraste AAA sobre o azul.

## 5. Qualidade e encerramento

Testes de RN58 (rota acessível a todos os papéis, sem leitura de dado operacional) e RN59 (contexto abre na seção certa para cada módulo do mapa; módulo desconhecido abre na abertura; volta devolve à origem; sem origem, sem barra). Teste de **integridade do conteúdo** — as 12 seções presentes com suas âncoras, e o texto idêntico à fonte. Teste provando que **a camada de leitura não vaza** para outras telas. E2e: abrir a ajuda de três módulos diferentes e verificar a seção de destino; navegar entre seções pelo sumário; voltar à origem; `/ajuda#j4` direto. Axe AAA limpo e 380px na rota nova; suíte **F1–F15 integralmente verde**. README com a seção do guia e a nota de fonte única.

## Mensagem para abrir a sessão (colar como está, anexando o v10.1 e o Guia da Plataforma)

Verifique que **F1–F15 estão mergeadas na main** — se algo faltar, pare e reporte. Confirme a ficha da Onda 9 em `docs/especificacao/`; o protótipo **v10.1** e o **Guia da Plataforma** estão anexados a esta mensagem — commite os dois em `docs/referencias/` no primeiro commit. Leia o `CLAUDE.md`, o prompt `docs/especificacao/prompt-claude-code-onda9.md` e a ficha da Onda 9, nesta ordem. Atenção: o produto está **em produção com base povoada**; o **texto do guia é imutável** (transcrever, nunca reescrever) e o conteúdo deve ter **fonte única** para a rota e para o documento autônomo. Apresente o plano da F16 em até 10 linhas e **aguarde minha aprovação antes de escrever qualquer arquivo**. Execute na branch provisionada (título do PR: "F16 — Ajuda contextual e rótulo institucional"), commits pequenos; rebase da main antes do PR. Encerre com o PR aberto — **sem mergear**.
