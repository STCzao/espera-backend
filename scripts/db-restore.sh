#!/usr/bin/env bash
# Restaura un dump en la base LOCAL.
#
#   ./scripts/db-restore.sh backups/espera-20260928-120000.dump
#
# --clean --if-exists borra los objetos antes de recrearlos, asi que esto
# PISA la base local. Pide confirmacion porque no se puede deshacer.
set -euo pipefail
cd "$(dirname "$0")/.."

DUMP=${1:-}
[ -n "$DUMP" ] || { echo "Uso: $0 <archivo.dump>" >&2; exit 1; }
[ -f "$DUMP" ] || { echo "No existe: $DUMP" >&2; exit 1; }
[ -f .env ] || { echo "Falta .env." >&2; exit 1; }
set -a; . ./.env; set +a

CONTAINER=${CONTAINER:-espera-postgres}

echo "Esto REEMPLAZA el contenido de '$POSTGRES_DB' en $CONTAINER."
read -r -p "Escribi 'si' para continuar: " ok
[ "$ok" = "si" ] || { echo "Cancelado."; exit 1; }

docker exec -i "$CONTAINER" pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  --clean --if-exists --no-owner --no-privileges < "$DUMP"

echo "Restaurado desde $DUMP"
