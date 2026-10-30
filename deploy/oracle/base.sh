#!/usr/bin/env bash
# Oracle Always Free AMD Micro (1 GB RAM) için temel kurulum. Tekrar çalıştırılabilir.
# Kullanım: sudo bash base.sh "<açılacak TCP portları, ör. 80 443>" "<kaynak CIDR, ör. 0.0.0.0/0>"
set -euo pipefail
PORTS="${1:-}"
SOURCE="${2:-0.0.0.0/0}"
export DEBIAN_FRONTEND=noninteractive

timedatectl set-timezone Europe/Istanbul

# 1 GB RAM: 2 GB takas, yalnızca gerektiğinde kullanılsın.
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >>/etc/fstab
fi
echo 'vm.swappiness=10' >/etc/sysctl.d/90-seyir.conf
sysctl -q --system

# snap (~100 MB RAM) bu sunucularda kullanılmıyor.
if command -v snap >/dev/null; then
  systemctl disable --now snapd.service snapd.socket snapd.seeded.service 2>/dev/null || true
  apt-get purge -y -qq snapd >/dev/null || true
fi

apt-get update -qq
apt-get install -y -qq unattended-upgrades netfilter-persistent iptables-persistent >/dev/null

# Oracle Ubuntu imajı iptables ile 22 dışındaki her şeyi reddeder: istenen portlar REJECT'ten önce açılır.
for port in $PORTS; do
  if ! iptables -C INPUT -p tcp -s "$SOURCE" --dport "$port" -m state --state NEW -j ACCEPT 2>/dev/null; then
    iptables -I INPUT 5 -p tcp -s "$SOURCE" --dport "$port" -m state --state NEW -j ACCEPT
  fi
done
netfilter-persistent save >/dev/null
echo "base ok: $(hostname) ports=[$PORTS] from $SOURCE"
