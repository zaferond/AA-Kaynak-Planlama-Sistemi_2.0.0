# N4 / Y5 — Native MSSQL ve Windows kanıtlarını yenileme

Tarih: 8 Ekim 2026. İlgili bulgu: [7 Ekim incelemesi](MIMARI-GUVENLIK-PERFORMANS-INCELEME-2026-10-07.md), **N4 / Orta — kabul eksikliği**; önceki **Y5**.

## İncelenen sürüm ve durum

Test edilen kaynak commit'i: **`731f5281f123f324628de7d0085508d2aaf54e48`**. N1 silme doğrulaması, N2 frontend bağımlılık düzeltmesi ve güncel migration 31 bu kaynaklarda bulunuyor. N1/N2 değişiklikleri önceki `56521c3` commit'inde Git'e gönderildi. Bu notun/arşivin sonraki commit'i uygulama davranışını değiştirmez; kanıtın esas sürümü yukarıdaki commit ve dosya hash'leridir.

**Giderildi — güncel kaynak için native/Windows CI kanıt eksikliği. Kurum kabulü doğrulanmadı.** Aynı commit'in kalite ve native işleri başarılıdır. Sentetik CI sonucu üretim güvenliği veya kapasitesi garantisi değildir.

## Yapılan dar değişiklikler

- Şema sonunda hâlâ `30` bekleyen altı test güncel `schemaVersion` kataloğunu kullanıyor. Eski şema fixture'ları eski sürümü açıkça koruyor. Kurtarma hata enjeksiyonu katalogdaki son migration'a uygulandı; byte koruması ve güvenli yeniden deneme kontrolleri korunuyor.
- İki revision testinde hiç var olmamış hücre silinerek tombstone yaratılması beklentisi kaldırıldı: önce gerçek sıfır kaydı oluşturulup siliniyor, revision **2** ve kapsamı doğrulanıyor. Böylece N1 koruması zayıflatılmadan gerçek silme izleri sınanıyor.
- Native MSSQL suite'e N1 regresyonu eklendi: 32 hayali kayıt, bozuk anahtar, geçerli boş silme, gerçek kayıt silme, tekrar silme, eski revision, yeniden oluşturma ve karma batch geri alma. Kalıcı revision tablosu sorgulanıyor; iki bağımsız native havuz korunuyor.
- Native sonuç artık sabit 48 dosyalık liste yerine bütün uygulama/derleme girdileri, doğrudan test modülleri ve iki CI workflow'unun **463 hash'ini** içeriyor; `checkedCommit` ayrıca kaydediliyor. Hash eşitliği dosya kimliğini kanıtlar; frontend'in bütün özelliklerinin native test edildiği anlamına gelmez.
- Windows kapısına bağımlılık kullanım/güvenlik regresyonu eklendi.
- Tarayıcıdaki iki eski seçici filtreli özet ve ana dağılım tablolarını karıştırıyordu. `headcount-forecast` kaynak özeti tablosuna, `workspace-filters` takım/proje başlıklı ana tabloya yönlendirildi. Aynı kontrolde filtreli dağılım **0,5**, bütün proje toplamı **0,75** ayrı ayrı doğrulanıyor; beklenen değerler düşürülmedi ve kontrol atlanmadı.

## Native MSSQL sonucu

