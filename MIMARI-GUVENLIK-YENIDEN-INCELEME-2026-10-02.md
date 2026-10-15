# Mimari ve güvenlik — yeniden inceleme

**Tarih:** 2 Ekim 2026\
**İncelenen kaynak:** `main`, `b59fdf5df375d13959829b8adc8367d9a35a9433` (35. adım sonrası).\
**Güncel durum — 3 Ekim 2026:** İlk incelemenin ve önceki turların bulguları aşağıda tarihsel kayıt olarak korunuyor. Son dokuz bulgunun kod/CI düzeltmeleri tamamlandı; B1'in genel editör kapsamı ve B2'nin parola/başlangıç sürümü ek kontrolleri dahil B1–B6 için yerel sentetik doğrulamalar başarılıdır. Önerilen sıranın ortak Excel / Store / App ayrıştırması da tamamlandı; 402 kaynak testi ve 53 tarayıcı grubu başarılıdır. Yerel sentetik HTTPS/proxy kontrolü geçti. Güncel sonuçlar [3 Ekim düzeltme raporunda](MIMARI-GUVENLIK-DUZELTMELER-2026-10-03.md). Native MSSQL/Windows/proxy ve kurum kurtarma doğrulamaları ayrı kalır.

## Sonuç

Önceki ayrıştırmalar işe yaramış: ortak hesaplama/yetkilendirme modülleri, komut hazırlama, veri tabanı adaptörleri, transaction ve kayıt çakışması kontrolleri mevcut. Ancak projenin bütünü için “temiz mimari tamamlandı, yeni hata kalmadı” sonucu çıkmıyor. Yapı, katmanları kısmen ayrılmış bir monolit. Özellikle açık taslak ile güncel snapshot/revision arasındaki ilişki ve migration kataloğunun farklı yerlerde tutulması gerçek hatalara yol açıyor.

**Altı bulgu grubu doğrulandı.** Yedek bulgusunun iki ayrı yeniden üretimi var. Öncelikli ikisi sessiz kayıt ezilmesi ve yedek doğrulaması. İncelenen yollarda yeni bir SQL injection, doğrudan XSS veya sunucu tarafı rol aşımı doğrulanmadı; bu sonuç uygulamada hiçbir güvenlik açığı bulunmadığı garantisi değildir.

## Kapsam ve kanıt

- `backend`, `shared`, `frontend` ve `scripts`: **199 kaynak dosyası / 36.893 satır** (`.mjs`, `.ts`, `.tsx`, `.css`; paketler ve üretilen çıktılar hariç). Bu sayı inceleme envanteridir, her satırın aynı ayrıntıda incelendiği iddiası değildir.
- Mimari bağımlılıklar, kimlik doğrulama/CSRF/rol kontrolleri, SQL sınırları, kayıt/revision akışları, ortak hesaplama ve tarih kuralları, risk/rapor düzenleme, Excel, migration/yedek ve kalite kapıları incelendi.
- `npm run verify`: **361/361 test**, biçim, TypeScript ve üretim derlemesi başarılı.
- `npm run test:ui`: **28/28 tarayıcı kontrol grubu** başarılı; risk, takvim, yetki, geçmiş, import/restore. Bu gruplar 361 test sayısına dahil değildir.
- Root ve frontend `npm audit`: inceleme anında **0 bildirilen bağımlılık açığı**. İş mantığı ve uygulama güvenliğini ölçmez.
- TypeScript AST ile statik olarak çözülebilen yerel runtime import/export bağlantıları tarandı: **döngü bulunmadı**, `shared` → backend/frontend bağımlılığı bulunmadı. Type-only bağlantılar hariç; hesaplanan dinamik importlar için bütünlük iddiası yoktur.
- Yeniden üretimler geçici SQL.js, sentetik hesap/veri ve ayrı HTTP portuyla yapıldı. Gerçek uygulama DB'sinde test kayıtları, oturum açma, silme veya restore yapılmadı.

## Doğrulanmış bulgular

### B1 — P1: Risk taslağı başka kullanıcının kaydını sessizce ezebiliyor

