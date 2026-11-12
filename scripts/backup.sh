#!/usr/bin/env bash
# Copia de seguridad COMPLETA (base de datos + archivos subidos) del servidor.
# Uso manual:   bash scripts/backup.sh
# Automático:   crontab -e   y agregar (todos los días a las 3:30 a. m.):
#   30 3 * * * /var/www/microtrabajo-app/scripts/backup.sh >> /root/backups/backup.log 2>&1
# Opcional: copiar a otro servidor o a un almacenamiento externo (indispensable: una copia en el mismo disco no protege de un fallo del disco):
#   REMOTE="usuario@otro-servidor:/ruta/backups/" bash scripts/backup.sh
set -euo pipefail
APP_DIR="${APP_DIR:-/var/www/microtrabajo-app}"
DEST="${DEST:-/root/backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"
mkdir -p "$DEST"
STAMP=$(date +%F_%H%M)
FILE="$DEST/haganapp-$STAMP.tar.gz"
# La base se copia con una instantánea consistente (no se copia el archivo en uso).
SNAP=$(mktemp -d)
node -e "
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync(process.argv[1] + '/data/microtrabajo.db');
db.exec(\"VACUUM INTO '\" + process.argv[2] + \"/microtrabajo.db'\");
" "$APP_DIR" "$SNAP"
tar -czf "$FILE" -C "$SNAP" microtrabajo.db -C "$APP_DIR/data" --exclude=backups --exclude='microtrabajo.db*' .
rm -rf "$SNAP"
find "$DEST" -name 'haganapp-*.tar.gz' -mtime +"$KEEP_DAYS" -delete
if [ -n "${REMOTE:-}" ]; then scp -q "$FILE" "$REMOTE"; fi
echo "$(date '+%F %T') copia creada: $FILE ($(du -h "$FILE" | cut -f1))"
