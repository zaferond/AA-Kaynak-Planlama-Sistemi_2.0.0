# Mimari ve güvenlik bulguları — düzeltme turu

**Tarih:** 3 Ekim 2026\
**Git tabanı:** `main`, `b59fdf5df375d13959829b8adc8367d9a35a9433`. Çalışma ağacındaki önceki değişiklikler korunarak ilerlenmiştir; bu tur commit/push oluşturmaz.\
**Kapsam:** Son salt okunur incelemedeki dokuz bulgu ve önerilen sıranın ortak Excel / Store / App / RiskTable / gerçekleşen kaynak / çalışma takvimi ekranı mimari ayrıştırması ve ortak tablo stilleri / planlanan kaynak ekranı / App filtre-seçim-görünüm ayrıştırması. Önceki raporun B1–B6 kayıtları tarihsel kanıt olarak korunmuştur.

## Sonuç

Dokuz bulgunun kaynak kod/CI yapılandırması tarafındaki düzeltmeleri tamamlandı. Son App dışa aktarma/veri eylemleri ayrıştırması sonrasında `npm run verify` **414/414 test**, biçim, ortak katman kontrolü, TypeScript ve üretim derlemesiyle başarılı. Tam tarayıcı çalıştırıcısı **69/69 kontrol grubu** başarılı. Bu sayılar ayrı test kümeleridir; önceki turlardaki 402/409 test ve 53, 54, 57, 59, 60, 63 ve 66 grupluk sonuçlar aşağıda tarihsel kanıt olarak korunmuştur.

Testler gerçek backend ve derlenmiş arayüzle, geçici SQL.js ve sentetik hesap/veri kullanılarak çalıştırıldı. Gerçek kullanıcıyla oturum açılmadı; çalışan veritabanında kayıt, migration, restore veya silme yapılmadı. Çalışan backend yeniden başlatılmadı; kaynak değişikliklerinin backend tarafında kullanılabilmesi için kontrollü yeniden başlatma gerekir.

Bu sonuç native MSSQL/Windows/proxy/kurum kurtarma doğrulaması veya uygulamanın bütün güvenlik açıklarından arındığının kanıtı değildir.

## Uygulanan sıra ve kanıt

| Sıra | İnceleme bulgusu | Düzeltme | Doğrulama |
|---|---|---|---|
| 1 | #1 — genel editörlerde sessiz ezilme, B1 ile aynı kök neden | `editor-state.ts`, `editor-revisions.ts`, `editor-commands.ts`, `usePortalEditor.ts`: proje, aşama, başlık/not, kaynak ve toplu kaynak taslakları açılış revision'larını taşır. Kaydetme ve açık editörden silme yeni snapshot'ın revision'ını devralmaz. 409 taslağı korur; otomatik üzerine yazma yoktur. | Beş taslak türü ve bağlı takım için komut testleri; gerçek tarayıcıda geciken okuma sonrası kayıt/silme 409, uzaktaki değişiklik ve yerel taslağın korunması. |
| 2 | #2 — geçici okuma hatasında taslak kaybı | `App.tsx`: aynı oturumdaki başarısız okuma mevcut snapshot ve editörü korur. Gerçek oturum/hesap değişimi önceki taslağı temizlemeye devam eder. | Tarayıcıda 503 sırasında açık proje taslağı korunur; yeniden kaydetme 200. Mevcut sekmeler arası kimlik testleri de tam koşuda geçti. |
| 3 | #3 — geçersiz parola kayıtlarının tam yedekte kabulü, B2 ek kontrol | `auth.mjs`, `snapshot-model.mjs`: salt/hash'in beklenen scrypt kayıt biçimi public kullanıcı projeksiyonundan önce doğrulanır. Boş, yanlış uzunlukta veya hex olmayan kayıtlar reddedilir. | Yedek oluşturma/doğrulama/kurtarma testleri; hatada kısmi çıktı yayımlanmaz, kaynak dosya baytları değişmez. |
| 4 | #4 — bilinmeyen migration sürümünün başlangıçta kabulü | `migration-catalog.mjs`, `schema-migrations.mjs`: bilinmeyen uygulanmış sürüm yazma/yükseltme/seed öncesinde reddedilir. Transaction sonunda gerekli migration geçmişi denetlenir. Aynı şemaya ait bilinen eski kaynak fingerprint'i sınırlı uyumluluk listesinde korunur; şema/model/parola kontrolleri yine zorunludur. | Gerçek geçici SQL.js görüntüsünde 999 sürümüyle başlangıç reddi ve bayt eşitliği. SQL.js/MSSQL çağrı sınırında 0/31/999 sürümleriyle hiç yazma yapılmadığının mock testi. Bilinen eski fingerprint kabulü ve rastgele fingerprint reddi. |
| 5 | #6 — kendi kaynağının liderlik kapsamından kaybolması, B4 | `shared/access.ts`: yalnız normal kullanıcının kendi kaynak geçmişi liderlik filtresinden bağımsız korunur. İK notu/kodu maskesi, diğer kişiler, planlanan takım kapsamı ve yönetici kapsamı korunur. `actual-visibility.ts` tablo/kişi listesi/Excel için ortak görünürlük sağlar. | Tam transfer fixture'ı; başka çalışan/takım tahsisinin açılmadığının testleri. Tarayıcıda kendi gerçekleşen hücresi ve API kapsamı; Excel'de yalnız kendi kaydı. |
| 6 | #7 — işbaşı tarihinin API'den atlanması, B5 | `resource-policy.ts`, `server-domain.ts`, `resource-import.ts`, editör komutları: çalışan statüleri ve dahil edilen Aktif İlan için tarih ortak kuralla zorunludur. İşten Ayrıldı için iki tarih gerekir. Sunucu geçmiş snapshot'ıyla karşılaştırır; yeni/istihdam alanları değişen dönem boş tarihi devralamaz. | Üç çalışan statüsü ve dahil ilan için doğrudan HTTP 400; model/revision/generation rollback. Tarihli kayıtlar ve hariç ilanlar kabul edilir. Eski tarihsiz dönemler ilgisiz işlem ve aynı dönemin JSON restore'unda değiştirilmez; yeni dönem/statüye istisna taşınamaz. |
| 7 | #5 — uzun kritik notun Excel sınırını aşması, B3 | `xlsx-cells.ts`, `project-info-report-export.ts`: uzun metin kayıpsız devam satırlarına bölünür. Unicode çiftleri kesilmez, CR/LF korunur, hücre/satır sınırları uygulanır. Kısa raporların gruplaması korunur. Diğer aktarım yazarları geçersiz tek hücreyi bozuk dosya üretmeden açık hatayla reddeder. | 40.000 karakter, Unicode, boş/çok satırlı metin, CR/LF, formül benzeri metin, 32.767 karakter/253 satır sınırı testleri. Sentetik XLSX'in bütün XML parçaları Python ile ayrıştırıldı; 75 devam satırındaki birleştirilmiş metin birebir eşit, satırlar ≤409 pt ve formül düğümü yok. |
| 8 | #8 — risk seçeneklerinin ve korunan admin kimliğinin tekrarları | `risk-policy.ts`: model tipleri, Zod, RiskTable ve Excel doğrulaması/strateji kolonları aynı kategorileri/statüleri/stratejileri kullanır. Backend root-admin kontrolleri `ROOT_ADMIN_ID` sabitinden gelir. Dağılım Excel'i ZIP yardımcısına doğrudan bağlanır; başka rapor modülüne bağımlılığı kaldırılmıştır. | Risk politika/Excel testleri, TypeScript ve ortak katman kontrolü; önceki risk/rol/yetki testleri tam koşuda geçti. |
| 9 | #9 — tarayıcı testlerinin CI dışında kalması | `quality.yml`: push/PR kalite koşusuna Chromium ve sentetik tarayıcı regresyonları eklendi. `mssql-native.yml`: mevcut izole Docker testi haftalık ve manuel çalışacak şekilde ayarlandı; zamanlanmış çalışmada boyut varsayılanı 1000. | Yerelde CI'ın tarayıcı komutu 53 grup geçti; iki workflow YAML olarak ayrıştırıldı. GitHub runner/native SQL Server çalışması bu turda yapılmadı. |

