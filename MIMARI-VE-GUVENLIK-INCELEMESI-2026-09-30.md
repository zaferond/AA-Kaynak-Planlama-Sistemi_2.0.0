# AA Kaynak Yönetimi — Mimari ve Güvenlik İncelemesi

> **1 Ekim 2026 güncellemesi:** Bu belge ilk incelemenin kaydıdır. Bulguların güncel durumu ve uygulanan düzeltmeler [Mimari İyileştirmeler raporunda](MIMARI-IYILESTIRMELER-2026-10-01.md) yer alır. Aşağıdaki eski kod konumları ilk inceleme sürümüne aittir.

Tarih: 30 Eylül 2026  
İncelenen Git sürümü: `4c60665`  
Depo: `AA Kaynak Planlama Sistemi_1.0.0/AA Kaynak Planlama Sistemi`

## Genel değerlendirme

Uygulamada iyi temeller var: sunucuda yetki denetimi, parametreli SQL, parola ve oturum güvenliği, kayıt revizyonları, ortak hesaplama yardımcıları ve otomatik testler. Ancak temiz mimarinin sorumluluk ayrımı ve bağımlılık yönü ilkeleri tutarlı uygulanmıyor. Özellikler büyüdükçe ana bileşen, veri katmanı ve doğrulama kodlarında bakım yükü birikmiş.

Önerim mevcut sistemi aşamalı olarak modülerleştirmek. Mevcut ihtiyaca mikroservis eklemek gerekmiyor. Önce doğrulanmış davranış hataları giderilmeli, ardından iş kuralları ortak bir çekirdeğe taşınmalı.

## Kapsam ve doğrulama

- Frontend, backend, veri adaptörleri, ortak hesaplamalar, yetkiler, Excel aktarımı, bağımlılıklar, başlatma/derleme akışı ve test düzeni incelendi.
- `npm test`: **92 test başarılı, 0 başarısız**.
- `npm --prefix frontend run typecheck`: başarılı.
- Backend `npm audit`: bilinen açık bildirimi yok.
- Frontend `npm audit`: Vite bağımlılığı için bir yüksek önem dereceli paket bulgusu; paket altında iki güvenlik duyurusu var.
- İş kuralı senaryoları bellekte örnek veriyle; giriş sınırı ayrı bir geçici HTTP sunucusunda; istemci yanıt sırası sahte ağ yanıtlarıyla doğrulandı.
- Canlı kullanıcı verisi değiştirilmedi. Uygulama kodu değiştirilmedi, commit/push yapılmadı.
- MSSQL entegrasyon testleri ve gerçek yük testi bu incelemede çalıştırılmadı. Mevcut test başarısı üretim MSSQL davranışının tamamını doğrulamaz. Bu çalışma kapsamlı bir sızma testi sertifikasyonu değildir.

## Öncelikli bulgular

### 1. Yüksek — Eğitim ve izin sonradan girilince %100 sınırı aşılabiliyor

**Durum: Örnek veriyle doğrulandı.**  
Konum: `backend/operations.mjs:49`, `:122`, `:133`, `:143`, `:154`.

Gerçekleşen dağılım ve manuel çalışma saati değişimlerinde `assertActualMonthlyLimit` çalışıyor. Kişisel takvim değişikliğinde yalnızca çalışma saatinin tamamen sıfırlanması kontrol ediliyor; aynı toplam sınırı uygulanmıyor. Ortak takvim değişikliğinde de benzer bir eksik var.

Eylül 2026 örneği:

| İşlem sırası | Gözlenen sonuç |
|---|---|
| 3 saat eğitim → %100 proje dağılımı | Reddediliyor |
| %100 proje dağılımı → 3 saat eğitim | Kabul ediliyor; toplam **%101,515** |
| %100 proje dağılımı → 3 saat izin | Kabul ediliyor; proje dağılımı **%101,538** oluyor |

İzin önce girilip ardından %100 tahsis yapılması, kalan çalışma saati üzerinden hesaplandığı için geçerli; sorun tahsis sonrasında kapasite azaltıldığında sınırın denetlenmemesi.

**Öneri:** İlgili ayın kapasitesini veya tahsisini değiştiren bütün işlemlerde aynı toplam denetimini uygulamak. Toplu işlemlerde ara adımlar yerine son durumun doğrulanması gerekir. Geçmiş kayıtların saatlerini kendiliğinden azaltmadan, aşım varsa açıkça bildirmek.

