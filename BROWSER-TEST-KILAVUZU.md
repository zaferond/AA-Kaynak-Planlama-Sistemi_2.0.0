# Tarayıcı akış testleri

## Çalıştırma

Node.js 24 veya üzeri ve kurulu paketler gerekir. Depo kökünde:

```sh
npm ci
npm --prefix frontend ci
npm run test:ui
```

`test:ui` önce TypeScript kontrolü ve üretim derlemesi yapar. macOS'ta kurulu Google Chrome'u kullanır. Diğer sistemlerde Playwright Chromium'u kurun:

```sh
npx playwright install chromium
```

Linux ortamında eksik sistem kütüphaneleri varsa `npx playwright install --with-deps chromium` kullanılabilir. Başka bir Chromium/Chrome çalıştırılabilir dosyası için `UI_BROWSER_EXECUTABLE` ortam değişkenine dosyanın tam yolunu verin. Eksik tarayıcı otomatik olarak uygulamanın canlı adresine geçiş yapmaz; test başarısız olur.

## İzolasyon

- Çalıştırıcı `.env`, `DB_*`, canlı uygulama adresi veya kullanıcı veritabanı yolunu okumaz. İşletim sisteminin geçici dizininde yeni bir SQL.js veritabanı, rastgele yerel port ve altı sentetik hesap oluşturur.
- Uygulamanın gerçek backend'i ve derlenmiş arayüzü kullanılır. Ağ gecikmesi, 503 ve eski sürüm cevapları yalnız test tarayıcısında taklit edilir.
- Tarayıcıdaki tarih 2 Ekim 2026 olarak sabitlenir; gerçek zamanlayıcılar çalışmaya devam eder. Ocak 2026 hesapları kullanılan örnek veriye göredir.
- Test sonunda tarayıcı, HTTP sunucusu, veritabanı bağlantısı ve zamanlayıcılar kapatılır; sentetik veritabanı silinir. Ekran görüntüleri, sentetik indirme dosyaları ve `result.json` geçici kanıt dizininde kalır. Yol terminalde yazdırılır; işletim sistemi bu dizini sonradan temizleyebilir.
- Derleme `site/` dizinini günceller. Testler gerçek planlama verisine, gerçek kullanıcı hesaplarına veya canlı 3000 portuna kayıt göndermez.

## Kapsam

5 Ekim 2026 Sistem / Alt Sistem kataloğu güncellemesinde **14/14 hedefli kontrol grubu geçti**, yakalanmamış tarayıcı hatası yok: mevcut dizin yönetimi 5, yeni risk kataloğu 5, risk kayıt onayı 4 grup. `risk-systems.mjs` 75 başlangıç adı, düğme sırası, arama/kaydırma, ekleme/tekrar adı reddetme, taslak koruma, rol kontrolleri, risk satırında ID ile seçim, ad değişikliğinin bağlı riske yansıması, açık eski risk taslağının 409 ile korunması ve kullanılan/kullanılmayan tanım silmesini denetler. Yönetim penceresi %90 ölçekli Chrome ekran görüntüsünde ayrıca incelendi. Kontrol tam runner'a eklendi; tam runner, Windows ve native MSSQL bu tur çalıştırılmadı. Testlerin tümü ayrı geçici SQL.js ve sentetik hesaplar kullandı; çalışan DB'ye işlem yapılmadı.

5 Ekim 2026 Excel XML karakter düzeltmesinde hedefli **3/3 kontrol grubu geçti**, yakalanmamış tarayıcı hatası yok. `excel-xml-characters.mjs` geçerli Unicode sınırları ve CR/LF'nin gerçek XML ayrıştırıcısında korunmasını, yedi çıktı yazıcısının XML parçalarını ve sentetik normal kullanıcının geçersiz karakter içeren riskinde açık hata/indirme yapılmamasını denetler. Metin düzeltildikten sonra formül benzeri metin dahil kayıpsız inline string çıktısı kontrol edilir. Test ayrı geçici SQL.js ve Chrome bağlamları kullanır; gerçek veriye dokunmaz. Kontrol tam koşuya eklendi; tam koşu ve GitHub CI bu düzeltme için ayrıca çalıştırılmadı.

