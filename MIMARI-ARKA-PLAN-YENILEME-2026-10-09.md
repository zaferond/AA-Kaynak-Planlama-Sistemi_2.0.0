# Arka plan yenileme yaşam döngüsü — 9 Ekim 2026

## Kapsam ve başlangıç

Başlangıç **`5334d7932b995593d209c5662b1431bfe384a248`**, Git çalışma ağacı temiz ve origin/main ile eşitti. Önceki frontend geçiş/oturum koordinasyonu adımından devam edildi. Backend, API, SQL, migration, shared iş kuralları, bağımlılık sürümleri ve görünüm tasarımı değişmedi.

`usePortalRefresh` yalnız React ref/effect, DOM focus/visibility, interval ve event listener bağlantısını yönetir. React/DOM/storage/backend'den bağımsız `features/portal-refresh.ts` okuma ve sürüm kontrolü sıralamasını enjekte edilen callback'lerle yürütür. Risk taslağı guard/revision, diğer editor opening revision ve storage generation/session identity sahipliği korunur.

## Yeniden üretilen sorun

Eski **5334d79** derlemesinde sentetik hesap/SQL.js/loopback/headless Chrome ile `/api/version` yanıtı bekletildi. Kontrol başladıktan sonra proje düzenleme modalı açıldı, taslak adı değiştirildi ve focus input dışındaki Kaydet butonuna alındı. Sentetik diğer işlem proje sorumlusunu değiştirdi. Bekletilen sürüm yanıtı serbest bırakılınca açık editor olmasına rağmen **1 `/api/data` okuması** başladı; yeni assertion **1 !== 0** ile başarısız oldu. Eski callback, effect'in başladığı `editing=false` değerini kullanıyordu. Canlı risk ref'i risk taslağını koruyordu; proje/directory/saving closure'ı için aynı koruma yoktu.

Etki: düzenleme sırasında gereksiz tam snapshot okuması ve modalın arkasındaki verinin yenilenmesi. Editor'un yakalanmış opening revision'ı önceki düzeltmelerle korunuyordu; bu yeniden üretim veri kaybı veya yetkisiz erişim kanıtı değildir.

## Dar düzeltme ve korunan davranışlar

- Düzenleme, saving, risk ref ve callback'ler her React commit'inde güncellenir; geciken sonuç yenileme kararını güncel getter'lardan verir. Bildirim ile okuma mikro görevi arasındaki editor açılışı da tekrar kontrol edilir.
- Arka plan okumaları seri yürür. Okuma sürerken gelen bildirimler tek pending işareti olur; tamamlanınca gerekiyorsa tek takip okuması yapılır. Böylece önceki yanıtta bulunmayan yeni değişiklik atlanmaz. Bu sınırlama scheduler'ın okumaları içindir; elle reload, export veya POST transportunun tümünü seri hale getirmez.
- Sürüm/identity kontrolü düzenleme sırasında çalışmaya devam eder; yalnız full data read ertelenir. 15 saniye aralık, görünürlük kontrolü ve storage bildirim anahtarı korunur. Gizli sekmeler sürüm sorgusu göndermez.
- Cleanup interval ve bekleyen focusout timeout'unu temizler, listener'ları kaldırır, eski async devamları lifetime ile geçersiz kılar. Tek bekleyen blur işi tutulur. Geciken eski completion yeni lifetime'ın pending işini sıfırlamaz.
- Geçici version hatası taslağı kaldırmaz ve yeni kullanıcı hatası göstermez. Full read hata bildirimi mevcut `usePortalData.reload` sahibinde kalır; beklenmedik callback rejection'ı da aynı hata setter'ına gider. Hata sonrası anında sonsuz retry yok; yeni bildirim/poll sonraki denemeyi başlatabilir.
- `usePortalData.reload` veri okumadan önce ve okuma döndükten sonra mevcut captureSessionGuard'ı doğrular. Storage'ın zaten var olan session epoch/identity/monotonik generation ve belirsiz write recovery kontrolü değiştirilmedi.
- Başlamış okumalar sırf editor açıldı diye iptal edilmez; kendi opening revision'ını koruyan mevcut editor/conflict davranışı ve gelen snapshot gösterimi korunur. Cleanup, sunucuda işlem iptali veya eski HTTP isteğinin kesin sonlandırıldığı iddiası değildir.

## Yerel doğrulama ve ortam

Git archive ile geçici klasör; kilit dosyaları byte eşitliği doğrulanan önceki geçici dependency kurulumu. `.env`, gerçek hesap ve çalışan veritabanı kullanılmadı. Browser fixture kendi geçici SQL.js dosyası/sentetik hesapları/loopback portunu oluşturur. Yalnız test harness'ında uygulamanın 15 saniyelik callback'i kontrollü çağrılır; HTTP deadlines/DOM timer'ları native kalır. Her yeni browser kontrolü kendi context'ini kapatıp sentetik proje değişikliğini mevcut CAS ile geri alır; ortak fixture'a iş verisi bırakmaz, revision/audit normal şekilde ilerler.

