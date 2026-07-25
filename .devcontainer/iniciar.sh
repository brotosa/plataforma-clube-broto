#!/usr/bin/env bash
# Sobe o servidor de desenvolvimento em segundo plano a cada inicialização
# do Codespace (postStartCommand). Log em /tmp/plataforma-dev.log.
set -u
cd "$(dirname "$0")/.."

if curl -sf -o /dev/null http://localhost:3000; then
  echo "Servidor já está no ar na porta 3000."
  exit 0
fi

echo "Iniciando o servidor de desenvolvimento (porta 3000)…"
nohup pnpm dev > /tmp/plataforma-dev.log 2>&1 &
