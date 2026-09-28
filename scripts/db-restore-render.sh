#!/usr/bin/env bash
# Restaura un dump local en la base de Render, usando su External Database URL
# (Render Dashboard -> la base -> Connections -> External Database URL).
#
#   RENDER_DATABASE_URL='postgresql://...' ./scripts/db-restore-render.sh backups/x.dump
#
# La URL va por variable de entorno y NUNCA como argumento: los argumentos
# quedan en el historial del shell y son visibles en la lista de procesos.
#
# pg_restore corre dentro de una imagen postgres descartable, asi que no hace
# falta instalar el cliente en Windows.
set -euo pipefail

DUMP=${1:-}
[ -n "$DUMP" ] || { echo "Uso: RENDER_DATABASE_URL='...' $0 <archivo.dump>" >&2; exit 1; }
[ -f "$DUMP" ] || { echo "No existe: $DUMP" >&2; exit 1; }
[ -n "${RENDER_DATABASE_URL:-}" ] || { echo "Falta RENDER_DATABASE_URL." >&2; exit 1; }

# Se muestra solo el host, para saber contra que se apunta sin exponer la clave.
HOST=$(printf '%s' "$RENDER_DATABASE_URL" | sed -E 's#.*@([^/:]+).*#\1#')
echo "Esto REEMPLAZA el contenido de la base en: $HOST"
echo "Si es la base de produccion, hace un backup de ella primero."
read -r -p "Escribi 'si' para continuar: " ok
[ "$ok" = "si" ] || { echo "Cancelado."; exit 1; }

# --no-owner/--no-privileges: los roles locales no existen en Render.
# sslmode=require: Render rechaza conexiones externas sin TLS.
docker run --rm -i -e PGSSLMODE=require postgres:16-alpine \
  pg_restore -d "$RENDER_DATABASE_URL" --clean --if-exists --no-owner --no-privileges < "$DUMP"

echo "Restaurado en Render desde $DUMP"