## Ek mimari ve doğrulama çalışması

Önerilen sıranın ortak Excel katmanı ve Store/App ayrıştırması tamamlandı. İş kuralları, rol kapsamı ve transaction sınırı korunarak ilerlenmiştir; dosya boyutu tek başına güvenlik veya performans kanıtı sayılmaz.

| Alan | Değişiklik ve korunmuş davranış | Kanıt |
|---|---|---|
| Kimlik/oturum repository | `backend/identity-repository.mjs` kullanıcı ve oturum SQL mapping'lerini alır. Bağlantıyı çağıran verir; yeni transaction açılmaz. Kullanıcı/oturum public Store yöntemleri korunur. | Mevcut HTTP oturum iptali, rol/yetki, restore ve yeniden bağlantı testleri tam koşuda geçti. |
| Planlama okuma/yazma | `planning-reader.mjs` snapshot SQL okumaları, `planning-writer.mjs` diff persistence içindir. `Store` 829→289 satır: taze aktör kontrolü, validation, audit, revision/generation, projection ve tek transaction koordinasyonunu tutar. Migration katalog/runner ayrımı önceki turda yapılmıştır. | Eşzamanlılık/restore odak kontrolü 16/16; tam suite tek kazanan, çakışan batch rollback, okuyucu tutarlılığı, hata sonrası rollback ve restart senaryolarını kapsar. |
| App veri akışı | `usePortalData.ts` snapshot ve mutation state'i; `usePortalRefresh.ts` polling/storage/focus yenilemesini yönetir. `App` 1438→1361 satır. Açılış revision'ı editörde kalır, geçici read hatası taslağı korur, oturum değişimi eski taslağı temizler. | Editör 409/503 ve sekmeler arası kimlik dahil 53 tarayıcı grubu. |
| Ortak Excel paketi/indirme | Altı yazar `xlsx-workbook.ts` kullanır: içerik türleri, worksheet/style ilişkileri, metadata, adlandırılmış aralıklar, yazdırma başlıkları, hesaplama bayrağı ve URL indirme/temizliği. Raporların hücreleri/stilleri korunur. Başka rapordan ZIP import'u kaldırıldı. | 8 XLSX varyantının bütün XML parçaları öncesi/sonrası karşılaştırıldı. Projeler aylık/haftalık, dağılımlar, risk, kritik konular ve kaynak raporu eşdeğer. Şablonda yalnız düzeltilen liste/yardım satırları farklıdır. |
| Ek Excel bütünlük kontrolleri | Şablon yardım satırları en uzun listeyi takip eder; boş named range ters aralık oluşturmaz. Sayfa adları Türkçe/ASCII harf farklarıyla çakışamaz; risk exportu uygun sayı eki üretir. Dağılımların proje×kişi/takım büyüklüğü Excel satır sınırından önce kontrol edilir. Diğer satır yazarları da ortak sınır kontrolünü kullanır. İndirme tıklaması hata verse de Blob URL temizlenir. | Excel odak testi 12/12; çok büyük grid oluşturulmadan ret, I/i/İ/ı çakışması, boş/uzun liste, ZIP ilişkileri, metin/formül ayrımı ve hata halinde URL temizliği. |
| Sentetik HTTPS/proxy | Geçici SQL.js, tek kullanımlık test sertifikası, yerel HTTPS proxy ve rastgele portlar. Sertifika/hostname doğrulaması açık; global TLS doğrulaması kapatılmaz. Proxy gelen forwarding iddialarını kendi bağlantı adresiyle değiştirir. | Güvenilmeyen sertifika/yanlış hostname reddi; Secure/HttpOnly/SameSite cookie, HSTS, no-store, Host/Origin/CSRF reddi, logout iptali ve 60/61 giriş kotası. Retlerde planning generation değişmez. Kurum proxy'si ayrıca doğrulanacaktır. |
| Windows kalite kapısı | `quality.yml` Windows runner'ında ortak domain, TypeScript/build ve sentetik dosya kilidi/rollback/restart/oturum/eşzamanlılık kontrolleri çalıştırır. Ubuntu tarayıcı kapısı korunur. | Workflow YAML ayrıştırması başarılı. Bu Mac turunda gerçek Windows runner çalıştırılmadı. |
| İzlenebilir profil | Native ve SQL.js profil raporlarının kaynak hash listesine ayrılan repository ve migration modülleri eklendi. Native kılavuz şema 30 ve haftalık çalışma bilgisiyle güncellendi. | Yerel sentetik Store profili 1.000/10.000 planlanan kayıt, 200 çalışan, 1.000 gerçekleşen, 500 yüzde, 1.000 kişisel gün ve 1.000 başlangıç audit kaydıyla üç güncellemede snapshot/revision/generation/audit eşitliğini doğruladı. Kalite koşusuyla eşzamanlı çalıştığı için süreler kapasite sonucu olarak kullanılmadı. |

## Geçmiş veri uyumluluğu

- Yeni kaynak/dönemlerde çalışan statüsünün başlangıç tarihi API dahil zorunludur. İçe aktarmada mevcut İstanbul yılının 1 Ocak varsayılanı korunur.
- Var olan tarihsiz çalışma döneminin statü, dahil bilgisi, miktarı ve çalışma tarihleri değişmeden kaldığında geçmişe tarih yazılmaz. Takım/liderlik metadata taşınması bu dönemlere yapay tarih eklemez.
- JSON restore yalnız mevcut verideki aynı eski dönemi istisna kapsamında koruyabilir; yeni tarihsiz kaynak/dönem/statü ekleyemez. Tam SQL.js yedeği gerçek eski dönemleri kayıpsız korur; şema/model/kayıt biçimi denetimleri çalışır.
- Parola biçim denetimi doğru parolayı bilmeden salt ile hash'in birbirine ait olduğunu doğrulayamaz. Özel parola/salt/hash/token değerleri rapora yazılmamıştır.
- Normal kişinin kendi satırına verilen görünürlük yeni bir API yazma yetkisi değildir. İsim ve çalışma versiyonu gösterilir; özel İK alanları ve başkalarının kişisel takvimi/gerçekleşenleri açılmaz.

## Komutlar ve ortam

Kaynak/testler `.env`, canlı DB, yedek ve loglar alınmadan `aa-fix-verification-*`, `aa-architecture-verification-*`, `aa-risk-refactor-verification-*`, `aa-actual-refactor-verification-*`, `aa-calendar-refactor-verification-*`, `aa-table-styles-verification-*` ve `aa-planned-refactor-verification-*` geçici kopyalarına taşındı. Kurulu bağımlılıklar kullanıldı; testler ayrı sentetik dosyalar ve rastgele yerel portlarla çalıştı.

