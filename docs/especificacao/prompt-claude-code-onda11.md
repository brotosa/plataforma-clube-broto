# Prompt para o Claude Code — Onda 11: Esteira de imagem e prontidão para implantação · Fase F18

> **Mesmo repositório.** Pré-requisito: **F1–F17 mergeadas na main** (verifique e reporte se algo faltar). Fase de **infraestrutura de entrega**: sem tela, sem regra de negócio, sem migration. O produto está em produção — nada aqui pode alterar comportamento da aplicação, exceto a rota de saúde, que é adição. Anexo: `docs/especificacao/ficha-onda11-esteira-imagem.md` deve estar na main.

**Primeira tarefa (commit próprio de docs):** atualizar o `CLAUDE.md` — ficha da Onda 11 nas fontes da verdade, F18 no mapa de fases, RN61 entre as regras.

## 1. Rota de saúde

Criar rota pública de verificação, **fora do grupo autenticado**, que responda em dois níveis:

- **vivo** — o processo responde; sem tocar o banco.
- **pronto** — alcança o banco com uma consulta trivial (`SELECT 1` ou equivalente); falha com código de erro adequado quando não alcança.

**Não revela nada:** sem versão de dependência, sem nome de banco, sem contagem de registro, sem detalhe de ambiente. Corpo mínimo. Sem cache. **Não registra em auditoria** (é chamada a cada poucos segundos por balanceador; poluiria a trilha). Teste cobrindo os dois níveis e a ausência de vazamento no corpo da resposta.

## 2. Esteira de imagem

Acrescentar ao CI existente (`.github/workflows/ci.yml`, que hoje tem dois jobs) um **terceiro job** — não altere os dois atuais.

**Em pull request:** constrói a imagem e **não publica**. Falha de build reprova o PR.

**Em push na main:** constrói, roda o teste de fumaça e, passando, **publica no GHCR** (`ghcr.io/<dono>/<repo>`) usando o token nativo do GitHub Actions — sem segredo novo a provisionar. Etiquetas: **versão do `package.json`**, **sha curto do commit** e **`latest`**. Plataforma `linux/amd64`; se `arm64` sair barato com cache, inclua e declare no PR — se encarecer o tempo do job, deixe fora e registre a decisão.

**Cache de camadas** entre execuções para o job não virar gargalo do CI.

## 3. Teste de fumaça — o requisito central (RN61)

Contra um **PostgreSQL de serviço descartável** (o CI já usa esse padrão no segundo job; reaproveite a configuração):

1. Aplicar migrations pelo caminho de deploy real — o mesmo `scripts/preparar-banco-deploy.mjs`, não um atalho.
2. Subir **o contêiner recém-construído** (não o servidor de desenvolvimento), com as variáveis mínimas: banco, segredo de sessão, URL e as duas chaves criptográficas — geradas na hora, descartáveis.
3. Aguardar a rota **pronto** responder, com tempo limite generoso e falha explícita se estourar.
4. Verificar: a rota de saúde responde; a **tela de entrada** responde; uma **rota protegida recusa acesso anônimo** (redirecionamento ou 401/403 — o comportamento que a aplicação já tem).
5. Derrubar o contêiner e reportar o resultado.

**Se qualquer passo falhar, não publica.** Imagem que constrói mas não sobe não é entregável.

> **Este job vai rodar o `docker build` pela primeira vez na história do projeto.** É esperado que ele falhe nas primeiras tentativas — caminhos do standalone, arquivos ausentes no estágio final, permissões do usuário não-root, ou o `prisma generate` não alcançado. **Corrija o `Dockerfile`**, não o teste; e registre no PR **cada ajuste que precisou fazer**, porque é exatamente o conhecimento que a TI teria de descobrir sozinha na hora da implantação.

## 4. Documentação de operação

README ganha a seção **"Executando a imagem"**, escrita para quem vai implantar e não conhece o projeto: como obter a imagem publicada e escolher a etiqueta; a **lista completa das variáveis obrigatórias** com o que cada uma é (e o aviso de que as duas chaves criptográficas são permanentes); como rodar migrations como **passo separado do start** e por quê; como agendar o job diário; e como verificar que subiu, usando a rota de saúde. **Comandos literais, prontos para colar** — sem "configure adequadamente".

Atualizar também o `docs/handoff-ti-implantacao.md`, se estiver no repositório: a pendência "a imagem nunca foi construída" deixa de existir e vira "imagem publicada em cada merge; consumir a etiqueta da versão".

## 5. Qualidade e encerramento

Testes da rota de saúde (vivo, pronto, banco indisponível, ausência de vazamento). **Suíte F1–F17 integralmente verde** — esta fase não pode mexer em comportamento de aplicação. O job novo precisa **passar de verdade no CI do próprio PR**: build verde e, no PR, sem publicação. README e handoff atualizados. Se algum ajuste no `Dockerfile` alterar o que a imagem contém, declare no PR o que mudou e por quê.

## Mensagem para abrir a sessão (colar como está)

Verifique que **F1–F17 estão mergeadas na main** — se algo faltar, pare e reporte. Confirme a ficha da Onda 11 em `docs/especificacao/`. Leia o `CLAUDE.md`, o prompt `docs/especificacao/prompt-claude-code-onda11.md` e a ficha da Onda 11, nesta ordem. Esta é fase de **infraestrutura de entrega**: sem tela, sem regra de negócio, sem migration — a única adição à aplicação é a rota de saúde. O `docker build` **nunca foi executado neste projeto**; espere ajustes no `Dockerfile` e registre cada um no PR. Apresente o plano da F18 em até 10 linhas e **aguarde minha aprovação antes de escrever qualquer arquivo**. Execute na branch provisionada (título do PR: "F18 — Esteira de imagem e prontidão para implantação"), commits pequenos; rebase da main antes do PR. Encerre com o PR aberto — **sem mergear**.
