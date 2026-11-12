#!/usr/bin/env bash
# Copia de seguridad COMPLETA (base de datos + imágenes). Uso: bash scripts/backup.sh
# Automático (todos los días 3:40 a. m.):  crontab -e  y agregar:
#   40 3 * * * /var/www/vitrina-app/scripts/backup.sh >> /root/backups/vitrina.log 2>&1
# Opcional, copiar a otro servidor:  REMOTE="usuario@otro:/ruta/" bash scripts/backup.sh
set -euo pipefail
APP_DIR="${APP_DIR:-/var/www/vitrina-app}"; DEST="${DEST:-/root/backups}"; KEEP_DAYS="${KEEP_DAYS:-14}"
mkdir -p "$DEST"; STAMP=$(date +%F_%H%M); FILE="$DEST/vitrina-$STAMP.tar.gz"; SNAP=$(mktemp -d)
node --no-warnings -e "
const { DatabaseSync } = require('node:sqlite');
new DatabaseSync(process.argv[1] + '/data/vitrina.db').exec(\"VACUUM INTO '\" + process.argv[2] + \"/vitrina.db'\");
" "$APP_DIR" "$SNAP"
tar -czf "$FILE" -C "$SNAP" vitrina.db -C "$APP_DIR/data" --exclude=backups --exclude='vitrina.db*' .
rm -rf "$SNAP"; find "$DEST" -name 'vitrina-*.tar.gz' -mtime +"$KEEP_DAYS" -delete
[ -n "${REMOTE:-}" ] && scp -q "$FILE" "$REMOTE"
echo "$(date '+%F %T') copia creada: $FILE ($(du -h "$FILE" | cut -f1))"
