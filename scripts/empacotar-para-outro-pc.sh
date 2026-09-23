#!/usr/bin/env bash
#
# Gera um ZIP do projeto pronto para rodar em OUTRO PC apontando para PRODUÇÃO.
#
# - NÃO altera a config desta máquina (seus .env locais continuam apontando pro
#   Supabase local/Docker, ver docs/supabase/AMBIENTE_LOCAL.md).
# - Cria uma cópia temporária, sobrescreve os .env dessa cópia para produção e
#   compacta em um .zip, excluindo node_modules/.git/etc (o outro PC roda
#   `npm install` normalmente).
#
# Uso: bash scripts/empacotar-para-outro-pc.sh
#
set -euo pipefail

# Raiz do projeto = pasta pai deste script/..
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STAMP="$(date +%Y%m%d-%H%M)"
STAGE="$(mktemp -d)/teccel-obras"
OUT="$ROOT/../teccel-obras-PRODUCAO-$STAMP.zip"

# --- Credenciais de PRODUÇÃO (mesmas de web/.env.local e do fallback em mobile/lib/supabase.ts) ---
PROD_URL="https://hiuagpzaelcocyxutgdt.supabase.co"
PROD_ANON="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhpdWFncHphZWxjb2N5eHV0Z2R0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE3NDE1ODAsImV4cCI6MjA3NzMxNzU4MH0.sEp1yx9p_RGPWUIQ1bzE2aYx1YdPiKHFZJ-GnG4a-N8"

echo ">> Copiando projeto para staging (excluindo pesos)..."
mkdir -p "$STAGE"
rsync -a \
  --exclude 'node_modules/' \
  --exclude '.git/' \
  --exclude '.expo/' \
  --exclude '.next/' \
  --exclude 'dist/' \
  --exclude 'web-build/' \
  --exclude '/mobile/ios/' \
  --exclude '/mobile/android/' \
  --exclude 'supabase/.temp/' \
  --exclude '.supabase/' \
  --exclude '*.tsbuildinfo' \
  "$ROOT/" "$STAGE/"

echo ">> Reescrevendo .env da cópia para PRODUÇÃO..."

# Mobile: aponta pra produção (mantém o SENTRY_AUTH_TOKEN existente, se houver)
SENTRY_LINE="$(grep -h '^SENTRY_AUTH_TOKEN=' "$ROOT/mobile/.env.local" 2>/dev/null || true)"
{
  echo "#DO NOT COMMIT THIS"
  [ -n "$SENTRY_LINE" ] && echo "$SENTRY_LINE"
  echo ""
  echo "# PRODUÇÃO (Supabase na nuvem) — mudanças refletem no banco compartilhado."
  echo "EXPO_PUBLIC_SUPABASE_URL=$PROD_URL"
  echo "EXPO_PUBLIC_SUPABASE_ANON_KEY=$PROD_ANON"
} > "$STAGE/mobile/.env.local"

# Web: .env.local já é produção -> mantém como está.
# Remove o override de dev (.env.development.local) para que `npm run dev`
# TAMBÉM aponte pra produção no outro PC.
rm -f "$STAGE/web/.env.development.local"

echo ">> Compactando..."
( cd "$(dirname "$STAGE")" && zip -rq "$OUT" "teccel-obras" )

rm -rf "$(dirname "$STAGE")"

echo ""
echo "OK! Pacote de PRODUÇÃO gerado em:"
echo "  $OUT"
echo ""
echo "No outro PC: descompactar, e em cada app rodar 'npm install' antes de usar."
