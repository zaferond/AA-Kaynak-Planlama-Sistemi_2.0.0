# Mimari iyileştirme — Gerçekleşen dağılım ve takvim işlemleri

## Başlangıç ve değişiklik

Başlangıç **`2b07fd7cbb7315eaa543ddbf35acc5111f6720d3`**, temiz Git çalışma ağacı. Önceki liderlik/takım ayrımından sonra gerçekleşen dağılım, çalışılan saat, ortak çalışma takvimi ve kişisel izin/eğitim komutları `backend/actual-calendar-commands.mjs` içinde toplandı. `backend/operations.mjs` **533 → 381 satır** oldu. Satır sayısı yalnız sorumluluk ayrımını gösterir; güvenlik veya performans ölçümü değildir.

- `stageActualChange`: eski sayısal FTE ve yüzde/gün/saat girişleri; gelecek ay koruması; yüzde metadata'sı ve etkilenen ay takibi.
- `stageWorkedHoursChange`: hedef/ay doğrulaması, manuel saat sınırı ve otomatik saate dönüş.
- `stageCalendarChange`: ortak takvim schema'sı; tatil kesri değişen aylardaki proje ve kişisel kayıtların etkilenmesi.
- `stagePersonDayChange`: tarih/hedef/tür doğrulaması, eski ve tür ekli kimliklerin uyumluluğu; izin/eğitim kaydetme ve silme.
- `finalizeActualChanges`: yalnız tüm komutlar uygulandıktan sonra aylık kapasite kontrolü ve yüzde yeniden hesaplaması. Ay ekleme küçük bir modül içi yardımcıda tutulur.

## Korunan çağrı zinciri

`/api/changes → changeAndView → Store.mutate → stageChanges → stageParsedChanges → ortak yetki/duplicate/revision kontrolü → ilgili stage handler → ortak revision artışı → final aylık sınır/yüzde hesabı → Store.validate/persist/audit/generation`.

Yeni handler'lar HTTP endpoint değildir ve DB bağlantısı/transaction açmaz. Aktif hesap, CSRF, erişim kapsamı, işlem boyutu, duplicate kimlik, revision ve dağıtım silme hedef kontrolü mevcut ortak zincirde kalır. Handler'ların yalnız bu kontrollerden sonra Store'un işlem taslağına çağrılması önkoşuldur. Standalone `applyChanges` tam doğrulamayı korur; sadece planlanan dağılım için tanımlanan WeakSet sahiplikli komut/dar taslak yolu değişmedi.

Çalışılan saat ve kişisel gün için mevcut olmayan kaydı temizleme `false` döndürür; ortak döngü eski `continue` davranışını korur ve revision tombstone'u üretmez. Yetki ve revision yine no-op öncesinde kontrol edilir. Ortak takvim etiket değişimi kapasite hesabını tetiklemez; kesir değişimi tetikler. Yüzde metadata'sı olmayan saat/gün girişleri için sahte yüzde kaydı üretilmez. Formüller, schema sınırları, hata metinleri ve kontrol sırası korunur. SQL, frontend, API schema, bağımlılık sürümü veya migration değiştirilmedi.

Yüzde girişi, komutun uygulandığı sıradaki efektif çalışma saatini FTE'ye çevirir. Son yüzde ise final çalışma saatine göre hesaplanır; bu nedenle aynı batch'teki saat değişimiyle yüzde girişinin yerini değiştirmek aynı FTE sonucunu garanti etmez. Bu mevcut davranış açıkça test edilir; sıra bağımsızlığı yalnız final kapasite kontrolü ve explicit revision kontrollerinin erken implicit artıştan etkilenmemesi için geçerlidir. Manuel saatten de hafta içi resmî tatil ve izin saatleri düşülür; eğitim çalışma süresini azaltmaz, dağıtılan toplamın kapasite kontrolüne eklenir.

## Güçlendirilen regresyon

`tests/record-access-http.test.mjs` yeni HTTP senaryosu ortak yarım gün tatil, izin, eğitim, manuel saat ve iki proje dağılımını tek batch'te uygular; ileri/ters komut sırasını iki ayrı sentetik fixture'da sınar.

- Son komutta eski revision: **409**, veri/revision/generation ve audit bütünüyle önceki durumdadır.
- Final kapasite aşımı: **400**, dört türde uygulanmış taslak ve audit/generation bütünüyle geri alınır.
- Aynı güncel revision'larla tekrar: **200**, bir generation artışı; saat ve kişisel kayıtlar kaydedilir.
- Explicit yüzde girişinin FTE'si komut sırasına göre korunur. Final efektif saat **100 − 4,5 tatil − 2 izin = 93,5**; yüzde yeniden hesaplaması explicit komutların revision kontrolünden sonra yapılır.
- Ortak tatil diğer çalışanın aynı aydaki saat/FTE'sini korurken yüzdesini ve actual revision'ını günceller; başka ayın yüzde/revision'ı değişmez.
- Store kapatılıp aynı geçici dosyayla yeniden açıldığında snapshot ve generation eşit kalır.

İlk hedef koşuda **54/57** geçti; yeni testin beklenen manuel saat hesabı yarım gün tatili düşmeyip 98 saat varsaydığından iki alt test ve parent başarısız oldu. Beklenti mevcut `shared/actual-units.ts` kuralına göre 93,5 saate düzeltildi; üretim davranışı değiştirilmedi. Sonraki hedef koşu **57/57** geçti. Başarısız ilk koşu başarı toplamına dahil edilmez.

