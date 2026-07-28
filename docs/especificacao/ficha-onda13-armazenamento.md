# Ficha de Módulo — Onda 13: Armazenamento persistente de arquivos
**Plataforma de Administração e Gestão do Clube Broto** · v0.1 para validação · 27/07/2026

Fase **F21**, única da onda. Origem: falha reproduzida em uso — a ativação de campanha não conclui e a tela devolve a mensagem genérica da RN55. Continuidade: regra **RN71**. **Bloqueadora de produção.**

---

## 1. O problema

A porta `ArmazenadorSnapshots` (`infra/exportacoes/armazenador.ts`) tem uma única implementação: `criarArmazenadorLocal`, que grava em `var/exportacoes/` **no disco da máquina**. Isso serve desenvolvimento e CI e **não sobrevive a ambiente de produção**: na Vercel o sistema de arquivos é efêmero e por instância, então o arquivo gravado numa instância não existe na seguinte, nem depois de um deploy.

**Sete pontos de chamada** dependem disso, em três artefatos:

| Artefato | Prefixo da chave | Grava | Lê |
|---|---|---|---|
| Imagem da peça de campanha | `pecas/{campanhaId}/{hash}{ext}` | ao salvar a peça | ao gerar o kit |
| Snapshot do público (CSV) | `listas-contato/{data}-{id}.csv` | ao exportar e ao ativar | ao gerar o kit e ao baixar |
| Kit de execução (zip) | `kits/{campanhaId}/v{n}-{nome}` | ao ativar | ao baixar |

**A falha observada:** a ativação lê a imagem da peça e o `publico.csv` do disco; nenhum dos dois está lá; a exceção vira a mensagem genérica da RN55. A tela mostra "1 peça(s)" porque a contagem vem do banco — o registro existe, o binário não. **Sem esta fase, o módulo de campanhas não funciona em produção**, mesmo sem peça alguma.

## 2. O que a fase entrega

- **Implementação persistente da porta**, guardando o conteúdo no próprio banco — a quarta vez que a plataforma toma essa decisão, depois da marca do aliado (F15), da imagem da solução (F17) e da minuta (F19), e pelo mesmo motivo: poucos arquivos, pequenos, com consistência transacional de graça e zero dependência externa.
- **Sete pontos de chamada migrados**, incluindo a rota de download do kit, que hoje instancia o armazenador local diretamente.
- **Chave órfã falha nomeando a causa** (RN55): registro que aponta para conteúdo inexistente devolve mensagem que diz o que fazer — reenviar a peça, reexportar a lista, regerar o kit —, nunca erro genérico. É o estado em que a base de demonstração já se encontra.
- **Ativação de campanha volta a concluir**, com teste que reproduz a falha original.
- **Limites explícitos e a condição de revisão** (§4).

## 3. Fora de escopo

Adapter S3. Ele continua sendo o destino natural quando o volume justificar, e a porta existe para que entre sem tocar domínio nem telas — mas hoje ele acrescentaria bucket, credencial e dependência da TI a uma fase que bloqueia a produção. **A condição objetiva para revisitar está no §4.**

## 4. Regra

**71. RN71 — Arquivo derivado é guardado pela plataforma.** Peça de campanha, snapshot de exportação e kit de execução são gravados no banco, sob a porta `ArmazenadorSnapshots`; **nenhum caminho de produção escreve em disco local**. Chave sem conteúdo é falha nomeada (RN55), nunca erro genérico.

**Limites — e eles são a condição da decisão, no padrão da RN54:**

| Artefato | Teto | Formatos |
|---|---|---|
| Imagem de peça | **1 MB** por arquivo | PNG, JPG, WEBP |
| Snapshot de exportação | **25 MB** por arquivo | CSV |
| Kit de execução | **50 MB** por arquivo | ZIP |

**Condição objetiva para entrar o adapter S3:** o maior kit armazenado passar de 50 MB, **ou** o total guardado passar de 5 GB. Satisfeita qualquer uma, o adapter entra em fase própria — a porta não muda. Até lá, guardar no banco é a decisão defensável, e os tetos são o que a sustenta.

**SVG fica de fora** dos formatos de peça, de propósito: clientes de e-mail não o renderizam, e a peça existe para consumo externo.

## 5. Modelo

Tabela nova para o conteúdo, no padrão de `marcas_aliado`, `imagens_solucao` e `minutas_contrato`: chave (única), conteúdo, tipo, tamanho, hash e momento. **Nenhuma coluna existente muda** — `imagemChave`, `arquivoChave` e as demais continuam guardando a chave; o que muda é onde o conteúdo dela vive.

## 6. Pendências e riscos

- **Colisão com a F20**, que corre em paralelo: `schema.prisma`, pasta de migrations, `CLAUDE.md` e `package.json`. Protocolo no prompt.
- **Base de demonstração** tem registros órfãos e permanece assim — o conserto os faz falhar com clareza, não os recupera. Peça e kit da campanha "Teste" precisarão ser refeitos.
- **Gravação dentro da transação:** hoje a imagem da peça é gravada *depois* do commit, porque o destino era o disco. Com o banco, pode entrar na própria transação e eliminar o estado inconsistente. Decisão do implementador, declarada no PR.
