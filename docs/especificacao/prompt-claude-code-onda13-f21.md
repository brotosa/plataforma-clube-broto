# Prompt para o Claude Code — Onda 13: Armazenamento persistente de arquivos · Fase F21

> **Mesmo repositório.** Pré-requisito: **F1–F19 mergeadas na main**. Fase **funcional com migration**, corretiva e **bloqueadora de produção**. Anexos na main: `docs/especificacao/ficha-onda13-armazenamento.md` e este prompt.
>
> **Atenção — há outra fase em execução.** A **F20 (telemetria da operadora)** corre em paralelo, em branch própria. Leia o §7 antes de planejar.

**Primeira tarefa (commit próprio de docs):** atualizar o `CLAUDE.md` — ficha da Onda 13 nas fontes da verdade, F21 no mapa de fases, **RN71** entre as regras.

## 1. A falha a consertar

A ativação de campanha não conclui: a geração do kit lê a imagem da peça (`infra/casos-de-uso/campanhas.ts:710`) e o `publico.csv` (`:920`) pelo armazenador local, que grava em `var/exportacoes/` **no disco**. Em ambiente de produção o disco é efêmero e por instância — o arquivo não está lá, a exceção sobe e a tela devolve a mensagem genérica da RN55. Reproduza a falha em teste **antes** de consertá-la.

## 2. A implementação

Nova implementação de `ArmazenadorSnapshots` guardando o conteúdo **no banco**. A porta não muda: `salvar(chave, conteudo)` e `ler(chave)` continuam com a mesma assinatura — é para isso que ela existe.

Tabela nova no padrão de `marcas_aliado`, `imagens_solucao` e `minutas_contrato`: chave única, conteúdo, tipo, tamanho, hash e momento. **Migration estritamente aditiva**, `down.sql` verificado, **nenhuma coluna existente alterada** — `imagemChave` e `arquivoChave` seguem guardando a chave.

**Migre os sete pontos de chamada**, e note que a rota de download do kit (`app/(plataforma)/campanhas/[id]/kit/[kitId]/route.ts`) instancia o armazenador local diretamente, fora dos casos de uso. Ao terminar, **nenhum caminho de produção pode escrever em disco**; acrescente uma verificação que prove isso — a mesma disciplina das cercas de arquitetura.

A implementação local pode continuar existindo para desenvolvimento e CI, se você julgar útil; se mantiver, deixe explícito onde cada uma é usada e por quê.

## 3. Chave órfã — o estado em que a base já está

`ler` numa chave sem conteúdo **falha nomeando a causa** (RN55), dizendo o que fazer: reenviar a peça, reexportar a lista, regerar o kit. Não é erro genérico e não é exceção crua. A base de demonstração tem registros nesse estado hoje — a campanha "Teste" é um deles —, e o conserto os faz falhar com clareza, **não os recupera**. Teste esse caminho.

## 4. Limites (RN71)

Imagem de peça **1 MB** (PNG, JPG, WEBP — **SVG não**, cliente de e-mail não renderiza); snapshot de exportação **25 MB**; kit **50 MB**. Recusa por excesso nomeia o artefato e o tamanho, no padrão dos perfis de arquivo que já existem. Documente no README a **condição objetiva** que traz o adapter S3: maior kit acima de 50 MB **ou** total armazenado acima de 5 GB.

## 5. Uma decisão sua, declarada no PR

A imagem da peça é gravada hoje **depois** do commit (`campanhas.ts:595`), porque o destino era o disco e não havia como participar da transação. Com o banco, pode entrar na própria transação e eliminar o estado inconsistente — linha gravada, arquivo não. Avalie e **declare o que escolheu e por quê**.

## 6. Qualidade

Testes: o caso que reproduz a falha original (ativação com peça e com público, sem conteúdo no armazenador); ida e volta de cada artefato; chave órfã com causa nomeada; cada teto recusando com mensagem própria. As suítes existentes de campanha e de exportação **continuam válidas em comportamento** — o que pode mudar nelas é apenas o mecanismo de leitura, nunca o que afirmam. **Suíte F1–F19 integralmente verde.**

Versão: suba o `package.json` para a **próxima menor disponível no momento do rebase final** — 1.2.0 se a main estiver em 1.1.0, ou 1.3.0 se a F20 já tiver mergeado. Declare no PR qual escolheu.

## 7. Protocolo de convivência com a F20

A F20 corre em paralelo e toca `schema.prisma`, a pasta de migrations, o `CLAUDE.md` e o `package.json`. **Nada de lógica se cruza** — ela vive em ingestão, consultas e telas; esta fase vive na camada de armazenamento.

Regras: **não altere nada fora do escopo desta ficha**; ao rebasear, reconcilie `schema.prisma` e `CLAUDE.md` **preservando o que a F20 escreveu**, sem reordenar nem reescrever; se um conflito exigir decidir por ela, **pare e reporte** em vez de resolver por conta própria. O carimbo da migration precisa ser posterior ao da F20, se ela já tiver mergeado.

## Mensagem para abrir a sessão (colar como está)

Verifique que **F1–F19 estão mergeadas na main** — se algo faltar, pare e reporte. Confirme a ficha da Onda 13 em `docs/especificacao/`. Leia o `CLAUDE.md`, o prompt `docs/especificacao/prompt-claude-code-onda13-f21.md` e a ficha, nesta ordem. Esta é fase **corretiva com migration** e é **bloqueadora de produção**: hoje a ativação de campanha falha porque o armazenamento de arquivos grava em disco local, que não sobrevive a ambiente de produção. **Há outra fase em execução em paralelo — a F20, telemetria da operadora** —, e o §7 do prompt traz o protocolo de convivência: não altere nada fora do escopo desta ficha, e em conflito de rebase que exija decidir pela F20, pare e reporte. Comece **reproduzindo a falha em teste**, antes de consertá-la. Apresente o plano da F21 em até 10 linhas e **aguarde minha aprovação antes de escrever qualquer arquivo**. Execute na branch provisionada (título do PR: "F21 — Armazenamento persistente de arquivos"), commits pequenos; rebase da main antes do PR. Encerre com o PR aberto — **sem mergear**.
