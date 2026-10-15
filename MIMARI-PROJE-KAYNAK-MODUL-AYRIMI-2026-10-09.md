# Mimari iyileştirme — Proje ve kaynak işlemleri

## Başlangıç ve değişiklik

Başlangıç **`e6fec208e055a3db498c8ac344b5269f99dc6c5b`**, temiz Git çalışma ağacı. Önceki gerçekleşen/takvim ayrımının ardından proje ve kaynak oluşturma/güncelleme/silme komutları `backend/project-resource-commands.mjs` içinde toplandı. `backend/operations.mjs` **381 → 312 satır** oldu. Satır sayısı yalnız sorumluluk ayrımını gösterir; güvenlik veya performans ölçümü değildir.

Yeni `stageProjectResourceChange` mevcut komut gövdesini ve işlem sırasını korur:

- Proje/kaynak kimlik eşleşmesi, olmayan kaydı silme hatası ve taslak koleksiyonunun güncellenmesi.
- Proje sırası gönderilmemişse eski `sortOrder` değerinin korunması; sıralanmış listede yeni projenin sona eklenmesi.
- Proje silme: bağlı riskler, planlanan/gerçekleşen dağılımlar, yüzde metadata'sı ve eski takım arşivindeki ilgili proje tahsisleri temizlenir. Risk/dağılım revision'ları artırılır.
- Kaynak silme: gerçekleşen dağılımlar/yüzdeler, manuel saatler ve kişisel takvim kayıtları temizlenir; ilgili revision'lar artırılır.

Bu aşama silme davranışını yeniden tasarlamaz. Proje silinince başka projelerdeki kayıtlar veya çalışanın izin/saat kayıtları silinmez. Kaynak silinince takım bazlı planlanan tahsisler ve projeler silinmez. Kaynak silme ile kaynak statüsünü değiştirme ayrı işlemlerdir; statü güncellemesine silme zinciri eklenmedi.

## Korunan sorumluluk ve çağrı sınırları

`/api/changes → changeAndView → Store.mutate → stageChanges → schema/yetki/duplicate/revision kontrolü → stageProjectResourceChange → ortak revision artışı → final aylık sınır/yüzde hesabı ve proje sıralaması → Store.validate → persistPlanningSnapshot → audit/generation/commit`.

Yeni handler HTTP endpoint değildir; parser tarafından kabul edilen proje/kaynak komutunu, ortak kontrollerden sonra Store'un işlem taslağına uygulamak önkoşuldur. DB bağlantısı veya transaction açmaz. Ortak yetki ve revision kontrolü, final tam snapshot doğrulaması, `previousResources` ile tarihsel kaynak politikası, proje sıralama fonksiyonu ve planlanan komutun dar taslak sahipliği değişmedi.

SQL writer kaynak/proje alt kayıtlarını önce temizler; parent silme veritabanının FK ilişkilerini de çalıştırır. `kp_users.resource_id` için mevcut **ON DELETE SET NULL** ilişkisi kaynak silinince çalışan eşleştirmesini kaldırır; hesabı silmez. Kaynak kimliğinin yeniden oluşturulması hesabı kendiliğinden eşleştirmez. Proje fazları/kritik başlıkları ve kaynak geçmiş sürümleri mevcut FK cascade ile temizlenir. Bu ilişkiler, SQL metinleri/parametreleri/yazma sırası, migration veya kullanıcı oturum politikası değiştirilmedi.

Silme sırasında artırılan bağlı revision'lar final kayıtta kalır. Aynı batch'te önce parent silinip sonra eski revision'la child düzenlenirse **409** ve tüm işlem geri alınır. Parent yeniden oluşturulduktan sonra eski child taslağı yine geçerli hale gelmez. Aynı batch için revision kontrolleri hâlâ komut sırasındaki taslak üzerinde yürür; bu değişiklik bütün silme/düzenleme sıralarına eşdeğer anlam garanti etmez.

## Güçlendirilen regresyon

`tests/record-access-http.test.mjs` yeni HTTP/Store senaryosu proje ve kaynak silmeyi iki ayrı sentetik fixture'da sınar. İki proje, iki çalışan ve her çalışanın iki geçmiş sürümü; proje fazı/kritik başlığı, riskler, dağılımlar/yüzdeler, manuel saatler, izin, tarihsel tahsis arşivi ve bir sentetik kullanıcı bağlantısı oluşturulur.

- Parent silme ardından eski child revision: **409**, veri/revision/generation/audit ve kullanıcı eşleştirmesi korunur.
- Bu test Store örneğinin persistence metodunu yalnız test süresince sarar; gerçek DB veya global adapter değiştirilmez. Store'un verdiği transaction bağlantısı yerel Proxy ile kullanılır. Parent SQL silmesinin gerçekten uygulanması beklenir: proje kritik başlığının satır sayısı 0 veya kullanıcı `resource_id` değeri NULL görülür; ardından sentetik hata üretilir. Metot `finally` içinde eski prototype davranışına döner.
- Hata sonrası state, audit, generation ve kullanıcı bağlantısı başlangıçla aynıdır. Aynı revision'la HTTP tekrar denemesi **200**, bir generation artışı olur.
- Yalnız ilgili kaynak/projenin bağlı kayıtları silinir. Diğer proje/çalışan kayıtları ve revision'ları korunur; proje silinince eski tahsis arşivindeki ilgili proje de temizlenir.
- Parent yeniden oluşturulur; eski risk, planlanan/gerçekleşen dağılım, manuel saat ve kişisel gün taslakları **409** ile reddedilir. Kaynak yeniden oluşturulsa da eski kullanıcının çalışan bağlantısı boş kalır; bu kullanıcı o çalışanın actual kaydını yazamaz (**403**).
- Store kapatılıp aynı geçici dosyayla yeniden açıldığında snapshot/generation eşit kalır.