5 Ekim 2026 risk kayıt onayı güncellemesinde seçili risk/oturum akışları geçici SQL.js ve Chrome üzerinde yeniden çalıştırıldı: **29/29 kontrol grubu geçti**, yakalanmamış tarayıcı hatası yok. Yeni `risk-save-confirmation.mjs` Enter/dış tıklamada kabul ve iptal, onaydan önce kayıt gönderilmemesi, değişmemiş veya eski değerine döndürülmüş satırda soru çıkmaması, geçersiz/yeni risk ve satır/sekme değişimi iptalinde taslağın korunmasını denetler. Aynı sekme tıklamasındaki mouse-down/focus olayları iptal sonucunu paylaşır; iki onay sorusu açılmaz. Mevcut 409/503/retry, bekleyen tek kayıt, silme/yeniden yükleme onayı, rol ve sekmeler arası oturum regresyonları bu 29 gruba dahildir. Tam tarayıcı koşusu ve GitHub CI bu güncelleme için ayrıca çalıştırılmadı.

3 Ekim 2026'da macOS/Chrome üzerinde **69 kontrol grubu** başarılı:

| Akış | Kontroller |
|---|---|
| Çalışma alanı eylemleri | Dört sekmede filtreli Excel çıktısı ve OOXML; normal kişinin yalnız kendi kaynağı; global sıfırlamada iptal/503/retry ve filtre dışı takım/proje/ay, diğer verilerin korunması; toplu kaynak silmede iptal/409/seçim koruma, başarıda yalnız seçili kaynak/gerçekleşen kayıt silme ve plan/proje koruma |
| Çalışma alanı filtre/görünümü | Geniş plan URL başlangıcı, dönem/gruplama değişiminde seçim temizliği, mevcut yıl/12 ay/aylık görünüm sıfırlama ve reload; seçili proje tahsisiyle özet değişirken aktif kapasite ve tüm-proje raporlarının korunması; doğrudan açılış, özet yeniden açma, sekme/dönem değişimi ve varsayılan Raporlar reload sonrası iki yönlü gerçek yatay scroll |
| Planlanan kaynak girişi | Gerçek fareyle ters sürükleme, Ctrl ile ek seçim, sol üst odak, Ctrl+Enter ile toplu kayıt, Enter/dış tıklama/Escape temizliği; sıfır içeren 2×2 Ctrl+C/V ve sağ tık kopyalama/yapıştırma; 503 sonrası taslak/seçim korunması, bekleyen retry alan kilidi ve tek istek |
| Ortak tablo stilleri | Üretilen CSS üzerinde altı yıl paleti, dağılım kenarlık önceliği, dolu/boş/odak hücreleri, bugün çizgisinin genişlik/renk/katmanı ve ortak proje başlık ölçüsü; %80 yakınlaştırmadaki ölçü yuvarlaması hesaba katılır |
| Oturum tutarlılığı | Aynı tarayıcı bağlamında iki sekme, açık taslakta çıkış/giriş, storage/BroadcastChannel yedekleri, iki kanal kapalıyken değişmeyen generation ile kimlik kontrolü, odak kontrolünde 503/taslağın korunması, gecikmiş admin yanıtını reddetme, aynı hesaba yeniden girişte yeni CSRF/taslak; sinyalde yetki veya kimlik taşınmaması |
| Genel editör ve kendi kaynak görünümü | Proje taslağı açıkken gelen güncel snapshot; açılış revision’ıyla kaydet/sil ve 409; uzaktaki kaydı/taslağı koruma; 503 sonrası açık taslak/retry; eski hesap liderliği dışında kendi gerçekleşen satırını gösterme, başka çalışanı göstermeme |
| Risk | Yeni satır/iptal/sıra, ilk ve kalan puan, strateji, diğer satıra geçiş, Enter/Shift+Enter/Escape, Tab/Shift+Tab odak sırası, IME Enter ve silme düğmesinde Enter ile yanlışlıkla kayıt yapılmaması, tab/filtre değiştirme, hata sonrası taslak/retry, geciken kayıtta alan kilidi ve tek istek, Excel/JSON aktarımında güncel taslak, başarısız kayıtta çıkışı engelleme, çoklu proje/matris, silme onayı ve sahiplik/rol yetkisi |
| Risk eşzamanlılığı | Düzenleme başlamadan açılan okumanın sonradan güncel veri döndürmesi, açılış revision'ıyla kaydet/sil, çakışmada taslağı ve diğer kullanıcının verisini koruma, iptal/hatalı/başarılı yeniden yükleme, değiştirilmemiş eski taslağı yazmama, gerçek version polling ve select/blur sırasında yenilemeyi bekletme, okuma hatası/retry, uzaktan silinen kaydı yeniden oluşturmama |
| Gerçekleşen giriş/bağlam | Hücre ve toplam satırından kişi/ay seçimi, dış tıklama/Escape/Enter ile seçim temizleme, yüzde/gün/saat dönüşümleri, manuel saati değiştirip otomatik takvime dönme, tam kapasitede boş projenin kilitlenmesi, gelecek ayın kapalı kalması, uyarı sonrası girişe odak dönüşü, 503 sonrası kaynak/saat taslağını koruma ve tekrar kaydetme |
| Takvim | Ortak tam/yarım gün, hafta sonunu iki kez düşmeme, kişisel/ortak takvim yetkileri, aynı gün saatlik izin ve eğitim, hata/retry ve kayıt sırasında alan kilidi, aylık saat/yüzde hesabı, %100 ve çalışma saati sınırları, rapor kayıtları |
| Ortak takvim taslağı | Ortak kayıtta 503 sonrası eklenen tarihleri koruma, geciken retry sırasında alan/yıl/kapatma kilidi, Escape/X ile pencereyi kapatmama ve tek kayıt isteği; yeni snapshot geldikten sonra açılış revision'ıyla 409, yerel taslak ve uzaktaki kaydı koruma, yeniden açınca güncel takvimi yükleme |
| İçe aktarma | Şablon indirme, geçersiz/büyük dosya, satır hatasında hiç yazmama, hata filtresi ve sheet değiştirme, sunucu hatasından sonra retry, dosya/mevcut kayıttaki tekrarların atlanması |
| Yedek | Hesap/parola içermeyen JSON, iptalde dosya seçimini temizleme, bozuk/büyük dosya/503/eski generation reddi, başarılı restore'da modelin yerine konması ve hesapların korunması |
| Proje tabloları | Üç ekranda proje başlığının yıl/ay altında sabit kalması ve sonraki projede değişmesi, yatay kaydırmada proje adının korunması, fare ve Alt+ok ile kayıtlı proje sıralaması, reload sonrası sıra, kaynak/not verisinin korunması, başarısız sıralamada geri alma |
| Zaman çizelgesi katmanları | Aylık bar/haftalık detay/baklavaların sabit sol sütunun arkasından geçmesi; sürükleme ve tutamakların yüksek yerel katmanları dahil gerçek `elementFromPoint` kontrolü; açık alanda etkileşimin korunması |
| Yetki ve geçmiş | Giriş hatası/parola görünürlüğü/hatırla/reload/çıkış, ana admin koruması, rol-kaynak değişikliği ve oturum iptali, iki admin revision çatışması, kendi rol değişikliğinden sonra yeniden giriş, geçmiş sayfalama/alan farkı/özel veri maskesi/okuma hatası retry |