| Komut/kontrol | Sonuç |
|---|---|
| `npm run verify` | 402/402 test; Prettier, ortak katman kontrolü, TypeScript ve üretim derlemesi geçti. |
| `node scripts/run-browser-checks.mjs` | Son çalışma takvimi turunda 59/59 grup; yakalanmamış tarayıcı hatası yok. |
| Excel ortak katman/satır/sayfa ve mevcut risk aktarımı (`node --test tests/xlsx-workbook.test.mjs tests/xlsx-cell-limits.test.mjs tests/risk-export.test.mjs`) | 12/12. Tam teste dahildir. |
| Geçici HTTPS/proxy (`node --test tests/proxy-tls.test.mjs`) | Başarılı; tam teste dahildir. |
| Yeni editör/kendi kaynak tarayıcı grubunun ayrı çalıştırılması | 4/4 grup. Tam koşuya da dahildir. |
| Yeni bakım/migration/tarih/Excel doğrulamaları | Tam teste dahildir; yeni negatif HTTP senaryoları transaction rollback'i de kontrol eder. |
| Python `zipfile` + `ElementTree` ile sentetik XLSX | Bütün XML parçaları geçerli; kayıpsız metin, hücre/satır sınırları ve formül yokluğu doğrulandı. |
| Önce/sonra XLSX (`node export-comparison.mjs` + Python `zipfile`/`ElementTree`, yalnız geçici kopyada) | 8 varyantın bütün XML parçaları ayrıştırıldı ve karşılaştırıldı; sadece düzeltilen şablon liste satırları farklıdır. |
| `node scripts/benchmark-store.mjs --sizes=1000,10000 --samples=3 --resources=200 --actuals=1000 --percentages=500 --calendar-days=1000 --audit-events=1000 --response=delta --validation=single --output=architecture-benchmark.json` | Sentetik veri bütünlüğü doğrulandı; kaynak DB geçici dosyadır. |
| Ruby YAML ayrıştırıcısı | İki workflow, yeni Windows işi dahil ayrıştırıldı; GitHub üzerinde çalıştırıldığı anlamına gelmez. |
| `git diff --check` | Hata yok; HEAD değişmedi. |

İlk denemelerdeki eski fixture/uyarı beklentileri, eksik editör revision'ı ve tarayıcı seçici hataları düzeltildikten sonra son tam koşular başarılıdır. Kuralı gevşeterek eski test beklentileri korunmamıştır.

## Kurum ortamında ayrıca doğrulanacaklar

1. **Native MSSQL:** ayrı sentetik DB'de migration/transaction/lock/restore ve gerçek SQL türleri. Bu turdaki MSSQL guard testi mock bağlantıdır. Haftalık CI konteyneri için ilk başarılı runner sonucu henüz alınmadı.
2. **Windows:** yeni sentetik CI işi için ilk başarılı Windows sonucu henüz doğrulanmadı; launcher, servis kimliği, dosya ACL'leri, kilit/crash davranışı ve Windows'a özgü bağlantı yolu.
3. **Proxy/TLS:** geçici yerel HTTPS/proxy testi geçti; gerçek kurum proxy hop/trust ayarı, TLS sonlandırma, Secure cookie, Origin/Host ve paylaşımlı rate-limit davranışı.
4. **Kurum kurtarma:** erişimi kısıtlanmış yedek deposu, izleme, ayrı hedefe gerçek restore, gerekli sertifika/anahtarlar ve ölçülmüş RPO/RTO. Yerel SQL.js doğrulaması bunların yerini tutmaz.
5. **Yük ve native Excel:** gerçekçi sentetik kurum hacmi/eşzamanlılık; Microsoft Excel uygulamasında uzun devam satırlarının açılış ve görsel kontrolü.

Bu kontroller çalışan/üretim ortamına erişim veya yazma gerektiriyorsa mevcut salt okunur ortam kısıtları gereği önceden izin alınmalıdır. Kaynakların düzeltilmesi bu operasyonların yapılmış olduğu anlamına gelmez.


## Çalışma ağacı ve etkinleştirme

Git HEAD değişmedi; commit/push yapılmadı. Bu turdan önceki çalışma ağacı değişiklikleri korunmuştur. Doğrulanan kaynaklar ve site çıktısı Git deposu ile üstteki çalıştırılabilir kopyaya aktarıldı. Çalışan backend'e istek gönderilmedi, `.env` ve gerçek veritabanı okunmadı/yazılmadı; backend yeniden başlatılmadı. Kaynak değişiklikleri mevcut sürecin import ettiği backend modüllerini kendiliğinden değiştirmez.

Yerel kaynak düzeltmeleri tamamlandı. Native MSSQL, gerçek Windows servis/ACL, kurum TLS/proxy ve kurum yedekten kurtarma sonuçları hazır bir izole ortam olmadan **doğrulanmadı** olarak kalır. Ortamın hazırlanması için bilgi istendi; gerçek veritabanında test yapılarak bu sınır aşılmadı.

## RiskTable mimari ayrıştırması — 3 Ekim 2026

Harici MSSQL/Windows ortamı gerektirmeyen sıradaki çalışma tamamlandı. `frontend/src/RiskTable.tsx` 951 satırdan 264 satıra indirildi; sorumluluklar `frontend/src/features/risk-table/` altındaki altı modüle taşındı. Bu sayı bakım sınırlarının göstergesidir; performans artışı veya tüm mimarinin tamamlandığı iddiası değildir.

- `useRiskDraft.ts` açılış değer/revision çiftini, taslağı, doğrulama ve kayıt/silme/iptal/yeniden yükleme akışını yönetir. Bekleyen kayıt tek istekte birleştirilir; hata/409 taslağı korur. Başka satıra geçiş hedef satırın değer ve revision'ını önceki kayıt beklenmeden birlikte yakalar.
- `columns.ts` sütun türlerini, genişlikleri, grupları ve düzenleyici türlerini tanımlar. Başlık kapsamı ve alan sayısı katalogdan hesaplanır; ayrı düzenlenebilir-alan ve strateji eşleştirmeleri kaldırılmıştır.
- `RiskValue.tsx` ve `RiskCellEditor.tsx` salt görünüm ve düzenleme alanlarını ayırır. Hesaplanan alanlar salt okunur kalır; seçenek/puan/validasyon kuralları mevcut ortak modüllerde korunur.
- `useRiskTableInteraction.ts` odak, scroll, dış tıklama ve klavyeyi yönetir; `types.ts` bileşen sözleşmelerini taşır. Tablo DOM'u, sınıfları, metinleri, izinler ve API sözleşmesi korunmuştur.

### Bu turun doğrulaması

| Kontrol | Sonuç ve ortam |
|---|---|
| `npm run verify` | Geçici kaynak kopyasında 402/402 test; biçim, ortak katman, TypeScript ve üretim derlemesi başarılı. |
| Son `npm run build` ve `node scripts/run-browser-checks.mjs` | Son JSX temizliğinden sonra sırayla çalıştırıldı; derleme başarılı, 54/54 tarayıcı grubu geçti, yakalanmamış hata yok. |
| Risk ve eşzamanlılık gruplarının odak koşusu | Sentetik SQL.js/Chrome üzerinde 18/18; tam tarayıcı koşusuna da dahildir. |
| Yeni klavye regresyonu | Tab/Shift+Tab odağı, IME Enter, silme düğmesinde Enter ve Escape kontrol edildi; iptal senaryosunda API değişiklik isteği sayısı sıfır, kaydedilmiş model aynı. |
| Önce/sonra ekran karşılaştırması | Aynı sentetik fixture ile boş tablo, açık yeni taslak, kaydedilmiş sol görünüm ve sağa kaydırılmış görünüm karşılaştırıldı. Dört durumda görüntü boyutları aynı, yerleşim farkı görülmedi. Çözümlenmiş PNG'lerde 14–205 piksel farkı vardır; birebir piksel eşitliği iddia edilmez. |
| `git diff --check` ve kopya karşılaştırması | Biçim hatası yok; bu turun kaynakları, dokümanları ve etkin site çıktısı iki uygulama kopyasında aynı. HEAD değişmedi. |

Gerçek hesap/DB, çalışan backend, migration, restore ve kurum bağlantıları kullanılmadı. Harici ortam bekleyen kontrollerin durumu değişmedi. Sonraki mimari adım gerçekleşen kaynak ekranının (`PersonAllocationPanel.tsx`) sorumluluk ayrıştırmasıdır; bu turda başlatılmadı.

## Gerçekleşen kaynak ekranı ayrıştırması — 3 Ekim 2026

RiskTable sonrasındaki mimari adım tamamlandı. `frontend/src/PersonAllocationPanel.tsx` 774 satırdan 167 satıra indirildi. Ekran state'i ve kayıt koordinasyonu burada kalır; görünüm ve etkileşim sorumlulukları `frontend/src/features/actual-allocation/` altındaki sekiz modüle taşındı:

