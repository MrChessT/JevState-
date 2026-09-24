#!/usr/bin/env bash
# Migraciones + tests pgTAP en un Postgres local (sin Docker ni Supabase CLI).
# Requisitos: postgresql-16 con postgis-3 y pgtap (pg_prove). Crea una base temporal y la borra.
set -euo pipefail
cd "$(dirname "$0")/.."
DB="inmo_test_$$"
export PGOPTIONS="-c client_min_messages=warning"
PSQL=(psql -v ON_ERROR_STOP=1 -q -X)
if [ "$(id -u)" = "0" ] && id postgres >/dev/null 2>&1; then AS=(sudo -E -u postgres); else AS=(); fi
cleanup() { "${AS[@]}" dropdb --if-exists "$DB" >/dev/null 2>&1 || true; }
trap cleanup EXIT
"${AS[@]}" createdb "$DB"
"${AS[@]}" "${PSQL[@]}" -d "$DB" -f supabase/local/shim.sql >/dev/null
for f in supabase/migrations/*.sql; do
  echo "migración $(basename "$f")"
  "${AS[@]}" "${PSQL[@]}" -d "$DB" -f "$f" >/dev/null
done
# Las migraciones deben poder repetirse sin error.
for f in supabase/migrations/*.sql; do "${AS[@]}" "${PSQL[@]}" -d "$DB" -f "$f" >/dev/null; done
echo "migraciones repetibles: ok"
"${AS[@]}" "${PSQL[@]}" -d "$DB" -c "create extension if not exists pgtap with schema extensions" >/dev/null
"${AS[@]}" pg_prove -d "$DB" --ext .sql -r supabase/tests
