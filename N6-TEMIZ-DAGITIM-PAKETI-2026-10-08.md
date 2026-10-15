# N6 — Güncel derlemeyle sınırlı dağıtım paketi

## Sonuç ve kapsam

Başlangıç: `652f40525d4bfdbc348cef040248a333b695e2e1`, temiz Git çalışma ağacı. 7 Ekim incelemesindeki **N6'nın paket büyümesi kısmı giderildi**. Çalışan kurulumda eski varlık saklama/temizlik ve atomik canlı sürüm geçişi **açık operasyonel işlerdir**; N6 bütünüyle kapanmış sayılmamalıdır.

Derleme artık ürettiği dosyaları `releaseArtifacts` olarak açıkça kaydeder: HTML, JS, CSS, bunların gzip kopyaları ve uygulamanın JS içinden kullandığı logo. HTML'den tahmin edilen eksik bir dosya listesi kullanılmaz. Manifestin `artifacts` alanı hâlâ tüm mevcut site dosyalarını doğrular. Eksik, eklenmiş, hash'i değişmiş veya symlink içeren kaynaklar eski bundle dahil paketlemeyi engeller.

Paket yalnız güncel çıktıları alır; kendi manifesti kopyalanan tam envanteri içerir. Kaynak dosyaları, commit bilgisi ve hash'leri korunur. Kaynakta eski dosyalar veya manifest silinmez/değiştirilmez. Hedef mevcutsa reddedilir; hata temizliği yalnız bu çağrının oluşturduğu yeni hedefe uygulanır. Manifest en son yazılır; işlem atomik canlı yayın değildir.

Eski v1 manifestlerinin açılış doğrulaması korunur. Güncel çıktı listesi olmayan eski manifestle paketleme, yeniden derleme isteyen açık hata verir. Güncel liste hash/path/alt küme/index zorunluluğuyla doğrulanır; geçersiz liste önceki iyi manifesti değiştiremez. Gelecekte yeni statik dosya eklendiğinde derlemenin listesi ve paket kabul kontrolü birlikte güncellenmelidir.

## Geçici ortamda ölçüm

Gerçek ayar, kullanıcı hesabı veya DB alınmayan Git kaynak kopyası kullanıldı. Başlangıçtaki doğrulanmış site dosyaları eski birikimi sınamak için bu geçici kopyaya taşındı. Kilit hash'leri aynı olan önceki izole kurulumun bağımlılıkları kullanıldı; yeni npm kurulumu yapılmadı.

| Site çıktısı | Dosya | Sıkıştırılmamış klasör boyutu; `.gz` dosyaları da dahil |
|---|---:|---:|
| Tarihsel birikim dahil kaynak | 407 | 133.963.808 bayt |
| Yeni paket | 7 | 1.383.530 bayt |

**400 tarihsel dosya pakete alınmadı; site çıktı boyutu yaklaşık %99 azaldı.** Bunlar tüm kaynak paketinin veya ZIP'in boyutu değildir. Derlenen arayüz içerikleri değişmedi.

## Çalıştırılan kontroller

- `node --test tests/deployment-manifest.test.mjs tests/http-config.test.mjs tests/startup-tools.test.mjs`: **22/22**, fail/skipped/cancelled 0. Yalnız geçici ve sentetik fixture'lar; gerçek başlatıcı/DB çalıştırılmadı. Bunların 13'ü dağıtım testidir. Üç ardışık tarihsel birikimden sonra paket hâlâ 7 dosyadır; güncel dosyaların baytları eşittir. Eski manifest, bozuk release listesi, tarihsel dosya drift'i, mevcut hedef, traversal ve symlink korumaları sınandı.
- `npm run check:domain`: **35 shared kaynak**, recursive AST sınır kontrolü başarılı.
- `npm run build`: TypeScript ve Vite başarılı; yalnız geçici kaynak kopyasında çıktı yazıldı.
- `node scripts/check-deployment-package.mjs`: **387 kaynak / 7 çıktı / 400 tarihsel çıktı hariç**, paket doğrulaması başarılı. Gerçek build'in HTML JS/CSS referansları, logo ve gzip açılmış bayt eşitliği kontrol edildi; yeni geçici paket temizlendi.
- `npm run format:check` ve `git diff --check`: başarılı.

