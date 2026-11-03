# Egebis Seyir yavaşlık tanısı — kullanıcı bilgisayarı (Windows). Yavaşlığı yaşayan bilgisayarda PowerShell'de:
#   powershell -ExecutionPolicy Bypass -File scripts\perf-check-client.ps1 http://sunucu:8092
# Hiçbir şeyi değiştirmez. Aynı istekleri sistem vekili (proxy) üzerinden ve vekilsiz ölçer; küçük ve büyük
# dosya sürelerini karşılaştırır. Çıktıyı (perf-client-*.txt) geliştiriciye gönderin.
param([Parameter(Mandatory = $true)][string]$Url)

$Url = $Url.TrimEnd('/')
$out = "perf-client-$(Get-Date -Format yyyyMMdd-HHmmss).txt"
Start-Transcript -Path $out | Out-Null

function Section($title) { Write-Host "`n==== $title ====" }
$format = '%{http_code} HTTP/%{http_version} dns=%{time_namelookup}s baglanti=%{time_connect}s tls=%{time_appconnect}s ilk-bayt=%{time_starttransfer}s toplam=%{time_total}s boyut=%{size_download}B\n'
function Get-Timing($target, [switch]$NoProxy) {
  $curlArgs = @('-sk', '-o', 'NUL', '-w', $format)
  if ($NoProxy) { $curlArgs += @('--noproxy', '*') }
  & curl.exe @curlArgs $target
}

Section 'Bilgisayar ve ağ'
Get-Date
$uri = [Uri]$Url
"Sunucu: $($uri.Host)"
Resolve-DnsName $uri.Host -ErrorAction SilentlyContinue | Select-Object Name, Type, IPAddress | Format-Table -AutoSize
Test-Connection $uri.Host -Count 4 -ErrorAction SilentlyContinue | Select-Object Address, ResponseTime | Format-Table -AutoSize

Section 'Sistem vekili (proxy) ayarı — adres burada geçiyorsa istekler vekilden geçer'
netsh winhttp show proxy
Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings' |
  Select-Object ProxyEnable, ProxyServer, ProxyOverride, AutoConfigURL | Format-List

$asset = (& curl.exe -sk "$Url/") | Select-String -Pattern '/assets/index-[^"]*\.js' | ForEach-Object { $_.Matches[0].Value } | Select-Object -First 1

foreach ($mode in @('Varsayılan (vekil dahil)', 'Vekilsiz')) {
  $np = $mode -eq 'Vekilsiz'
  Section "$mode — sayfa"
  1..3 | ForEach-Object { Get-Timing "$Url/" -NoProxy:$np }
  Section "$mode — API (küçük yanıt)"
  1..3 | ForEach-Object { Get-Timing "$Url/api/health" -NoProxy:$np }
  if ($asset) {
    Section "$mode — ana JS dosyası (büyük yanıt; küçükler hızlı bu yavaşsa MTU/vekil sorunu)"
    1..3 | ForEach-Object { Get-Timing "$Url$asset" -NoProxy:$np }
  }
}

Section 'Yorum'
'- "Vekilsiz" belirgin hızlıysa: sunucu adresini vekil istisnalarına (ProxyOverride / PAC) ekletin.'
'- API hızlı ama büyük dosya çok yavaşsa: ağda MTU sorunu (sunucu raporundaki MTU bölümüne bakın).'
'- Hepsi yavaş ve ping yüksekse: ağ/VPN gecikmesi.'
Stop-Transcript | Out-Null
"Rapor: $out"
