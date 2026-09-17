#!/usr/bin/env bash
# Sobe (ou reseta) o Supabase local em Docker e aplica o schema completo do
# projeto, sem tocar em produção.
#
# Por que não usar `supabase db reset` puro: o histórico de migrations tem
# vários arquivos datados só por dia (ex.: três em 20250202, nove em
# 20260220) que colidem na PK de tracking do CLI — em produção eles nunca
# passaram pelo CLI, foram colados manualmente no SQL Editor. Este script
# aplica os .sql direto via psql, na ordem cronológica real, incluindo
# supabase/migrations/_old/ (que tem peças necessárias, como a criação da
# tabela `profiles`) e corrigindo duas dependências dentro do mesmo dia.
#
# Ver docs/supabase/AMBIENTE_LOCAL.md para o guia completo.

set -euo pipefail
cd "$(dirname "$0")/.."

DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
MIGRATIONS_DIR="supabase/migrations"

# Arquivos que não são migrations de schema (scripts avulsos/um-tiro, alguns
# destrutivos) e o único arquivo de _old/ que ficou obsoleto (enum abandonado
# em favor de TEXT — ver _old/20250123_fix_tipo_servico_and_add_fotos_chave.sql).
SKIP_FILES=(
  "EXECUTAR_AGORA.sql"
  "LIMPAR_TODAS_OBRAS_E_FOTOS.sql"
  "finalizar_obra_2222222222.sql"
  "fix_admin_user.sql"
  "fix_admin_user_simple.sql"
  "20250121_add_missing_tipos_servico.sql"
)

echo "==> Subindo Supabase local (Docker)..."
npx -y supabase@2.117.0 stop --no-backup >/dev/null 2>&1 || true
npx -y supabase@2.117.0 start

echo "==> Montando ordem das migrations..."
ORDERED_FILE=$(mktemp)
python3 - "$MIGRATIONS_DIR" "$ORDERED_FILE" <<'PYEOF'
import glob, os, re, sys

migrations_dir, out_path = sys.argv[1], sys.argv[2]
skip = {
    "EXECUTAR_AGORA.sql", "LIMPAR_TODAS_OBRAS_E_FOTOS.sql",
    "finalizar_obra_2222222222.sql", "fix_admin_user.sql",
    "fix_admin_user_simple.sql", "20250121_add_missing_tipos_servico.sql",
}

files = glob.glob(os.path.join(migrations_dir, "*.sql")) + \
        glob.glob(os.path.join(migrations_dir, "_old", "*.sql"))

items = []
for f in files:
    base = os.path.basename(f)
    if base in skip:
        continue
    m = re.match(r"(\d{8})_", base)
    if not m:
        continue
    items.append((m.group(1), f))

def sortkey(item):
    date, f = item
    base = os.path.basename(f)
    # 20260220_fix_obras_rls_login_equipe.sql define get_session_role(),
    # usada por outros arquivos do mesmo dia — precisa rodar primeiro.
    if date == "20260220":
        return (date, 0 if base == "20260220_fix_obras_rls_login_equipe.sql" else 1, base)
    # 20260415_criar_tabela_servicos.sql precisa existir antes de
    # 20260415_adicionar_obra_numero_servicos.sql referenciar a tabela.
    if date == "20260415":
        return (date, 0 if base == "20260415_criar_tabela_servicos.sql" else 1, base)
    return (date, 1, base)

items.sort(key=sortkey)
with open(out_path, "w") as fh:
    for _, f in items:
        fh.write(f + "\n")
PYEOF

TOTAL=$(wc -l < "$ORDERED_FILE")
echo "==> Aplicando $TOTAL migrations..."
OK=0
FAIL=0
while IFS= read -r f; do
  if psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f "$f" >/tmp/local-db-reset-last.log 2>&1; then
    OK=$((OK+1))
  else
    FAIL=$((FAIL+1))
    echo "  FALHOU: $f"
    tail -5 /tmp/local-db-reset-last.log | sed 's/^/    /'
  fi
done < "$ORDERED_FILE"
rm -f "$ORDERED_FILE"
echo "==> Migrations: $OK aplicadas, $FAIL falharam."

if [ "$FAIL" -gt 0 ]; then
  echo "==> Atenção: houve falhas acima. Confira antes de considerar o banco pronto."
fi

echo "==> Aplicando seed de teste (admin@local.test / admin123)..."
psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f supabase/seed-local.sql

echo ""
echo "==> Pronto. Supabase local:"
echo "    API:     http://127.0.0.1:54321"
echo "    Studio:  http://127.0.0.1:54323"
echo "    DB:      $DB_URL"
echo "    Admin web: admin@local.test / admin123"
echo "    Equipe (mobile): ex. 'CNT 01' / Teccel2025"
echo ""
echo "    Para apontar o painel web pra cá: web/.env.local.dev (ver docs/supabase/AMBIENTE_LOCAL.md)"