Mevcut hedef testler özel/prototype benzeri kimlikler, yetkiler, no-op silmeler, tombstone/recreate, katalog cascade, aylık hesaplama sırası, import/restore korumaları, snapshot sahipliği ve proje sıralamasını da sınar. Bu kanıtlar yerel sentetik kapsam içindir; her kullanıcı işlemi veya tüm kurum koşullarının kabulü değildir.

## Doğrulama ortamı ve sonuçlar

Git archive'dan yeni geçici kopya oluşturuldu. Gerçek `.env`, DB, kullanıcı veya çalışan servis kullanılmadı. Kilit dosyaları byte olarak aynı olan önceki geçici kurulumun bağımlılıkları yalnız bağlantıyla kullanıldı; yeni kurulum yapılmadı. Sınırlandırılmış ortam, ayrı boş npm config'leri ve geçici cache kullanıldı. Test DB'leri açıkça tanımlanmış geçici SQL.js dosyalarıdır; HTTP/tarayıcı sentetik hesaplarla loopback fixture kullanır. Testte schema hazırlığı sadece bu geçici dosyalarda çalışır.

| Komut / kontrol | Sonuç |
|---|---|
| `node --test --test-reporter=tap tests/record-access-http.test.mjs tests/project-order.test.mjs tests/concurrency.test.mjs tests/restore.test.mjs tests/mutation-snapshot.test.mjs` | **45/45**, fail/skipped/cancelled 0 |
| Geçici runner: `checkEntityEditors`, `checkProjectTables` | **9 tarayıcı kontrolü**, macOS Chrome headless; sayfa hatası yok |
| `npm run check:domain`, `npm run format:check`, `npm run build` | **35 shared kaynak**, recursive AST; biçim/TypeScript/Vite başarılı; build yalnız geçici klasöre yazdı |
| `node scripts/check-deployment-package.mjs` / artifact hash karşılaştırması | **392 kaynak / 7 güncel çıktı**, 402 tarihsel çıktı paketten hariç; referans/gzip/hash kabulü geçti. **409/409 site artifact aynı** |

## Kalan işler ve sınırlar

- Sıradaki modül ayrımı toplu dağılım sıfırlama, Excel satır import'u ve JSON restore komutlarıdır. Admin kontrolü, backup normalizasyonu, revision yeniden üretimi ve eski generation/katalog taslaklarını geçersiz kılma korunmalıdır.
- App'in kalan koordinasyon sorumlulukları devam eder. Bu dar ayrım, bütün schema tekrarlarını veya projedeki tüm mimari borcu kapatmaz.
- N3 tam snapshot/doğrulama/global lock, N2 backend Orta bağımlılık uyarısı, N6 canlı sürüm geçişi/eski varlık saklama ve kurum servis/CA/proxy/yedek/yük kabulü açık kalır.
- Native MSSQL için bu kaynakta yeni koşu yapılmadı. SQL.js FK/rollback kanıtı Native MSSQL, kurum yedekleri veya gerçek yük kabulü yerine geçmez; önceki native sonucu yeni commit'in kanıtı değildir.
- Gerçek hesap/DB/ayar okunmadı; servis yeniden başlatılmadı. Disk manifesti çalışan backend'in yeni kodu yüklediğini kanıtlamaz. Önceden farklı yerel milestone tarih testi korunur.

## CI kanıtı ve aktarım kontrolü

Test edilen kaynak **`736ba2cddf7871b5d59a6aa3a88e827a0d53afec`**. [Kalite koşusu 37902728862](https://github.com/zaferond/AA-Kaynak-Planlama-Sistemi/actions/runs/37902728862) başarılı: **Ubuntu 570/570**, **Windows 220/220**, **Chromium 141 kontrol**. Fail/skipped/cancelled 0; Windows ile genel süit örtüşür ve toplamlar toplanmaz. Biçim/domain/TypeScript/build/manifest, iki işletim sisteminde temiz paket kabulü ve iki audit Yüksek eşiği geçti. Audit eşiği mevcut backend Orta uyarısını kapatmaz.

[Güvenli metadata, test toplamları ve indirilen log hash kaydı](ci-evidence/quality-736ba2c-receipt.json). Ham loglar veya bağlantı bilgileri Git'e eklenmez. Kanıt/dokümantasyon commit'i üretim kodunu değiştirmez; ayrı tam CI koşusu iddiası değildir.

Uygulama klasörüne aktarım kontrolü önceki manifest ve dosya hash'lerini, yerel değişikliklerin korunmasını ve doğrulanmış geçici derlemeyle **392 kaynak / 409 site çıktısı / 7 güncel çıktı** eşitliğini denetler. Mevcut site çıktıları aynı olduğundan yeniden yazılmaz veya silinmez. Seçilen dosyalar geri alınabilir yedekle aktarılır, manifest en son yazılır. Yedek konumu: `.deployment-backups/2026-10-09-architecture-project-resource-final`. Bu işlem servis yeniden başlatması veya çalışan veritabanına işlem içermez.