**Yer:** [App yenileme](frontend/src/App.tsx#L227), [App kayıt](frontend/src/App.tsx#L556), [RiskTable taslak](frontend/src/RiskTable.tsx#L397).

Risk satırı açılırken kaydın revision'ı taslakla birlikte tutulmuyor. Ana ekran yenilemesi yalnız parent `editor`/`saving` ve odaklı input/textarea kontrol ediyor; odaklı select ile çocuk bileşenin risk taslağı bu korumaya dahil değil. Yenilenen props mevcut taslağı değiştirmiyor. Kaydet ise taslak açılışındaki revision yerine ana ekrandaki en son revision'ı gönderiyor.

**Yeniden üretim:**

1. A, revision 1'deki riski açıp tanımı değiştiriyor; olasılık seçimi odakta kalıyor.
2. B, aynı riskin sebebini değiştiriyor: revision 2.
3. 15 saniyelik kontrol A'nın ana verisini yeniliyor; A'nın taslağı eski sebebi koruyor.
4. A Enter ile kaydediyor. İstek revision **2**, yanıt **200**; B'nin yeni sebebi eski sebebe dönüyor.

Sunucunun 409 koruması çalışsa da istemci yanlış revision gönderdiğinden çakışmayı göremiyor. Bu, varsayımsal yarış değil, gerçek Chrome ve sentetik HTTP/DB ile doğrulanmış veri kaybıdır.

**Öneri:** Taslak sözleşmesi `value + baseRevision` taşımalı; kaydet/sil bu revision ile çalışmalı. Yenileme koruması odak sorgusu yerine bütün açık/kirli editörleri kapsamalı. Çakışmada taslak korunmalı, yeniden yükleme/birleştirme seçeneği verilmelidir. Diğer editörlerde aynı sözleşme ayrı kontrol edilmeli; bu rapor hepsinde aynı hata olduğunu iddia etmiyor.

### B2 — P1: Yedek doğrulaması eksik migration veya gerekli sütunu kabul ediyor

**Yer:** [currentSchema](scripts/maintenance-snapshot.mjs#L40), [inspect](scripts/maintenance-snapshot.mjs#L69), [migration 12](backend/store.mjs#L291).

**B2a — migration kataloğu eksik:** `requiredVersions`, yalnız `NNN_sqljs.sql` dosyalarından çıkarılıyor. Store içinde kodla çalışan migration **3 ve 12** bu listede bulunmuyor. Migration hash'i de bu kodları kapsamıyor.

Sentetik güncel DB'den yalnız version 12 kaydı kaldırıldı; `writeBundle` ve `verifyBundle` bunu geçerli şema 29 yedeği olarak kabul etti. Ayrı dosya uygulamayla açıldığında migration 12 yeniden çalıştı ve Ocak gerçekleşen kaynağı **0,10 → 0,11** dönüştü. Bütünlük/hash doğrulaması geçmesine rağmen geri açılışta iş verisi değişti.

**B2b — sütun kataloğu denetlenmiyor:** `kp_users.password_hash` sütunu çıkarılmış, şema sürümü ve tablo adları korunmuş sentetik DB de tam yedek üretme ve doğrulamadan geçti. Dosyanın SQLite bütünlüğü sağlam olması, uygulamanın ihtiyaç duyduğu hesap şemasının tam olduğu anlamına gelmiyor.

**Öneri:** SQL ve kod migration'ları tek sürümlü katalogda birleştirilmeli; gerekli tabloların sütunları, anahtarları ve önemli kısıtları denetlenmeli. “Doğrulandı” sonucu için güncel uygulamayla ayrı ortamda read/auth/model kontrolü de eklenmeli. Eksik migration'ı otomatik tamamlayarak kabul etmek veri dönüşümünü gizler; doğru yaklaşım reddetmek ve açık kurtarma prosedürüdür.

Bu bulgu mevcut gerçek yedeğin bozuk olduğu anlamına gelmez; doğrulayıcının kabul etmemesi gereken görüntüleri kabul ettiğini gösterir. Native MSSQL yedek prosedürünün çalıştırılmış sonucu değildir.

### B3 — P2: Uzun kritik notlar Excel hücre sınırını aşıyor

**Yer:** [rapor detayının birleştirilmesi](frontend/src/project-info-report-export.ts#L38), [hücre yazımı](frontend/src/project-info-report-export.ts#L12), [sınırsız not şeması](shared/server-domain.ts#L64).

40.000 karakterli geçerli not backend doğrulamasından geçti. Raporun ürettiği `C4` hücresi tarih/bullet ile **40.028 karakter** oldu; workbook üretimi hata vermeden tamamlandı. Aynı başlığın bütün konuları tek hücrede toplandığından, birden fazla kısa not da toplam sınırı aşabilir.

Excel hücresi en fazla **32.767 karakter**, hücre içi satır sonu sayısı en fazla **253**; satır yüksekliği en fazla **409 punto**. [Microsoft Excel sınırları](https://support.microsoft.com/en-us/excel/excel-specifications-and-limits).

Bu çalışmada native Excel ile onarım/açılış sonucu ölçülmedi. Doğrulanan sonuç sınırı aşan dosya üretimidir; açılma/onarım, metin kaybı veya metnin tamamının görünmemesi riski vardır.

**Öneri:** Sistemde sınırsız metin isteği korunmalı; export metni kesmeden devam satırlarına/hücrelerine bölmeli. Karakter ve satır sonu kontrolleri ortak Excel katmanında uygulanmalı. Diğer exportlar aynı kurala geçirilmelidir.

### B4 — P2: Çalışanın liderliği değişince kendi kaydı görünümden kaybolabiliyor

**Yer:** [kaynak görünürlük filtresi](shared/access.ts#L101), aynı dosyadaki `canSeeResourceMonth`.

Normal kullanıcının kişi bazlı actual/izin yetkisi `resourceId` ile belirlenirken, kaynak listesi yalnız hesapta seçili liderlik takımları ile filtreleniyor. Kaynak yeni liderliğe taşınıp hesap liderlik eşleştirmesi eski kalırsa kişinin kendi actual verisi görünümde bulunuyor, kendisi kaynak listesinde bulunmuyor.

**Yeniden üretim:** `scopeData`'ya gerçek fixture modeli, normal `employee` hesabı ve diğer liderliğe taşınmış `r-own` verildi. `resources` içinde `r-own` yok; `actualAllocations['r-own|p-a|2026-01'] = 0.1` korunuyor. Ekran kişi listesini `resources`'tan kurduğu için kendi giriş satırını kaybeder. Bu kontrol ortak görünüm fonksiyonunda yapıldı; tarayıcıda takım taşıma akışının uçtan uca testi değildir.

**Öneri:** Normal kişinin kendi kaydının görünürlük ve yazma kuralları birlikte tanımlanmalı. Kendi kaydı için gerekli güvenli assignment bilgisi liderlik filtresinden bağımsız korunabilir; başka kişilerin bilgisi açılmamalı. Yönetici kapsamı aynı şekilde genişletilmemelidir.

### B5 — P2: Zorunlu işbaşı tarihi yalnız ön yüzde zorunlu

**Yer:** [frontend kuralı](frontend/src/features/editor-commands.ts#L103), [backend kuralı](shared/server-domain.ts#L289).

Frontend çalışan statülerinde boş tarihi reddediyor. Backend yalnız dahil edilmiş Aktif İlan ve İşten Ayrıldı için zorunluluk uyguluyor; Aktif Çalışan, SAAT Ücretli Ofis Ç. ve Gear Up için boş start kabul ediyor.

Sentetik Store'un gerçek kayıt/validate yolu ile bu **üç statüde de `start: ''`** kalıcı olarak kaydedildi. Normal kullanıcı bu endpoint ile kaynak değiştiremez; bulgu rol aşımı değil, doğrudan API/veri yükleme yoluyla iş kuralının aşılmasıdır.

**Öneri:** İşbaşı zorunluluğu/default politikası ortak kural olmalı ve sunucuda uygulanmalı. Eski tarihsiz kayıtlar için ayrı uyarlama planlanmalı; bütün tarihi kayıtları körlemesine güncellemek geçmiş kapasiteyi değiştirebilir.

### B6 — P2: Başka sekmede hesap değişince açık sekme eski kullanıcı görünümünü tutuyor

**Yer:** [sekme içi oturum cache'i](frontend/src/storage.ts#L7), [version kontrolü](frontend/src/storage.ts#L116), [App yenileme](frontend/src/App.tsx#L247).

Oturum epoch'u ve kullanıcı/cache yalnız mevcut JS sekmesinde tutuluyor. Login/logout sekmeler arası sinyal yayımlamıyor. `/api/version` yalnız veri generation'ını kontrol ediyor; hesap değişimi generation'ı artırmıyor.

Açık admin sayfasıyla aynı tarayıcı bağlamında logout ve normal kullanıcı login'i yapıldı. Sunucu `/auth/me` rolü **normal** döndürdü. Bir sonraki başarılı version polling'den sonra eski sayfada **Yetki Kontrol Ekranı** sekmesi hâlâ bulunuyordu. Gerçek veri okumaları/yazmaları sunucuda yeni kullanıcıya göre yetkilendirilir; eski CSRF de yazmayı engeller. Dolayısıyla bu bir sunucu admin yetkisi kazanma bulgusu değildir. Eski yetkili snapshot'ın ve yanlış arayüzün açık sayfada kalması kimlik/cache tutarlılığı sorunudur.

**Öneri:** Login/logout/kullanıcı sürümü değişimini BroadcastChannel veya güvenli sekmeler arası bildirimle yay; açık sekmelerde taslak/cache/CSRF'yi temizle ve kimliği tekrar doğrula. Version kontrolü kimlik değişimini de algılamalıdır. Çıkış ve yeniden girişin sırası aynı sekmedeki mevcut epoch korumasını bozmamalı.

## Mimari, tekrar ve sabit kurallar

| Alan | Değerlendirme | Somut sonraki iş |
|---|---|---|
| Ortak domain | Frontend/backend ortak hesaplamaları kullanıyor; ters katman bağımlılığı ve runtime döngüsü taramada çıkmadı. | Zorunlu alan/politika kurallarını da ortaklaştır; B5 gibi frontend/server farklarını kaldır. |
| Store | 1.570 satır; migration, bütün model okuma, projection, diff persistence, audit, oturum ve kullanıcı işlemleri aynı sınıfta. | Önce migration runner/katalog, sonra kullanıcı/oturum ve planlama repository'lerini ayır. Transaction sınırını parçalama. |
| App | 1.367 satır; oturum, veri yenileme, yazma, filtre/seçim, komutlar ve bütün ekran koordinasyonu bir arada. | Taslak/baseRevision ve query/mutation katmanını ayır; B1'i yalnız dosyayı bölerek çözüldü sayma. |
| RiskTable / actual | 864 / 769 satır; görünüm, inline taslak, otomatik kayıt ve etkileşim birlikte. | Ortak edit-session sözleşmesi, alan/kolon tanımları ve tabloda gezinmeyi ayrı sorumluluklara ayır. |
| Excel | ZIP/XML kaçış yardımcıları ortak; workbook ilişkileri, paket iskeleti ve Blob indirme kodu birden fazla exportta tekrarlanıyor. | Ortak workbook writer + hücre sınırı + download; risk şablonu ve rapora özel stiller ayrı kalsın. |
| Enum/katalog | Risk kategorileri model tipi, Zod ve RiskTable'da ayrı listeler; ROOT_ADMIN_ID varken backend birkaç literal kullanıyor. | Tek sabit katalogdan tip ve şema türet; korunan admin kimliğini tek kaynaktan oku. |
| Migration | Kod içindeki ve SQL dosyalarındaki migration'lar ayrı kaynaklar. | B2'nin kök nedeni; kataloğu tekleştir, uygulanmış sıralamayı test et. |
| Stil | Dosyalara ayrılmış ama yüksek specificity/override ve ekranlara gömülü ölçüler devam ediyor. | Ortak renk/ölçü token'ları ve kapsamlı tablo stilleri. Aynı seçicinin tekrarı her zaman kopya değildir; yükleme sırası anlamlı. |
| Performans | Planning delta/read daraltması var; write hâlâ bütün model validate/snapshot ve genel transaction kilidi kullanıyor. | Büyük gerçekçi fixture'da ölç; komut kapsamlı validation/persistence'i davranışı koruyarak geliştir. Native kapasite kanıtı henüz yok. |

**Her sabit değer hatalı değildir.** Statü adları, 9 saat/gün, 180 saat referans FTE, planlama tarih aralığı ve risk matrisi kurum politikası olabilir. Bunları belirsiz ayarlara dönüştürmek hesapların anlamını değiştirebilir. Sorun aynı kuralın ayrı kaynaklarda tutulması veya değişebilir politikanın UI içinde dağınık yazılmasıdır. Frontend `shared` re-export dosyaları ayrı hesaplama kopyaları değildir.

## Güvenlikte korunması gereken iyi noktalar

- SQL değerleri parametreli; tablo/sütun isimleri sabit katalogdan geliyor.
- API'de kimlik/CSRF/rol kontrolü mevcut; değişiklik işlemi transaction içinde güncel hesap durumunu tekrar denetliyor.
- Oturum cookie'si HttpOnly/SameSite; parola scrypt ile, oturum token'ı hash ile saklanıyor. Yetki/parola değişiminde eski oturum iptali var.
- Personel özel notları normal/manager görünümünde maskeleniyor; JSON yedeği hesap/parola kapsamına alınmıyor.
- Transaction/rollback, atomik SQL.js dosya yazımı, tombstone revision ve eski session yanıtlarının reddi mevcut.
- CSP/Origin/Host kontrolleri, parser boyutları, IP/hesap giriş sınırı ve MSSQL ortak rate-limit deposu var.

Bunlar kod ve mevcut testlerin kanıtladığı korumalardır; internet üzerinden penetrasyon testi, kurum deployment doğrulaması veya bağımsız güvenlik sertifikası değildir.

## Henüz doğrulanmamış / kalan kontroller

1. **Native MSSQL (31. adım):** İki gerçek havuz/sunucu, SQL UTC/kilit/kota, migration ve yüksek hacim davranışı. SQL.js başarısı bunların kanıtı değildir.
2. **Windows, NTLM/TLS ve kurum proxy:** Gerçek ağ/servis hesabı/sertifika/ACL/Host-Origin zinciri kurulumu.
3. **Kurum yedek operasyonu:** Ayrı sunucuda gerçek kurtarma tatbikatı, şifreli depo, görev/zamanlayıcı ve sorumlu. Audit 5 yıl; tüm yedek kopyaları için süre ayrıca belirlenmelidir.
4. **CI tarayıcı kapsamı:** Normal kalite workflow'u `verify` ve audit çalıştırıyor; mevcut `test:ui` ve bu incelemedeki yeni eşzamanlı/restore senaryoları otomatik kapıda yok.
5. **Uzun/çoklu kullanıcı ölçümü:** Mevcut benchmark/native test altyapısı var; gerçek hedef kapasite ve p95/lock bekleme sonucuyla deployment kararı verilmelidir.

## Önerilen düzeltme sırası

1. **B1 tamamlandı:** açılış revision'ı, taslak korunması ve eşzamanlılık regresyonları; aşağıdaki düzeltme kaydı.
2. **B2 tamamlandı:** ortak migration kataloğu, sütun/kısıt ve uygulama modeli doğrulaması; aşağıdaki düzeltme kaydı.
3. **B6 tamamlandı:** sekmeler arası oturum bildirimi, sunucu kimliği ve taslak/cache temizliği; aşağıdaki düzeltme kaydı.
4. B4–B5: kendi kaynak görünümü ve ortak başlangıç tarihi kuralı; legacy uyumluluk kontrolü.
5. B3: uzun Excel metnini kayıpsız böl; bütün exportlarda ortak altyapı.
6. Yukarıdaki davranışlar güvenceye alındıktan sonra Store/App sorumluluklarını küçült; native ve kurum kontrollerini tamamla.

## Yeniden üretim kanıtları

Geçici klasörler işletim sistemi tarafından temizlenebilir. Kalıcı sonuçlar yukarıda sayısal olarak kaydedildi.

- Risk, uzun Excel, tarih/görünüm ve sekme değişimi: `/var/folders/z9/yl1whp294pb8d7qxxxdz_3f80000gn/T/aa-browser-checks-F2bxHN/fresh-review-results.json`.
- Yedek version 12 / sütun: `/var/folders/z9/yl1whp294pb8d7qxxxdz_3f80000gn/T/aa-browser-checks-PHOz6N/fresh-review-results.json`.
- Mevcut 28 grup: `/var/folders/z9/yl1whp294pb8d7qxxxdz_3f80000gn/T/aa-browser-checks-mPAnHG/result.json`.
- İnceleme betiği: `/tmp/aa-fresh-review-probes.mjs`; yapı envanteri: `/tmp/aa-review-structure.json`; kalite logları: `/tmp/aa-review-verify.log`, `/tmp/aa-fresh-review-ui.log`.
- İlk probe denemesindeki `bundle.folder`/`directory` ve 20 iş günlü Şubat fixture düzeltildi. Bu test betiği hataları ürün bulgusu sayılmadı. Geçerli yedek yeniden üretimi Ocak'ta 0,10 → 0,11 dönüşümüdür.

## B1 düzeltmesi — 2 Ekim 2026

- Risk satırı açıldığında değer ve revision aynı görüntüden birlikte yakalanır. Kaydet ve sil bu açılış revision'ını kullanır; arka plan yanıtı taslağın temel sürümünü değiştiremez. Diğer satıra geçişte bu çift, önceki satırın kaydı beklenmeden yakalanır.
- Değiştirilmemiş taslak, güncel props yerine açılış değerine karşılaştırılır; başka kişinin değişikliği üzerine gereksiz eski veri yazılmaz.
- Açık risk düzenleyicisi arka plan yenilemesini durdurur; odaklı select de korunur. Önceden başlamış bir okumanın başarısızlığı taslağı kapatmaz. Oturumun sona ermesi mevcut veri temizliği davranışını korur.
- HTTP 409 ayrı hata tipiyle tanınır. Taslak korunur; başka satıra/sekmeye/filtreye geçiş engellenir. **Güncel Kaydı Yükle** yalnız açık kullanıcı onayıyla yerel değişiklikleri kaldırır; onay iptali veya yükleme hatası taslağı korur. Güncel kaydı yüklemek yeni değer/revision çiftini yakalar. Otomatik birleştirme veya zorla üzerine yazma yoktur.
- Başka kullanıcı kaydı silmişse taslak tabloda kalır; eski revision ile tekrar oluşturulmaz. Güncel kaydı yükleme veya açık iptal ile kapanır.
- Eski çalışan JS ile aynı kalıcı test yeniden çalıştırıldı: açılış revision 1 olmasına rağmen gönderilen revision **2** olduğundan regresyon testi başarısız oldu. Kanıt: `aa-browser-checks-2RfJfa`. Düzeltilmiş kod aynı yarışta revision **1** / HTTP **409** döndürür; diğer kullanıcının verisi ve yerel taslak korunur.
- `npm run verify`: **365/365 test**, biçim, TypeScript ve üretim derlemesi başarılı. `npm run test:ui` çalıştırıcısının **42/42 grubu** başarılı: önceki 33 grup, 7 risk eşzamanlılık/yenileme grubu ve 2 kaydırma katmanı grubu. Tam koşu: `/var/folders/z9/yl1whp294pb8d7qxxxdz_3f80000gn/T/aa-browser-checks-KnwrYD/result.json`. Sentetik SQL.js/hesaplar; gerçek DB'ye QA kaydı veya gerçek hesapla test giriş yapılmadı.
- Sıradaki mimari düzeltme **B2: migration kataloğu ve yedek şema doğrulaması**. B3–B6, native MSSQL ve kurum ortamı kontrolleri açık kalır.

### B1 ve kaydırma düzeltmelerinin çalışan kopyaya aktarımı — 3 Ekim 2026

Son arayüzde 9 hedefli tarayıcı grubu tekrar geçti; çalışan kopyada 364 test ve TypeScript başarılı (önceden bulunan tek bağımsız test farkı korundu). `http://localhost:3000` üzerinde yeni JS/CSS/HTML aktif. Salt okunur kontrol (`2026-10-03T07:40:23.713032+00:00` UTC): **21 tablonun tüm satır içerikleri aynı**, şema 30, 203 audit; HTML/JS/CSS canonical/çalışan kopya/HTTP byte-identical, oturumsuz API 401. Gerçek DB'ye QA girişi/restore yapılmadı. Tam yedek ve önceki kaynak/site varlıkları `AA Kaynak Yedekleri/risk-draft-timeline-layers-20261002T183522Z` dizininde.

## B2 düzeltmesi — 3 Ekim 2026

- Migration katalog ve SQL yüklemesi `backend/migration-catalog.mjs` altında ortaklaştırıldı. Kodla çalışan **3 ve 12** dahil bütün zorunlu sürümler doğrulanır; v2 eski kişi tahsis tablosu isteğe bağlı kalır. Katalog dışı/eksik SQL kaynakları reddedilir.
- Store'un migration/ilk katalog kurulum bloğu `backend/schema-migrations.mjs` içine alındı. Tek transaction, tarihsel 24→23 sırası, 5/6 GO ayrımı ve veri dönüşümleri korundu. Yeni DB migration'ı veya iş verisi dönüşümü eklenmedi. Normal uygulama başlatma/upgrading davranışı tarihsel kuralları korur; yedek doğrulayıcısı kaynak DB üzerinde migration/otomatik tamamlama çalıştırmaz.
- Yeni yedek hash'i SQL dosyalarının yanında migration kodunu, saat hesap yardımcılarını ve başlangıç kataloğunu kapsar. Aynı şema ve aynı SQL kaynaklarının eski hash'iyle oluşturulmuş geçerli v1 yedekler, **bütün yeni şema/model kontrollerinden geçerek** kabul edilir. Farklı uygulama sürümüne ait yedekler için uygun kaynak sürümü gereklidir.
- Beklenen SQLite şeması, katalogdaki DDL ile ayrı boş bellek içi DB'de üretilir. Bütün gerekli sütunlar, tip/nullability/default/PK sırası, FK, UNIQUE/collation ve CHECK ifadeleri karşılaştırılır. İsteğe bağlı legacy kişi tahsis tablosu mevcutsa onun yapısı da kontrol edilir. İkincil performans indekslerinin tamamı için eşitlik iddiası yoktur.
- Tam yedek oluşturma/doğrulama ayrıca gerçek Store'un model ve hesap okuma yollarını, ortak model doğrulamasını salt okunur özel görüntüde çalıştırır. Geçersiz JSON veya uygulama modeli kabul edilmez. Gerçek dosyada Store connect/migrate çalıştırılmaz; veri, hesap ve oturumlar değiştirilmez. Gerçek parola ile giriş bu kontrolün parçası değildir; sentetik kurtarma testinde giriş parolası doğrulandı.
- **5 yeni regresyon grubu:** eksik 3/12 ile üretme/doğrulama reddi (manifest/hash yeniden hesaplanmışken de); eksik parola sütunu ve yedi geçerli fakat zayıflatılmış şema varyantı; eski hash ile kurtarma ve hesabın parolası/modeli; geçersiz uygulama JSON'ı; gerçek v2→30 yükseltme ve isteğe bağlı legacy tablo. Kaynak baytlarının korunması ve reddedilen kaynağın tamamlanmış paket yayımlamaması denetlendi.
- `npm run verify`: **370/370 test**, biçim, ortak kaynak kontrolü, TypeScript ve üretim derlemesi başarılı. Native MSSQL sonucu veya gerçek veriyle geri dönüş iddia edilmez.
- **Sıradaki B6:** tarayıcı sekmeleri arasında kimlik/CSRF/cache tutarlılığı. Ardından B4–B5 ve B3; native/kurum ortamı kontrolleri ayrıca açık.

### B2 çalışan kopya ve yedek doğrulaması — 3 Ekim 2026

- Tam kalite koşusu **370/370 test**, 42/42 tarayıcı grubu başarılı; tarayıcı kanıtı `/var/folders/z9/yl1whp294pb8d7qxxxdz_3f80000gn/T/aa-browser-checks-pD5Y3e/result.json`. Native MSSQL/Windows/proxy ve kurum kurtarma operasyonu bu sonuçlara dahil değildir.
- Yeni doğrulayıcı hem bu aktarımın yeni tam yedeğini hem de B1 sırasında eski SQL hash'iyle üretilmiş tam yedeği kabul etti: ikisi de şema 30, **203 audit**. Bu, gerçek kayıtların korumalı kopyasının okunabildiğini doğrular; gerçek hesapla giriş veya gerçek DB'ye restore testi yapılmadı.
- 12 kaynak/test/kılavuz yolu çalışan kopyaya aktarıldı. Paket, başlatıcı ve önceki tek test farkları korundu. Uygulama normal komutla yeniden başlatıldı; `http://localhost:3000` açık. Aktarım öncesi kaynaklar, tam yedek ve kapanış sonrası disk görüntüsü `AA Kaynak Yedekleri/backup-schema-catalog-20261003T080817Z` altında; sayısal sonuç `deploy-result.json` içinde.
- Salt okunur kontrol (`2026-10-03T08:15:07.155Z` UTC): **21 tablonun bütün satır içerikleri aynı**, şema 30 / 203 audit; HTML/JS/CSS canonical/çalışan kopya/HTTP aynı, oturumsuz API 401. Yeni migration veya iş verisi dönüşümü eklenmedi.

Çalışan üst kopyanın ek doğrulaması: **369/369 test** ve TypeScript başarılı; canonical ile önceden bulunan tek bağımsız test farkı korundu.

## B6 düzeltmesi — 3 Ekim 2026

- Başarılı giriş/çıkış ve bağlı oturumun sona ermesi, `session-events.ts` üzerinden BroadcastChannel ve storage bildirimleri yayımlar. Bildirim yalnız protokol sürümü ve rastgele olay/sekme kimlikleri içerir; kullanıcı, veri snapshot'ı, cookie, CSRF veya sunucu oturum işareti paylaşılmaz. Aynı sekmeden gelen ve iki yoldan tekrarlanan olaylar ayıklanır. Kanallardan birinin kullanılamaması diğerini bozmaz.
- Sunucu `/auth/login`, `/auth/me` ve `/version` JSON'ına, bütün doğrulanmış API yanıtlarına da header olarak aynı oturum işaretini ekler. İşaret session ID/cookie değildir; ayrı alanla hash'lenir ve giriş bilgisi olarak kullanılamaz. Aynı hesaba yeniden girişte de değişir. Kimlik ve yetki kontrolü sunucuda korunur; yeni DB migration'ı yoktur.
- Başka sekmedeki değişimde yerel kullanıcı/CSRF/snapshot/generation/kuyruk temizlenir; Portal yeni instance olarak açılır. Seçimler, açık pencereler ve risk taslakları yeni hesaba taşınmaz, otomatik kaydedilmez. Yeni kullanıcı yalnız `/auth/me` ve kendi kapsamındaki `/data` yanıtından yüklenir. Sinyalde sahte rol/CSRF gönderilmesi yetki vermez.
- Version polling, veri generation'ı değişmese ve editör açık olsa bile oturum değişimini algılar. Odak/görünürlük geri geldiğinde sunucu kontrolü yapılır; bu, bildirimin kaçırıldığı veya iki kanalın da kapalı olduğu durumları kapsar. Aynı oturumdaki geçici 503/ağ hatası editörü kapatmaz. Gerçek 401 oturumu temizler; hatalı giriş parolası başka sekmelere başarılı hesap değişimi diye yayımlanmaz.
- Önceki oturumdan gelen geç yanıt/401 yeni cache'i veya girişi değiştiremez. Artık beklenmeyen yanıtların gövdeleri iptal edilir. Eski sıraya alınmış yazılar reddedilir; yeni oturumun kuyruğu eski isteğin bitmesini beklemez. Portal işlemleri oturum bağlamına bağlıdır; dosya okuması sırasında hesap değişirse eski yedek yeni hesabın CSRF'siyle restore gönderemez. Başarısız logout mevcut bağlamı iptal etmez.
- **7 yeni birim/HTTP grubu:** aynı generation/different session ve eski/yeni yazma kuyruğu; API gövdesinden önce kimlik reddi; dış sinyal/eski 401; bildirim gizliliği ve başarısız giriş/çıkış; geçici kontrol hatası/sona erme ve döngü; dosya okuma/restore yarışı; sunucu işaretinin kararlılığı/dönüşü, değişmeyen generation, eski CSRF reddi ve işaretle sahte girişin 401 olması.
- **7 yeni gerçek Chrome grubu:** iki sekmede çıkış/giriş ve açık taslak; BroadcastChannel olmadan storage; storage kapalıyken BroadcastChannel; iki kanal kapalıyken değişmeyen generation ile polling; odak kontrolünde 503/taslağın korunması ve hesap değişimi; geciken admin snapshot'ı; aynı hesaba tekrar girişte taslak ve CSRF yenileme. Testler sentetik hesap/DB ile çalışır.
- Önceki çalışan JS aynı iki-sekme testinde başarısız oldu: başka sekmeden çıkıştan sonra eski sekme 10 saniyede giriş ekranına geçmedi (`aa-browser-checks-uKdmPB`). İlk yeni QA denemelerinde bırakılan response body'sini Playwright ile tekrar okuma ve son kayıt fixture'ında etki/olasılık seçmemek test betiği sorunlarıydı; düzeltildi. Ürün kontrolünü gevşetmek için kullanılmadılar.
- Son `npm run verify`: **377/377 test**, biçim/ortak kaynak/TypeScript/üretim derlemesi başarılı. Tam tarayıcı koşusu **49/49**, yakalanmamış hata yok: `/var/folders/z9/yl1whp294pb8d7qxxxdz_3f80000gn/T/aa-browser-checks-DbEmPD/result.json`.
- Dağıtımdan önce açık olan eski JS sekmelerinin sayfayı yenilemesi gerekir. Native MSSQL/Windows/proxy ve kurum kurtarma kontrolleri bu yerel sonuçlara dahil değildir. Sıradaki **B4: liderlik değişiminden sonra kişinin kendi kaynağının görünürlüğü**, ardından B5 ve B3.

### B6 çalışan kopyaya aktarım — 3 Ekim 2026

12 kaynak/test/kılavuz yolu ile altı aktif HTML/JS/CSS ve gzip dosyası aktarıldı; eski hash'li varlıklar korundu. Çalışan kopyada **376/376 test** ve TypeScript başarılı; canonical ile önceden bulunan tek bağımsız test farkı korundu. Paket/başlatıcı farkları değişmedi. Backend normal `.env` komutuyla yeniden açıldı; `http://localhost:3000` aktif. Açık eski JS sayfaları bir kez yenilenmelidir.

Salt okunur aktarım kontrolü (`2026-10-03T09:25:02.026Z` UTC): **21 tablonun bütün satır içerikleri aynı**, şema 30, 203 audit. HTML/JS/CSS repo/çalışan kopya/HTTP baytları aynı; oturumsuz API 401 ve oturum işareti yok. Gerçek hesapla QA girişi, DB'de test kaydı veya restore yapılmadı. Önceki kaynak/aktif varlıklar, doğrulanarak oluşturulan tam DB yedeği, kapanış sonrası disk görüntüsü ve `deploy-result.json`: `AA Kaynak Yedekleri/session-consistency-20261003T092115Z`. Karşılaştırma aktarım anlarını doğrular; sonraki normal kullanıcı işlemleri devam edebilir.


## 3 Ekim 2026 — son salt okunur incelemenin düzeltmeleri

Sonraki dokuz bulgu ve uygulanmış sıra [ayrı düzeltme raporunda](MIMARI-GUVENLIK-DUZELTMELER-2026-10-03.md) kaydedildi. Son kaynak görüntüsünde `npm run verify` 394/394 test ve derleme, tam tarayıcı çalıştırıcısı 53/53 grup geçti. Önceki bölümlerdeki “açık/sıradaki” ifadeleri ilgili turun tarihsel durumudur; güncel durum için bu bölüm ve bağlantılı rapor esas alınmalıdır. Bu tur gerçek çalışan DB'sine yazmadı veya backend'i yeniden başlatmadı.