- `useActualAllocationView.ts`: görünür kişi/hücre kapsamı, sayfalama ve tüm snapshot'tan alınan aylık toplamlar. Proje filtresi kapasite hesabına giren tahsisleri veya eğitimi azaltmaz.
- `useActualCellSelection.ts`: seçili hücre, kişi/ay bağlamı, dış tıklama/odak/Escape ve kapsam/sayfa değişiminde seçim temizleme.
- `useActualCapacityDialog.ts`: kapasite uyarısının state'i ve kapanışta giriş alanına güvenli odak dönüşü.
- `ActualAllocationControls.tsx`, `ActualAllocationTable.tsx`, `ActualAllocationDialogs.tsx`: başlık ve saat/birim kontrolleri, sabit proje grupları/kişi girdileri/toplamlar, takvim/uyarı/aşama pencereleri.
- `types.ts`, `format.ts`: ortak ekran/callback sözleşmeleri ve ay/sayı biçimleri.

Mevcut `ActualAllocationInputs.tsx` taslak davranışı, `actual-allocation-commands.ts` revision'lı komut hazırlığı ve `writeBatch` kayıt yolu korunmuştur. Takvim, kapasite ve birim iş kuralları shared katmanda kalır. Yeni API, yetki, veritabanı şeması veya hesaplama kuralı eklenmedi. DOM/CSS sınıfları korunmuştur; görünürlük/statü geçmiş kayıtları silmez. Satır sayısı azalması performans veya güvenlik garantisi değildir.

### Bu turun kanıtları

| Kontrol | Sonuç ve ortam |
|---|---|
| `npm run verify` | Geçici kaynak kopyasında 402/402 test; biçim, ortak katman bağımlılık kontrolü, TypeScript ve üretim derlemesi geçti. |
| `node scripts/run-browser-checks.mjs` | Son derlemeden sonra 57/57 grup; yakalanmamış tarayıcı hatası yok. Önceki 54 gruba üç gerçekleşen giriş grubu eklendi. |
| Gerçekleşen giriş + takvim odak koşusu | Sentetik SQL.js/Chrome üzerinde 9/9 grup; tam koşuya da dahildir. |
| Yeni kullanıcı akışları | Hücre/toplam seçimi, dış tıklama/Escape/Enter, yüzde/gün/saat eşitliği, manuel saatin otomatik takvime dönüşü, tam kapasite/gelecek ay kilidi, uyarıdan girişe odak dönüşü, kaynak ve saat kaydında 503 sonrası taslak/retry. Kaydedilen model ve görünüm birlikte denetlendi. |
| Önce/sonra ekran karşılaştırması | Aynı sentetik fixture ve viewport'ta boş ekran, seçili hücre, kayıtlı tahsis, kapasite uyarısı, aşama penceresi ve kişisel takvim karşılaştırıldı. Altı durumun çözümlenmiş PNG piksel verisi ve boyutları birebir aynı. Diğer viewport/işletim sistemleri için görsel eşitlik iddia edilmez. |
| `git diff --check` ve kopya karşılaştırması | Biçim hatası yok; bu turun kaynak/dokümanları ve etkin site dosyaları Git deposu ile çalıştırılabilir üst kopyada aynı. Git HEAD değişmedi; commit/push yok. |

Çalışan backend'e istek gönderilmedi, yeniden başlatılmadı; `.env`, gerçek kullanıcı hesabı ve gerçek DB kullanılmadı. Test kayıtları yalnız geçici veritabanındadır ve fixture kapanışında silinir. Native MSSQL/Windows/kurum proxy/kurtarma doğrulamalarının bekleyen durumu değişmedi. Sonraki aday mimari adım `WorkCalendarDialog.tsx` içindeki takvim formu, önizleme ve kayıt sorumluluklarının ayrılmasıdır; bu turda başlatılmadı.

## Çalışma takvimi ayrıştırması — 3 Ekim 2026

Gerçekleşen kaynak ekranından sonraki takvim adımı tamamlandı. `frontend/src/WorkCalendarDialog.tsx` 550 satırdan 124 satıra indirildi; pencere/yıl/bölüm koordinasyonu burada kalır. Sorumluluklar `frontend/src/features/work-calendar/` altındaki yedi modüle ayrıldı:

- `useWorkCalendarEditor.ts`: ortak/kişisel form state'i, açılış snapshot/revision'ı, yerel ortak taslak, ekleme/silme, mevcut kayıt ve hata/busy akışı. Ortak tarih silme en güncel yerel taslaktan fonksiyonel güncellemeyle yapılır.
- `useWorkCalendarView.ts`: yılın ortak ve kişisel kayıtları ile shared kurallardan alınan aylık saat önizlemesi. Kişisel takvim değiştiğinde önizlemenin memo bağımlılığı güncellenir.
- `SharedCalendarSection.tsx`, `PersonalCalendarSection.tsx`, `CalendarHoursSummary.tsx`: ortak aralık/listesi, kişisel izin/eğitim formu/listesi ve hesaplanmış saat satırlarının görünümü. Bu bölümlerde API çağrısı veya ayrı iş kuralı yoktur.
- `types.ts`, `format.ts`: pencere sözleşmesi, komut hazırlayıcılarının parametrelerinden türetilen form türleri ve ortak tarih/ay biçimleri.

`calendar-commands.ts`, shared takvim/birim kuralları ve `writeBatch` transport'u değişmedi. Ortak taslak yalnız **Takvimi Kaydet** ile; kişisel izin/eğitim tek kayıt olarak yazılmaya devam eder. Açılış revision'ı arka plan snapshot'ından devralınmaz; 409/503 taslağı korur. Mevcut başlangıç/bitiş varsayılanı, alan temizliği, yıl/izin sınırları, rol kapsamı ve busy durumunda kapanış engeli korundu. Ek DOM/CSS sarmalayıcısı, API/şema değişikliği veya yeni iş politikası eklenmedi. Satır sayısı güvenlik veya performans garantisi değildir.

### Bu turun kanıtları

| Kontrol | Sonuç ve ortam |
|---|---|
| `npm run verify` | Geçici kaynak kopyasında 402/402 test; sıfır başarısız/atlanan test, biçim, domain bağımlılık kontrolü, TypeScript ve üretim derlemesi geçti. |
| `node scripts/run-browser-checks.mjs` | Son derlemeden sonra 59/59 grup; yakalanmamış tarayıcı hatası yok. Önceki 57 gruba iki ortak takvim taslağı grubu eklendi. |
| Takvim taslağı + mevcut takvim odak koşusu | Sentetik SQL.js/Chrome üzerinde 8/8; tam koşuya da dahildir. |
| Yeni 503/bekleyen kayıt senaryosu | Eklenen iki tarih 503 sonrasında taslakta kaldı; sunucuda kayıt oluşmadı. Retry beklerken alan, yıl, kapat ve kayıt düğmeleri kilitlendi; Escape/X pencereyi kapatmadı. Bekleyen istek sayısı bir, başarıdan sonra iki tarih kaydedildi ve pencere kapandı. |
| Yeni 409/arka plan yenileme senaryosu | Ayrı sentetik aktör ortak takvimi değiştirdi; yeni snapshot'ın App'e yansıdığı ayrıca proje aşamasından doğrulandı. Yerel tarihler ve açılış revision'ı korundu. POST açılış revision'ını gönderdi ve 409 aldı; diğer aktörün kaydı silinmedi. Kapatıp yeniden açınca yalnız güncel takvim geldi. |
| Önce/sonra ekran karşılaştırması | Aynı sentetik fixture/viewport'ta ortak boş/önizleme/kaydedilmiş; kişisel boş/doldurulmuş/kaydedilmiş; yönetici salt okunur görünümü karşılaştırıldı. Yedi durumda çözümlenmiş PNG piksel verileri ve boyutlar birebir aynı. Diğer viewport/işletim sistemleri için görsel eşitlik iddia edilmez. |
| `git diff --check` ve kopya karşılaştırması | Biçim hatası yok; bu turun kaynak/dokümanları ve etkin site dosyaları Git deposu ile çalıştırılabilir üst kopyada aynı. HEAD değişmedi; commit/push yapılmadı. |