Testler uygulama davranışını ve veritabanındaki sonucu birlikte denetler; yakalanmamış tarayıcı hataları koşuyu başarısız yapar. Excel dosyalarının ZIP/OOXML yapısı, XML ayrıştırılması ve beklenen hücre değerleri kontrol edilir. Microsoft Excel uygulamasında dosya açma, Windows kurulumu, native MSSQL ve tüm ekran boyutlarının görsel doğrulaması bu komutun kapsamı değildir.

`npm run verify` içindeki birim/entegrasyon testleri ile bu 69 tarayıcı grubu ayrı sayılır. Kalite CI push/PR koşusunda bu tarayıcı çalıştırıcısı da yer alır; Chromium kurulumu sonrasında sentetik SQL.js kullanır. Native MSSQL iş akışı haftalık ve manuel çalışacak şekilde tanımlanmıştır. Bu turda GitHub runner ve native ortam sonuçları alınmadı.


Windows push/PR kalite işi ayrıca domain/TypeScript/build ve sentetik SQL.js oturum, dosya kilidi, rollback/restart, eşzamanlılık ve Excel paket kontrollerini çalıştırır. Gerçek Windows servis hesabı/ACL ve native MSSQL bağlantısı için ayrı kurum testi gerekir. `npm test` içindeki HTTPS/proxy testi OpenSSL kullanarak geçici test sertifikası üretir; global TLS ayarını veya gerçek sertifikaları değiştirmez.


