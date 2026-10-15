# N3 — Planlanan yazmalarda dar taslak ve doğrudan delta

## Durum ve kapsam

8 Ekim 2026. Başlangıç: `785ad08a1d3a3b57819926b09a4f6c49e5c36c45`. Önceki [N3 ölçümü ve kişisel okuma kapsamı](N3-SNAPSHOT-KILIT-OLCUM-VE-OKUMA-KAPSAMI-2026-10-08.md) korunur. **N3 kısmen giderildi; tam snapshot okuması, tam veri doğrulaması ve global yazma kilidi sürüyor.** Bu çalışma üretim kapasitesi veya uygulamanın tümü için güvenlik garantisi oluşturmaz.

## Dar değişiklik

- `backend/operations.mjs`: sadece bu modülün ürettiği, WeakSet kimliğiyle tanınan planlanan tahsis komutu dar taslak kullanabilir. Komut verisi transaction içinde yeniden parse edilir ve tüm türlerin `allocation` olduğu yazmadan önce kontrol edilir. Keyfi callback, üzerine özellik eklenmiş callback ve karışık işlemler eski tam kopyalama yolunda kalır.
- `backend/mutation-snapshot.mjs`, `backend/store.mjs`: bu komutta yalnız tahsis ve revision haritaları kopyalanır. Diğer yeni SQL snapshot alanları okunur; tam Zod/doğrulama yeni nesneler üzerinde normalizasyon yapar. Kullanıcı güncelliği/yetkisi, revision, audit, kalıcılık ve transaction sınırları korunur. Beklenmeyen harita şekli tam kopyalamaya döner.
- `backend/planning-response.mjs`, `shared/access.ts`: güncel taban ve değişmeyen diğer veri koşulları sağlandığında tam view/actual projeksiyonu ve admin kullanıcı listesi oluşturulmadan delta döner. Aktif hesabın SQL üzerinden doğrulanması sürer. Planlanan revision görünürlüğü tam view ile ortak politikayı kullanır. Normal kullanıcılara planlanan revision verilmez; manager yalnız görünür takımlarını alır.
- Eski taban, protokole katılmayan istemci, normalizasyon ve planlama dışı değer/revision değişiklikleri tam snapshot yolunu korur. Sıfır, aynı değer yazması ve silme tombstone revision'ları korunur.

## Güvenli doğrulama

Gerçek `.env`, kullanıcı, veritabanı ve çalışan süreç kullanılmadı. Git kaynaklarından geçici dizin, mevcut bağımlılıkların geçici kopyası/symlink'i ve her testin kendi SQL.js dosyası/sentetik hesapları kullanıldı.

| Komut | Yerel sonuç |
|---|---|
| `node --test tests/mutation-snapshot.test.mjs tests/planning-snapshot.test.mjs tests/transaction-profile.test.mjs tests/store-persistence.test.mjs tests/scope-index.test.mjs tests/concurrency.test.mjs tests/record-access-http.test.mjs` | 76/76, fail/skipped/cancelled 0 |
| `npm run check:domain` | 35 shared dosyada AST sınır kontrolü başarılı |
| `npm run build` | TypeScript ve site derlemesi başarılı |
| `npm run deploy:verify` | Kaynak/artifact farkı yok |

Yeni regression kontrolleri: dar taslağın önceki tahsis/revision'ı değiştirmemesi; komut kimliğinin taklit edilememesi; çağrıdan önce girdi değiştirildiğinde karışık komutun reddedilmesi; bozuk ilgisiz actual/saat/takvim verisinin tam doğrulamada reddedilmesi; delta hazırlığı yazmadan sonra hata verirse audit/generation/değerlerin rollback ve yeniden açılışta korunması; manager kapsamı ve eski taban fallback'i. Mevcut permission/revision/HTTP/concurrency/disk kontrolleri de çalıştırıldı.

## Ölçümün doğruluğu ve CI kapısı

