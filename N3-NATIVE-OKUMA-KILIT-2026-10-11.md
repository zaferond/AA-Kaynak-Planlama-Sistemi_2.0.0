# N3 — Güncel Native MSSQL okuma ve kilit ölçümü — 11 Ekim 2026

## Sonuç

**N3 kısmen giderildi; kapasite kabulü açık.** Takvim fark hesabı optimizasyonu `5c93ae361fec28c80d1f959da264c3b1d59dcece` commit'iyle gönderildi. Aynı commit'in [Native MSSQL koşusu](https://github.com/zaferond/AA-Kaynak-Planlama-Sistemi/actions/runs/38133527760) **23/23** testle başarılı; fail/skipped/cancelled/todo **0**. Temizleme doğrulandı. Raporun **505** kaynak/test/workflow hash'i test edilen commit ile eşleşti; Windows başlatıcısında `.gitattributes` CRLF checkout kuralı uygulandı.

Kanıtlar: [native sonuç](ci-evidence/native-mssql-5c93ae3.json), [koşu ve hash makbuzu](ci-evidence/native-mssql-5c93ae3-receipt.json). Makbuzdaki arşiv SHA256'sı rapor baytlarına, artifact SHA256'sı indirilen ZIP'e, job log SHA256'sı geçici ham loga aittir. Ham loglar ve bağlantı bilgileri Git'e eklenmez.

Bu adım production transaction/yetki/şema kodunu değiştirmez. Bir önceki [takvim optimizasyonu](N3-TAKVIM-FARK-HESABI-2026-10-11.md) SQL.js kanıtına güncel native kanıt ekler; eski raporların CI durumları güncel kaynak için otomatik doğru kabul edilmedi.

## Ortam ve iş yükü

- GitHub Actions Ubuntu 24.04; Node **24.21.0**, SQL Server **16.0.4295.3 Developer**, compatibility **160**, uygulama şeması **31**.
- Loopback'e bağlı, **4 GiB** bellek sınırına sahip geçici SQL Server container'ı; her koşuda boş `AA_native_test`. Test runner `_test` adı, boş nesne kataloğu ve exclusive test lease şartını doğrular. İki bağımsız connection pool; gerçek `.env`/DB/kullanıcı hesabı kullanılmadı.
- Contention fixture: **10.000** planlanan, **4.000** gerçekleşen, başlangıçta **4.000** yüzde kaydı; **80** kaynak, **20** kişisel takvim kaydı. Saat override tablosu boş; bu koşu saat override yükü hakkında kanıt sağlamaz.
- **1/4/12** eşzamanlı worker; admin/normal okuma, planlanan/gerçekleşen yazma, karma akış ve ayrı ardışık delta zinciri. **16 senaryo, 640 işlem, 340 yazma**. Ana gruplarda 40, karma alt gruplarda 10 gözlem. Ek native load profili 3 örnek kullanır; iki profilin ölçümleri birleştirilmez.
- Tek hücre değişikliklerinde revision/generation, audit sayısı, kapsam, transaction snapshot tutarlılığı, stale delta fallback ve bağımsız pool'dan nihai veri doğrulanır. Test kancaları sadece geçici Store nesnelerinde; finally ile geri alınır ve worker'lar hata halinde de boşaltılır.

## Güncel ölçüm

Süreler örnek **p95**, milisaniye. Kilit sütunu SQL sunucusunda `sp_getapplock` çağrısı çevresindeki süredir; salt DMV bekleme süresi değildir. Store toplamı HTTP ve JSON kodlamasını içermez. Aşamalar birbiriyle örtüşür; p95 değerleri toplanmaz ve oranları tek isteğin zaman dağılımı sayılmaz.

| Akış | Eşzamanlılık | Store toplam | Kilit edinme | Snapshot okuma | Komut + doğrulama + hazırlık | Persist |
|---|---:|---:|---:|---:|---:|---:|
| Normal okuma | 1 | 102,39 | 0,00 | 89,69 | — | — |
| Normal okuma | 4 | 379,86 | 0,00 | 319,30 | — | — |
| Normal okuma | 12 | 1.091,86 | 0,00 | 977,67 | — | — |
| Planlanan yazma | 1 | 333,76 | 0,00 | 221,14 | 80,11 | 24,31 |
| Planlanan yazma | 4 | 1.402,64 | 1.079,64 | 257,16 | 81,36 | 23,39 |
| Planlanan yazma | 12 | 4.038,64 | 3.697,92 | 242,73 | 81,01 | 24,59 |
| Gerçekleşen yazma | 1 | 363,18 | 0,00 | 231,22 | 87,90 | 24,72 |
| Gerçekleşen yazma | 4 | 1.335,98 | 1.010,23 | 228,78 | 88,43 | 23,81 |
| Gerçekleşen yazma | 12 | 3.906,17 | 3.584,26 | 217,63 | 87,37 | 24,48 |

Karma 12 worker senaryosunda dört alt grubun Store p95'i **2.906–3.027 ms**, kilit edinme p95'i **2.614–2.657 ms**. Salt okuma senaryosunda Shared kilitler birlikte alınabilirken okuma süresi büyür; karma akışta okumalar da Exclusive yazmaları bekler.

### Okunan satırlar ve yanıt

`backend/store.mjs:226` mutasyon transaction'ında tam `read` ve son `validateSnapshot` çağrılarını korur. `backend/planning-reader.mjs:6` metadata ve beş sayısal taramayı kurar; `backend/adapters/mssql.mjs:211` Shared/Exclusive application lock'u transaction boyunca tutar.

- Normal okumada 1.858 planlanan, 4.000 gerçekleşen, **50** kişisel yüzde ve 4.000 revision satırı okunur. Bu fixture'daki liderlik kapsamına özgüdür; normal kullanıcıya tüm bu satırların açıklandığı anlamına gelmez. `Store.view` kapsam projeksiyonunu ayrıca uygular. Anonim takım toplamları için gerçekleşen FTE okunmaya devam eder.
- Planlanan yazmada tek hücre değişmesine rağmen **10.000 planlanan + 4.000 gerçekleşen + 4.000 yüzde + 14.000 revision** satırı okunur. İki takvim settings JSON'undan okunur. İlgisiz veri için son tam doğrulama devam eder.
- Ardışık delta zincirindeki **40/40** yanıt delta'dır: p95 **324,47 ms**, yanıt **297 byte**, full projectView **0**. Buna rağmen tam snapshot okuma p95 **212,76 ms**, komut/doğrulama/hazırlık **81,69 ms** ve persist **23,84 ms** kalır. Delta küçülmesi tam SQL okumasını ortadan kaldırmaz.
- Sabit eski baseGeneration ile yapılan eşzamanlı yazmalarda güvenli full fallback beklenir: planlanan 12 worker senaryosunda **1 delta / 39 full**, p95 yanıt yaklaşık **1,14 MB**. Bu testin eski generation'ı bilinçli koruması, gerçek istemcilerin her istekte aynı fallback oranını yaşayacağını kanıtlamaz.
- 12 worker admin okumasında örneklenmiş tüm Node süreci heap tepesi **316,6 MiB**, RSS **596,7 MiB**. Fixture/base snapshot, cevaplar ve ölçüm altyapısı dahil; SQL Server belleği, istek başına allocation veya garantili GC tepesi değildir.

**Kanıtın yorumu:** bu sentetik yükte eşzamanlı yazma gecikmesinde belirgin kilit edinme süresi görülür. Tek işlemde tam okuma ve doğrulama/hazırlık maliyeti kalır. Takvim fark hesabının düzeltilmesi bu iki maliyeti kapatmış sayılmaz. Önceki CI koşuları farklı runner/zaman ve kaynaklarla ölçüldüğü için süre farkından optimizasyon yüzdesi veya gerileme iddiası çıkarılmaz.

## Kalite akışında bulunan test izolasyonu hatası

İlk [kalite koşusu](https://github.com/zaferond/AA-Kaynak-Planlama-Sistemi/actions/runs/38133500682) **başarısızdır**: Ubuntu **643/643** kaynak ve Windows **280/280** test geçti, fakat browser aktivite raporunda `%76,19` beklenirken `%82,05` geldi. İlk 140 browser kontrolü başarılı olsa da bütün browser kapısı geçmiş sayılmaz. Audit adımları bu koşuda çalışmadı. [Başarısız koşu makbuzu](ci-evidence/quality-5c93ae3-receipt.json).

Çağrı zinciri: `run-browser-checks` önce `checkCalendar`, sonra `checkActivityReport` çalıştırır. Takvim testi 7 Ocak tam gün, 8 Ocak yarım gün ve hafta sonu işaretini ortak sentetik takvimde bırakır. Aktivite testi yeni çalışanlara izin/eğitim ekler ama kapasite beklentisi boş ortak takvim içindir. **144 / 189 = %76,19** yerine tatiller nedeniyle **144 / 175,5 = %82,05** hesaplanması bu girdi için doğrudur.

Geçici SQL.js/loopback/Chrome fixture'ında aynı üç takvim kaydıyla hata birebir yeniden üretildi; ayrı boş fixture'da değişmeyen altı aktivite kontrolünün tamamı geçti. Dar düzeltme sadece `scripts/run-browser-checks.mjs`: aktivite kontrolleri kendi geçici fixture'ında çalışır, check/error listeleri ana rapora aktarılır ve child fixture finally ile kapatılır. Beklentiler değiştirilmez, test atlanmaz, üretim hesaplaması değiştirilmez.

### Yerel kaydırma kontrolü ve test zamanlaması

Takvim izolasyonu düzeltildikten sonraki yerel tam browser koşusunda aktivite kontrolleri geçti, fakat viewport kontrolü ana sayfaya yukarı kaydırmada zaman aşımına düştü. Ayrı boş fixture'da viewport kontrolü de tekrarladı; önceki test verisi tek neden değildi.

`mouse.wheel()` native hareketin bitmesini beklemez. Test, aşağı hareket sürerken DOM scrollTop'unu sıfırlıyor; yukarı hareketin ilk sayfa kaymasını görür görmez de sonraki kontrol için sayfayı tekrar alta alıyordu. Yalnız 300 ms gesture beklemesi eklenen denemeler hâlâ başarısızdı; bu ara başarısızlıklar başarılı sayılmadı. Reset sonrasında sanal satırların/compositor'un çizimini bekleyen mevcut iki-frame header kontrolü eklenince **iki bağımsız fixture koşusunda 9/9** viewport kontrolü geçti. Yukarı/aşağı hareketlerin öncesindeki programatik resetler ayrıldı. Scroll yönü, ana sayfa sınırı, table scrollTop/Left ve header hit-testing beklentileri korunur; yeni header kontrolü eklenir. Production CSS/scroll kodu değiştirilmedi. Bu ölçüm bütün tarayıcı/OS kombinasyonlarının sorunsuzluğunu kanıtlamaz.

Yerel komutlar, ayrı geçici kaynak kopyasında boş SQL.js/sentetik hesap/loopback ve macOS Chrome kullandı; gerçek `.env`/DB yoktu:

- Activity fixture probe: aynı takvimle `%82,05` / `%76,19` hata farkı assert edilerek yeniden üretildi; yeni boş fixture'da **6/6**, pageerror yok.
- Viewport probe: ilk dar koşu ve yalnız gesture beklemesi kullanılan ara koşular başarısız; son paint barrier + gesture ayrımıyla **9/9**, iki ardışık bağımsız koşu.
- `prettier --check scripts/run-browser-checks.mjs scripts/browser-checks/viewport-scroll.mjs`: geçti.
- `npm run build`, `node scripts/verify-deployment.mjs`, `node scripts/check-deployment-package.mjs`: geçti. **407 kaynak / 7 güncel çıktı**; 430 tarihî çıktı temiz paket dışında. Diskteki 437 çıktı hash'i değişmedi.

Son [38134440153 kalite koşusu](https://github.com/zaferond/AA-Kaynak-Planlama-Sistemi/actions/runs/38134440153), **`fe77c91d64245a2f4d9c9c57dff6c2ab82db9c9d`** üzerinde **başarılıdır**: Ubuntu **643/643**, Windows **280/280**, Chromium **154/154**. Kaynak testlerinde fail/cancelled/skipped/todo 0. Windows sayısı Ubuntu kapsamıyla örtüşür; sayılar tek bir bağımsız test toplamı olarak toplanmaz. Biçim/domain/TypeScript/build/manifest/temiz paket ve iki `npm audit --audit-level=high` adımı başarılı. [Son kalite makbuzu](ci-evidence/quality-fe77c91-receipt.json).

Bu rapor ve kanıt arşivinin sonraki commit'i uygulama/test kaynaklarını değiştirmez. Kalite kanıtının kaynak kimliği `fe77c91`, native kanıtınki `5c93ae3` olarak korunur. Dokümantasyon push'u yeni bir native koşu sayılmaz.

Native test `5c93ae3` üzerinde, browser düzeltmeleri **`fe77c91`** üzerinde çalışır. Native arşivinin 505 hash'i `fe77c91` ile de karşılaştırıldı: **503 eşit**, yalnız `scripts/run-browser-checks.mjs` ve `scripts/browser-checks/viewport-scroll.mjs` değişik. Backend/shared/frontend, SQL ve native runner baytları aynı. Bu, `fe77c91` için yeni bir native koşu yapıldığı iddiası değildir; makbuz iki sürümü açıkça ayırır.

Dosyalar mevcut kaynak/çıktı hash'leri doğrulanarak uygulama kopyasına alındı; geri alınabilir yedek `.deployment-backups/n3-native-ci-20261011T110747Z` altında. Yerel bağımsız milestone testi değişmedi. Manifest güncel kaynaklara uyumlu; uygulama süreci yeniden başlatılmadı.

## Sınırlar ve sıradaki çalışma

- HTTP kabul kuyruğu/yoğunluk sınırı bu profilde ölçülmez; `queueMs` yalnız benchmark worker kuyruğudur. 40 örnekte p99 en büyük örneğe eşittir; üretim kuyruğu/SLA tahmini yapılamaz.
- 4 GiB SQL container sınırı, hedef kurum SQL Server kaynağı değildir. Gerçek execution plan, physical IO/DMV bekleme, CPU profili, GC pause, WAN, proxy/TLS/CA, Windows servis hesabı/ACL, NTLM ve kurum yedek RPO/RTO bu adımla doğrulanmaz.
- N2 bağımlılık uyarıları ve N6 eski asset/canlı yayın politikası yeniden kapanmış sayılmaz. Yüksek eşikli audit başarısı Orta uyarıları giderilmiş yapmaz.
- Sıradaki öneri **N3 için sınırlandırılmış mutasyon kabulü ve yoğunlukta güvenli geri bildirim** tasarımıdır: bekleyen işlem sayısı ve süresi sınırı, yazmadan önce reddetme, istemci taslağını koruma; gönderilmiş yazmaya otomatik retry yok. Her instance sınırının çoklu süreç genel kotası olmadığı açıkça belirtilmeli. Ardından komut bazlı dar SQL/validasyon tasarımı, mevcut tam-read referansına karşı bütünlük eşdeğerliği ile ele alınmalı. Global kilit ve son doğrulama ölçümde yavaş göründüğü için doğrudan kaldırılmamalı.
- Çalışan servis yeniden başlatılmadı. Yeni backend optimizasyonunun diskte bulunması açık sürecin yeni kodu yüklediğini kanıtlamaz. Gerçek DB/account/migration/restore kullanılmadı.
