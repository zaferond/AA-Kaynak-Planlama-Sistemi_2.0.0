# Uygulama stilleri

Önceki `src/upgrade.css` içeriği ekran ve bileşen sorumluluklarına göre bu dizine ayrıldı. **Kuralların cascade sırası `manifest.json` ile belirlenir.** Dosya adlarını alfabetik sıralamak yükleme sırasını değiştirmemelidir.

## Derleme sırası

1. `assets/base.css` — mevcut temel stiller
2. `styles/manifest.json` içindeki dosyalar — listedeki sırayla
3. `src/login.css`
4. Vite tarafından birleştirilen bileşen stilleri — mevcut risk ve değişiklik geçmişi stilleri dahil

`frontend/styles.mjs` listedeki dosyaları bu sırayla okur. Eksik, yinelenmiş, dizin dışına çıkan veya listeye eklenmemiş CSS dosyası derlemeyi durdurur. Sonuç tarayıcıya yine tek CSS dosyası olarak sunulur; ilave ağ isteği oluşmaz.

## Dosya seçimi

| Dizin | Kapsam |
|---|---|
| `workspace/` | Ana yerleşim, menü, filtreler ve ortak aksiyonlar |
| `projects/` | Proje tablosu, aşama menüsü, Gantt/haftalık barlar, düzenleyiciler |
| `planning/` | Planlanan kaynak tablosu, kapasite özeti, görünüm seçimleri |
| `allocation/` | Dağılım kontrolleri, ortak tablo ve sabit sütun kuralları |
| `resources/` | Çalışan araçları, düzenleme ve içe aktarma |
| `reports/` | Kritik konular, grafikler ve rapor başlıkları |
| `administration/` | Yetki ve takım yönetimi |
| `calendar/` | Ortak çalışma ve kişisel izin/eğitim takvimi |
| `shared/` | Ortak kontroller, tablo tema değerleri, kişi sayısı rozetleri, bugün çizgisi, dolu hücreler |

Bazı ortak seçiciler ilgili ekran dosyalarında hâlâ birbirini tamamlar. Bu ilk ayrıştırma adımında seçiciler, değerler, media query sınırları ve `!important` kullanımları korunmuştur. `*-theme` ve `*-layout` dosyaları mevcut kuralların sonraki düzenlemelerini içerir; yerlerini değiştirmeden önce etkilenen ekranlar görsel olarak doğrulanmalıdır.

## Ortak tablo değerleri

`shared/table-tokens.css` manifest'in başında yüklenir. `.app` altında `--table-*` değişkenleri çizgi, sabit başlık/proje/özet yüzeyi, proje yıl başlığı yüksekliği, yatay scrollbar boşluğu, bugün çizgisi ve dolu dağılım hücrelerinin renklerini tanımlar. Planlanan ve gerçekleşen giriş renkleri ayrı kalır; odak ve boş hücre kuralları bu değişkenlerden etkilenmez. Proje yıl satırının yüksekliği ve sonraki başlığın `top` değeri aynı değişkenden gelir. Dinamik proje sabitleme ölçümleri ve katman sırası yine tablo bileşenine/ilgili seçicilere aittir.

Altı `.year-band-*` sınıfı aynı dosyada kendi üç renk değişkenini sağlar. `allocation/actuals-and-reports.css` içindeki tek başlık kuralı bu paleti kullanır; mevcut specificity ve yükleme konumu korunur. Planlanan ve gerçekleşen tabloların benzer kenarlık kuralları farklı cascade konumlarında kaldığı için birleştirilmemiştir. Değerleri ortaktır; ay başlığı kenarlığında mevcut farklılık korunur. Tabloyla aynı renge sahip menü, form ve sürükleme işaretleri ayrı sorumlulukları nedeniyle bu kapsama alınmamıştır.

`scripts/browser-checks/table-styles.mjs`, üretilen CSS'in tamamını sentetik tablo üzerinde doğrular: altı yıl rengi, iki dağılım tablosunun kenarlık önceliği, dolu/boş/odak hücreleri, bugün çizgisi ve başlık ölçüsü. Bu kontrol mevcut gerçek arayüz kaydırma/sabitleme testlerini tamamlar. Bütün legacy stillerin veya `!important` kurallarının temizlendiği anlamına gelmez.

Yeni bir stil için önce mevcut ilgili dosyayı düzenleyin. Yeni dosya gerekiyorsa `manifest.json` listesine uygun sırada ekleyin. `npm run verify` biçim, test, TypeScript ve derleme kontrollerini birlikte çalıştırır. Bu kontroller tarayıcı görsel doğrulamasının yerini tutmaz.
