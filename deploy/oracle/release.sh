#!/usr/bin/env bash
# Seyir'i Oracle seyir-app sunucusuna yayınlar (yerelde derler, hazır paketi gönderir).
# 1 GB RAM'li sunucuda derleme yapılmaz; bağımlılıklar saf JavaScript olduğundan paket her platformda çalışır.
# Kullanım (depo kökünden):  bash deploy/oracle/release.sh
set -euo pipefail

HOST="${SEYIR_HOST:-140.238.174.137}"
KEY="${SEYIR_KEY:-$HOME/.ssh/ssh-key-2026-10-30.key}"
SSH="ssh -i $KEY -o BatchMode=yes ubuntu@$HOST"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="$ROOT/.release"
STAMP="$(date +%Y%m%d-%H%M%S)"

cd "$ROOT"
echo "1/5 derleniyor…"
pnpm --filter @scrum/shared build >/dev/null
DATABASE_URL=postgresql://build:build@localhost:5432/build pnpm --filter @scrum/api exec prisma generate >/dev/null
pnpm --filter @scrum/api build >/dev/null
pnpm --filter @scrum/web build >/dev/null

echo "2/5 üretim paketi hazırlanıyor…"
rm -rf "$OUT" && mkdir -p "$OUT"
pnpm --filter @scrum/api deploy --prod --legacy \
  --config.node-linker=hoisted --config.auto-install-peers=false "$OUT/api" >/dev/null
(cd "$OUT/api" \
  && find node_modules -path '*@prisma/client/runtime/*' \
       \( -name '*sqlserver*' -o -name '*cockroachdb*' -o -name '*mysql*' -o -name '*sqlite*' \) -type f -delete \
  && find node_modules dist -type f \
       \( -name '*.map' -o -name '*.d.ts' -o -name '*.d.mts' -o -name '*.d.cts' -o -name '*.md' \) -delete)
cp -r apps/api/prisma "$OUT/prisma"
cp apps/api/prisma.config.ts "$OUT/prisma.config.ts"
cp -r apps/web/dist "$OUT/web"
tar -C "$OUT" -czf "$OUT.tgz" api prisma prisma.config.ts web
echo "   paket: $(du -h "$OUT.tgz" | cut -f1)"

echo "3/5 gönderiliyor…"
scp -i "$KEY" -o BatchMode=yes -q "$OUT.tgz" "ubuntu@$HOST:/tmp/seyir-$STAMP.tgz"

echo "4/5 kuruluyor, şema güncelleniyor…"
$SSH "sudo bash -s" <<EOF
set -euo pipefail
R=/opt/seyir/releases/$STAMP
mkdir -p \$R && tar -xzf /tmp/seyir-$STAMP.tgz -C \$R && rm /tmp/seyir-$STAMP.tgz
cp -r \$R/prisma \$R/prisma.config.ts /opt/seyir/migrate/
cd /opt/seyir/migrate && set -a && . /etc/seyir/api.env && set +a && ./node_modules/.bin/prisma migrate deploy 2>&1 | tail -2
rsync -a --delete \$R/web/ /srv/seyir/
ln -sfn \$R/api /opt/seyir/current
chown -R seyir:seyir /opt/seyir/releases
systemctl enable --now seyir-api >/dev/null 2>&1; systemctl restart seyir-api
systemctl reload caddy || systemctl restart caddy
# Son 3 sürüm kalır.
ls -1dt /opt/seyir/releases/* | tail -n +4 | xargs -r rm -rf
EOF

echo "5/5 sağlık kontrolü…"
for i in $(seq 1 30); do
  if $SSH "curl -fsS http://127.0.0.1:3000/api/health" >/dev/null 2>&1; then
    echo "YAYINDA: https://${HOST//./-}.sslip.io  (sürüm $STAMP)"; rm -rf "$OUT" "$OUT.tgz"; exit 0
  fi
  sleep 3
done
echo "API sağlık kontrolünden geçmedi; günlük: sudo journalctl -u seyir-api -n 50"; exit 1