7 Ekim 2026 hedefli `viewport-scroll.mjs` kontrolü: 40 sentetik proje ve yalnız geçici SQL.js ile dört grup; %90 uygulama ölçeğinde 1800×1050 ve 1000×720 ekran, ana sayfanın özet satırında bitmesi, gerçek wheel ile bağımsız tablo kaydırma, tablo sonunda sayfanın hareket etmemesi, görünen takvim başlıklarının konum ve hit-test kontrolü, plan özeti açma/kapatma, takım gruplaması, aylık/haftalık proje görünümü ve proje/dönem filtre etiketleri. Çalıştırıcı tam tarayıcı CI listesine eklendi. Gerçek hesaba veya uygulama veritabanına bağlanmaz.

Aynı turdaki hedefli regresyon koşusu toplam **12 grup** geçti: dört yeni viewport grubu, ortak üretilmiş tablo stilleri, üç ekranda proje freeze/değişimi, pointer/klavye proje sıralama ve hata koruması, aylık/haftalık bar/baklava katman hit-testleri. TypeScript ve üretim build başarılıdır.

Son proje sayfalama güncellemesinde 260 sentetik proje eklendi; mevcut iki test projesiyle ilk sayfada 250, ikinci sayfada 12 proje ve önceki sayfaya dönüş doğrulandı. Kullanım ipucu satırı kaldırıldı. Son hedefli tarayıcı koşusu 13/13 grup; `node --test tests/workspace-view.test.mjs` 7/7.


7 Ekim 2026 aşama katmanı düzeltmesi: hata gerçek seçim ve yatay scroll ile önce yeniden üretildi (`elementFromPoint` sabit proje sütunu yerine `phasepreview` döndürdü). Ortak odak yükseltmesi yalnız `.cell input:focus` içeren kaynak hücreleriyle sınırlandı. Son hedefli koşuda dört tarayıcı grubu geçti: aylık/haftalık seçili ve klavye odağındaki aşamalar sabit sütunun arkasında; proje adı/expand odağında ilk hücre sticky kalır; bar/baklava/tutamak katmanları korunur; sayısal kaynak girişinin z-index 9 odak davranışı korunur. Yalnız geçici SQL.js ve sentetik hesaplar kullanıldı. `node --test tests/project-clipboard.test.mjs` 7/7 geçti.


7 Ekim 2026 görünüm seçenekleri: planın gerçekleşen dağılım anahtarı ve projelerin detay/haftalık anahtarları filtre özetinin altında, ana tablo üstünde dar bir satıra taşındı. “Filtrelenen Projeler” başlığı doğrulandı. Son hedefli koşu **11/11 grup** geçti: büyük/dar ekranlarda satır konumu ve dar yükseklik, gerçek aç/kapatla gerçekleşen satırlar ve proje detayları, haftalık görünüm, özet aç/kapat, sayfa kaydırma sınırı, 250/12 proje sayfalama ve aşama/bar/baklava katmanları. TypeScript ve üretim build başarılı.

