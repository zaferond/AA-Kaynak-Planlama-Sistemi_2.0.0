# AA Mühendislik Liderliği Kaynak Yönetimi Sistemi

Node.js 24 veya üzeri gerektirir. İlk kurulumda ve sonraki açılışlarda Mac Terminal'de bu klasöre geçip:

```sh
bash baslat-mac.sh
```

Windows'ta `baslat-windows.cmd` dosyasını çalıştırın. Başlatıcı ilk giriş hesabını oluşturur, gerekli paketleri kurar ve arayüzü derler. Sonraki açılışlarda da aynı dosyayı kullanın.

Dağıtım öncesinde `npm run build` ve `npm run deploy:verify` ile kaynak/derleme paketini doğrulayın. Yeni, boş bir dağıtım klasörü üretmek için `npm run deploy:package -- --output "../AA-dagitim"` kullanın. Mevcut hedefe veya kaynak klasörüne paket yazılmaz; ayarlar, veritabanı ve bağımlılıklar pakete eklenmez. Doğrudan `npm start` da kaynak/derleme eşleşmesini veritabanını açmadan önce denetler. Doğrulama komutu veri tabanına bağlanmaz; ayrıntılar [dağıtım doğrulama kılavuzunda](DAGITIM-DOGRULAMA-KILAVUZU.md).

Uygulama varsayılan olarak `http://127.0.0.1:3000` adresinde açılır. Aynı anda başka bir kopyası çalışıyorsa önce onu durdurun. Kurulum ve veritabanı seçenekleri için [başlangıç kılavuzuna](ONCE-BUNU-OKUYUN.md) ve [MSSQL geçiş notlarına](IT-MSSQL-GECIS.md) bakın.

İşlem geçmişi saklama süresi **5 yıl** olarak tanımlıdır; otomatik silme zamanlayıcısı kurulmadı. Tam DB yedeği, doğrulama, geçmiş arşivi, temizleme önizlemesi ve oturumları kaldıran kurtarma kopyası için [veri saklama ve yedekleme kılavuzuna](VERI-SAKLAMA-VE-YEDEKLEME.md) bakın. Ekrandaki JSON yedeği hesapları ve işlem geçmişini içermez.

Giriş denemesi sınırı yerelde bellekte, MSSQL'de ortak veritabanında tutulur. Şema 29 geçişi, çok sunuculu kullanım ve güvenilen proxy ayarları için [giriş koruması kılavuzuna](GIRIS-KORUMASI-VE-PROXY.md) bakın. Native MSSQL ve Windows sentetik CI sonuçları [doğrulama raporunda](MSSQL-CI-DOGRULAMA-2026-10-04.md). Windows başlatma/servis ayrımı ve kalan kurum kabul işleri [Windows kılavuzunda](WINDOWS-BASLATMA-VE-SERVIS-KILAVUZU.md); adres/HTTPS koruması ve sentetik proxy testlerinin kapsamı [proxy/TLS raporunda](PROXY-TLS-DOGRULAMA-2026-10-04.md). Kurumun gerçek proxy/sertifika/ağ kabulü ayrı ortamda bekliyor.

Commit'e bağlı Ubuntu/Windows kalite sonuçları ve kalıcı native MSSQL sonuç JSON'u [CI kanıt arşivinde](CI-KANIT-ARSIVI.md) bulunur. Kurulum kılavuzlarındaki 2 Ekim native bekleme notları tarihsel kayıttır; 4 Ekim'de sentetik GitHub native koşusu başarılıdır, kurum kabulü ise ayrıdır.

`npm run check:domain`, `shared/` altındaki kaynakların bağımlılık sınırlarını sözdizimi ağacıyla denetler. Root `npm ci` bu araç için TypeScript geliştirme bağımlılığını kurar; frontend kurulumu bu komut için gerekmez. İhlal varsa domain smoke testi yüklenmeden işlem durur. Kapsam ve sınırlar [5 Ekim düzeltme kaydında](MIMARI-GUVENLIK-DUZELTMELER-2026-10-05.md).

Risk Sistem / Alt Sistem kataloğu, yönetim yetkileri, şema 31 ve doğrulamalar [özellik kaydında](RISK-SISTEM-KATALOGU-2026-10-05.md) açıklanır.

## Yazma yoğunluğu sınırı