[37763546804 koşusu](https://github.com/zaferond/AA-Kaynak-Planlama-Sistemi/actions/runs/37763546804): **20/20**, hata/atlama/iptal **0**. Node **24.21.0**, SQL Server **16.0.4295.3 Developer**, uyumluluk **160**, şema **31**. `cleanupVerified: true`.

- [Byte olarak korunan sonuç](ci-evidence/native-mssql-731f528.json)
- [Koşu, log hash'i ve kaynak karşılaştırması](ci-evidence/native-mssql-731f528-receipt.json)

463 dosyanın tamamı test edilen Git commit'inin dosyalarıyla karşılaştırıldı. Windows başlatıcısı için `.gitattributes` gereğince CRLF checkout baytları kullanıldı. Gerçek kullanıcı/DB bağlantı bilgileri rapora konulmadı; ham CI logları Git'e eklenmedi.

Küçük sentetik Store profili: 1.000 planlanan kayıt, iki havuz, üç ölçüm; admin/yönetici/normal okuma medyanları **37,64 / 27,49 / 25,53 ms**, 24 eşzamanlı yazmanın toplamı **1.936,95 ms**. Bu ölçümler global kilidi içerir; HTTP/tarayıcı/WAN, fiziksel SQL IO, kilit bekleme p95/p99 veya hedef kapasite ölçümü değildir. Önceki koşudan süre farkı aynı donanım/iş yükü altında kontrollü karşılaştırılmadığı için iyileşme/gerileme sonucu çıkarılmadı. **N3 açık.**

## Komutlar, ortam ve ara hatalar

[37763521968 kalite koşusu](https://github.com/zaferond/AA-Kaynak-Planlama-Sistemi/actions/runs/37763521968): Ubuntu **509/509** kaynak testi ve **133** başarılı Chromium kontrolü; Windows **143/143** sentetik test. Hata/atlama/iptal sayıları sıfır. Biçim/domain/TypeScript/build/manifest ve iki `npm audit --audit-level=high` adımı başarılı. [Kalite kaydı](ci-evidence/quality-731f528-receipt.json). Windows sayısı genel testlerle örtüşür; sayılar bağımsız kapsam olarak toplanmaz. Backend'deki Orta `sprintf-js` uyarıları bu Yüksek eşikli kapının geçmesini engellemez ve giderilmiş sayılmaz.

Komutlar/fixture'lar çalıştırılmadan incelendi. Yerel doğrulama ayrı geçici kaynak kopyası, temiz bağımlılıklar, boş npm ayarları, geçici SQL.js, sentetik hesaplar ve rastgele loopback portları kullanır. `.env` ve çalışan DB taşınmadı. Install script'leri kapalıydı. Kurulum mevcut bağımlılıkları değiştirmedi. Native koşu kullanıcı tarafından daha önce seçilen GitHub CI geçici SQL Server container'ında çalıştı; Windows ayrı CI runner'ıdır.

- Geçici ortamda `npm run verify`: **509/509** kaynak testi; biçim/domain/TypeScript/build başarılı. İlk koşudaki eski şema ve phantom-tombstone beklentileri yukarıdaki dar test düzeltmeleriyle giderildi.
- `56521c3` native koşusu: **20/20**; Windows **143/143**. Ubuntu kaynak testleri **509/509**, fakat browser seçicisi iki tablo bulduğu için kalite koşusu **başarısız**. [Başarısız ara kayıt](ci-evidence/quality-56521c3-receipt.json) başarılı gibi gösterilmedi.
- Sonraki yerel tarayıcı koşusunda ikinci seçicinin yanlış özet tablosundan **0,5** okuduğu görüldü; gerçek ana tablo beklentisi **0,75** korunarak kapsam düzeltildi.
- Kesilen yerel koşunun geçici çıktısı kalmadığı için yeni geçici kopya hazırlandı. Eski kurulu bağımlılık dosyalarının okunması bekleyince yalnız sahip olunan test süreci durduruldu ve temiz kurulum yapıldı; uygulama süreci durdurulmadı.
- Temiz geçici kopyada `npm run build` ve `node scripts/run-browser-checks.mjs`: TypeScript/build ve **133/133** tarayıcı kontrolü başarılı. Yerel macOS/Chrome sonucu, CI Chromium ve Windows sonuçlarıyla ayrı değerlendirilir.

## Bu çalışma ile doğrulanmayan kurum konuları

### Disk paketinin son kontrolü

Kanıt arşivi `a28affa` ile gönderildi; bu commit'in otomatik [37764507509 kalite koşusu](https://github.com/zaferond/AA-Kaynak-Planlama-Sistemi/actions/runs/37764507509) da başarılıdır. Native raporun 463 hash'i arşiv commit'iyle yeniden karşılaştırıldı; kaynak farkı yok. Bu notun sonraki güncellemesi dokümantasyondur, yeni bir native koşu iddiası değildir.

Temiz geçici derlemenin aktif çıktıları mevcut paketle aynıydı. Kanonik manifest başarılı derlemenin kaynak hash'leriyle yenilenip doğrulandı. Çalışma klasörüne 14 dosya yedek alınarak aktarıldı. Beklenen **377 kaynak + 397 çıktı** hash'i eşleşti. Ancak tam envanter kontrolü `site/index 2.html` ve `site/index 2.html.gz` adlı iki ek dosya bulduğu için ilk `node scripts/verify-deployment.mjs` komutu exit 1 döndü; yalnız hash eşitliği tam envanter doğrulaması yerine kullanılmadı.

Bu iki ek dosya silinmedi; `.deployment-backups/2026-10-08-n4-final/unexpected-site-copies/` altında korundu. Oluşma nedeni doğrulanmadı. Asıl `site/index.html` ve gzip çıktısı beklenen hash'leri taşıyordu. Son tekrar **exit 0 / ok: true**, kaynak ve çıktı için changed/missing/added listeleri boş. Gerçek DB, `.env`, hesaplar ve çalışan backend süreci kullanılmadı. Eski hash'li varlıkların genel saklama konusu **N6** olarak ayrıca açık kalır.

### Ayrı kurum kabulü

1. **Native MSSQL kurum bağlantısı:** asgari yetkili hesap, kurum CA/hostname/NTLM, firewall. Container SQL hesabı ve self-signed trust kurum kabulü yerine geçmez.
2. **Windows hizmeti:** kurum servis hesabı, NTFS ACL, SCM stop/crash/boot, gerçek Explorer/TTY ilk kurulum. Windows sentetik başlatıcı testleri gerçek servis/DB başlatmaz.
3. **Proxy/TLS ve ağ:** kurum HTTPS adresleri, çoklu proxy, WAN/gecikme, kurum tarayıcısı ve SSO.
4. **Yedek/kurtarma:** kurum yedek şifreleme/erişimi, ayrı hedefe geri alma, migration geri dönüşü, RPO/RTO ve kurum veri doğrulaması.
5. **Temsili yük:** hedef veri hacmi/eşzamanlı kullanıcıyla p95/p99, bellek/GC, SQL planı/fiziksel IO ve kilit bekleme. Küçük sentetik medyanlar bu sınırları kapatmaz.

Gerçek hesaba giriş, çalışan veritabanına kayıt/silme/migration/restore yapılmadı. Sunucu yeniden başlatılmadı; disk dosyalarının güncelliği açık backend sürecinin güncel modülleri yüklediğini kanıtlamaz. N2'nin `sprintf-js` kök uyarısı hâlâ açık; güncel CI başarıları uyarının giderildiği anlamına gelmez.

## Sıradaki çalışma

**N3:** sentetik native eşzamanlı yükte kilit bekleme, yazma/okuma p95/p99 ve bellek ölçümünü ekle; sonuçtan sonra en sık tahsis yollarının snapshot/validasyon kapsamını daralt. Revision, aylık toplam, kapsam ve transaction bütünlüğü korunmadan global kilit kaldırılmamalı.