### 2. Yüksek, proxy kurulumuna bağlı — Bir kişinin giriş denemeleri herkesi engelleyebilir

**Durum: İzole HTTP uygulamasında doğrulandı; şirket proxy kurulumu ayrıca doğrulanmalı.**  
Konum: `backend/app.mjs:66`, `:90`; `IT-MSSQL-GECIS.md:19`, `:83`.

Giriş sınırı doğrudan `req.socket.remoteAddress` üzerinden tutuluyor: 15 dakikada 60 istek. Önerilen ters proxy kurulumunda uygulama tüm kullanıcıları proxy IP adresinden görüyor. Başarılı girişler ve geçersiz biçimdeki istekler de bu sayacı tüketiyor.

Testte 61 farklı istemci IP başlığıyla aynı bağlantı kaynağından istek gönderildi. İlk 60 istek şema hatasıyla 400, 61. istek 429 aldı. Gerçek proxy arkasında aynı sayaç bütün kullanıcıları etkileyebilir.

**Öneri:** Yalnızca güvenilen proxy adreslerini tanımlayıp gerçek istemci IP'sini kullanmak; başarısız giriş politikasını kullanıcı ve IP bazında düzenlemek. `X-Forwarded-For` başlığına koşulsuz güvenilmemeli. Birden fazla sunucu kullanılacaksa sayaç ortak depoda tutulmalı.

### 3. Orta — Eski ağ yanıtı yeni kaydı ekranda geri alabiliyor

**Durum: İstemci veri katmanında kontrollü yanıt sırasıyla doğrulandı; canlı tarayıcıda yük altında yeniden üretilmedi.**  
Konum: `frontend/src/storage.ts:11`, `:34`, `:64`, `:90`; `frontend/src/App.tsx:71`, `:72`, `:221`.

Yazma istekleri kendi aralarında sıraya alınıyor; bu iyi. Ancak arka plan okuması bu sıraya dahil değil. Her yanıt `generation` değerini ve ekran veri kümesini koşulsuz değiştirebiliyor.

Testte eski okuma bekletildi, yeni yazma yanıtı önce tamamlandı (`generation=2`), ardından eski okuma tamamlandı (`generation=1`). İstemci sürümü geriye döndü ve eski veri son yanıt olarak döndürüldü. Bu, veritabanındaki yeni kaydın silindiğini göstermez; ekranın geçici olarak eski veri göstermesi ve sonraki düzenlemelerin revizyon çatışması yaşaması riskidir.

**Öneri:** Oturumla birlikte artan veri sürümünü takip etmek; daha eski yanıtları ekrana uygulamamak. Okuma, yazma ve yeniden yüklemeyi tek bir veri yönetim katmanında toplamak.

### 4. Orta — Üst not tarihleri farklı ekranlarda farklı davranıyor

**Durum: Hesaplama yardımcılarıyla doğrulandı.**  
Konum: `frontend/src/MilestoneDateEditor.tsx:21`, `frontend/src/project-info-report.ts:39`, `frontend/src/milestone-ranges.ts:20`, `:28`, `:175`.

Düzenleme ekranı `expandRangeToNoteDates` kullanarak elle genişletilmiş üst tarihleri koruyor. Rapor ve detay sürükleme işlemleri `rangeWithNoteDates` ile üst aralığı detayların en küçük/en büyük tarihine yeniden indiriyor.

Örnek: üst not 10–20 Eylül, detay 12–18 Eylül. Detayın bitişini 19 Eylül yapmak:

- Düzenleme ekranında üst not: **10–20 Eylül**.
- Rapor/sürükleme hesaplamasında üst not: **12–19 Eylül**.

**Öneri:** Elle belirlenen sınırların korunması kuralını tek fonksiyonda tanımlayıp tüm giriş yollarında uygulamak. Ayrı davranış isteniyorsa kullanıcıya açık bir seçenek sunmak.

### 5. Orta — İzin/eğitim verisinde iki model ve doğrulama eksikliği

**Durum: Örnek veriyle doğrulandı.**  
Konum: `frontend/src/actual-units.ts:7`, `frontend/src/WorkCalendarDialog.tsx:70`, `backend/operations.mjs:37`, `frontend/src/server-domain.ts:129`.

