# Mimari iyileştirme — Risk işlemleri ve rapor kompozisyonu

## Başlangıç ve sonuç

Başlangıç commit'i **`8832e12af51b1520b641d2f7b492fa9840bed7e7`**, temiz Git çalışma ağacı. 7 Ekim incelemesindeki App/operation sorumluluklarını küçük modüllere ayırma önerisinin ilk bölümü uygulandı. Bu bir bakım ve test edilebilirlik çalışmasıdır; yeni güvenlik açığı tespit edildiği veya mimarinin tamamının bitirildiği iddia edilmez.

- `backend/operations.mjs`: **763 → 708 satır**. Risk kayıtları ve sistem/alt sistem kataloğunun taslak güncelleme davranışı `backend/risk-commands.mjs` içinde toplandı. Oluşturan kişi/tarih metadata'sı, kullanılan sistemin silinmesini engelleme, ad değişikliğinin bağlı risklere yansıması ve bağlı risk revision artışları aynı modülde yer alır.
- `frontend/src/App.tsx`: **1.013 → 952 satır**. Liderlik/takım tabloları ve kaynak grafiklerinin kompozisyonu `features/workspace/WorkspaceReports.tsx` bileşenine alındı. Rapor tablolarının ref'leri ve birlikte kaydırma etkisinin kurulması/temizlenmesi de rapor bileşeninde tutulur. İki tabloda ortak sunum parametreleri bir kez tanımlanır.

Satır sayısı güvenlik veya performans ölçümü değildir. Yeni modüllerle toplam kod sayısı artabilir; amaç sorumlulukların ve değişiklik sınırlarının belirginleşmesidir.

## Çağrı zinciri ve korunan sözleşmeler

`/api/changes → changeAndView → Store.mutate → stageChanges → stageParsedChanges → risk-commands → final validate/persist/audit`.

Risk handler'ları yalnız yetki ve güncel revision kontrolünden geçmiş komutun taslağını değiştirir. `operations.mjs` komut sırasını, yinelenen komut reddini, yetki/revision kontrollerini, ortak revision artışını ve son toplu doğrulamayı yönetmeye devam eder. Store aktif hesabı yeniden kontrol eder; kilit/transaction, audit, generation ve kalıcılık aynı yerde kalır. Yeni modül SQL, HTTP route, dosya/ortam veya veritabanı bağlantısı açmaz. `existingRisk` istemciden alınmaz; orchestrator'ın ilgili komut için okuduğu sunucu kaydıdır. API'nin schema/yetki sözleşmesi değiştirilmedi.

`App → useWorkspaceView/shared selectors → WorkspaceReports → existing tables/charts`.

Kapasite ve tahsis hesapları ortak selector/metric fonksiyonlarında kalır. Yeni bileşen hesapları tekrar uygulamaz. Seçilen takım kimlikleri ile yetki/filtre sonrası çözülen takım kimlikleri ayrı parametrelerdir; önceki filtre etiketi ve hesap kapsamı korunur. Rapor erişimi App'teki admin/manager kontrolü altında kalır. Excel/export akışı, üstteki sabit filtre alanı, tablo/grafik sırası, CSS/DOM sınıfları ve hesaplanan değerler korunur. Fragment kullanıldığı için yeni bir DOM sarmalayıcı eklenmedi.

Yeni bağımlılık yönleri `backend operations → backend risk commands → shared` ve `frontend App → frontend report composition → existing UI/shared` şeklindedir. Shared'den frontend/backend'e bağımlılık eklenmedi; yeni paket veya migration yoktur.

## Doğrulama yöntemi ve sonuçlar

Git'ten yeni geçici kaynak kopyası oluşturuldu. Gerçek `.env`, çalışan veritabanı, gerçek kullanıcı hesabı veya sunucu süreci kullanılmadı. Kilit hash'leri aynı olan önceki izole kurulumun bağımlılıkları yeniden kullanıldı; npm kurulumu yapılmadı. Test DB'leri açıkça geçici SQL.js dosyalarına bağlanır; HTTP/tarayıcı testleri loopback'te sentetik hesaplar kullanır. Derleme ve paket kabulü yalnız geçici kopyada yazma yaptı.

| Komut / kontrol | Sonuç |
|---|---|
| `node --test tests/risk-management.test.mjs tests/risk-systems.test.mjs tests/record-access-http.test.mjs tests/concurrency.test.mjs tests/mutation-snapshot.test.mjs` | **40/40**, fail/skipped/cancelled 0 |
| Geçici runner: `checkRiskSystems`, `checkRisks`, `checkRiskConcurrency`, `checkWorkspaceFilters`, `checkResourceReports` | **31 tarayıcı grubu**, sayfa hatası yok; macOS Chrome headless |
| `npm run check:domain` | **35 shared kaynak**, recursive AST bağımlılık sınırı geçti |
| `npm run build` | TypeScript/Vite başarılı; yalnız geçici kopyada |
| `node scripts/check-deployment-package.mjs` | **389 kaynak / 7 güncel çıktı**, 402 tarihsel çıktı yeni paketten hariç; hash/referans/gzip kontrolü geçti |
| `npm run format:check`, `git diff --check` | Başarılı |