Her uygulama instance'ı için oturum/CSRF doğrulamasından sonra, JSON gövdesi okunmadan önce yazma kabulü uygulanır. Varsayılanlar: 2 aktif istek, 8 FIFO bekleyen istek, kuyrukta 5 saniye. Kuyruk dolarsa veya bekleme dolarsa işlem başlamadan HTTP 503 ve `Retry-After: 1` döner; kullanıcı düzenlemesini koruyup kendisi tekrar kaydeder. Başlamış yazma otomatik tekrar gönderilmez. GET/HEAD, giriş ve çıkış bu iş kuyruğuna girmez; okumalar SQL kilitleri nedeniyle yine bekleyebilir.

İsteğe bağlı ortam ayarları (mevcut `.env` dosyası otomatik değiştirilmez):

| Ayar | Varsayılan | Aralık |
|---|---:|---:|
| `MUTATION_ACTIVE_LIMIT` | 2 | 1–8 |
| `MUTATION_PENDING_LIMIT` | 8 | 0–32 |
| `MUTATION_WAIT_MS` | 5000 | 100–10000 ms |
| `MUTATION_BODY_MS` | 60000 | 1000–120000 ms |

Son ayar kabul edilen isteğin handler başlamadan gövdesini tamamlaması için toplam süredir. Süre aşılırsa bağlantı kapatılır; veritabanı mutasyonu başlamaz. İstemci yanıt alamadığı için güvenli şekilde sonucu belirsiz kabul eder ve sunucu kontrolü ister. Bu süre transaction zaman aşımı değildir; başlamış işlem client bağlantısı kopsa da tamamlanana kadar kabul yuvasını tutar. Yavaş ağdaki büyük restore/import yüklemelerinde bu sınır ayrıca değerlendirilmelidir.

Kuyruk sonrası ve gövde alındıktan sonra oturum yeniden doğrulanır; Store içindeki güncel yetki, revision ve transaction kontrolleri korunur. SQL global kilidi kaldırılmaz. Sınırlar süreç/instance başınadır; çoklu servislerin toplam kotası, proxy bağlantı/bant genişliği sınırı veya üretim kapasite garantisi değildir. Doğrudan Store/CLI bakım işlemleri HTTP kuyruğu dışında kalır. Yeni iş mutasyonu endpoint'leri `admission.handler(...)` ile sarmalanmalıdır; böylece bağlantı kopması transaction sürerken yuva açamaz.

### Gerçekleşen dağılım ve aktivite raporu okumaları

`GET /api/actual-view` ve `/api/activity-report`, tam yazma snapshot'ı yerine ayrı salt okunur model kullanır. Gerçekleşen değerler çalışan ve seçilen dönemle; aktivite değerleri ayrıca proje filtresiyle SQL'de daraltılır. Plan tahsisleri/risk kayıtları okunmaz. Metadata eşleştirmesi ortak kalır; yazmaların tam doğrulaması ve Shared/Exclusive transaction kilitleri korunur. Gerçekleşen yanıtında yalnız gerekli gerçekleşen/takvim revision anahtarları bulunur; plan/risk revision'ları bu ekrandan düzenlenmez.

Bu iki uç birlikte uygulama instance'ı başına en fazla **4**, hesap başına **2** eşzamanlı rapor okuması kabul eder; bekleme kuyruğu yoktur. Hesap sınırında 429, toplam sınırda 503 ve `Retry-After: 1` döner; kullanıcı mevcut **Tekrar Dene** ile raporu yeniden yükler. Bağlantı kopması çalışan DB okumasının yuvasını erken boşaltmaz. Bu sınır diğer GET'lere veya çoklu instance toplamına uygulanmaz. Denormalize takvim JSON'u ve yetki belirlemek için organizasyon/çalışan geçmişi hâlâ okunur; 900'ü aşan veya eski ayırıcı içeren kimliklerde güvenli tam kapsam fallback'i kullanılır. Ölçümler ve kalan doğrulama [M5 kaydında](M5-RAPOR-OKUMA-MALIYETI-2026-10-13.md).

### Tek hücre planlanan dağılım ön kontrolü

Uygulamanın oluşturduğu tek hücrelik planlanan dağılım komutları, mevcut Exclusive transaction içinde hedef takım/proje/hücre/revision için sabit ve parametreli bir ön okuma kullanır. Aynı komut kodu yetki ve revision hatalarını tam snapshot yüklenmeden reddeder. Ön kontrolü geçen istekler tam snapshot doğrulaması, persist, audit ve yanıt üretiminden geçmeye devam eder. Bu kısmi bağlam hiçbir zaman snapshot olarak yazılmaz veya istemciye dönülmez. Toplu/karma işlemler, key biçimi uygun olmayan eski veriler ve keyfî Store callback'leri mevcut tam okuma yolunu kullanır. Geçerli yazma başına bir ek hedef sorgusu vardır; üretim kapasitesi veya hız artışı garantisi değildir.
