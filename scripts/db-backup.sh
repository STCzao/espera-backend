#!/usr/bin/env bash
# Dump comprimido de la base local a ./backups/espera-<fecha>.dump
#
# Formato custom (-Fc), no SQL plano: lo restaura pg_restore en paralelo, pesa
# menos y permite restaurar tablas sueltas. pg_dump corre DENTRO del contenedor
# para no depender de tener postgres instalado en Windows, y para que la
# version del cliente coincida siempre con la del servidor.
set -euo pipefail
cd "$(dirname "$0")/.."

[ -f .env ] || { echo "Falta .env (copialo de .env.example)." >&2; exit 1; }
set -a; . ./.env; set +a

CONTAINER=${CONTAINER:-espera-postgres}
docker inspect "$CONTAINER" >/dev/null 2>&1 || { echo "El contenedor $CONTAINER no existe. Levantalo con: docker compose up -d" >&2; exit 1; }

mkdir -p backups
OUT="backups/espera-$(date +%Y%m%d-%H%M%S).dump"

# Sin -t: con TTY asignada, Docker traduce saltos de linea y corrompe el
# dump binario al redirigirlo.
docker exec "$CONTAINER" pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc > "$OUT"

echo "Backup: $OUT ($(du -h "$OUT" | cut -f1))"
