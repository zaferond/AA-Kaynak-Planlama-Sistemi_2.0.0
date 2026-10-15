# Dağıtım paketi doğrulama

## Hazırlama ve kontrol

Git deposundaki tek bir kaynak kopyasını kullanın. Dağıtım yöneticisi bağımlılıkları kilit dosyalarından kurup `npm run build` çalıştırır. Başarılı build, proje kökünde `deployment-manifest.json` üretir. Manifest kaynak/build girdilerinin ve `site/` çıktılarının SHA-256 değerlerini içerir; `.env`, veri tabanı, kullanıcı dosyaları ve `node_modules` kapsama alınmaz. Manifest web üzerinden sunulan `site/` içinde değildir.

```sh
npm run build
npm run deploy:verify
```

`deploy:verify` yalnız dosya okur. Hesapla giriş yapmaz, veri tabanına bağlanmaz, ayar değiştirmez, dosya yazmaz veya çalışan süreci durdurmaz. Başarılıysa `ok: true`, fark veya eksik/geçersiz manifest varsa exit 1 döner. Kaynak ve derleme farkları ayrı listelenir. Derleme sırasında kaynak değişirse yeni manifest üretilmez.

Paket başka bilgisayara taşınırken kaynak/build girdileri, iki package manifest/lock, başlatıcılar, `site/` ve kökteki manifest birlikte taşınır. Hedefte, kurulumdan sonra ve servisi başlatmadan önce aynı `deploy:verify` komutunu çalıştırın. Windows için komut `npm.cmd run deploy:verify` şeklindedir. Headless servis açılışında build veya paket kurulumu yapılmaz; bunlar dağıtım sırasında hazırlanır.

Manifest yoksa paketi güvenilir kaynak kopyasından yeniden derleyin. Fark varsa önce doğru proje klasörünü seçin; eski ve yeni kopyaları sessizce birleştirmeyin. Doğrulama komutu dosyaları düzeltmez. Geçerli eski manifest başarısız yeni build'de korunur; değişmiş kaynak veya çıktı ile birlikte doğrulamadan geçmez. Manifest Git'e eklenmez; dağıtım paketi ile saklanır.

## Yeni paket üretme ve açılış koruması

```sh
npm run deploy:package -- --output "../AA-dagitim"
```

Çıktının üst dizini mevcut olmalı, hedef klasör henüz var olmamalıdır. Komut doğrulanmış manifestteki kaynak/build girdilerini ve yalnız son derlemenin `releaseArtifacts` listesindeki site dosyalarını kopyalar. Eski hash'li bundle'lar yeni pakete aktarılmaz. Kopya hash'leri ve kaynak paketinin **tam envanteri** tekrar doğrulanır. Yeni paket manifestinin `artifacts` alanı yalnız kopyalanan güncel çıktıları içerir; kaynak manifesti değiştirilmez. Eski manifestler açılış doğrulamasında desteklenir; `releaseArtifacts` içermeyen bir manifestten paket üretmek için önce yeniden build gerekir.

Mevcut hedef birleştirilmez; kaynak içine çıktı oluşturulmaz. Hata halinde yalnız komutun oluşturduğu yeni klasör kaldırılır. Manifest en son yazılır; dosya kopyalanırken klasör görünür olabilir. Bu işlem atomik canlı sürüm değişimi değildir; yalnız komut başarılı olduktan ve hedef doğrulandıktan sonra paket kullanılmalıdır. `.env`, `data`, `node_modules`, Git, test kayıtları ve kişisel dosyalar taşınmaz. Test/CI geliştirme deposunda çalıştırılır; paket çalışma ve yeniden derleme girdilerini içerir.

Derleme mevcut `site/` içindeki eski dosyaları otomatik silmez. Açık sekmelerin eski bundle erişimini kesmemek için çalışan kurulumda temizlik uygulanmaz. Temiz paket ayrı bir sürüm klasörüne hazırlanır; kontrollü geçiş, eski sürüm saklama süresi ve sonrasında temizlik IT kabulünde ayrıca belirlenir. Canlı klasöre yeni paketi birleştirmek eski dosyaların birikmesini çözmez.

`node scripts/check-deployment-package.mjs` gerçek build çıktısından yeni geçici bir paket oluşturup temizler. HTML'nin JS/CSS referansları, logo, gzip açılmış bayt eşitliği ve tam paket manifesti kontrol edilir. Ayar/veritabanı okunmaz; sunucu başlatılmaz. `TMPDIR` kaynak içinde ise geçici klasör kaynakla aynı üst dizinde açılır. Bu kontrol Ubuntu ve Windows kalite kapılarına eklenmiştir.

Mac ve Windows başlatıcıları aynı setup → kilitli bağımlılık kurulumu → build → start sırasını kullanır. Mevcut `.env` setup tarafından korunur. Servis için hazırlanmış pakette `npm start` build çalıştırmaz; eksik manifest, değişmiş kaynak veya site çıktısı varsa Store oluşturulmadan önce çıkış yapar. Bu kontrol, veritabanı açılmasını engeller; geçerli paketin normal veritabanı işlemlerini değiştirmez.

Kaynak deposu ile çalışma klasörünü ayırın. Yeni paketin doğrulanması mevcut çalışan klasörün otomatik güncellenmesi anlamına gelmez. Kurum güncellemesinde veri/ayar yedeği, kontrollü dosya aktarımı ve restart kabulü ayrıca uygulanır; `.env` veya veritabanını yeni paketle değiştirmeyin.

7 Ekim 2026'da yeni geçici klasör, boş npm cache, gerçek kilitli kurulum/build ve sentetik SQL.js üzerinde Mac başlatıcı kabulü, yeniden açılışta ayar/veri koruma ve eski paket reddi başarılıdır. Güncel Windows/Native MSSQL ve kurum ortamı kabulü ayrıca beklemektedir.

## Kanıtın sınırları

- Git commit alanı bilgi amaçlıdır; Git bulunmayan paketlerde `null` olabilir. Kaynakta commit edilmemiş değişiklik olabilir; kabul sürümü için temiz Git ağacı ve CI kaydı ayrıca kontrol edilir.
- Bu bir imza sistemi değildir. Manifesti ve dosyaları değiştirme yetkisi olan kişiye karşı bütünlük garantisi vermez. Paket/manifest dağıtım yöneticisi tarafından korunmalı; kurum kabul kayıtlarında manifest hash'i güvenilen ayrı konumda saklanmalıdır.
- Doğrulama kaynak ile build sırasında kaydedilen girdilerin/çıktıların aynı kaldığını kontrol eder. Derleyicinin doğru çalıştığını veya `node_modules` içeriğinin değiştirilmediğini kanıtlamaz; kilitli kurulum ve CI ayrıca gerekir.
- Diskteki paketin doğrulanması, açık Node sürecinin yeni sürümü yüklediğini kanıtlamaz. Kontrollü restart ve süreç/sürüm kabulü IT tarafından ayrı test ortamında yapılır.
- Windows servis/ACL, kurum SQL hesabı/CA/proxy, yedek/restore ve hedef yük kabulü yerine geçmez. Gerçek ortam işlemleri ayrı yetki ve kabul planı gerektirir.

Ubuntu ve Windows kalite iş akışları build sonrası doğrulamayı çalıştırır. Sentetik regresyon testleri yalnız geçici klasörleri kullanır.
