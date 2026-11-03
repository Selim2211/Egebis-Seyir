# Yavaşlık tanısı — kontrol listesi (Zeynep ile birlikte)

Yönetici notları madde 9: "İçi neredeyse boş olduğu halde yazılım yavaş." Yerel ölçümlerde API yanıtları 40–160 ms, sayfa ilk yüklemesi ~241 KB (gzip). Boş sistemde yavaşlık genellikle **koddan değil, sunucu, ağ ya da kurulumdan** gelir. Aşağıdaki adımlar sorunun hangi katmanda olduğunu ayırır. Toplam süre: ~20 dakika.

## 0. Şimdiye kadar bulunanlar (ADR-158)

- **Bizim tarafta düzeltildi:** ana sayfa 97 ayrı JS dosyası istiyordu, 50'ye indi. 40 ms gecikmeli ağda açılış 2,7 → 2,1 sn, 80 ms'de 3,5 → 2,5 sn. Konteynerlere MTU kara deliğine karşı TCP ayarı ve günlük dosyası sınırı eklendi. Yeni sürüm deploy edilince bunlar ofiste de geçerli olur.
- **Oracle'da bulunup düzeltildi:** MTU kara deliği (büyük dosyalar 1 sn'ye kadar takılıyordu, %12 paket yeniden gönderimi).
- **Ofiste bakılacak:** HTTP mi HTTPS mi (HTTPS'te HTTP/2 açılır; ölçümde 80 ms gecikmede 2,5 → 2,0 sn), VPN gecikmesi, kurumsal vekil ve MTU. Aşağıdaki iki betik bunları ayırır.

## 1. Sunucu ölçümü (5 dk)

Ofis sunucusunda, `docker-compose.yml`'in olduğu klasörde:

```bash
bash scripts/perf-check.sh https://<tarayıcıdaki-adres>
```

Betik hiçbir şeyi değiştirmez; `perf-report-<tarih>.txt` dosyası oluşturur. Bu dosyayı bana gönderin.

Raporda şunlara bakın:

| Bulgu                                                       | Anlamı                                                                                |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `free -m` çıktısında **swap kullanımı** yüksek              | RAM yetmiyor; sunucuya RAM ekleyin ya da başka uygulamaları ayırın (önerilen ≥ 4 GB)  |
| `lsblk` → `ROTA=1`                                          | Veritabanı dönen diskte (HDD); SSD'ye taşımak büyük fark yaratır                      |
| Konteyner `Restarting` / yüksek `restart=`                  | API çöküp yeniden başlıyor; `docker compose logs api` ile hata bulunur                |
| "En yavaş istekler" listesinde 500 ms üstü                  | Sorun sunucuda/veritabanında: adres listesini bana iletin                             |
| HTTP sürelerinde **ilk-bayt** < 0,2 sn ama tarayıcıda yavaş | Sorun sunucuda değil, ağda (bkz. 2. adım)                                             |
| JS dosyasında `Content-Encoding` yok                        | Sıkıştırma kapalı; arada başka bir vekil (IIS/Nginx/F5) sıkıştırmayı bozuyor olabilir |

## 2. Kullanıcı bilgisayarı ölçümü (5 dk)

Yavaşlığı yaşayan bir Windows bilgisayarda (VPN açıkken):

```powershell
powershell -ExecutionPolicy Bypass -File scripts\perf-check-client.ps1 http://<sunucu>:8092
```

Aynı istekleri sistem vekili üzerinden ve vekilsiz ölçer; küçük API yanıtıyla büyük JS dosyasını karşılaştırır. `perf-client-<tarih>.txt` dosyasını gönderin.

## 3. Tarayıcı ölçümü (10 dk)

Yavaşlığı yaşayan bilgisayarda Chrome/Edge:

1. Uygulamayı açın, **F12 → Network (Ağ)** sekmesi, "Disable cache" işaretli **değil**.
2. Sayfayı yenileyin (F5). En alttaki satırı not edin: _requests, transferred, Finish, DOMContentLoaded_.
3. Yavaş görünen bir işlem yapın (ör. Backlog'u açmak). Listede en uzun süren satıra tıklayın → **Timing** sekmesi:
   - **Server Timing → app**: API'nin sunucuda harcadığı süre (yeni sürümle gelir).
   - **Waiting for server response (TTFB)** − app = ağ + vekil gecikmesi.
   - **Stalled / Queueing** uzunsa tarayıcı bağlantı bekliyor (vekil, antivirüs, eşzamanlı istek sınırı).
   - **Initial connection / SSL** uzunsa her istekte yeniden bağlantı kuruluyor (HTTP/2 kapalı ya da araya giren vekil).
4. Ekran görüntüsü alıp gönderin.

## 4. Sık görülen nedenler ve çözümleri

| Neden                                            | Belirti                                                  | Çözüm                                                                                                 |
| ------------------------------------------------ | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| VPN / uzak ağ                                    | Sunucu ölçümü hızlı, tarayıcı yavaş; `ping` > 50 ms      | Sunucuyu kullanıcılara yakın ağa almak; VPN'de bölünmüş tünel                                         |
| Kurumsal vekil / SSL denetimi (antivirüs)        | Her istekte "Stalled" ya da "SSL" uzun                   | Uygulama adresini vekil/SSL denetimi istisnasına eklemek                                              |
| DNS                                              | `dns=` süresi > 0,1 sn                                   | Sunucu adını iç DNS'e eklemek ya da hosts kaydı                                                       |
| Sunucu kaynakları                                | Swap dolu, CPU %100, HDD                                 | RAM/SSD; Docker'a ayrılan kaynak sınırlarını kaldırmak                                                |
| Düz HTTP (HTTPS değil)                           | Ağ sekmesinde Protocol `http/1.1`, çok satırda "Stalled" | HTTPS: şirket sertifikası ya da Caddy `tls internal` (kök sertifika GPO ile dağıtılır); HTTP/2 açılır |
| MTU (VPN)                                        | Küçük istekler hızlı, büyük JS dosyaları takılıyor       | Yeni sürümdeki konteyner TCP ayarı; olmazsa VPN/ağ ekibi MSS sınırlaması                              |
| HTTP (HTTPS değil) + `COOKIE_SECURE` uyuşmazlığı | Girişte döngü, sürekli yeniden yükleme                   | DEPLOY.md §3: HTTP kullanılıyorsa `COOKIE_SECURE=false`                                               |
| Eski tarayıcı önbelleği                          | Güncellemeden sonra ilk açılış yavaş/beyaz ekran         | Bir kez Ctrl+F5 (yeni sürümde eksik dosya hatasında sayfa kendini bir kez yeniler)                    |
| Geliştirme modu                                  | `NODE_ENV` production değil, `/api/docs` açık            | `.env` → `NODE_ENV=production` ve `docker compose up -d --build`                                      |

## 5. Sonuç

Rapor ve tarayıcı ekran görüntüleri geldiğinde sorunun katmanı (sunucu / ağ / tarayıcı) netleşir; kod tarafında bir iyileştirme gerekirse yavaş adresler üzerinden yaparım.