1. Arayüz yalnızca yarım saatlik girişleri kabul ediyor; sunucu `0,1` saat girişini kabul ediyor. Arayüz ve API farklı kurallar uyguluyor.
2. Kişisel takvim anahtarı `çalışan|tarih`. Aynı güne 2 saat izin ve 3 saat eğitim ayrı kayıt olarak konulamıyor; ikinci kayıt birincinin yerini alıyor. Bu mevcut veri modelinin sınırı; aynı gün iki tür gerektiğinde işlevsel eksikliğe dönüşüyor.

**Öneri:** Saat adımını ortak şemada doğrulamak. Aynı gün birden fazla tür desteklenecekse bağımsız kayıt kimliği veya günlük kayıt listesi kullanmak; toplam saat sınırını ortak çalışma takvimiyle birlikte kontrol etmek.

### 6. Orta; bildirilen paket önem derecesi yüksek — Vite güncellemesi gerekli

Konum: `frontend/package.json` ve kilit dosyası. Mevcut sürüm: **8.0.13**.

Windows'ta dosya engelleme kuralının aşılması duyurusu bu sürümü kapsıyor; ilgili 8.0 sürüm hattındaki düzeltme **8.0.16**. Duyuru, Vite geliştirme sunucusunun ağa açılması gibi koşullar gerektiriyor. İncelenen uygulama başlatma akışı Vite'ı derleme için kullanıyor, uygulamayı Express üzerinden sunuyor; bu nedenle mevcut çalışan uygulamada bu açık üzerinden sömürü doğrulanmadı. [Vite güvenlik duyurusu](https://github.com/vitejs/vite/security/advisories/GHSA-fx2h-pf6j-xcff)

Aynı bağımlılık için Windows UNC yollarıyla ilgili ikinci duyuru da audit çıktısında yer alıyor. [İkinci güvenlik duyurusu](https://github.com/advisories/GHSA-v6wh-96g9-6wx3)

**Öneri:** Uyumlu yamalı sürüme geçmek, kilit dosyasını güncellemek ve derleme/testleri tekrarlamak. Başlatma betikleri de kilit dosyası değişiminde bağımlılıkları güncellemeli: `baslat-mac.sh:8` yalnızca klasör yoksa kurulum yapıyor; mevcut kurulumlar eski sürümde kalabiliyor.

## Mimari ve bakım bulguları

### 7. Orta — Ana ekran çok fazla sorumluluk taşıyor

Konum: `frontend/src/App.tsx:64`, `:221`.

Dosya yaklaşık **92 KB**. Sekmeler, filtreler, diyaloglar, seçim/pano davranışı, kayıt işlemleri, kaynak ve proje yönetimi bir bileşende toplanmış. Çok sayıda fonksiyon tek satırda yazıldığı için 491 satır sayısı gerçek karmaşıklığı gizliyor. `editor`, `save` ve değişiklik değerlerinde `any` kullanılması TypeScript kontrolünü zayıflatıyor.

**Öneri:** `projects`, `risks`, `planning`, `actuals`, `calendar`, `reports`, `administration` özellik modülleri; ayrı tablo seçim/pano hook'ları; türe göre ayrıştırılmış düzenleyici ve komut tipleri. İş kurallarını JSX içinden çıkarmak.

### 8. Orta — Sunucu iş kuralları frontend derlemesine bağlı

Konum: `frontend/build.mjs:16`, `frontend/src/server-domain.ts`, `backend/operations.mjs:16`, kök `package.json`.

Sunucu, frontend altındaki TypeScript kaynaklarından üretilen ve Git'te tutulan `backend/domain/index.mjs` dosyasını kullanıyor. Testler de bu çıktıyı kullanıyor. `npm test` öncesinde bu dosyanın yeniden derleneceği garanti edilmiyor. Kaynak değişmişken eski çıktı test edilip başarılı sonuç alınabilir. Ayrıca operations katmanı tablo eşlemesini doğrudan Store'dan alıyor.

**Öneri:** Ortak iş kuralları, modeller ve şemaları bağımsız `domain/shared` paketine taşımak. Sunucu ve frontend burayı kullanmalı; oluşturulan çıktı ile kaynak arasındaki uyumu build/test zinciri sağlamalı. İşlem türleri veri adaptöründen bağımsız tanımlanmalı.

### 9. Orta — Her kayıtta bütün veri kümesi işleniyor

Konum: `backend/store.mjs:424`, `:544`, `:560`, `:616`; `backend/adapters/mssql.mjs:89`; `backend/app.mjs:154`.

Bir hücre değişikliği için tüm uygulama verisi okunuyor, kopyalanıyor, doğrulanıyor ve farkları karşılaştırılıyor. Değişen projenin alt kayıtlarını temizlerken ilgili tablo tamamen okunup bellekte süzülüyor. MSSQL tarafında yazmalar uygulama genelindeki tek kilitle sıraya giriyor. Kayıt sonrasında istemciye yeniden tüm yetkili veri görünümü gönderiliyor.

Bu yaklaşım küçük veri kümelerinde tutarlılık sağlamayı kolaylaştırır; veri ve eşzamanlı kullanıcı sayısı arttığında gecikme ve kilit beklemesi oluşturabilir. Bu incelemede sayısal kapasite sınırı ölçülmedi.

**Öneri:** Kayıt/hedef bazlı sorgu ve güncelleme, ilgili revizyonla koşullu yazma, değişen kayıtların döndürülmesi, proje ve dönem bazlı okuma. Global kilit kaldırılmadan önce veri bütünlüğü kuralları ve işlem izolasyonu yeniden tasarlanmalı.

### 10. Orta — İş kuralları ve sabitler birden fazla yerde yazılmış

| Örnek | Konum | Sorun / öneri |
|---|---|---|
| Günlük 9 saat | `actual-units.ts`, `WorkCalendarDialog.tsx`, `operations.mjs`, `server-domain.ts` | Ortak sabit var, fakat arayüz ve doğrulama tekrar sayısal değer kullanıyor. Tek kaynaktan okunmalı. |
| Risk puan eşikleri | `risk-score.ts:5`, `risk-export.ts:18`, `:42` | Ekran kararı, Excel rengi ve formülü ayrı tanımlı. Ortak risk bantlarından üretilmeli. |
| Aktif kaynak uygunluğu | `model.ts:45`, `metrics.ts:4` | Benzer statü/tarih/dahil hesabı tekrarlanıyor. Tek uygunluk fonksiyonu kullanılmalı. |
| Organizasyon kataloğu | `backend/catalog.json`, `frontend/src/catalog.json` | Şu anda eşit olan iki fiziksel kopya zamanla ayrışabilir. Tek kaynak kullanılmalı. |
| Tarih sınırları | `App.tsx:437`, `server-domain.ts:21` | Arayüzde 2026–2195, sunucuda 2000–2199 kabul aralığı. Farkın iş kuralı olarak açıklanması veya ortaklaştırılması gerekli. |
| Excel XML yardımcıları | `project-export.ts:11`, `risk-export.ts:6`, diğer export modülleri | Kaçış, hücre ve stil üretim kodlarının ortaklaştırılması bakım maliyetini azaltır. |

Sabit değer kullanmak tek başına hata değildir. Örneğin 180 saatlik FTE tabanı açıkça tanımlanmış bir iş kuralı olabilir. Sorun aynı kuralın farklı yerlerde tekrar yazılması ve değişiklikte hepsinin birlikte güncellenmek zorunda olmasıdır. Her sabiti yönetici ayarına dönüştürmek de gereksizdir; değişebilir iş politikaları ile sabit teknik kurallar ayrılmalı.

### 11. Orta — Değişiklik geçmişi eksik

Konum: `backend/store.mjs`, `backend/operations.mjs`, `backend/app.mjs`.

Revizyonlar çakışmayı tespit ediyor; eski değer, yeni değer ve işlemi yapan kişi için kalıcı denetim geçmişi bulunmuyor. Riskte oluşturucu ve güncelleme tarihi var; bu genel bir değişiklik geçmişinin yerini tutmuyor. Bir kaynak tahsisinin veya kritik konunun kim tarafından ne zaman değiştirildiği tam izlenemiyor.

**Öneri:** Hassas iş işlemleri için işlemle birlikte yazılan denetim kaydı: kullanıcı, zaman, işlem, kayıt kimliği ve gerekli alan farkları. Parola, oturum belirteci ve gereksiz kişisel içerik loglanmamalı.

### 12. Orta — Büyük istekler erken ayrıştırılıyor

Konum: `backend/app.mjs:37`, `backend/operations.mjs:29`.

20 MB JSON ayrıştırıcısı oturum ve Origin kontrolünden önce çalışıyor. Toplu değişiklik sınırı 100.000 kayıt. Bu boyutlar, tüm veri kümesi üzerinde çalışan kayıt mekanizmasıyla birlikte bellek/CPU baskısı yaratabilir. Canlı hizmete yük bindirilerek saldırı denemesi yapılmadı; bu koddan tespit edilen dayanıklılık riskidir.

**Öneri:** İçe aktarma/yedek yüklemeyi küçük normal kayıt isteklerinden ayırmak; endpoint başına boyut ve işlem sayısı sınırı; ucuz kaynak/oturum kontrollerini uygun sıraya almak; gerçek kullanım yüküyle doğrulamak.

### 13. Düşük/Orta — CSS ve otomasyon düzeni bakım riskini artırıyor

Konum: `frontend/src/upgrade.css`, kök ve frontend `package.json`.

- `upgrade.css`: yaklaşık **119 KB**, **59 `!important`**. Tekrarlanan ek stiller ve öncelik düzeltmeleri sonraki görsel değişiklikleri zorlaştırıyor.
- İncelenen depoda CI yapılandırması ve lint/format komutları bulunamadı.
- Derleme komutu typecheck'i zorunlu kılmıyor; test komutu ortak sunucu çıktısını yeniden üretmiyor.
- Mevcut testler değerli; ancak işlem sıraları, ağ yanıt sıraları ve ekranlar arası aynı davranış yeterince kapsanmıyor.

**Öneri:** Özellik bazlı stiller ve ortak tasarım değişkenleri; formatter/linter; CI üzerinde temiz kurulum → ortak derleme → typecheck → test → uygulama derlemesi. MSSQL entegrasyonu izole test veritabanında ayrı iş olarak çalıştırılmalı. Risk satırı otomatik kayıt, çoklu seçim/yapıştırma ve not tarihi akışlarına az sayıda kritik tarayıcı testi eklenmeli.

## Güçlü taraflar

- Yetki sunucuda tekrar denetleniyor; normal kullanıcının risk sahipliği kuralı yalnızca arayüze bırakılmamış.
- SQL değerleri parametreli; dinamik tablo adları kontrollü eşlemelerden geliyor.
- Parolalar salt içeren scrypt ile türetiliyor; oturum belirteçleri rastgele üretilip özetleri saklanıyor.
- HttpOnly/SameSite çerezleri, HTTPS için Secure, CSRF/Origin kontrolleri ve CSP bulunuyor.
- Kayıt revizyonları ve transaction kullanımı eşzamanlı değişikliklerde temel koruma sağlıyor.
- Üretim ayarlarında HTTPS/MSSQL koşulları ve veritabanı TLS kontrolleri var.
- Excel dışa aktarımında metin kaçışı ve metin hücreleri; içe aktarımda dosya/XML sınırları ve dış içerik kontrolleri mevcut.
- Tarih, kapasite, risk puanı gibi alanlarda yeniden kullanılabilir saf fonksiyonlar zaten var. Refaktör bunları koruyarak ilerleyebilir.

Bu incelemede doğrudan doğrulanmış SQL injection, yetkisiz yönetici işlemi veya saklanan parola sızıntısı bulmadım. Bu ifade bütün olası açıklara karşı güvence değildir.

## Önerilen uygulama sırası

1. **Doğrulanmış hatalar:** %100 sınırı, proxy giriş sayacı, eski ağ yanıtlarının uygulanması, tarih kuralı birliği ve saat şeması. Her biri için davranışı gösteren regresyon testi.
2. **Derleme güvenilirliği:** Vite güncellemesi, kilit dosyasıyla kurulum, ortak domain paketi, otomatik typecheck/test/build zinciri.
3. **Modülerleştirme:** Ana ekranı özelliklere ayırma, tipli değişiklik komutları, ortak iş kuralları ve Excel yardımcıları, CSS düzeni.
4. **Ölçek ve izlenebilirlik:** Hedefli veritabanı işlemleri, denetim geçmişi, MSSQL/eşzamanlılık/yük testleri.

Başarı ölçütü yalnızca dosyaların küçülmesi olmamalı: aynı iş kuralı her ekranda aynı sonucu vermeli; bir değişiklik tek noktadan yapılmalı; yeni bir özellik başka sekmede davranış bozmadan geliştirilebilmeli.