Gerçek kullanıcı hesabı, `.env`, çalışan/üretim DB'si, migration veya restore kullanılmadı. Çalışan backend'e istek gönderilmedi ve backend yeniden başlatılmadı. Sentetik veritabanları test fixture'ı kapanışında silinir. Harici MSSQL/Windows/proxy/kurum kurtarma kontrollerinin **doğrulanmadı** durumu devam eder. Bu turda yeni bir güvenlik açığı iddia edilmedi; daha geniş bir güvenlik incelemesinin yerine geçmez.

## Ortak tablo stilleri — 3 Ekim 2026

İlk raporun mimari değerlendirmesindeki ortak renk/ölçü ve CSS önceliği konusu yerel kaynak üzerinden ele alındı. Bu çalışma görsel yeniden tasarım veya yeni bir güvenlik açığı düzeltmesi değildir.

- `styles/shared/table-tokens.css` manifest'in başında yüklenir. Tablo çizgileri, sabit başlık/proje/özet yüzeyleri, proje yıl başlığı yüksekliği, scrollbar boşluğu, bugün çizgisi ve pozitif planlanan/gerçekleşen girdilerin ayrı renkleri ortak değişkenlerden gelir. Aynı proje yıl yüksekliği hem `height` hem sonraki başlığın `top` değerinde kullanılır.
- Altı yıl paleti üç değişkenle tanımlanır. `allocation/actuals-and-reports.css` içindeki altı tekrarlı başlık kuralı tek kurala indirildi; eşleşen sınıflar, specificity ve cascade konumu korundu.
- Planlanan/gerçekleşen benzer kenarlık seçicileri taşınmadı: mevcut yükleme sırası ay başlığının sol kenarlığında farklı sonuç verir. Değerleri tek kaynaktan gelir; benzer seçici tek başına gereksiz tekrar sayılmadı. Dinamik sticky ölçümleri, z-index, odak kuralları, media query sınırları ve gerekli `!important` kuralları korunur. Menü/form/sürükleme renkleri tablo rengiyle aynı olsa da otomatik değiştirilmedi.
- `table-styles.mjs` üretilen CSS'i sentetik markup ile doğrular ve mevcut CI tarayıcı çalıştırıcısına eklendi. Palet, kenarlık önceliği, pozitif/boş/odak girişleri, bugün çizgisi, uygulama dışındaki çizgi fallback'i ve ortak başlık ölçüsü kapsanır. Test ölçüleri %80 zoom'daki Chrome yuvarlamasına 0,02 CSS piksel tolerans verir; uygulamanın zoom'u değiştirilmez.

### Bu turun kanıtları

| Kontrol | Sonuç ve ortam |
|---|---|
| `npm run verify` | Geçici kaynak kopyasında 402/402 test; sıfır başarısız/atlanan test, biçim, domain bağımlılık kontrolü, TypeScript ve üretim derlemesi geçti. Son ölçü toleransı değişikliği ayrıca Prettier ile denetlendi ve tam tarayıcı koşusunda çalıştı. |
| `node scripts/run-browser-checks.mjs` | Son derlemeden sonra 60/60 grup; yakalanmamış tarayıcı hatası yok. Önceki 59 gruba üretilen tablo stillerinin regresyon grubu eklendi. Gerçek arayüzde proje satırı sabitleme, yatay kaydırma, aylık/haftalık bar-baklava katmanları ve giriş akışları da mevcut testlerle geçti. |
| Önce/sonra hesaplanmış stil | Önceki etkin derleme ve yeni derlemenin tüm CSS'i aynı sentetik markup/viewport ile karşılaştırıldı. Planlanan, gerçekleşen, rapor, proje aylık/haftalık ekran örneklerinin normal/odak/kaydırılmış 15 durumunda 1.350 DOM öğesinin standart computed CSS özellikleri, boyutları ve bugün çizgisi pseudo özellikleri aynı. Yeni custom property tanımları eşitlik karşılaştırmasına dahil değildir. |
| Önce/sonra görsel | Yukarıdaki beş normal sentetik ekranın PNG dosyaları bayt düzeyinde birebir aynı. Bunlar stil fixture'larıdır; tüm uygulama ekranları/viewport/işletim sistemleri için görsel eşitlik iddia edilmez. |
| `git diff --check` ve kopya karşılaştırması | Biçim hatası yok; bu turun kaynakları, dokümanları ve etkin site dosyaları Git deposu ile çalıştırılabilir üst kopyada aynı. HEAD değişmedi; commit/push yapılmadı. |

Kanıtlar yalnız `aa-table-styles-verification-*` geçici kopyasında üretildi. `.env`, gerçek kullanıcı hesabı, çalışan/üretim DB'si, migration veya restore kullanılmadı. Çalışan backend'e istek gönderilmedi ve backend yeniden başlatılmadı. Tarayıcı testinin DB'si sentetik SQL.js, portu rastgele loopback'tir ve kapanışta DB silinir. Yerel stillerin geri kalan legacy override'ları ve bütün hardcoded değerler temizlenmiş değildir. Native MSSQL/Windows/proxy/kurum kurtarma kontrolleri doğrulanmadı olarak kalır.

## Planlanan kaynak ekranı ayrıştırması — 3 Ekim 2026

Ortak tablo stillerinden sonraki yerel mimari çalışma tamamlandı. `frontend/src/features/PlannedAllocationPanel.tsx` 550 satırdan 30 satıra indirildi; kapasite özeti/sayfalama/tablo/alt açıklamanın koordinasyonunu tutar. Görünüm sorumlulukları `features/planned-allocation/` altındaki sekiz modüle ayrıldı:

- `types.ts`: mevcut public ekran sözleşmesi ve hook'tan türetilen dar grid tipi.
- `PlannedCapacitySummary.tsx` ve `PlannedSummaryRows.tsx`: özetin açılması/filtre etiketleri ve mevcut metric/project totals'tan aktif/tahsis/kalan görünümü. Proje filtresi aktifken üst özetin tahsisi seçili projelerden; takım özetinin tüm proje tahsisi mevcut metric'ten gelmeye devam eder.
- `PlannedTableHeaders.tsx`: kapasite/ana tablonun ortak colgroup, yıl ve ay başlıkları. Kullanılmayan ikinci etiket sütunu seçeneği kaldırıldı; bu ekranın iki çağrısı da zaten tek sütun kullanıyordu.
- `PlannedAllocationTable.tsx` ve `PlannedAllocationRow.tsx`: takım/proje grupları, sabit proje başlıkları, toplamlar, tahsis girişleri ve isteğe bağlı gerçekleşen satırlar. Seçim Set'i tablo başına bir kez oluşturulur ve satırlara salt okunur sözleşmeyle verilir.
- `PlannedTeamLabels.tsx` ve `PlannedPhaseButton.tsx`: kişi rozeti, tekrarlanan gerçekleşen açma/kapama düğmesi/görünürlüğü ve mevcut aşama önizleme callback'leri.

`usePlannedGrid.ts`, `AllocationCell.tsx`, `plan-cell-grid.ts`, metric/shared iş kuralları ve App'in `save`/`batch` kayıt yolu değiştirilmedi. Rol/liderlik/dönem kontrolleri ve revision hazırlığı mevcut mekanizmada kalır. Yeni transport, API, şema veya hesaplama kuralı yoktur. DOM/CSS sınıfları ve grup sınırları korunmuştur; yeni HTML sarmalayıcısı eklenmedi. Satır sayısı azalması tek başına performans veya güvenlik kanıtı değildir; ayrılan dosyaların toplamı ek tür sözleşmeleriyle birlikte daha uzundur.

### Bu turun kanıtları

