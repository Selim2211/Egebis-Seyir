#!/usr/bin/env bash
# Egebis Seyir yavaşlık tanısı (yönetici notları madde 9). Ofis sunucusunda, docker-compose.yml'in
# bulunduğu klasörde çalıştırın:  bash scripts/perf-check.sh https://seyir.sirket.local
# Hiçbir şeyi değiştirmez; yalnızca ölçer. Çıktıyı (perf-report-*.txt) geliştiriciye gönderin.
# Şifre, çerez ya da .env içeriği yazdırılmaz.
set -uo pipefail

URL="${1:-}"
if [ -z "$URL" ]; then
  echo "Kullanım: bash scripts/perf-check.sh <tarayıcıdaki adres, ör. https://seyir.sirket.local>"
  exit 1
fi
URL="${URL%/}"
OUT="perf-report-$(date +%Y%m%d-%H%M%S).txt"
exec > >(tee "$OUT") 2>&1

section() { printf '\n==== %s ====\n' "$1"; }
have() { command -v "$1" >/dev/null 2>&1; }

section "Zaman ve sunucu"
date
uname -a
uptime
echo "CPU çekirdeği: $(nproc)"

section "Bellek ve takas (swap yüksekse sunucu RAM'i yetmiyor)"
free -m
section "Disk (kullanım %90 üzeriyse sorun); ROTA=1 dönen disk (HDD) demektir"
df -h / /var/lib/docker 2>/dev/null
have lsblk && lsblk -d -o NAME,ROTA,SIZE,MODEL

section "Anlık yük (top, ilk 15 süreç)"
top -b -n 1 | head -22

section "Ağ arayüzleri ve MTU (docker köprüleri ana arayüzden BÜYÜK olmamalı)"
# Sanal makine/VPN ağlarında MTU çoğu zaman 1500'den küçüktür (ör. 1450). Docker köprüsü 1500 kalırsa
# büyük yanıtlar (JS dosyaları, uzun listeler) takılır: küçük istekler hızlı, sayfalar geç açılır.
ip -o link show | awk '{print $2, $4, $5}' | grep -E 'mtu' | sed 's/://'

if have docker; then
  section "Docker kurulumu (snap ile kurulduysa disk/ağ başarımı düşük olabilir)"
  docker version --format 'Docker {{.Server.Version}}' 2>/dev/null
  have snap && snap list docker 2>/dev/null && echo "UYARI: Docker snap paketiyle kurulu"
  docker info --format 'Storage={{.Driver}} Cgroup={{.CgroupVersion}} CPUs={{.NCPU}} Mem={{.MemTotal}}' 2>/dev/null
  section "Docker ağlarının MTU değeri"
  for n in $(docker network ls -q); do
    docker network inspect -f '{{.Name}} mtu={{index .Options "com.docker.network.driver.mtu"}}' "$n" 2>/dev/null
  done
  section "Konteyner günlük dosyası boyutları (GB seviyesindeyse disk doluyor)"
  for c in $(docker compose ps -q 2>/dev/null); do
    f=$(docker inspect -f '{{.LogPath}}' "$c" 2>/dev/null)
    [ -n "$f" ] && sudo -n du -h "$f" 2>/dev/null
  done
  section "Konteyner durumu (Restarting/unhealthy olmamalı)"
  docker compose ps 2>/dev/null || docker ps
  section "Konteyner kaynak kullanımı"
  docker stats --no-stream --format 'table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}\t{{.NetIO}}\t{{.BlockIO}}'
  section "API yeniden başlama sayısı"
  docker inspect -f '{{.Name}} restart={{.RestartCount}} started={{.State.StartedAt}}' $(docker compose ps -q 2>/dev/null) 2>/dev/null

  section "Son 1 saatin en yavaş 20 API isteği (ms)"
  docker compose logs --no-color --since 1h api 2>/dev/null \
    | grep -o '"url":"[^"]*".*"responseTime":[0-9]*' \
    | sed -E 's/.*"url":"([^"]*)".*"responseTime":([0-9]+)/\2 \1/' \
    | sort -rn | head -20
  section "Son 1 saatte istek sayısı ve ortalama süre"
  docker compose logs --no-color --since 1h api 2>/dev/null \
    | grep -o '"responseTime":[0-9]*' | cut -d: -f2 \
    | awk '{ n++; s+=$1; if ($1>500) slow++ } END { if (n) printf "istek=%d ortalama=%.0f ms  500ms üstü=%d\n", n, s/n, slow; else print "kayıt yok" }'
  section "Son 1 saatteki hata satırları"
  docker compose logs --no-color --since 1h api 2>/dev/null | grep -c '"level":50' || true

  section "Veritabanı"
  docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -c "\timing on" \
    -c "select 1" \
    -c "select count(*) as baglanti from pg_stat_activity" \
    -c "select pg_size_pretty(pg_database_size(current_database()))" \
    -c "show shared_buffers" \
    -c "select relname, n_live_tup, n_dead_tup from pg_stat_user_tables order by n_dead_tup desc limit 5"' 2>&1 | head -30
fi

section "HTTP süreleri (sunucunun kendisinden; ağ/VPN etkisi yok)"
measure() {
  curl -sk -o /dev/null -w "%{http_code} HTTP/%{http_version}  dns=%{time_namelookup}s  bağlantı=%{time_connect}s  tls=%{time_appconnect}s  ilk-bayt=%{time_starttransfer}s  toplam=%{time_total}s  boyut=%{size_download}B  $1\n" "$1"
}
for i in 1 2 3; do measure "$URL/"; done
for i in 1 2 3; do measure "$URL/api/health"; done
ASSET=$(curl -sk "$URL/" | grep -o '/assets/index-[^"]*\.js' | head -1)
if [ -n "$ASSET" ]; then
  measure "$URL$ASSET"
  section "Ana JS dosyası başlıkları (Content-Encoding: zstd/gzip ve uzun Cache-Control olmalı)"
  curl -skI -H 'Accept-Encoding: zstd, gzip' "$URL$ASSET" | grep -iE '^(content-encoding|cache-control|content-length|server)'
fi
section "index.html başlıkları (Cache-Control: no-cache olmalı)"
curl -skI "$URL/" | grep -iE '^(content-encoding|cache-control|server|alt-svc)'
section "API yanıtında sunucu süresi (Server-Timing)"
curl -skI "$URL/api/health" | grep -iE '^server-timing' || echo "Server-Timing başlığı yok (eski sürüm olabilir)"

section "Bitti"
echo "Rapor: $OUT"