İlk paket kabul denemesi, test ortamındaki `TMPDIR` kaynak klasörünü gösterdiği için kaynak-içi hedef korumasında reddedildi. Kontrol aracı geçici kökün kaynak içinde olduğu durumda dışarıda geçici dizin oluşturacak şekilde düzeltildi; koruma gevşetilmedi. Sonraki deneme geçti. Ubuntu/Windows CI'a gerçek build sonrası aynı paket kabul kontrolü eklendi; sonuçları ayrıca kaydedilecektir.

## Aynı kaynak commit'i için CI doğrulaması

Kod ve iş akışı commit'i **`a26c7265c87b699fa8fb3d46ea77da802ef6282a`**, [37821015932 kalite koşusunda](https://github.com/zaferond/AA-Kaynak-Planlama-Sistemi/actions/runs/37821015932) başarılıdır: **Ubuntu 562/562, Windows 212/212, Chromium 141 grup**. Test toplamlarının fail/skipped/cancelled değerleri 0'dır. İki işletim sisteminde yeni gerçek build → geçici temiz paket kabul adımı başarılıdır; biçim/domain/TypeScript/build/manifest ve iki audit Yüksek eşiği de geçmiştir. [Metadata, test toplamları ve log hash kaydı](ci-evidence/quality-a26c726-receipt.json). Windows testleri genel süitle örtüşür; toplamlar bağımsız kapsam olarak toplanmamalıdır. Bu kayıt backend Orta bağımlılık uyarısını veya kurum kabul işlerini kapatmaz; native MSSQL yeniden çalıştırılmadı.

Önceki boş detay tarihi düzeltmesinin **`652f40525d4bfdbc348cef040248a333b695e2e1`** koşusu da ayrı doğrulandı: [37819205387](https://github.com/zaferond/AA-Kaynak-Planlama-Sistemi/actions/runs/37819205387), **558/558, 208/208, 141 Chromium grup**. [Önceki kaynak için ayrı kayıt](ci-evidence/quality-652f405-receipt.json); N6 test edilmiş sayılması için kullanılmadı.

Sonraki kanıt/dokümantasyon commit'i yeni üretim kodu içermez; test edilen commit yukarıdakidir. Çalışma klasörüne aktarımda 407 mevcut site çıktısı korunur; 387 kaynak ve 7 güncel çıktı listesi manifestle doğrulanır. Önceden farklı olan yerel `tests/milestone-note-dates.test.mjs` korunur ve üzerine yazılmaz. Gerçek ayar/veritabanı okunmaz veya değiştirilmez; servis yeniden başlatılmaz. Diskte doğrulama, açık sürecin yeniden yüklenmesi kanıtı değildir.

## Kalan işler ve sınırlar

- Canlı `site/` içindeki eski dosyalar kasıtlı olarak korunur. Yeni temiz paket kontrollü ayrı sürüm klasörüne geçişte kullanılır. Açık sekme davranışı, önceki sürüm saklama süresi, geri dönüş ve eski klasör temizliği kurumun dağıtım kabulünde ayrıca sınanmalıdır.
- Default build hâlâ mevcut `site/` içine çıktı yazar; bunu canlı atomik yayın olarak kullanmak güvenli kabul edilmez. Paket yalnız komut başarıyla bittikten ve doğrulandıktan sonra kullanılmalıdır.
- Gerçek Windows servis/ACL, çalışan süreç, kurum proxy/CA, MSSQL veya yük kabulü bu çalışmanın kanıtı değildir. DB, migration, restore, gerçek hesap, `.env` veya servis erişimi yapılmadı.
- N3'ün tam snapshot/global lock maliyeti, N2'nin backend Orta bağımlılık uyarısı ve önceki kurum kabul işleri bu değişiklikle kapanmaz. Sonraki kod çalışması App/operation sorumluluklarını mevcut davranış testleriyle küçük modüllere ayırma incelemesidir.