| Kontrol | Sonuç ve ortam |
|---|---|
| `npm run verify` | Geçici kaynak kopyasında 402/402 test; sıfır başarısız/atlanan test, biçim, domain bağımlılık kontrolü, TypeScript ve üretim derlemesi geçti. |
| `node scripts/run-browser-checks.mjs` | Son derlemeden sonra 63/63 grup; yakalanmamış tarayıcı hatası yok. Önceki 60 gruba üç planlanan giriş grubu eklendi. Normal ekranın proje sabitleme/kaydırma ve diğer mevcut davranışları da tam koşuda geçti. |
| Yeni planlanan giriş odak koşusu | Sentetik SQL.js/Chrome üzerinde 3/3. Gerçek pointer sürüklemesi ve klavye/menü kullanıldı; modeldeki kayıtlar ayrıca denetlendi. Test API kancası yalnız sentetik 503 ve gecikmiş retry içindir. |
| Çoklu seçim ve kayıt | Ters yönde üç hücre seçimi, otomatik sol üst odak, Ctrl ile kopuk ek seçim, 0,75'in Ctrl+Enter ile dört hücreye yazılması; tek hücre Enter, dış tıklama ve Escape seçimini temizler. Escape'te değiştirilmiş 9 taslağı kaydedilmez; önceki 0,6 kalır. |
| Kopyalama | Sıfır içeren 2×2 takım/ay bloğu Ctrl+C/V ve sağ tık menüsüyle farklı aylara taşındı; satır/ay yönü, sıfırlar ve kaynak değerleri korundu. Kopyalanan metin yalnız sentetik test değerlerinden oluştu. |
| 503 ve bekleyen retry | İlk toplu kayıt 503 aldı; metin ve iki hücrenin seçimi açık kaldı, DB'ye yazılmadı. Retry sırasında girişler kilitlendi; toplam iki istekten yalnız retry başarılı oldu. 1,25 yalnız hedef iki hücreye yazıldı, sonraki ay değişmedi; başarıda seçim temizlendi. |
| Önce/sonra görsel | Aynı sentetik veri/viewport ile proje kapasite açık/kapalı, gerçekleşen açık, seçim, sağ tık menüsü ve takım normal/gerçekleşen görünümleri karşılaştırıldı. Yedi PNG'nin boyutları aynı; beşinde çözümlenmiş piksel verisi birebir eşit, diğer ikisinde 6 ve 1 piksel farkı var. Yerleşim farkı görülmedi; tüm viewport/işletim sistemleri için görsel eşitlik iddia edilmez. |
| `git diff --check` ve kopya karşılaştırması | Biçim hatası yok; bu turun kaynak/dokümanları ve etkin site dosyaları Git deposu ile çalıştırılabilir üst kopyada aynı. Git HEAD değişmedi; commit/push yapılmadı. |

`.env`, gerçek hesap, çalışan/üretim DB'si, migration veya restore kullanılmadı. Test DB'leri geçici SQL.js, portlar rastgele loopback'tir; fixture kapanışında DB'ler silinir. Çalışan backend'e istek gönderilmedi ve backend yeniden başlatılmadı. Native MSSQL/Windows/proxy/kurum kurtarma doğrulamalarının bekleyen durumu değişmedi. Bu tur yeni bir güvenlik açığı iddia etmez. Sonraki yerel aday App içindeki filtre/seçim ve türetilmiş ekran verilerinin sorumluluk ayrıştırmasıdır; bu turda başlatılmadı.


## App filtre, seçim ve görünüm ayrıştırması — 3 Ekim 2026

Planlanan kaynak ekranından sonraki yerel mimari adım tamamlandı. `frontend/src/App.tsx` 1361 satırdan 1197 satıra indirildi. Sorumluluklar `frontend/src/features/workspace/` altındaki beş modüle ayrıldı:

- `workspace-options.ts`: geniş plan bağlantısından filtre/dönem/yoğunluk başlangıcı, ay ve dönem sınırları, bağlantı üretimi ve sıfırlama bildirimi. Saf fonksiyonlar `window` olmadan test edilebilir; App yalnız tarayıcı adresini verir.
- `useWorkspaceFilters.ts`: filtre, hücre/kaynak/kişi seçimi, sayfa, görünüm/yoğunluk, detay/haftalık seçenekleri ve güncel tarih state'i. Normal filtre değişiminde kişi filtresinin korunması; tam sıfırlamada temizlenmesi; yıl değişiminde yalnız varsayılan ocak başlangıcının güncellenmesi mevcut davranıştır.
- `workspace-selectors.ts`: yetkili snapshot'tan takım/proje/kişi kapsamı, rapor grupları, filtre etiketleri, metric toplama ve sayfalama. Girdi modelini değiştirmez. Kişi görünürlüğü ortak `shared/actual-visibility.ts` politikasından gelir; ilk bilinen atamanın geçmiş görünüm fallback'i veya kendi kaynak istisnası yeniden tanımlanmaz.
- `useWorkspaceView.ts`: selector ve mevcut shared kapasite/tahsis indekslerinin memo koordinasyonu. Kapasite indeksi tüm yetkili snapshot'tan hesaplanır; proje filtresi bunu daraltmaz. Üst plan özetinin seçili proje tahsisi ve takım/raporların tüm proje tahsisi ayrı kalır.
- `useSynchronizedTableScroll.ts`: iki tekrarlı effect tek hook'a indirildi; plan–özet ve liderlik–takım tablolarında iki yönlü scroll, ilk hizalama ve dinleyici temizleme ortaklaştırıldı.

App oturum/ekran/eylem koordinasyonunu tutar. `usePortalData`, `usePortalRefresh`, editör açılış revision'ı, `usePlannedGrid`, mevcut save/batch yolu, sunucu yetkileri ve shared iş kuralları değiştirilmedi. Yeni API/şema/transport veya iş politikası yoktur. DOM/CSS sınıfları korunur. Ayrıştırma tüm App mimarisinin tamamlandığı, performansın arttığı veya uygulamanın güvenli olduğu anlamına gelmez; modüllerin toplam satır sayısı ek sözleşmelerle birlikte artmıştır.

### Bu turda bulunan ve düzeltilen ek davranış hatası

**Doğrudan açılışta ortak yatay kaydırmanın bağlanmaması:** önceki App'in effect'i veri henüz yokken çalışır; tabloların ref'leri boş olduğu için döner. İlk veri yüklemesi bağımlılıklar arasında olmadığından doğrudan geniş plan veya varsayılan Raporlar açılışında dinleyiciler kurulmayabilir. Yeni hook çağrıları `!!data` koşuluyla veriyle oluşturulan tablolar hazır olduktan sonra etkinleşir. Yenilemeler her snapshot'ta scroll'u sıfırlamaz; yalnız veri var/yok geçişi bağlantıyı etkiler.

Bu kusur önceki etkin derleme üzerinde güvenli biçimde yeniden üretildi: 650 px'e daraltılan iki tablonun ana scroll'u 180 px'e alındığında değerler **[180, 0]** idi. Aynı sentetik fixture ve yeni derlemede **[180, 180]** oldu. Önceki JS yalnız test tarayıcısının asset isteğine yerel dosyadan verildi; çalışan sunucuya istek gönderilmedi. Bu bulgu bir güvenlik açığı iddiası değildir.

### Bu turun kanıtları

