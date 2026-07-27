#!/usr/bin/env bash
# =====================================================================
# RN61 — teste de fumaça da imagem de produção.
# ---------------------------------------------------------------------
# Não basta a imagem construir: ela precisa SUBIR e responder. Imagem que
# constrói e não sobe não é entregável, e publicá-la é pior que não publicar
# nada — troca uma incógnita conhecida por uma falsa garantia.
#
# Sobe O CONTÊINER RECÉM-CONSTRUÍDO (nunca o servidor de desenvolvimento)
# contra um PostgreSQL descartável, e verifica o que a ficha §2 pede: a rota
# de saúde responde, a tela de entrada responde, e uma rota protegida recusa
# acesso anônimo.
#
# Uso:  scripts/fumaca-imagem.sh <imagem>
# Espera DATABASE_URL já apontando para o banco descartável, com as
# migrations aplicadas pelo caminho de deploy real (scripts/preparar-banco-deploy.mjs).
#
# `--network host` para o contêiner alcançar o PostgreSQL que o CI expõe em
# localhost, e para o curl alcançar a aplicação sem mapear porta.
# =====================================================================
set -euo pipefail

IMAGEM="${1:?uso: scripts/fumaca-imagem.sh <imagem>}"
NOME_CONTEINER="${NOME_CONTEINER:-fumaca-clube-broto}"
BASE="${BASE_URL:-http://localhost:3000}"
# Generoso de propósito: runner frio, imagem recém-carregada e primeira
# conexão do Prisma. Estourar aqui tem de significar "não subiu", não
# "subiu devagar" — falso vermelho ensina a equipe a reexecutar sem ler.
LIMITE_SEGUNDOS="${LIMITE_SEGUNDOS:-120}"

if [ -z "${DATABASE_URL:-}" ]; then
  echo "FALHA: DATABASE_URL não definida — o teste de fumaça precisa do banco descartável." >&2
  exit 1
fi

falhas=0

encerrar() {
  local saida=$?
  if [ "$saida" -ne 0 ]; then
    echo "--- log do contêiner (últimas 50 linhas) ---" >&2
    # `>&2 2>&1` nesta ordem: primeiro a saída vai para o erro, depois o erro
    # segue a saída já redirecionada. Invertido (`2>&1 >&2`) os dois trocam de
    # lugar em vez de convergirem — e o log do Next, que sai pelo erro, iria
    # parar na saída padrão.
    docker logs --tail 50 "$NOME_CONTEINER" >&2 2>&1 || true
  fi
  docker rm -f "$NOME_CONTEINER" >/dev/null 2>&1 || true
  return $saida
}
trap encerrar EXIT

verificar() {
  local descricao="$1" esperado="$2" obtido="$3"
  if [ "$obtido" = "$esperado" ]; then
    echo "ok    $descricao (${obtido})"
  else
    echo "FALHA $descricao — esperado ${esperado}, obtido ${obtido}" >&2
    falhas=$((falhas + 1))
  fi
}

codigo() { curl -sS -o /dev/null -w "%{http_code}" --noproxy '*' "$@"; }
corpo() { curl -sS --noproxy '*' "$@"; }
# Na espera, recusa de conexão é o estado ESPERADO enquanto a aplicação sobe:
# deixar o curl reclamar encheria o log de "erro" que não é erro, e log que
# grita o tempo todo é log que ninguém lê quando a falha for de verdade.
codigo_calado() { curl -s -o /dev/null -w "%{http_code}" --noproxy '*' "$@" 2>/dev/null || true; }

# ---------------------------------------------------------------------
# 1. A plataforma gravada na imagem — a correção do Dockerfile fica provada
#    pela esteira, não por inspeção manual de quem construiu.
# ---------------------------------------------------------------------
echo "== engine do Prisma gravado na imagem =="
engines=$(docker run --rm --entrypoint sh "$IMAGEM" -c \
  'find /app/node_modules -name "libquery_engine-*.so.node" -printf "%f\n" 2>/dev/null' || true)