Gerçekleşen satırlar küçüldükten sonra eski scroll boşluğunun kalması da bu koşuda yeniden üretildi. Bugün çizgisi artık scrollTop ve viewport yüksekliğiyle taşınmaz; başlangıcı içerik sıfırı, yüksekliği gerçek tablo yüksekliğidir. Böylece çizgi silinen/gizlenen satırların alanını korumaz; başlıklar iç kaydırmada görünür kalır. Testler yalnız geçici SQL.js ve sentetik hesap kullandı.


### 7 Ekim 2026 — tüm kayıtları kapsayan tablolar ve proje kaynak grafiği

Önceki 250/12 sayfalama kontrolünün yerine tüm filtre sonuçlarını tek tabloda kapsayan kaydırma kontrolü geçmiştir. 260 ek sentetik projeyle ilk/son kayda erişim, oluşturulan proje sayısının sınırlı kalması, detay açık durumunun kaydırma sonrasında korunması, kaydedilmemiş kaynak girişinin korunması ve Esc ile iptali denetlenir. Önceki kopyala/yapıştır, Ctrl+Enter, hata/retry, proje sıralama, sabit proje/sol sütun ve görünüm seçenekleri kontrolleri korunur. Son hedefli koşu **20/20 tarayıcı grubu** geçti.

Kaynak raporlarının ayrı hedefli koşusu **3/3 grup**: ay ve proje gerçek/plan karşılaştırması, ilk 10 ve bağımsız seri seçimi, dar/60 aylık görünüm, izin/eğitim listesinin yeri ve veri değiştirmeme. `node --test tests/workspace-view.test.mjs tests/resource-planning-reports.test.mjs tests/project-clipboard.test.mjs` **22/22** geçti. Performansın yöntemi, rakamları ve kapsam sınırları `TABLO-VE-KAYNAK-RAPORLARI-2026-10-07.md` içindedir.


### 7 Ekim 2026 — dönem toplamı ve planlama etkinliği

Proje sütun grafiğinin dönem toplamı (kişi-ay) ve mevcut bağımsız seri seçimleri doğrulandı. Kaynak raporlarının yeni hedefli koşusu **4/4 grup**: aylık gerçek/plan karşılaştırması, proje toplamları, aylık ve dönem etkinliği, sıfır paydada boş nokta, %100 üzeri değer, proje grafiğinin hemen altındaki yerleşim, takım filtresi, dar ekran ve açık/kapalı özet başlığının hover renginin sabit kalması. Veri değişmedi ve tarayıcı hatası yok. `node --test tests/resource-planning-reports.test.mjs` **10/10** geçti; oranların toplamdan hesaplanması, sıfır/boş veri, taşma/geçersiz değer ve girdi değiştirmeme sınırları dahil. TypeScript ve üretim build başarılı.

Raporlar ekranındaki **Uygulanan Filtreler** satırı için hedefli kaynak raporları koşusu **5/5 grup** geçti. Takım değişiminin özet satırına yansıması, başlangıç/bitiş ayı ve dönem metni, uygulanmayan proje filtresinin gösterilmemesi, 1800 ve 900 piksel genişliklerde sayfa kaydırılırken satırın üstte sabit kalması ve rapor içeriğinin üzerinde görünmesi kontrol edildi. Geçici SQL.js veritabanında yalnız sentetik veri kullanıldı; kontroller veriyi değiştirmedi ve tarayıcı hatası oluşmadı.

Sabit alan artık filtre seçimlerinin bulunduğu satırdan başlar. Aynı hedefli kontrol, her iki ekran genişliğinde filtre kontrollerinin üst kenarda, özet satırının onların altında sabit kalmasını ve her ikisinin rapor içeriğinin üzerinde görünmesini doğrular. Kaydırılmış ekrandan takım seçimini açıp değiştirme ve geri alma da kontrol edilir.
