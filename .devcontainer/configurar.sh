#!/usr/bin/env bash
# Configuração única do Codespace/devcontainer (postCreateCommand):
# pnpm, .env com segredo gerado, dependências, migrations e seed.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "── Plataforma Clube Broto · configuração do ambiente ──"

if ! command -v pnpm >/dev/null 2>&1; then
  echo "Instalando pnpm…"
  sudo npm install -g pnpm@10
fi

if [ ! -f .env ]; then
  echo "Gerando .env (AUTH_SECRET aleatório)…"
  {
    echo "DATABASE_URL=\"${DATABASE_URL:-postgresql://broto:broto@db:5432/clube_broto?schema=public}\""
    echo "AUTH_SECRET=\"$(openssl rand -base64 32)\""
    # Sem AUTH_URL fixa: com AUTH_TRUST_HOST o Auth.js usa o host da
    # requisição, o que funciona no localhost e na URL do Codespaces.
    echo "AUTH_TRUST_HOST=\"true\""
  } > .env
fi

echo "Instalando dependências…"
pnpm install

echo "Aguardando o PostgreSQL e aplicando migrations…"
for tentativa in $(seq 1 30); do
  if pnpm exec prisma migrate deploy >/dev/null 2>&1; then
    break
  fi
  sleep 2
done
pnpm exec prisma migrate deploy

echo "Seed (taxonomias, regras RN06 e usuários de desenvolvimento)…"
pnpm db:seed

echo "── Ambiente pronto. O servidor sobe sozinho na porta 3000. ──"
