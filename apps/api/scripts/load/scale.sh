#!/usr/bin/env bash
# Çok süreçli ölçekleme deneyi: N API örneği + yuvarlak-robin vekil, aynı merdiven. Kullanım: scale.sh 1 2 4
cd "$(dirname "$0")/../.."
killports() {
  for port in 3200 3201 3202 3203 3204 3205 3206 3207 3208 3209; do
    for pid in $(netstat -ano -p tcp | grep ":$port .*LISTENING" | awk '{print $NF}' | sort -u); do taskkill //F //PID "$pid" > /dev/null 2>&1; done
  done
  sleep 3
}
killports
for N in "$@"; do
  pids=()
  ports=()
  for k in $(seq 1 "$N"); do
    port=$((3200 + k)); ports+=("$port")
    node scripts/load/api.cjs 384 "$port" > "/tmp/inst-$port.log" 2>&1 &
    pids+=($!)
  done
  for port in "${ports[@]}"; do
    for i in $(seq 1 30); do [ "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:$port/api/health)" = 200 ] && break; sleep 2; done
  done
  node scripts/load/proxy.mjs "$(IFS=,; echo "${ports[*]}")" > /tmp/proxy.log 2>&1 &
  pids+=($!)
  sleep 2
  echo "=== $N örnek ===" | tee -a /tmp/scale-all.log
  node scripts/load/load.mjs "scale-$N" --steps 100,200,400 --secs 30 --think 4 --all 2>&1 | tee -a /tmp/scale-all.log
  killports
done
echo ÖLÇEKLEME-BİTTİ | tee -a /tmp/scale-all.log
