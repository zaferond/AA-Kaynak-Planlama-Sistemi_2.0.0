# Native MSSQL ve CI doğrulaması — 4 Ekim 2026

## Durum ve önceki raporla ilişki

Bu belge, [3 Ekim düzeltme raporunun](MIMARI-GUVENLIK-DUZELTMELER-2026-10-03.md) native MSSQL hazırlık bölümünü günceller. Önceki rapordaki sonuçlar kendi tarihindeki kanıtı anlatır. Artık **native SQL Server CI ve Windows sentetik CI için başarılı çalıştırma kanıtı vardır**. Gerçek kurum ortamına ilişkin kontroller aşağıda açıkça ayrı tutulur.

- Önceki yerel mimari/güvenlik değişiklikleri `394466e03ae8b790f7dd2fc3bc40928966162cef` commit'iyle `main` dalına gönderildi. İlk kalite koşusu [37184434112](https://github.com/zaferond/AA-Kaynak-Planlama-Sistemi/actions/runs/37184434112) başarılıdır.
- Native MSSQL için doğrulanan commit: `63780fc4538829c16c7b14739f882a9851629f59`.
- Native başarı: [37186385433](https://github.com/zaferond/AA-Kaynak-Planlama-Sistemi/actions/runs/37186385433), **19/19 test, sıfır başarısız/iptal/atlanan test**.
- Tarayıcı kontrolündeki bekleme düzeltmesini içeren kod commit'i: `20bafffb3b510d9148ac2bbffe6bc91cabde16e9`. Native raporun kapsadığı **48 dosyanın SHA-256 değerleri bu commit'te de aynı**.
- Son kalite sonucu: [37186919906](https://github.com/zaferond/AA-Kaynak-Planlama-Sistemi/actions/runs/37186919906) başarılı: Ubuntu format/domain/TypeScript/derleme, **414/414** test, **69/69** tarayıcı grubu, bağımlılık audit kapıları; Windows sentetik **58/58** test ve derleme..

Bu testler bütün güvenlik açıklarının bulunduğunu veya gerçek yükte kapasite/stabilite kabulünün tamamlandığını kanıtlamaz.

## Native çalıştırmada bulunan ve düzeltilen sorunlar

| Alan | Doğrudan kanıt ve düzeltme | Commit |
|---|---|---|
| MSSQL migration 13/14, dinamik DDL | [İlk koşu](https://github.com/zaferond/AA-Kaynak-Planlama-Sistemi/actions/runs/37184488198) `Incorrect syntax near 'QUOTENAME'` ile durdu. Kısıt kaldırma komutu `nvarchar(max)` değişkeninde oluşturulup `EXEC` ile çalıştırılır; tanımlayıcılar `QUOTENAME` ile korunur. | `0c4ec83bd1be37a1670ed1c5fe1cd318e689c474` |
| MSSQL migration 13, yeni sütuna bağlı filtreli indeks | [İkinci koşu](https://github.com/zaferond/AA-Kaynak-Planlama-Sistemi/actions/runs/37185152562) `Invalid column name 'resource_id'` ile durdu. Sabit indeks DDL'i ayrı `EXEC(N'...')` içinde derlenerek sütun ekleme tamamlandıktan sonra bağlanır. İndeksin kuralı değişmez. | `461934961fae79dd66ef58f74d7dd61e8f5d8772` |
| MSSQL migration 19, uzun metin yükseltmesi | [Üçüncü koşu](https://github.com/zaferond/AA-Kaynak-Planlama-Sistemi/actions/runs/37185671702) `bar_text` varsayılan değer kısıtının `ALTER COLUMN` işlemini engellemesiyle durdu. Kısıtın adı/ifadesi metadata'dan alınır; kısıt kaldırılır, sütun büyütülür ve aynı varsayılan geri kurulur. | `63780fc4538829c16c7b14739f882a9851629f59` |

Şema sürümü **30** olarak kalır. SQL.js migration'ları ve iş kuralları değiştirilmedi. Uygulanmış migration sürümleri yeniden çalıştırılmaz. Başarı kanıtı ayrı boş test veritabanında eski v2 → v30 yükseltmesi ve temiz kurulum içindir; bozuk/elle değiştirilmiş gerçek veritabanları üzerinde kurtarma kanıtı değildir.

Migration 19 için native suite'e anlamlı regresyon eklendi: mevcut Unicode/tırnak/emoji içeren veri, özel adında `]` bulunan varsayılan kısıt, alan verilmeden yapılan insert ve 2.000 tekrar içeren yeni uzun metin korunur. Testin geçici tablosu kaldırılıp legacy fixture eski duruma getirilir; tüm süreç yalnız izin verilen sentetik test veritabanında yürür.

## Kalite kontrolündeki zamanlama düzeltmesi

[37186384973](https://github.com/zaferond/AA-Kaynak-Planlama-Sistemi/actions/runs/37186384973) koşusunda `npm run verify` ve Windows işi geçti; tarayıcı kontrolü saat → gün dönüşümünde `18 !== 2` ile durdu. Backend kaydının tamamlanması React ekran güncellemesinin tamamlanmasıyla aynı olay değildir. `ActualAmount` yeni birimi render edip metni `useEffect` ile günceller.

`scripts/browser-checks/actual-allocation.mjs` kontrolü, mevcut koşula bağlı bekleme yardımcısıyla hücrede **2** görülmesini ve hücrenin etkin olmasını bekler. Beklenen sonuç, veri kontrolü ve süre sınırı korunur; uyku, assertion kaldırma veya başarısız testi yeniden deneme eklenmedi. Uygulama kaynak kodu değişmedi. Odak kontrolü geçici SQL.js/rastgele loopback portunda **3/3**, sıfır tarayıcı hatası ile geçti.

## Ortam, komutlar ve kanıt

| Kontrol | Sonuç / sınır |
|---|---|
| Yerel `npm run verify` | Güncel 411 kaynak/config/test dosyasının geçici kopyasında **414/414**, format/domain/TypeScript/derleme geçti. `.env`, gerçek hesap veya çalışan DB kullanılmadı. |
| Yerel `node scripts/run-browser-checks.mjs` | Üretim derlemesi sonrası **69/69** grup; yakalanmamış tarayıcı hatası yok. İlk doğrulama derlemesinde yanlışlıkla verilen `NODE_ENV=test` kaldırılarak derleme tekrarlandı; bu doğrulama ortamı hatası uygulama hatası olarak raporlanmaz. |
| Odak tarayıcı kontrolü | Yalnız `checkActualAllocation`: **3/3**; birim dönüşümü, seçim, limit, 503 taslağı/retry ve otomatik saat geri dönüşü. Ayrı sentetik fixture kapanışta DB'yi siler. |
| Native `npm run test:db -- --size 1000 --samples 3 --report native-mssql-report.json` | GitHub'ın geçici SQL Server 2022 Developer container'ında **19/19**. SQL Server `16.0.4295.3`, uyumluluk seviyesi **160**, Node `v24.21.0`. |
| Native artifact | `native-mssql-report`, artifact ID **11296584539**, schema **30**, `cleanupVerified: true`; 48 kaynak hash'i ilgili Git commit içeriğine karşı doğrulandı. JSON SHA-256: `c4eca2bf19d8fa041f9f484589827a8bbcb98b61f28552b69e65410bcdfb9ac3`. Artifact saklama süresi workflow'da 7 gündür. |
| Windows CI | Sentetik test işi ve Windows TypeScript/derlemesi geçti. Gerçek servis hesabı, NTLM/kurum SQL bağlantısı veya ACL doğrulaması değildir. |
| `git diff --check` / aşamalanan dosyalar | Yalnız ilgili kaynak, test ve raporlar gönderildi; `.env`, DB, yedek, test artifact'i veya log eklenmedi. |

Native suite ayrıca HTTP CRUD/yetki/import/restore, SQL kısıtları, bağımsız pool'larda optimistic locking, paylaşılmış giriş limiti, okuyucu/yazıcı kilidi, atomik iki hücre güncellemesi, rollback/revision/generation/audit, OPENJSON uzun Unicode metinler ve BIN2 kapsamlı revision anahtarlarını çalıştırır. Test DB hedefi adı/boşluğu/izinleri kontrol edilir; yalnız sabit test tablo kataloğu temizlenir. Test parolası rapora veya Git'e yazılmaz.

### Sentetik yük ölçümü

1.000 planlanan tahsis, üç örnek ve iki bağımsız pool ile native Store okuması:

| Rol | Medyan ms | En yüksek ms | Tahsis satırı |
|---|---:|---:|---:|
| Admin | 31,62 | 56,24 | 1.000 |
| Yönetici | 26,48 | 51,94 | 186 |
| Normal | 24,63 | 25,42 | 186 |

24 paralel yazma isteği toplam **1.738,88 ms** sürdü. Bunlar global application lock dahil sentetik native Store ölçümleridir; HTTP/tarayıcı gecikmesi, üretim p95'i veya eşzamanlı kullanıcı kapasitesi sonucu değildir.

## Git ve çalışan uygulama

Bulut yer tutucuları özgün depoda Git yazmalarını kesintiye uğrattı. Doğrulanan dosyalar, aynı remote ve mevcut Git geçmişinden oluşturulan ayrı yerel clone üzerinden normal fast-forward commit/push ile gönderildi. Geçmiş yeniden oluşturulmadı ve force-push yapılmadı. Özgün depoya doğrulanmış Git nesneleri eklenerek index/ref metadata'sının hizalanması, bu belgenin gönderilmesinden sonra tamamlanacak kapanış işlemidir; kaynak/DB dosyalarını değiştiren checkout/reset kullanılmaz.

Kullanıcının programı açma isteğiyle yerel uygulama başlatıldı ve `http://localhost:3000/` için HTTP **200** doğrulandı. Gerçek kullanıcıyla giriş, test kaydı, restore veya test migration'ı çalışan veritabanında yapılmadı. Native testler yalnız CI'nın ayrı container'ında çalıştı.

## Kalan gerçek ortam kabul işleri

1. **Windows servis/ACL/launcher:** gerçek hizmet hesabı, dizin/sertifika izinleri, servis yeniden başlatma ve kurum bağlantısı.
2. **Kurum proxy/TLS:** gerçek hop/trust ayarı, sertifika zinciri, cookie/Host/Origin ve dağıtık rate-limit davranışı.
3. **Kurum kurtarma:** erişim kontrollü yedek ve anahtarlar, ayrı hedefe kurtarma; ölçülmüş RPO/RTO.
4. **Yük ve native Excel:** kurum büyüklüğündeki sentetik veriyle HTTP/tarayıcı profili, gerçek Excel uygulamasında çıktı kabulü ve gereken kapasite.

Native CI'da `sa` ve test container'ına özel sertifika güveni kullanıldığı için kurumun asgari izinli SQL hesabı/TLS politikası doğrulanmadı. Bu işler için uygun ayrı ortam ve erişim gerekir; gerçek çalışan/üretim ortamındaki test işlemleri ayrıca açık izin gerektirir.
