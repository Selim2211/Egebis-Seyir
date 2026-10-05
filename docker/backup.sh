#!/bin/sh
# Günlük yedek (ADR-028): veritabanı dökümü + yüklenen dosyalar. BACKUP_KEEP_DAYS günden eskiler silinir.
# backup servisi bu betiği sürekli çalıştırır; elle anlık yedek için:
#   docker compose exec backup /backup.sh once
set -eu

KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
HOUR="${BACKUP_HOUR:-3}"
DIR=/backups

run_backup() {
  stamp=$(date +%Y%m%d-%H%M%S)
  echo "[backup] $stamp başlıyor"
  pg_dump --format=custom --no-owner --file="$DIR/db-$stamp.dump"
  if [ -d /data/uploads ]; then
    tar -czf "$DIR/uploads-$stamp.tar.gz" -C /data uploads
  fi
  find "$DIR" -type f \( -name 'db-*.dump' -o -name 'uploads-*.tar.gz' \) -mtime +"$KEEP_DAYS" -delete
  echo "[backup] $stamp tamam"
}

if [ "${1:-}" = "once" ]; then
  run_backup
  exit 0
fi

strip() { echo "$1" | sed 's/^0*//;s/^$/0/'; }

# Her gün HOUR:00'da (konteyner saat dilimi TZ ile).
while true; do
  now=$(( $(strip "$(date +%H)") * 3600 + $(strip "$(date +%M)") * 60 + $(strip "$(date +%S)") ))
  wait=$(( HOUR * 3600 - now ))
  [ "$wait" -le 0 ] && wait=$(( wait + 86400 ))
  echo "[backup] sonraki yedek $wait sn sonra"
  sleep "$wait"
  run_backup || echo "[backup] HATA: yedek alınamadı"
done
