# =====================================================================
# Plataforma de Administração do Clube Broto — imagem de produção
# ---------------------------------------------------------------------
# Multi-stage: dependências → build (standalone) → runtime enxuto.
# Alvo declarado no prompt da Onda 1: ECS Fargate ou App Runner.
#
# O build usa `BUILD_STANDALONE=true` porque `output: "standalone"` só é
# ligado para o deploy containerizado (na Vercel ele quebra o mapeamento
# de rotas — ver next.config.ts).
#
# Migrations NÃO rodam no start do contêiner: `prisma migrate deploy` é
# passo de deploy (task/job separado), para que várias instâncias subindo
# em paralelo não disputem o schema. Ver README.md § Deploy.
# =====================================================================

ARG NODE_VERSAO=22
# Espelho público da AWS, não Docker Hub: o CodeBuild roda atrás de um NAT
# compartilhado por várias contas, e o limite de pull anônimo do Docker Hub
# (429 Too Many Requests) é por IP, não por conta — o build passou a falhar
# de forma persistente, não esporádica. O `public.ecr.aws` espelha as
# mesmas imagens oficiais, sem esse limite.
ARG REGISTRO_BASE=public.ecr.aws/docker/library

# ---------------------------------------------------------------------
# 1. Dependências — cache estável: só muda quando os manifestos mudam.
# ---------------------------------------------------------------------
FROM ${REGISTRO_BASE}/node:${NODE_VERSAO}-bookworm-slim AS dependencias
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

# OpenSSL ANTES do install — o postinstall roda `prisma generate`, e é a
# libssl do sistema que o Prisma inspeciona para escolher qual engine gravar.
# A imagem slim vem SEM ela: medido na F18, a imagem saía com
# `libquery_engine-debian-openssl-1.1.x` num Debian bookworm, que é
# OpenSSL 3.x, e o Prisma avisava a cada start que "may not work as expected".
# O engine liga OpenSSL estaticamente (verificado com `ldd`: nenhuma
# dependência de libssl), então o 1.1.x até funcionava — o defeito é a
# plataforma errada gravada na imagem e o aviso permanente em log de
# produção, que manda a TI investigar o que não é problema.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app

# O postinstall roda `prisma generate`, então o schema precisa estar aqui.
COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile

# ---------------------------------------------------------------------
# 2. Build — gera o servidor standalone.
# ---------------------------------------------------------------------
FROM ${REGISTRO_BASE}/node:${NODE_VERSAO}-bookworm-slim AS construcao
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app

COPY --from=dependencias /app/node_modules ./node_modules
COPY . .

ENV BUILD_STANDALONE=true
ENV NEXT_TELEMETRY_DISABLED=1
# O build do Next não conecta ao banco; o valor existe só para satisfazer a
# leitura do schema pelo Prisma Client. Em execução vem do ambiente real.
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build?schema=public
RUN pnpm build

# ---------------------------------------------------------------------
# 3. Runtime — imagem final sem toolchain de build, usuário sem root.
# ---------------------------------------------------------------------
FROM ${REGISTRO_BASE}/node:${NODE_VERSAO}-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Duas coisas distintas, do lado de quem executa. `openssl` porque o cliente
# refaz a mesma inspeção no start para escolher qual engine carregar — sem
# ela, o aviso volta mesmo com o engine certo gravado. `ca-certificates`
# porque a imagem slim não traz `/etc/ssl/certs/ca-certificates.crt`
# (verificado na F18): o Node tem as raízes dele compiladas, mas o OpenSSL
# embutido no engine do Prisma lê o armazenamento do sistema, e é ele que
# valida o certificado do PostgreSQL. Com RDS exigindo TLS, a ausência
# aparece na implantação — nunca aqui. Como root, antes do USER node.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# `node` já existe na imagem oficial (uid 1000) — não criamos usuário novo.
USER node

# O standalone traz o servidor e apenas as dependências que ele usa; static/
# e public/ entram à parte, como manda a documentação do Next.
COPY --from=construcao --chown=node:node /app/.next/standalone ./
COPY --from=construcao --chown=node:node /app/.next/static ./.next/static
COPY --from=construcao --chown=node:node /app/public ./public
# A carga inicial lê as planilhas reais em runtime, por `process.cwd()/dados`
# (infra/casos-de-uso/carga-inicial.ts). O rastreamento do Next já costuma
# levá-las para o standalone; a cópia explícita garante que a funcionalidade
# não dependa de uma heurística do bundler.
COPY --from=construcao --chown=node:node /app/dados ./dados
# Mesma razão para o conteúdo do Guia da Plataforma (Onda 9): a rota /ajuda
# lê `conteudo/guia-plataforma` por `process.cwd()`, e o guia é fonte única
# — sem a cópia, a ajuda ficaria vazia justamente na imagem de produção.
COPY --from=construcao --chown=node:node /app/conteudo ./conteudo
# Mesma razão de novo, e faltou até esta correção: o dossiê assistido
# (Onda 2, F8) lê docs/especificacao/prompt-dossie-due-diligence.md em
# runtime por `process.cwd()` (infra/dossie/template.ts) — de propósito,
# para registrar em cada dossiê exatamente qual versão do template gerou o
# prompt. Sem a cópia, T11 quebrava com ENOENT em produção (achado em uso
# real, não na fumaça — o smoke test não abre a tela do dossiê). Só
# `especificacao/`, não `docs/` inteiro: o resto (referências, prompts das
# fases) não é lido por nada em runtime e só infla a imagem.
COPY --from=construcao --chown=node:node /app/docs/especificacao ./docs/especificacao

EXPOSE 3000

# Sem shell: o processo do Node é o PID 1 e recebe SIGTERM direto do
# orquestrador (encerramento limpo no ECS/App Runner).
CMD ["node", "server.js"]