| Komut / yöntem | Sonuç |
|---|---|
| Eski derleme + yeni delayed-version browser regresyonu | Beklenen başarısızlık: açık editor sırasında 1 okuma; 0 bekleniyordu |
| `node --test --test-reporter=tap tests/portal-refresh.test.mjs tests/workspace-navigation.test.mjs tests/storage-order.test.mjs tests/http-transport.test.mjs tests/domain-boundaries.test.mjs` | **77/77**, fail/skipped/cancelled 0; 14 yeni scheduler testi |
| `npm run check:domain` | 35 shared kaynak, recursive AST sınırı geçti |
| `npm run format:check` | Geçti |
| `npm run build` | TypeScript/Vite geçti; yalnız geçici site/.compiled/manifest yazıldı |
| `node scripts/check-deployment-package.mjs` | **398 kaynak / 7 güncel çıktı**, 406 tarihî çıktı temiz geçici pakete alınmadı |

Yeni unit testleri current busy/focus, mikro görev yarışı, delayed version, notification burst/serial follow-up, ongoing-read sırasında editor açılışı, poll paylaşımı, hidden page, stop/reactivation, eski completion, session değişimi ve read/version hatasının kontrollü yeniden denenmesini sınar. Genel Linux keşfine ve Windows sentetik süitine eklendi. Yeni browser kontrolü ortak CI runner'da mevcut entity-editor kontrollerinden önce çalışır.

Yeni portal-refresh (2), mevcut entity-editors (4), risk-concurrency (7), session-consistency (7) ve calendar-drafts (2) kontrolleri aynı geçici fixture içinde **22/22 geçti**, pageerror yok. Geciken sürüm yanıtı açık proje taslağını bekledi; kapandıktan sonra tek okuma güncel sorumluyu gösterdi ve taslak adı sunucuya yazılmadı. Beş bildirim ilk bekleyen snapshot sırasında paralel okuma açmadı; tek takip okuması sonraki değişikliği gösterdi. Mevcut started-before-editor snapshot/conflict ve session polling davranışları korundu.

## Kalan işler ve sınırlar

Bu inceleme tüm uygulamanın güvenli/stabil olduğunun veya kurum ortamında performansının kanıtı değildir. Native MSSQL bu kaynak için yeniden çalıştırılmadı; backend SQL değişmedi. Backend Orta bağımlılık uyarısı, N3 snapshot/global lock maliyeti, N6 canlı yayın/eski bundle saklama ve Windows servis/ACL/CA/proxy/TLS/yedek/yük kabulü devam eder.

Sıradaki konu: **N3 — backend mutasyonlarında tam snapshot okuma/kopyalama/doğrulama maliyeti**. Güncel sentetik ölçüm ve çağrı zinciri üzerinden en pahalı aşama belirlenecek; CAS, aylık limit ve transaction bütünlüğünü koruyan dar iyileştirme değerlendirilecek. SQL.js ölçümü native MSSQL kilit bekleme veya gerçek p95/p99 kabulünün yerine geçmez.

## CI kanıtı ve aktarım kontrolü

Test edilen kaynak **`20c66088f321905e437c5b50c1f329f7c317709c`**. [Kalite koşusu 37915006005](https://github.com/zaferond/AA-Kaynak-Planlama-Sistemi/actions/runs/37915006005) başarılı: **Ubuntu 602/602**, **Windows 252/252**, **Chromium 145 kontrol**. Fail/skipped/cancelled 0; Windows ile genel süit örtüşür ve toplamlar toplanmaz. Biçim/domain/TypeScript/build/manifest, iki işletim sisteminde temiz paket kabulü ve iki audit Yüksek eşiği geçti. Audit eşiği mevcut backend Orta uyarısını kapatmaz.

[Güvenli metadata, test toplamları ve indirilen log hash kaydı](ci-evidence/quality-20c6608-receipt.json). Ham loglar veya bağlantı bilgileri Git'e eklenmez. Kanıt/dokümantasyon commit'i üretim kodunu değiştirmez; ayrı tam CI koşusu iddiası değildir.

Uygulama klasörüne aktarım kontrolü önceki manifest ve dosya hash'lerini, yerel değişikliklerin korunmasını ve doğrulanmış geçici derlemeyle **398 kaynak / 413 site çıktısı / 7 güncel çıktı** eşitliğini denetler. Doğrulanmış yeni JS ve index plain/gzip çıktıları seçilerek aktarılır; tarihî bundle'lar silinmez. Seçilen dosyalar geri alınabilir yedekle aktarılır, manifest en son yazılır. Yedek konumu: `.deployment-backups/2026-10-09-portal-refresh-final`. Bu işlem servis yeniden başlatması veya çalışan veritabanına işlem içermez.
