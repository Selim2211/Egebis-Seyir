#!/usr/bin/env bash
# seyir-db: PostgreSQL (Türkçe arama için en_US.UTF-8), yalnızca iç ağdan erişim, 1 GB RAM ayarları.
# Şifre sunucuda üretilir: /root/seyir-db.env (yalnızca root). Tekrar çalıştırılabilir.
# Kullanım: sudo bash db.sh <özel IP> <izinli CIDR>
set -euo pipefail
PRIVATE_IP="$1"
ALLOW="${2:-10.0.0.0/24}"
export DEBIAN_FRONTEND=noninteractive

locale-gen en_US.UTF-8 >/dev/null
apt-get install -y -qq postgresql postgresql-contrib >/dev/null
VER=$(ls /etc/postgresql | sort -V | tail -1)

# Varsayılan küme C.UTF-8 ile kurulur (ö, ş, ğ ILIKE'ta tanınmaz): boşsa en_US.UTF-8 ile yeniden kurulur.
if ! sudo -u postgres psql -Atc "select datcollate from pg_database where datname='template1'" | grep -q en_US; then
  pg_dropcluster --stop "$VER" main
  pg_createcluster --locale en_US.UTF-8 --encoding UTF8 "$VER" main >/dev/null
fi

CONF=/etc/postgresql/$VER/main
cat >"$CONF/conf.d/seyir.conf" <<EOF
listen_addresses = 'localhost,$PRIVATE_IP'
max_connections = 30
shared_buffers = 128MB
effective_cache_size = 384MB
work_mem = 4MB
maintenance_work_mem = 64MB
timezone = 'Europe/Istanbul'
EOF
grep -q "seyir-app" "$CONF/pg_hba.conf" || \
  echo "host scrum scrum $ALLOW scram-sha-256 # seyir-app" >>"$CONF/pg_hba.conf"
systemctl enable --now "postgresql@$VER-main" >/dev/null
systemctl restart "postgresql@$VER-main"

if [ ! -f /root/seyir-db.env ]; then
  PASS=$(openssl rand -hex 24)
  sudo -u postgres psql -q -c "CREATE ROLE scrum LOGIN PASSWORD '$PASS'"
  sudo -u postgres psql -q -c "CREATE DATABASE scrum OWNER scrum ENCODING 'UTF8' LC_COLLATE 'en_US.UTF-8' LC_CTYPE 'en_US.UTF-8' TEMPLATE template0"
  umask 077
  echo "DATABASE_URL=postgresql://scrum:$PASS@$PRIVATE_IP:5432/scrum" >/root/seyir-db.env
fi
echo "db ok: postgres $VER, collate=$(sudo -u postgres psql -Atc "select datcollate from pg_database where datname='scrum'")"