echo "${engines:-<nenhum>}"
case "$engines" in
  *debian-openssl-1.1.x*)
    echo "FALHA a imagem carrega o engine openssl-1.1.x — a libssl do sistema" \
         "não foi detectada no \`prisma generate\` (ver Dockerfile, estágio de dependências)." >&2
    falhas=$((falhas + 1))
    ;;
  *debian-openssl-3.0.x*)
    echo "ok    engine coerente com o Debian bookworm da imagem"
    ;;
  *)
    echo "FALHA nenhum engine do Prisma encontrado na imagem — o standalone não o levou." >&2
    falhas=$((falhas + 1))
    ;;
esac

# ---------------------------------------------------------------------
# 2. Subir o contêiner com as variáveis mínimas, descartáveis.
# ---------------------------------------------------------------------
echo "== subindo o contêiner =="
docker rm -f "$NOME_CONTEINER" >/dev/null 2>&1 || true
docker run -d --name "$NOME_CONTEINER" --network host \
  -e DATABASE_URL="$DATABASE_URL" \
  -e AUTH_SECRET="$(openssl rand -base64 32)" \
  -e AUTH_URL="$BASE" \
  -e AUTH_TRUST_HOST=true \
  -e CPF_HASH_KEY="$(openssl rand -base64 32)" \
  -e APP_ENCRYPTION_KEY="$(openssl rand -base64 32)" \
  "$IMAGEM" >/dev/null

# ---------------------------------------------------------------------
# 3. Aguardar a PRONTIDÃO — não o "vivo". Esperar pelo nível que não toca o
#    banco daria por boa uma aplicação de pé sem banco algum, que é
#    exatamente o estado que a rota de prontidão existe para denunciar.
# ---------------------------------------------------------------------
echo "== aguardando /api/saude/pronto (limite: ${LIMITE_SEGUNDOS}s) =="
pronto=nao
for segundo in $(seq 1 "$LIMITE_SEGUNDOS"); do
  if [ "$(codigo_calado "$BASE/api/saude/pronto")" = "200" ]; then
    echo "ok    prontidão em ${segundo}s"
    pronto=sim
    break
  fi
  # Contêiner que morreu não fica pronto nunca: falhar já, com o log.
  if [ -z "$(docker ps -q --filter "name=^${NOME_CONTEINER}$")" ]; then
    echo "FALHA o contêiner encerrou antes de ficar pronto." >&2
    exit 1
  fi
  sleep 1
done

if [ "$pronto" != "sim" ]; then
  echo "FALHA a rota de prontidão não respondeu em ${LIMITE_SEGUNDOS}s." >&2
  exit 1
fi

# ---------------------------------------------------------------------
# 4. O que a ficha §2 exige que esteja de pé.
# ---------------------------------------------------------------------
echo "== verificações =="
verificar "rota de saúde (vivo)" "200" "$(codigo "$BASE/api/saude")"
verificar "corpo do nível vivo" '{"estado":"vivo"}' "$(corpo "$BASE/api/saude")"
verificar "corpo do nível pronto" '{"estado":"pronto"}' "$(corpo "$BASE/api/saude/pronto")"
verificar "tela de entrada" "200" "$(codigo "$BASE/entrar")"

# Rota protegida com acesso anônimo: o que importa é NÃO ser 200. O
# comportamento que a aplicação já tem é o 307 para /entrar (middleware);
# 401 e 403 também servem, e o teste aceita os três para não travar numa
# escolha que é do gate de autenticação, não desta esteira.
protegida=$(codigo "$BASE/aliados")
case "$protegida" in
  307|302|401|403) echo "ok    rota protegida recusa anônimo (${protegida})" ;;
  *)
    echo "FALHA rota protegida devolveu ${protegida} a acesso anônimo — esperado 307, 401 ou 403." >&2
    falhas=$((falhas + 1))
    ;;
esac

if [ "$falhas" -ne 0 ]; then
  echo "== teste de fumaça REPROVOU (${falhas} falha[s]) — a imagem não será publicada. ==" >&2
  exit 1
fi

echo "== teste de fumaça aprovado: a imagem sobe e responde. =="
