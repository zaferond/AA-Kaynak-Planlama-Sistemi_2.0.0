# Mimari iyileştirme — Liderlik ve takım işlemleri

## Başlangıç ve sonuç

Başlangıç **`25de3b1d912c7c3eda96a7917b2804f1bd9ffe6b`**, temiz Git çalışma ağacı. Önceki risk/rapor modül ayrımının ardından liderlik/takım işlemleri ve bağlı kayıt güncellemeleri `backend/directory-commands.mjs` içinde toplandı. `operations.mjs` **708 → 533 satır** oldu. Bu bir bakım ve sorumluluk ayrımı çalışmasıdır; satır sayısı güvenlik veya performans kanıtı değildir.

- `stageTeamChange`: takım oluşturma, ad/liderlik güncelleme, kullanılan/son takım silme koruması ve geçmiş çalışan sürümlerinin liderliğini güncelleme.
- `applyLeaderChange`: liderlik oluşturma/güncelleme/silme, katalog revision'ı ve eski istemci generation koruması, bağlı takım/çalışan kayıtları ve kullanıcı–liderlik bağlantılarının taşınması.
- Ortak, modüle özel `updateResourceLeaders`: eşleşen tüm geçmiş sürümleri günceller; bir komutta her çalışanın revision'ını yalnız bir kez artırır. Önceden iki yerde aynı döngü bulunuyordu. Eşleşme koşulu takım taşımasında takım kimliği, liderlik adı değişiminde eski liderlik adıdır.

## Korunan çağrı zinciri ve sözleşmeler

Takım: `/api/changes → changeAndView → Store.mutate → stageChanges → yetki/revision kontrolü → stageTeamChange → ortak revision artışı → final validate/persist/audit`.

Liderlik: `/api/leaders/change → admin kontrolü → Store.mutate → applyLeaderChange → aynı transaction bağlantısında kullanıcı bağlantılarını taşıma → final validate/persist/audit`.

Mevcut `operations.mjs` girişinden `applyLeaderChange` yeniden export edilir; route, araç ve test import'ları korunur. Yeni modül kendi DB bağlantısını veya transaction'ını açmaz; Store'un verdiği bağlantıyı kullanır. SQL metni, parametreler ve upsert/remove sırası değişmedi. Liderlik handler'ının standalone doğrulaması, Store'un aktif hesap kontrolü, kilit/transaction kapsamı, katalog revision artışı ve `auditUsers: true` akışı korunur.

Takım komutlarında yinelenen komut, admin yetkisi ve revision kontrolü merkezî döngüde, handler çağrısından önce kalır. Takım schema/kimlik/benzersizlik kontrolleri, yeni takımın katalog işareti ve silme hatalarının sırası korunur. Proje/kaynak silme, gerçekleşen/takvim, import/restore ve planlama callback sahipliği bu aşamada değiştirilmedi. Yeni dependency, API alanı, migration veya frontend değişikliği yoktur. Shared'e uygulama bağımlılığı eklenmedi.

## Geçici ortamda doğrulama

Git kaynaklarından yeni geçici kopya oluşturuldu. Gerçek `.env`, DB, hesap veya çalışan süreç kullanılmadı. Kilit hash'leri aynı olan önceki izole kurulumun bağımlılıkları kullanıldı; npm kurulumu yapılmadı. Tüm DB işlemleri testin açıkça tanımladığı geçici SQL.js dosyalarına, HTTP/tarayıcı işlemleri sentetik hesaplarla loopback fixture'a uygulandı.

| Komut / kontrol | Sonuç |
|---|---|
| `node --test tests/record-access-http.test.mjs tests/concurrency.test.mjs tests/restore.test.mjs tests/transaction-profile.test.mjs` | **43/43**, fail/skipped/cancelled 0 |
| Geçici runner: `checkDirectoryManagement` | **5 tarayıcı grubu**, macOS Chrome headless; sayfa hatası yok |
| `npm run check:domain` | **35 shared kaynak**, recursive AST sınır kontrolü geçti |
| `npm run build` | TypeScript/Vite başarılı; yalnız geçici kopyada yazma |
| `node scripts/check-deployment-package.mjs` | **390 kaynak / 7 güncel çıktı**, 402 tarihsel dosya paketten hariç; hash/referans/gzip kontrolü geçti |
| `npm run format:check`, `git diff --check` | Başarılı |
| Önceki ve yeni derleme artifact hash karşılaştırması | **409/409 site çıktısı aynı**; arayüz çıktısı değişmedi |

### Güçlendirilen regresyonlar

`tests/record-access-http.test.mjs` içindeki takım taşıma testi artık aynı çalışanın iki geçmiş sürümünü kontrol eder. İki sürüm de yeni liderliğe geçer; çalışan revision'ı bir kez artar, tahsisler korunur. Ardından aynı batch'te takım taşıması ve eski çalışan revision'ıyla düzenleme denenir: **409**, tüm veri/audit/generation geri alınır.