| Kontrol | Sonuç ve ortam |
|---|---|
| `npm run verify` | Geçici kaynak kopyasında 409/409 test; sıfır başarısız/atlanan test, Prettier, domain bağımlılık kontrolü, TypeScript ve üretim derlemesi geçti. Önceki 402 teste yedi saf çalışma alanı testi eklendi. |
| `node --experimental-strip-types --test tests/workspace-view.test.mjs` | 7/7. URL yalnız geniş plan modunda uygulanır; hatalı ay/dönem/mod reddi, sınır clamp'i, kodlanmış çoklu filtre round-trip, grup/sıra/etiketler, uyumsuz filtrelerin boş kesişimi, proje filtresinden bağımsız kapasite, seçili takım proje toplamı, mevcut kendi kişi/geçmiş görünümü, server-scoped yönetici snapshot'ı ve sayfa sınırları. |
| Yeni çalışma alanı tarayıcı odak koşusu | 3/3. URL başlangıcı, dönem/gruplama değişiminde hücre temizliği, tam sıfırlama ve reload; proje filtresiyle değişen özet/korunan kapasite/tüm-proje raporu; doğrudan açılış, özet yeniden açma, dönem/sekme değişimi, haftalık reset ve varsayılan Raporlar reload sonrasında iki yönlü scroll. |
| `node scripts/run-browser-checks.mjs` | Son derlemeden sonra 66/66 grup; yakalanmamış tarayıcı hatası yok. Önceki 63 gruba üç çalışma alanı grubu eklendi. Rol/oturum, 409/503 taslakları, giriş/kopyalama, takvim, yedek/içe aktarma ve zaman çizelgesi regresyonları da geçti. |
| İlk açılış hatası | Önceki derleme [180, 0]; düzeltme [180, 180]. Tarayıcı grubu ayrıca özetten ana tabloya kaydırmayı ve özet/sekme/dönem sonrası yeniden bağlantıyı doğrular. |
| Önce/sonra görsel | Aynı sentetik fixture, %80 uygulama zoom'u ve 1800×1050 viewport'ta geniş plan proje/takım, filtreli rapor/gerçekleşen ve aylık/haftalık proje ekranları karşılaştırıldı. Altı PNG'nin boyutları aynı; beşinin çözümlenmiş piksel verisi birebir aynı, son geniş plan görüntüsünde altı piksel renk farkı var. Görsel incelemede yerleşim farkı görülmedi. Diğer viewport/işletim sistemleri için eşitlik iddia edilmez. |
| `git diff --check` ve kopya karşılaştırması | Bu turun kaynak/dokümanları ve etkin site dosyaları Git deposu, doğrulanan geçici kopya ve çalıştırılabilir üst kopyada aynı; önceki çalışma ağacı değişiklikleri korundu. HEAD değişmedi, commit/push yapılmadı. |

Kanıtlar `aa-workspace-refactor-verification-*` geçici kaynak kopyasında ve ayrı `aa-browser-checks-*` sentetik fixture'larında üretildi. `.env`, gerçek hesap, çalışan/üretim DB'si, migration veya restore kullanılmadı; çalışan backend'e istek gönderilmedi ve yeniden başlatılmadı. Test DB'leri geçici SQL.js/rastgele loopback portu kullanır ve kapanışta silinir. Native MSSQL, gerçek Windows servis/ACL, kurum proxy/TLS/kurtarma ve gerçek yük sonuçları **doğrulanmadı** olarak kalır.

Sonraki yerel aday App'in dışa aktarma ve veri değiştiren toplu eylemlerinin komut hazırlama/arayüz koordinasyonundan ayrılmasıdır. Bu turda başlatılmadı.


## Son App eylem ayrıştırması ve yerel turun kapanışı — 3 Ekim 2026

Planlanan son yerel mimari adım tamamlandı. App dışa aktarma ve veri eylemlerini koordine eden dört modüle bağlandı; `App.tsx` 1197→947 satır oldu. Satır sayısı performans veya güvenlik kanıtı değildir. Controller'lar her render'ın snapshot/callback'lerinden oluşur; React hook'u, yeni state veya yeni kayıt transport'u eklenmez.

- `workspace-exports.ts`: planlanan, gerçekleşen, proje ve kaynak raporu sekmeleri için mevcut Excel yazarını seçer; filtreli görünüm, normal kişinin kendi kaynak ID'si ve hata alanı korunur.
- `resource-report-data.ts`: kaynak raporunun grup yöneticisi, başlangıç ayına göre çalışan sayısı, kalan kaynak/aşım sınıfı ve filtre metni saf fonksiyonlara taşındı. Çalışan sayısında ilanlar/işten ayrılanlar hariç; çalışan statüsü, dahil ve tarih örtüşmesi önceki kuralla aynıdır. Hesaplama kaynağı shared model/date/metric politikalarıdır.
- `workspace-data-actions.ts`: global planlanan tahsis sıfırlama, seçili kaynak silme, JSON indirme/restore koordinasyonu. Onay metni, iptal, busy, hata/retry, seçimin başarıda temizlenmesi, risk taslağı/oturum guard'ı ve dosya input'unun finally temizliği korunur.
- `project-actions.ts`: proje/başlık sırası ve bar/not tarih eylemleri mevcut saf komut hazırlayıcılarına ve batch yoluna taşındı. Admin/saving/no-op kontrolleri, revision ve bildirimler korunur.

API, şema, migration, oturum transport'u, Excel yazar/paket biçimi ve shared iş politikaları değiştirilmedi. App ekran kompozisyonu, risk leave guard, sekme/çıkış koordinasyonu ve veri eylemi bağlantılarını tutar. DOM/CSS sınıfları değişmedi.

### Kanıtlar

| Kontrol | Sonuç ve ortam |
|---|---|
| `npm run verify` | Geçici kaynak kopyasında 414/414 test, sıfır başarısız/atlanan test; Prettier, domain sınırı, TypeScript ve üretim derlemesi geçti. Önceki 409 teste beş kaynak raporu payload testi eklendi. |
| `node --test tests/resource-report-data.test.mjs` | 5/5. Başlangıç ayındaki aktif/saat ücretli/Gear Up sayısı, ilan/dahil/ay örtüşmesi/transfer, ay ve grup sırası, tüm proje metric'i ve aşım sınıfları, takım/liderlik yönetici fallback'i, scopeData'dan geçen yönetici kapsamı ve filtre metni. |
| Yeni tarayıcı odak koşusu | 3/3. Dört sekmenin filtreli XLSX'leri indirildi, ZIP/OOXML parçaları ayrıştırıldı; normal kişinin kendi kaynağı ve başkasının dışlanması kontrol edildi. İptal/503 sonrası sıfırlama modeli korudu; retry tüm planlanan tahsisleri sildi. İptal/409 kaynak seçimlerini korudu; başarı yalnız seçili kaynakları ve onlara bağlı gerçekleşen kaydı sildi, planlanan tahsisler/projeler korundu. |
| `node scripts/run-browser-checks.mjs` | Son derlemeden sonra 69/69 grup; yakalanmamış tarayıcı hatası yok. Üç eylem grubu eklendi. Tam koşuda altı aylık görünüm dışındaki kasım tahsisi ile filtre dışı takım/proje tahsisi de sıfırlandı. Mevcut yedek/restore, 409/503 taslakları, oturum, rol, takvim ve proje/timeline kontrolleri geçti. |
| Önce/sonra görünüm | Aynı sentetik fixture, 1800×1050 ve %80 uygulama zoom'unda geniş plan proje/takım, filtreli rapor/gerçekleşen, aylık/haftalık proje ekranlarının altı PNG'si çözümlenmiş piksel ve boyut olarak birebir aynı. Diğer ekran/viewport/işletim sistemi için eşitlik iddia edilmez. |

### Ortam ve Git sınırı

Bu tur bazı depo dosyaları ve `.git/HEAD`, `.git/index`, `.git/config` bulut yer tutucusu olarak kaldı; normal okumalar/Git komutları ilerleyemedi. Platformun yalnız kaynak klasörleri ve Git metadata'sına yönelik yerel indirme isteği kabul edildi, ancak dosyalar okunabilir hale gelmedi. Kullanıcıdan Finder'da yerelde tutması istendi. Dosyaların içeriği tahmin edilmedi ve Git deposu yeniden oluşturulmadı.

