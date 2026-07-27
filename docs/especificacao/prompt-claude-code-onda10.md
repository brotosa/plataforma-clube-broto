# Prompt para o Claude Code — Onda 10: Imagem da solução e ajuste do cabeçalho · Fase F17

> **Mesmo repositório.** Pré-requisito: **F1–F16 mergeadas na main** (verifique e reporte se algo faltar). Produto **em produção com base povoada** — migrations seguras sobre dados existentes, nenhuma regressão. Anexo: `docs/especificacao/ficha-onda10-imagem-solucao.md` deve estar na main. Sem protótipo novo: a solução visual é a mesma da marca do aliado (Onda 8), já implementada; o v10.1 permanece a referência.

**Primeira tarefa (commit próprio de docs):** atualizar o `CLAUDE.md` — ficha da Onda 10 nas fontes da verdade, F17 no mapa de fases, RN60 entre as regras, e a decisão de arquitetura nomeada da ficha §3 (banco para imagem pequena e identitária; objetos para imagem numerosa e pesada).

## 1. Reaproveitamento é o requisito, não a exceção

A F15 já construiu tudo que esta fase precisa: validação de tipo real por assinatura de conteúdo, tabela binária em relação 1:1, rota de leitura com ETag pelo hash, componente de upload com troca e remoção auditadas, e o mapeador de erro que nomeia a recusa. **Generalize o que existe; não escreva um segundo caminho paralelo.** Se a validação hoje estiver acoplada à marca, extraia o núcleo comum parametrizado por limite e formatos aceitos — e prove com teste de regressão que **o comportamento da marca não mudou**.

## 2. Imagem do card da solução (RN60)

**Modelo:** tabela própria com relação **1:1 com a solução** (binário, tipo MIME, tamanho, hash, autor, data), chave primária sendo o próprio id da solução — mesmo padrão de `MarcaAliado`, **nunca coluna na solução**: o Prisma seleciona escalares por padrão e a lista de soluções passaria a carregar o binário. Migration **aditiva**; `down.sql` verificado contra banco limpo.

**Validações no servidor, antes de gravar:** **400 KB**; **PNG, JPG, WEBP** — **SVG não é aceito** nesta entidade, e a recusa nomeia o motivo; tipo real apurado pela assinatura do conteúdo, jamais pela extensão; redimensionamento no envio para a maior dimensão de uso, com o limite garantido no servidor (o cliente é conveniência, não controle).

**Campo antigo:** `imagemCardUrl` **permanece como coluna obsoleta** — deixa de ser escrita, com a leitura preferindo a imagem nova e usando a antiga como retaguarda enquanto houver valor. Registre a dívida no README com a condição objetiva de queda (nenhuma solução com valor na coluna). **Antes de mexer, procure todos os leitores** — na marca eram três, não um; se a imagem alimentar alguma régua de completude ou indicador, os números não podem mudar, e isso precisa de teste.

**Exibição:** formulário e ficha da solução; **cards de oferta**, onde a solução é apresentada; e o **kit de campanha** — o `KitAdapter` passa a incluir a imagem da solução vinculada quando existir, no mesmo padrão com que já inclui a marca, sem quebrar o manifesto e com o teste do zip determinístico atualizado. Sem imagem, mantenha o tratamento neutro atual.

## 3. Posição do botão de ajuda

Mover o botão **"?"** para a **extremidade direita** do cabeçalho, como último elemento — depois do bloco de identidade e do papel. Rótulo acessível, destino contextual e comportamento permanecem os mesmos; muda apenas a posição, e com ela a ordem de tabulação, que passa a terminar na ajuda (esperado e desejado). Atualize os testes que afirmam a posição ou a ordem de foco no cabeçalho. Verificar a 380px, com a lateral expandida e recolhida.

## 4. Qualidade e encerramento

Testes de RN60 (positivos e negativos): arquivo acima de 400 KB recusado com motivo; **SVG recusado nesta entidade** ainda que válido; tipo real divergente da extensão recusado; troca e remoção auditadas. Teste de regressão provando que **a marca do aliado (RN54) continua idêntica** após a generalização — limites, formatos aceitos, SVG ainda permitido lá. E2e: enviar imagem e vê-la na ficha da solução e no card de oferta; kit contendo a imagem quando houver. Axe AAA e 380px nas telas tocadas; suíte **F1–F16 integralmente verde**. README com a seção da imagem de solução e a dívida da coluna obsoleta.

## Mensagem para abrir a sessão (colar como está)

Verifique que **F1–F16 estão mergeadas na main** — se algo faltar, pare e reporte. Confirme a ficha da Onda 10 em `docs/especificacao/`. Leia o `CLAUDE.md`, o prompt `docs/especificacao/prompt-claude-code-onda10.md` e a ficha da Onda 10, nesta ordem. Atenção: o produto está **em produção com base povoada**; esta fase **generaliza o que a F15 construiu** para a marca do aliado — reaproveite, não duplique, e prove por teste que o comportamento da marca não mudou. Apresente o plano da F17 em até 10 linhas e **aguarde minha aprovação antes de escrever qualquer arquivo**. Execute na branch provisionada (título do PR: "F17 — Imagem da solução e ajuste do cabeçalho"), commits pequenos; rebase da main antes do PR. Encerre com o PR aberto — **sem mergear**.