Yeni liderlik rollback testi, yeni kullanıcı–liderlik bağlantısı SQL'e yazıldıktan ve çalışma taslağı güncellendikten sonra eski bağlantı silme adımında sentetik hata üretir. Store'un verdiği bağlantı yalnız bu test callback'inde Proxy ile sarılır; çalışan bağlantıya veya global adapter'a müdahale edilmez. Hata sonrası yeni liderlik satırı, bağlantılar, çalışan/takım verileri, kullanıcı yetkileri, audit ve generation önceki durumla aynıdır. Aynı katalog revision'ıyla gerçek HTTP tekrar denemesi **200** olur; iki geçmiş çalışan sürümü güncellenir, çalışan/takım revision'ları birer, katalog revision'ı ve generation birer artar. Yeniden açılışta veri ve kullanıcı bağlantıları korunur.

İlk koşuda yeni testin başlangıçta revision satırı olmayan seed takım için `undefined + 1` beklentisi `NaN` üretti: **42/43**. Test, mevcut revision sözleşmesindeki varsayılan 0'ı kullanacak şekilde düzeltildi; uygulama davranışı değiştirilmedi. Sonraki aynı komut **43/43** geçti. Başarısız ilk koşu son başarıya dahil edilmez.

Mevcut testler admin/manager/normal rolleri, CSRF, aynı isim/invalid input, kullanılan/son kayıt koruması, stale katalog ve eski generation fallback'i, eşzamanlı değişiklik, delete/recreate ABA, JSON restore, özel isimler (`__proto__`, `constructor`), bağlı kullanıcı kapsamı ve yeniden açılışı da kapsar. Tarayıcı kontrolleri yönetim listeleri, kaynak seçimlerinin güncellenmesi, combobox yerleşimi/scroll, katalog taslağı çatışmaları ve referanslı kayıt silme korumasını sınar.

## Kalan işler ve sınırlar

- Sıradaki modül ayrımı gerçekleşen dağılım/çalışılan saat/ortak ve kişisel takvim komutlarıdır. Final batch aylık sınır kontrolü ve yüzde yeniden hesaplaması komut sırasına bağlıdır; bunlar korunarak ayrı bir adımda ele alınmalıdır.
- Proje/kaynak silme zincirleri, import/restore ve App'in kalan koordinasyon sorumlulukları devam eder.
- N3 snapshot/global lock, N2 backend Orta bağımlılık uyarısı, N6 canlı sürüm geçişi/eski varlık saklama ve kurum servis/CA/proxy/yedek/yük kabulü bu değişiklikle kapanmaz.
- Yerel sonuçlar SQL.js ve sentetik ortam içindir. Native MSSQL için bu kaynak commit'inde yeni koşu yapılmadı; önceki native koşu yeni commit'in kanıtı değildir. Parametreli SQL/sıra değişmemiş olması kurum DB/servis kabulü yerine geçmez.
- Gerçek hesap/DB/ayar okunmadı; servis yeniden başlatılmadı. Disk manifesti açık sürecin yeni backend'i yüklediğini kanıtlamaz. Önceden farklı yerel `tests/milestone-note-dates.test.mjs` aktarım kontrolünde korunur.

## CI kanıtı ve aktarım kontrolü

Test edilen kaynak **`b15865410c470ac67a70a97f7c5005d6490fe5e8`**. [Kalite koşusu 37826265331](https://github.com/zaferond/AA-Kaynak-Planlama-Sistemi/actions/runs/37826265331) başarılı: **Ubuntu 564/564**, **Windows 214/214**, **Chromium 141 kontrol**. Fail/skipped/cancelled 0; Windows ile genel süit örtüşür ve toplamlar toplanmaz. Biçim/domain/TypeScript/build/manifest, iki işletim sisteminde temiz paket kabulü ve iki audit Yüksek eşiği geçti. Audit eşiği mevcut backend Orta uyarısını kapatmaz.

[Güvenli metadata, test toplamları ve indirilen log hash kaydı](ci-evidence/quality-b158654-receipt.json). Ham loglar veya bağlantı bilgileri Git'e eklenmez. Kanıt/dokümantasyon commit'i üretim kodunu değiştirmez; ayrı tam CI koşusu iddiası değildir.

Uygulama klasörüne aktarım kontrolü önceki manifest ve dosya hash'lerini, yerel değişikliklerin korunmasını ve doğrulanmış geçici derlemeyle **390 kaynak / 409 site çıktısı / 7 güncel çıktı** eşitliğini denetler. Mevcut site çıktıları aynı olduğundan yeniden yazılmaz veya silinmez. Seçilen dosyalar geri alınabilir yedekle aktarılır, manifest en son yazılır. Yedek konumu: `.deployment-backups/2026-10-08-architecture-directory-final`. Bu işlem servis yeniden başlatması veya çalışan veritabanına işlem içermez.