Doğrulama, önceki turda tamamı test edilmiş yerel kaynak kopyası üzerine bu turun değişiklikleri uygulanarak yapıldı. Güncel depoda okunabilir 130 kaynak dosyası bu başlangıç kopyasıyla eşit; 273 dosyanın içeriği yer tutucusu nedeniyle yeniden karşılaştırılamadı. Bu sınırlama Git ağacı/HEAD ve push doğrulamasını da etkiler. Son doğrulanmış Git tabanı rapor başındaki değerdir; bu tur güncel HEAD henüz okunamadı. Yeni kaynak/rapor/test ve etkin derleme dosyaları kopya hash kontrolüyle ayrıca doğrulanır.

`.env`, gerçek kullanıcı hesabı, çalışan DB'si, migration, restore ve gerçek backend kullanılmadı/yeniden başlatılmadı. Yerel bağımlılıklar da bulutta olduğundan geçici kaynak kopyasına mevcut lock dosyalarıyla `npm ci --ignore-scripts --no-audit --no-fund` uygulandı; ayrı boş kullanıcı/global npm config'i ve geçici cache kullanıldı. Paketler yalnız lock'taki npm registry adreslerinden alındı; uygulama verisi dışarı gönderilmedi. Test SQL.js DB'leri ayrı geçici dizin/rastgele loopback portu kullanır ve fixture kapanışında silinir.

### Kapanış ve kalan kabul kontrolleri

Kullanıcıyla kararlaştırılan **yerel kod iyileştirme turu tamamlandı**. Bu, bütün mimari/legacy CSS/hardcoded değerlerin temizlendiği veya bütün güvenlik açıklarının bulunmuş olduğu iddiası değildir. Bu tur yeni bir güvenlik açığı iddia etmez. Bundan sonra kayıtlı ana işler şu beş gerçek ortam kabul başlığıdır:

1. Native MSSQL: doğrulanmış ayrı sentetik hedefte migration/transaction/lock/restore ve ilk başarılı native CI sonucu.
2. Windows: ilk başarılı Windows CI, gerçek servis hesabı/ACL, launcher ve crash/yeniden başlatma.
3. Kurum proxy/TLS: gerçek hop/trust, TLS sonlandırma, cookie/Host/Origin ve rate-limit.
4. Kurum kurtarma: erişim kontrollü yedek, ayrı hedefe kurtarma, sertifika/anahtar ve ölçülmüş RPO/RTO.
5. Gerçekçi sentetik yük ve native Excel: beklenen kullanıcı/veri hacmi; Excel uygulamasında çıktı açılışı/görünümü.

Bu başlıklar **doğrulanmadı** olarak kalır. Gerçek çalışan/üretim ortamında işlem yapmak için kullanıcının açık izni gerekir. Commit/push isteği yetkilidir; Git dosyalarının yerelde erişilebilir olması beklenir.


## Native MSSQL kabul kontrolü — hazırlık ve güvenlik korumaları

**Seçilen hedef:** Kullanıcı, GitHub CI üzerinde geçici SQL Server kullanılmasını seçti. Mevcut `.github/workflows/mssql-native.yml` iş akışı kullanılacak; bu tur yeni bir workflow veya uygulama kodu değişikliği yapılmadı.

**Durum:** Yerel hazırlık kontrolleri tamamlandı; native SQL Server çalışması ve güncel commit üzerinde CI sonucu **doğrulanmadı**. Bu makinede Docker/Podman/Colima/sqlcmd PATH'te ve kontrol edilen standart kurulum konumlarında bulunmadı. Bu sonuç, erişimi bilinmeyen başka bir test sunucusunun yokluğu anlamına gelmez.

### İncelenen çağrı zinciri

`npm run test:db` → ortak domain kontrolü → `scripts/run-mssql-tests.mjs` → `mssqlTestEnvironment` → `tests/mssql.integration.mjs` → `withMssqlTestDatabase` → native adapter/test suite → kontrollü temizleme → başarı raporu.

- Test bağlantısı yalnız `TEST_DB_*` alanlarından kurulur; uygulamanın `.env` dosyası yüklenmez ve `DB_*` bağlantısına fallback yoktur. Veritabanı adı ayrı `_test` biçiminde olmak zorundadır.
- Yazma başlamadan gerçek bağlantının veritabanı adı, dbo şeması, metadata/DDL/DML izinleri, OPENJSON uyumluluğu ve boş olması denetlenir. Başka test süreciyle çakışmayı ayrı transaction kilidi engeller.
- Dolu veritabanında test callback'i ve tablo temizliği çalışmaz. Temizleme sabit dbo tablo kataloğuyla sınırlıdır; beklenmeyen nesne görülürse DROP işlemleri başlamaz.
- Native assertion, temizleme veya kilit bırakma hatası başarı raporuna dönüştürülemez. Başarı raporu ancak temizleme bitince yeni dosya olarak yazılır.
- Mevcut CI geçici parolalı, loopback'e bağlı SQL Server container'ı ve boş `AA_native_test` oluşturur. Test container'ı sonunda kaldırılır. Teste ait self-signed sertifika istisnası kurum TLS doğrulamasını kanıtlamaz.

### Bu tur çalıştırılan en küçük doğrulama

| Komut / kontrol | Sonuç ve sınır |
|---|---|
| `node --test tests/mssql-test-environment.test.mjs` | Önceki doğrulanmış geçici kaynak kopyasında **11/11**, sıfır başarısız/atlanan test. Testler fake adapter, sentetik bağlantı değerleri ve yalnız OS geçici dosyaları kullanır; native SQL Server bağlantısı kurulmaz. Çalıştırma ortamından DB/TEST_DB/ADMIN/BOOTSTRAP/SQLJS/NODE ayarları çıkarıldı; `NODE_ENV=test` açıkça verildi. |
| Güncel kaynak karşılaştırması | `scripts/mssql-test-environment.mjs`, `tests/mssql-native-suite.mjs` ve `backend/adapters/mssql.mjs` güncel depodaki okunabilir dosyalarla SHA-256 olarak eşit. CLI, integration test, guard test ve workflow'un güncel depo dosyaları bulut yer tutucusu olduğundan yeniden eşitlik kontrolü yapılamadı. |
| Git erişimi | `.git/HEAD`, `.git/index`, `.git/config` hâlâ yerelde okunabilir değil. Finder üzerinden indirme denemesi Computer Use izni olmadığı için gerçekleştirilemedi. Commit/push ve GitHub workflow başlatma bu tur yapılmadı; önceki push isteği açık. |

### CI kabul kanıtı için kalan işler

1. Kullanıcı depo klasörünü Finder'da **Şimdi İndir / İndirilenleri Koru** ile yerelde erişilebilir hale getirir.
2. Güncel HEAD, çalışma ağacı ve remote doğrulanır; önceki test kopyasıyla farklar değerlendirilir. Yalnız gerekli testler tekrar edilir; gerçek veri/env/yedek dosyaları commit'e dahil edilmez. Yetkili tüm kaynak güncellemeleri commit ve push edilir.
3. **Native MSSQL verification** iş akışı push edilen commit üzerinde, ilk koşu için mevcut `size=1000`, `samples=3` değerleriyle çalıştırılır. CI erişimi yoksa erişim kullanıcıyla tamamlanır; başka bir repo veya eski commit sonucu kabul edilmez.
4. Workflow sonucu, testlerin sıfır hata/atlama ile tamamlanması, `native-mssql-report` artifact'i, schema sürümü 30, `cleanupVerified: true` ve `sourceHashes` ilgili commit'e karşı doğrulanır. SQL süre/SELECT sayısı ölçümleri gerçek kullanıcı yükü veya kurum RPO/RTO sonucu olarak sunulmaz.
5. Native sonuç başarılı olduktan sonra sıradaki kabul başlığı Windows CI ve servis/ACL kontrolüdür; bu tur tamamlandığı iddia edilmez.

Gerçek kullanıcıyla giriş yapılmadı; `.env`, gerçek DB, migration, restore, çalışan uygulama veya kurumsal sisteme dokunulmadı. Bu kontroller yeni bir güvenlik açığı veya native MSSQL kabulü iddiası değildir.
