# Prompt para o Claude Code — Onda 8: Marca do aliado, leitura de listas e falhas legíveis · Fase F15

> **Mesmo repositório.** Pré-requisito: **F1–F14 mergeadas na main** (verifique e reporte se algo faltar). O produto está **em produção com base povoada** — aliados e ofertas reais, 46 prospects, 2.000 assinantes, 597 eventos de telemetria: nenhuma regressão é aceitável e migrations precisam ser seguras sobre dados existentes. Anexo: `docs/especificacao/ficha-onda8-marca-listas-erros.md` deve estar na main. Sem protótipo novo — as telas existem; o v9.1 permanece a referência visual.

**Primeira tarefa (commit próprio de docs):** atualizar o `CLAUDE.md` — ficha da Onda 8 nas fontes da verdade e a fase F15 no mapa de fases.

## 1. Marca do aliado (RN54)

**Modelo:** tabela própria com relação **1:1** com a empresa (binário, tipo MIME, tamanho, hash do conteúdo, autor e data) — **nunca coluna na empresa**: o Prisma seleciona escalares por padrão e a lista de aliados passaria a carregar o binário em toda consulta. Migration reversível; `down.sql` verificado contra banco limpo.

**Upload:** substituir o campo de endereço S3 no formulário do aliado por envio de arquivo. Validações no servidor, antes de gravar: **200 KB**; **PNG, JPG, WEBP, SVG**; **tipo real verificado pelo conteúdo** (assinatura do arquivo), nunca pela extensão; **SVG higienizado** — remover `<script>`, manipuladores de evento, `<foreignObject>` e referências externas — ou recusar com motivo; redimensionamento no envio para a maior dimensão de uso. Troca e remoção auditadas. Recusa sempre nomeia o motivo (RN55).

**Leitura:** rota própria servindo o binário com cabeçalhos de cache e validação de permissão coerente com a do aliado; o hash do conteúdo serve de identificador de versão para o cache não servir marca antiga.

**Exibição:** ficha do aliado, **lista de aliados**, **cards do funil (T8)** e **kits de oferta e de campanha** (o `KitAdapter` passa a incluir o arquivo da marca no pacote, quando existir — sem quebrar o manifesto atual, e com teste do zip determinístico). Sem logo: placa com inicial no padrão que a lista já usa.

## 2. Listas (RN56)

**Aliados:** trocar a paginação por **rolagem contínua** (carga incremental em blocos ao descer, mantendo a consulta paginada no servidor por baixo). Preservar filtros, busca e a contagem total; foco por teclado deve continuar percorrendo os itens carregados sem armadilha; a 380px o comportamento se mantém.

**Assinantes:** **não mexer** — a paginação no servidor permanece, por decisão ratificada.

## 3. Célula "Ofertas" do painel (T26)

O destaque passa a ser o número absoluto de **ofertas ativas publicadas com resgate no período** — **mesma base da vitrine viva, mesmo serviço**, com teste provando a concordância entre os dois números. "de N ativas" desce para a nota de procedência. Sem base de cálculo, mantém traço com motivo (RN50). Regressão obrigatória do restante do panorama e dos quatro blocos.

## 4. Falhas legíveis (RN55) — a mudança mais transversal

Hoje as server actions capturam exceções e devolvem mensagem genérica com "Tente novamente", perdendo o texto do domínio. Passe a **distinguir por classe de erro**: as classes conhecidas do domínio (validação, permissão, layout de arquivo, configuração ausente, limite excedido — as que já existem no código) **propagam a própria mensagem** até a interface; qualquer outra exceção exibe mensagem genérica **sem sugerir repetição** e registra o detalhe **apenas no log do servidor**.

**Nunca** exponha à interface: rastro de pilha, caminho de arquivo, SQL, valores de variáveis de ambiente ou identificadores internos. Nomear a variável ausente é permitido e desejável ("CPF_HASH_KEY ausente no ambiente"); imprimir o valor, jamais. Aplique de forma consistente a todas as server actions — não só às importações — e cubra com teste: erro conhecido chega com a mensagem, erro inesperado chega genérico e não vaza detalhe.


## 5. Arrastar card no funil (RN57)

Acrescentar o gesto de arrastar na T8 **sem criar caminho novo de decisão**: soltar o card chama o **mesmo caso de uso** do menu, com as mesmas validações, permissões e auditoria — proibido duplicar a regra no cliente. Comportamento exigido: destino não permitido a partir da origem **não aceita** o card; **Priorizada** sem avaliação fechada recusa (RN15) e devolve à origem exibindo a mensagem da regra; **Descartada** abre o modal dos seis motivos e só conclui com um (RN17); **Em aprovação** não aceita nem cede card por arrasto (o motor governa); cartão fora da permissão do papel não é arrastável. Atualização otimista é aceitável **desde que** a recusa do servidor reverta a posição com a mensagem — nunca deixar o card no destino errado.

**Acessibilidade e toque:** o menu do card continua sendo o caminho completo e o caminho por teclado; o arrasto é adicional e **nenhuma função pode existir só nele**. Se avaliar biblioteca de arrasto, apresente o trade-off no plano — arrasto nativo sem dependência é aceitável justamente porque o teclado já tem caminho próprio. Durante o gesto, a coluna indica aceitação ou recusa antes de soltar.

**Testes:** e2e do arrasto válido (card muda de coluna e a auditoria registra), do arrasto recusado por regra (card volta e a mensagem aparece), do arrasto para Descartada (modal exigido) e regressão completa do menu — que continua sendo o caminho testado por teclado.

## 6. Qualidade e encerramento

Testes de unidade RN54–RN56 (positivos e negativos), incluindo recusa de SVG com script, arquivo acima do limite, tipo real divergente da extensão, e a concordância do número da célula Ofertas com a vitrine viva. E2e: enviar logo e vê-lo na ficha, na lista e no card do funil; rolagem contínua carregando o segundo bloco; erro conhecido exibindo mensagem útil. Axe AAA limpo e 380px nas telas tocadas; suíte **F1–F14 integralmente verde**, com regressão explícita do funil (menu, teclado e as transições com efeito colateral). README atualizado: seção da marca (limites e formatos), a convenção de mensagens de erro, e a nota de que o S3 permanece para peças de campanha.

## Mensagem para abrir a sessão (colar como está)

Verifique que **F1–F14 estão mergeadas na main** — se algo faltar, pare e reporte. Confirme a ficha da Onda 8 em `docs/especificacao/`. Leia o `CLAUDE.md`, o prompt `docs/especificacao/prompt-claude-code-onda8.md` e a ficha da Onda 8, nesta ordem. Atenção: **o produto está em produção com base povoada** (aliados e ofertas reais, 2.000 assinantes, telemetria importada) — migrations precisam ser seguras sobre dados existentes e nenhuma regressão é aceitável. Apresente o plano da F15 em até 10 linhas e **aguarde minha aprovação antes de escrever qualquer arquivo**. Execute na branch provisionada (título do PR: "F15 — Marca do aliado, listas e falhas legíveis"), commits pequenos; rebase da main antes do PR. Encerre com o PR aberto — **sem mergear**.