Ölçüm aracı callback'i sararak komut kimliğini değiştiremez: planlanan komut aynen iletilir. Bu kimlik ve delta metodunun senkron dönüşü test edilir. Command+validation+diff hazırlığı beraber ölçülür; doğrulama süresi tek başına ölçülmüş sayılmaz.

Native profile'a, her patch sonrası generation'ı güncelleyen 40 işlemlik `planning-delta-chain` eklendi. Eski sabit tabanlı 15 contention senaryosu korunur; default toplam 16 senaryo / 640 işlem / 340 yazma olur. Zincir iki bağımsız SQL havuzu üzerinden ilerler, son görünüm doğrudan SQL view ile eşit olmalıdır; her adım tek kilit, bir dar kopya, sıfır tam view ve sadece aktif hesabın tek satırlık SQL kontrolünü doğrular. Ham SQL, parametre, bağlantı ve kullanıcı verileri rapora konmaz. Windows kalite kapısına planlanan snapshot ve kopyalama regression testleri eklendi.

### İlk CI ve Windows test düzeltmesi

Planlanan değişiklik sürümü `ae28c2c261d3f3a846a14bd9bf3b05fb76547fb4`. Native [37776609079](https://github.com/zaferond/AA-Kaynak-Planlama-Sistemi/actions/runs/37776609079) başarılıdır; JSON/hash doğrulaması aşağıda kayıtlıdır. İlk kalite [37776557819](https://github.com/zaferond/AA-Kaynak-Planlama-Sistemi/actions/runs/37776557819) **başarısızdır**: Ubuntu **530/530**, Chromium **133** ve audit kapıları başarılı; Windows **178/181**, üç disk rollback testi yalnız POSIX hata kodlarını beklediği için durdu. [Başarısız kalite kaydı](ci-evidence/quality-ae28c2c-receipt.json) korunur.

Bu üç test önceden Windows kapısında bulunmuyordu. Windows CI'da geçici DB hedefini bir klasör yaparak oluşturulan kontrollü rename hatası `EPERM`; POSIX'te `EISDIR/ENOTDIR` oldu. Test predicate'i yalnız fixture'ın kaynak/hedef yollarındaki `rename` ve platforma uygun hata kodunu kabul eder. Rollback, audit/generation ve yeniden açılış eşitliği kontrolleri kaldırılmadı. Uygulama/adapter kodu değişmedi. Düzeltilmiş test yerelde `node --test tests/planning-snapshot.test.mjs` **22/22** geçti. **`4bec49706b5986ad1d8e07d6b1318d08961000e8`** için [37777354538 kalite koşusu](https://github.com/zaferond/AA-Kaynak-Planlama-Sistemi/actions/runs/37777354538) **başarılıdır**: Ubuntu **530/530**, Windows **181/181**, Chromium **133**; biçim/domain/TypeScript/build/manifest ve backend/frontend Yüksek eşikli audit kapıları geçti. [Kalite kaydı](ci-evidence/quality-4bec497-receipt.json). İlk başarısız kayıt korunur; iki başarılı test toplamında fail/skipped/cancelled 0. Windows genel suite ile örtüşür. Audit başarısı backend Orta bağımlılık uyarısını kapatmaz. Native ölçüm bu test dosyasını çalıştırmaz; native komut ve tüm 380 uygulama/derleme/ölçüm girdisi bu test-only düzeltmesinden etkilenmez.

## Native kanıt ve ölçüm sonucu

Test edilen kaynak **`ae28c2c261d3f3a846a14bd9bf3b05fb76547fb4`**, [37776609079](https://github.com/zaferond/AA-Kaynak-Planlama-Sistemi/actions/runs/37776609079): **21/21**, 16 senaryo / 640 işlem / 340 yazma; iki havuz, şema 31, temizlik başarılı. SQL Server 16.0.4295.3 Developer, uyumluluk 160 ve Node 24.21.0. [Native JSON](ci-evidence/native-mssql-ae28c2c.json) byte olarak korunur; [koşu ve hash karşılaştırması](ci-evidence/native-mssql-ae28c2c-receipt.json) tüm **467** dosyanın test commit'iyle eşit olduğunu gösterir. JSON SHA-256: `651b0db388725ebc20054d13de300e54f945b4d18cfbb8c892d01e39f24a0f3a`. Ham loglar depoya eklenmez.

`planning-delta-chain`: **40/40 delta**, her adım **1 dar kopya / 0 tam snapshot kopyası / 0 tam view hazırlığı**. Aktif principal SQL kontrolü **1 satır**, tam admin listesi sorgulanmıyor. SQL çağrısı medyanı **22**; JSON boyutu medyanı **297 bayt**. Zincir sonu bağımsız havuzun tam SQL görünümüyle eşit; generation/revision/audit sayıları doğru. Eski sabit tabanlı planlama senaryoları, her düzeyde **1 delta / 39 full** ile güvenli fallback'i koruyor; bunlarda SQL çağrısı medyanı **24**, users satırı medyanı **4**.

| Senaryo | Eşzamanlılık | Örnek sayısı | Store medyan / örnek p95 (ms) |
|---|---:|---:|---:|
| Sabit tabanlı planlama yazması | 1 | 40 | 333,539 / 374,489 |
| Sabit tabanlı planlama yazması | 4 | 40 | 1.373,274 / 1.424,570 |
| Sabit tabanlı planlama yazması | 12 | 40 | 4.186,057 / 4.442,745 |
| Güncel tabanlı delta zinciri | 1 | 40 | 333,465 / 376,355 |

Bu süreler hâlâ önemli tam okuma/doğrulama maliyetini içerir. Önceki CI farklı runner ve fixture aşamasındaydı; süre azalması için kontrollü A/B veya üretim kapasitesi iddiası yapılmaz. Delta zinciri ile sabit tabanlı senaryolar da aynı veritabanında farklı sıralarda çalışır; süre farkı yalnız delta optimizasyonuna atfedilmez. Kopyalanmayan alanlar, tam projeksiyonun atlanması ve sonuç eşitliği doğrudan kanıttır. Bellek tüm Node sürecinden örneklenir; SQL IO/plan/DMV veya HTTP/WAN ölçümü değildir.

Windows test düzeltmesi **`4bec497`** için [ayrı karşılaştırma](ci-evidence/native-mssql-ae28c2c-4bec497-comparison.json): 467 dosyadan **466 eşit**, tek fark native runner'ın çalıştırmadığı `tests/planning-snapshot.test.mjs` içindeki hata predicate'idir. **380 uygulama/derleme/ölçüm girdisi, native çalışma modülleri ve workflow'lar eşittir.** `4bec497` üzerinde yeni native koşu yapıldığı iddia edilmez; native başarısı yukarıdaki kendi commit'ine aittir. Bu test-only fark için gereksiz SQL yük tekrarı yerine ayrı güncel Windows kalite koşusu kullanılır.

**Sonraki aşama:** [MSSQL metadata toplu okuması ve güncel kanıtlar](N3-MSSQL-SNAPSHOT-TOPLU-OKUMA-2026-10-08.md). Yukarıdaki rakamlar bu önceki aşamanın kendi commit'ine aittir.

## Kalan sınırlar

Tüm yazmalarda SQL tam snapshot okunuyor ve tam doğrulama/global lock uygulanıyor. Dar taslak, Zod'un doğrulama kopyasını veya audit/diff taramalarını kaldırmaz. Bir sonraki N3 adımı, referans/kapsam/hata kontrollerini koruyan hedefli yazma sorguları için ayrı tasarım ve eşdeğerlik kanıtıdır. Bu çalışma HTTP/WAN, SQL fiziksel IO/plan, kurum asgari SQL hesabı, kurum TLS/Windows servis ve gerçek yük kabulünü kapsamaz. N2 backend Orta bağımlılık uyarısı, N5 ortak istek yaşam döngüsü ve N6 eski asset temizliği ayrıca kalır.