Yeni kalıcı HTTP regresyonu `tests/risk-systems.test.mjs` içinde üç önemli davranışı sınar:

1. Önce sistem adı değişip ardından eski risk revision'ı kullanılırsa **409**: ilk değişiklik, audit, generation ve tüm veri geri alınır.
2. Normal kullanıcının kendi riskini değiştiren ilk komutundan sonra yetkisiz katalog komutu gelirse **403**: ilk değişiklik dahil hiçbir şey saklanmaz.
3. Güncel risk düzenlemesi ardından sistem adı değişikliği admin tarafından yapılırsa **200**: risk revision'ı iki, sistem revision'ı bir artar; generation yalnız bir artar. İstemcinin sahte oluşturucu/tarih metadata'sı mevcut sunucu değerlerini değiştiremez; yeniden açılışta sonuç korunur.

Mevcut tarayıcı kontrolleri risk sahipliği, kataloğu yönetme yetkisi, eski taslak, kaydetme hataları ve gezinme engeli yanında rapor tablolara birlikte kaydırmayı ilk açılış/sekme değişimi/dönem değişimi/yeniden yükleme sonrasında kontrol eder. Filtreye göre kaynak hesapları, grafik sırası, seri seçimi, Excel draft kaydı ve sabit filtre alanı da sınanmıştır.

## Kalan çalışmalar ve kanıt sınırları

- `operations.mjs` içindeki liderlik/takım güncellemesi ve bağlı kayıt değişiklikleri sonraki uygun modül ayrımıdır. Yetki, katalog revision'ı, transaction ve audit sırası korunarak mevcut HTTP davranış testleri kullanılmalıdır.
- Gerçekleşen dağılım/takvim komutları ve proje/kaynak silme zincirleri hâlâ merkezî komut döngüsündedir. Bunlar toplu işlem sırası ve final-monthly-limit davranışına bağlı olduğundan ayrı adımlarla incelenmelidir.
- App'teki kalan sekme/gezinme/bağlam menüsü koordinasyonu sürdürülebilir küçük parçalara ayrılabilir. Salt dosya kısaltmak amacıyla yeni soyutlamalar eklenmemelidir.
- N3 tam snapshot/global lock maliyeti, N2 backend Orta bağımlılık uyarısı ve N6 canlı sürüm geçişi/eski varlık saklama işleri bu çalışmayla kapanmaz.
- Native MSSQL bu kaynak değişikliği için yerelde test edilmedi. Kurum Windows servis/ACL, CA/proxy/TLS, gerçek yedek/restore ve hedef yük kabulü doğrulanmadı. Çalışan süreç yeniden başlatılmadı; disk manifesti doğrulaması açık sürecin yeni backend'i yüklediğinin kanıtı değildir.

## Aynı kaynak commit'i için CI ve aktarım

Test edilen kod commit'i **`3437a456b1ce830af953b1832a981f2ca67b3935`**. [37823750933 kalite koşusu](https://github.com/zaferond/AA-Kaynak-Planlama-Sistemi/actions/runs/37823750933) başarılıdır: **Ubuntu 563/563, Windows 213/213, Chromium 141 grup**; fail/skipped/cancelled 0. Biçim/domain/TypeScript/build/manifest, iki işletim sisteminde temiz paket kabulü ve iki audit Yüksek eşiği de başarılıdır. [Metadata/test toplamları/log hash kaydı](ci-evidence/quality-3437a45-receipt.json). Windows testleri genel süitle örtüşür; toplamlar bağımsız kapsam olarak toplanmamalıdır.

Bu kaynak için native MSSQL CI yeniden çalıştırılmadı. Önceki native koşu bu commit'e ait kanıt sayılmaz. İş kurallarının taşınması SQL query/persistence kodunu değiştirmedi; SQL.js ve Windows sentetik başarı kurum DB/servis kabulü yerine geçmez. Audit Yüksek eşiğinin geçmesi backend Orta bağımlılık uyarısını kapatmaz.

Sonraki kanıt/dokümantasyon commit'i üretim kodunu değiştirmez; test edilen kaynak yukarıdaki commit'tir. Çalışma klasörüne aktarım geri dönüş için yedeklenir, güncellenen dosyalar önceki commit ile karşılaştırılır, var olan tarihsel bundle'lar korunur, manifest en son yazılır. **389 kaynak / 409 site çıktısı / 7 güncel çıktı** tam envanter/hash doğrulamasıyla kontrol edilir. Önceden farklı olan yerel `tests/milestone-note-dates.test.mjs` üzerine yazılmaz. Gerçek ayar/veritabanı okunmaz; servis yeniden başlatılmaz.
