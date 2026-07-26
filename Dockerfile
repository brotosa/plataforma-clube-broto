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

# ---------------------------------------------------------------------
# 1. Dependências — cache estável: só muda quando os manifestos mudam.
# ---------------------------------------------------------------------
FROM node:${NODE_VERSAO}-bookworm-slim AS dependencias
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app

# O postinstall roda `prisma generate`, então o schema precisa estar aqui.
COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile

# ---------------------------------------------------------------------
# 2. Build — gera o servidor standalone.
# ---------------------------------------------------------------------
FROM node:${NODE_VERSAO}-bookworm-slim AS construcao
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
FROM node:${NODE_VERSAO}-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

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

EXPOSE 3000

# Sem shell: o processo do Node é o PID 1 e recebe SIGTERM direto do
# orquestrador (encerramento limpo no ECS/App Runner).
CMD ["node", "server.js"]