## Doğrulama ortamı ve sonuçlar

Git archive'dan yeni geçici kopya oluşturuldu; gerçek `.env`, veritabanı, kullanıcı veya çalışan servis kullanılmadı. İlk hedef testler mevcut bağımlılıkları yalnız okumak için bağlantıyla kullandı. Yerel geliştirme bağımlılığı eksikliği tespit edilince bağlantılar sadece geçici klasörde kaldırıldı; kilit dosyalarıyla `npm ci --ignore-scripts --no-audit --no-fund` ve frontend eşdeğeri geçici kopyaya kuruldu. Kurulum script'leri çalıştırılmadı. Sınırlandırılmış ortam, ayrı boş npm config'leri ve geçici cache kullanıldı. npm user/global config'in aynı dosyayı göstermesi kaynaklı hazırlık hatası ayrı config dosyalarıyla giderildi. Uygulama bağımlılıkları değiştirilmedi.

DB testleri açıkça tanımlanmış geçici SQL.js dosyaları; HTTP/tarayıcı işlemleri sentetik hesaplarla loopback fixture kullanır. Yeni migration kodu veya gerçek ortama migration/restore çalıştırılması yoktur.

| Komut / kontrol | Sonuç |
|---|---|
| `node --test --test-reporter=tap tests/work-calendar.test.mjs tests/actual-limits.test.mjs tests/actual-units.test.mjs tests/record-access-http.test.mjs tests/concurrency.test.mjs tests/restore.test.mjs` | **57/57**, fail/skipped/cancelled 0; son koşu tamamen geçici kurulumda |
| Geçici runner: `checkActualAllocation`, `checkCalendarDrafts`, `checkCalendar` | **11 tarayıcı kontrolü**, macOS Chrome headless; sayfa hatası yok |
| `npm run check:domain` | **35 shared kaynak**, recursive AST sınır kontrolü geçti |
| `npm run format:check`, `npm run build` | Biçim/TypeScript/Vite başarılı; build yalnız geçici klasöre yazdı |
| `node scripts/check-deployment-package.mjs` | **391 kaynak / 7 güncel çıktı**, 402 tarihsel çıktı paketten hariç; hash/referans/gzip kontrolü geçti |
| Önceki ve yeni site artifact hash karşılaştırması | **409/409 aynı**; arayüz çıktıları değişmedi |

## Kalan işler ve sınırlar

- Sıradaki modül ayrımı proje/kaynak oluşturma–güncelleme–silme ve bunlara bağlı kayıt/revision temizleme zincirleridir. Silme zinciri ortak batch revision kontrolleri ve kullanıcı bağlantılarıyla birlikte korunmalıdır.
- Import/restore ve App'in kalan koordinasyon sorumlulukları devam eder. Aynı schema/formülün başka katmanlarda bulunması bu dar ayrımla tümüyle çözülmüş değildir.
- N3 tam snapshot/doğrulama/global lock, N2 backend Orta bağımlılık uyarısı, N6 canlı sürüm geçişi/eski varlık saklama ve kurum servis/CA/proxy/yedek/yük kabulü açık kalır.
- SQL.js ve sentetik test başarısı kurum verisiyle yük/Native MSSQL kabulü değildir. Bu kaynak için native koşu yapılmadı; önceki native sonucu yeni commit'in kanıtı değildir.
- Gerçek hesap/DB/ayar okunmadı; servis yeniden başlatılmadı. Disk manifesti çalışan backend sürecinin yeni kodu yüklediğini kanıtlamaz. Önceden farklı yerel milestone tarih testi korunur.

## CI kanıtı ve aktarım kontrolü

Test edilen kaynak **`5b1ba099db2a877487172bd8fb76e962c79abeed`**. [Kalite koşusu 37899268951](https://github.com/zaferond/AA-Kaynak-Planlama-Sistemi/actions/runs/37899268951) başarılı: **Ubuntu 567/567**, **Windows 217/217**, **Chromium 141 kontrol**. Fail/skipped/cancelled 0; Windows ile genel süit örtüşür ve toplamlar toplanmaz. Biçim/domain/TypeScript/build/manifest, iki işletim sisteminde temiz paket kabulü ve iki audit Yüksek eşiği geçti. Audit eşiği mevcut backend Orta uyarısını kapatmaz.

[Güvenli metadata, test toplamları ve indirilen log hash kaydı](ci-evidence/quality-5b1ba09-receipt.json). Ham loglar veya bağlantı bilgileri Git'e eklenmez. Kanıt/dokümantasyon commit'i üretim kodunu değiştirmez; ayrı tam CI koşusu iddiası değildir.

Uygulama klasörüne aktarım kontrolü önceki manifest ve dosya hash'lerini, yerel değişikliklerin korunmasını ve doğrulanmış geçici derlemeyle **391 kaynak / 409 site çıktısı / 7 güncel çıktı** eşitliğini denetler. Mevcut site çıktıları aynı olduğundan yeniden yazılmaz veya silinmez. Seçilen dosyalar geri alınabilir yedekle aktarılır, manifest en son yazılır. Yedek konumu: `.deployment-backups/2026-10-09-architecture-actual-calendar-final`. Bu işlem servis yeniden başlatması veya çalışan veritabanına işlem içermez.
