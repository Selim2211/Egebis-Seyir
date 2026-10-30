#!/usr/bin/env bash
# seyir-app: Node.js 24, Caddy (otomatik HTTPS), systemd servisi, şema aracı. Tekrar çalıştırılabilir.
# Kullanım: sudo bash app.sh <site adresi, ör. 1-2-3-4.sslip.io>
set -euo pipefail
SITE="$1"
export DEBIAN_FRONTEND=noninteractive

if ! command -v node >/dev/null || ! node -v | grep -q '^v24'; then
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
if ! command -v caddy >/dev/null; then
  apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https curl >/dev/null
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' >/etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq && apt-get install -y -qq caddy >/dev/null
fi

id seyir >/dev/null 2>&1 || useradd --system --home /opt/seyir --shell /usr/sbin/nologin seyir
mkdir -p /opt/seyir/releases /opt/seyir/migrate /var/lib/seyir/uploads /srv/seyir
chown -R seyir:seyir /var/lib/seyir

# Şema aracı (Prisma CLI) ayrı klasörde; çalışma paketine girmez.
if [ ! -x /opt/seyir/migrate/node_modules/.bin/prisma ]; then
  (cd /opt/seyir/migrate && npm init -y >/dev/null && \
   npm install --omit=dev --no-audit --no-fund prisma@7.10.0 dotenv@18 >/dev/null)
fi

cat >/etc/systemd/system/seyir-api.service <<'EOF'
[Unit]
Description=Egebis Seyir API
After=network-online.target
Wants=network-online.target

[Service]
User=seyir
WorkingDirectory=/opt/seyir/current
EnvironmentFile=/etc/seyir/api.env
ExecStart=/usr/bin/node --max-old-space-size=384 dist/main.js
Restart=always
RestartSec=5
NoNewPrivileges=true
ProtectSystem=full
ReadWritePaths=/var/lib/seyir

[Install]
WantedBy=multi-user.target
EOF

cat >/etc/caddy/Caddyfile <<EOF
# Egebis Seyir (Oracle). Ayrıntılar: docker/Caddyfile ile aynı kurallar.
$SITE {
	encode zstd gzip
	request_body {
		max_size 128MB
	}
	header {
		X-Content-Type-Options nosniff
		Referrer-Policy strict-origin-when-cross-origin
		X-Frame-Options DENY
		Permissions-Policy "camera=(), microphone=(), geolocation=()"
		-Server
	}
	handle /api/* {
		reverse_proxy 127.0.0.1:3000
	}
	handle {
		root * /srv/seyir
		@assets path /assets/*
		header @assets Cache-Control "public, max-age=31536000, immutable"
		@html not path /assets/*
		header @html Cache-Control "no-cache"
		try_files {path} /index.html
		file_server
	}
}
EOF
systemctl daemon-reload
echo "app ok: node $(node -v), $(caddy version | cut -d' ' -f1)"
