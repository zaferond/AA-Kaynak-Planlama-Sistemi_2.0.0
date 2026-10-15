# Mimari iyileştirme — Toplu sıfırlama, import ve restore

## Başlangıç ve değişiklik

Başlangıç **`68cf94181b7bcae8879a2996c246f8d4527f4e37`**, temiz Git çalışma ağacı. Toplu planlanan dağılım sıfırlama, Excel kaynak satır aktarımı ve uygulama JSON yedeği geri yükleme komutları `backend/bulk-data-commands.mjs` içinde toplandı. `backend/operations.mjs` **312 → 181 satır** oldu; ağırlıkla ortak batch/yetki/revision koordinasyonu kaldı. Satır sayısı yalnız sorumluluk ayrımını gösterir; güvenlik veya performans ölçümü değildir.

Mevcut `operations.mjs` girişinden `reset`, `importRows`, `restore` yeniden export edilir. Route ve mevcut araç/test import'ları, çağrı parametreleri, dönüş değerleri ve hata metinleri korunur. SQL, schema, migration, frontend, bağımlılık sürümü veya HTTP sözleşmesi değiştirilmedi. Yeni dosya yalnız mevcut üç komut gövdesi, schema'ları ve gerekli import'ları taşır.

## Korunan çağrı zincirleri

- Sıfırlama: `/api/allocations/reset → route admin → Store.mutate → reset admin/schema → güncel ve beklenen tüm allocation revision'larını karşılaştırma → yalnız planlanan tahsisleri silme ve mevcut hücre revision'larını artırma → Store.validate/persist/audit/generation/commit`.
- Excel aktarım: `/api/resources/import → route admin → Store.mutate → importRows admin/1–5000 satır schema → shared.prepareImport → herhangi bir hatalı satır varsa yazma öncesi ret → yalnız yeni kaynakları ekleme, gerekirse liderliği boş takımın eşleştirilmesi → final doğrulama/transaction → aynı commit'in view ve imported/skipped sayıları`.
- JSON geri yükleme: `/api/restore → route admin → Store.mutate → transaction içindeki güncel generation ile açılış generation'ını karşılaştırma → restore admin → eski kişi tahsislerini takım tahsisine dönüştürme → migrate/validate(previousResources)/aylık kapasite → güncel revision'lardan yeni counter'lar → isteğe bağlı arşivi değiştirme/temizleme → final validate/persist/audit/generation/commit`.

Restore generation kontrolü route callback'inde, Store'un aynı transaction'ı içinde kalır. `restore` doğrudan çağrıldığında açılış generation'ını kendisi karşılaştırmaz; bu mevcut sözleşmedir. Üç komutun kendi admin kontrolü standalone çağrıları da korur. Store aktif hesabı/version'ı denetler, bağlantı/transaction, son doğrulama, SQL writer, audit ve generation'ı yönetir. Bu modül ayrı bağlantı açmaz.

JSON yedekteki revision counter'ları güvenilir kabul edilmez. Silinmiş kayıt counter'ları da güncel durumdan yeniden artırılır; çalışılan saat/kişisel gün ve ortak/katalog counter'ları korunur. Aynı içerik geri yüklense de katalog taslakları geçersiz kılınır. Yedekte bulunmayan isteğe bağlı `legacyArchive` mevcut arşivi temizler. Kullanıcı rol/parola/yetki kayıtları JSON data ile değiştirilmez; kaynak silinirse mevcut FK çalışan bağlantısını kaldırabilir. Gerçek DB dosyası/native kurum yedeği restore araçları bu JSON işlemiyle aynı değildir ve değiştirilmedi.

Import, UI önizlemesine güvenerek yazmaz: shared doğrulaması güncel transaction taslağında tekrar çalışır. Tekrarlanan kaynaklar atlanır; takımın ilk liderlik eşleşmesi kaynaklarla aynı commit'e dahildir. Yalnız tekrarlardan oluşan başarılı import da mevcut Store davranışı gereği generation artırır; bu değişiklik generation'ı iş etkisi olmayan komutlar için yeniden tasarlamaz.

## Güçlendirilen regresyon

`tests/restore.test.mjs` yeni test grubu sıfırlama, import ve restore'u üç ayrı sentetik fixture'da sınar. Rol/yetki, geç persistence hatası ve tekrar deneme ortak kontroldür:

- Normal/manager hesaplar: **403**, veri/audit/generation/hesap kayıtları korunur.
- Sıfırlamada eski/eksik revision: **409**; import'ta geçersiz ikinci satır: **400** ve geçerli ilk satır da yazılmaz; restore'ta yinelenen proje: ret. Tüm durumlarda tam snapshot, hesap kayıtları ve audit önceki durumdadır.
- Sadece test Store örneğinin transaction metodu geçici sarılır; adapter veya çalışan servis değiştirilmez. Mevcut transaction'ın bağlantısı yerel Proxy ile kullanılır. Son `UPDATE kp_settings SET ...` gerçekten çalışır ve transaction içinde generation'ın bir arttığı görülür; ardından sentetik hata üretilir. Bu noktada entity/metadata/revision ve audit SQL yazıları da tamamlanmıştır. Metot `finally` içinde eski prototype davranışına döner.
- Hata sonrası snapshot, kullanıcı bağlantıları/rol/parola kayıtları, generation ve audit geri alınır. Aynı geçerli girdilerle tekrar başarılı olur.
- Sıfırlama yalnız planlanan dağılımı temizler; actual/izin/kaynak kayıtlarını korur, eski revision'la tekrar reddedilir.
- Import **1 imported / 0 skipped** döndürür; liderliği boş takım eşleştirilir, takım/kaynak revision'ları doğrulanır. Tekrar **0 imported / 1 skipped**, aynı kaynak tekrar oluşturulmaz.
- Restore yedekteki 99999 counter'larını kullanmaz; güncel counter'ları bir artırır, isteğe bağlı arşivi kaldırır ve eski actual taslağını **409** ile reddeder. Kaldırılan kaynağın kullanıcı eşleştirmesi boşalır; hesap rol/parola/yetkisi korunur.
- Her fixture kapatılıp yeniden açıldığında snapshot/generation ve hesap kayıtları eşit kalır.

Mevcut hedef testler route generation çatışması, silinmiş kayıtların revision'ları, JSON hesap yetkilerinin korunması, liderlik yetkisi referansları, kaynak tarihlerinin import/restore politikası, özel kimlikler, eşzamanlı batch ve aylık sınırları da kapsar. Bunlar tüm kurum/gerçek veri senaryolarının kabulü değildir.

## Doğrulama ortamı ve sonuçlar

Git archive'dan yeni geçici kopya oluşturuldu; gerçek `.env`, DB, kullanıcı veya çalışan servis kullanılmadı. Kilit dosyaları byte olarak aynı olan önceki geçici kurulumun bağımlılıkları yalnız bağlantıyla kullanıldı; yeni kurulum yapılmadı. Sınırlandırılmış ortam, ayrı boş npm config'leri ve geçici cache kullanıldı. DB işlemleri açıkça tanımlanmış geçici SQL.js dosyalarına; HTTP/tarayıcı işlemleri sentetik hesaplarla loopback fixture'a uygulanır. Schema hazırlığı sadece bu dosyalarda çalışır. Gerçek ortamda migration/restore veya test verisi yazılması yoktur.

| Komut / kontrol | Sonuç |
|---|---|
| `node --test --test-reporter=tap tests/restore.test.mjs tests/domain.test.mjs tests/resource-dates.test.mjs tests/concurrency.test.mjs tests/record-access-http.test.mjs` | **61/61**, fail/skipped/cancelled 0 |
| Geçici runner: `checkWorkspaceActions`, `checkImportRestore` | **10 tarayıcı kontrolü**, macOS Chrome headless; sayfa hatası yok |
| `npm run check:domain`, `npm run format:check`, `npm run build` | **35 shared kaynak**, recursive AST; biçim/TypeScript/Vite başarılı; build yalnız geçici klasöre yazdı |
| `node scripts/check-deployment-package.mjs` / artifact hash karşılaştırması | **393 kaynak / 7 güncel çıktı**, 402 tarihsel çıktı paketten hariç; referans/gzip/hash kabulü geçti. **409/409 site artifact aynı** |

## Kalan işler ve sınırlar

- Backend komut gövdelerinin risk, katalog, actual/takvim, proje/kaynak ve toplu veri sorumlulukları artık ayrı modüllerdedir. Bu sınırların kurulması tüm iş kuralları/schema tekrarlarını veya mimari borcu kapatmaz; ortak batch koordinasyonu ayrı kalır.
- Sıradaki inceleme App'in kalan frontend koordinasyon sorumluluklarıdır. Oturum, veri yenileme, taslak ve sekme ilişkileri gözden geçirilerek davranışı koruyan dar ayrım seçilmelidir.
- N3 tam snapshot/doğrulama/global lock, N2 backend Orta bağımlılık uyarısı, N6 canlı sürüm geçişi/eski varlık saklama ve kurum servis/CA/proxy/yedek/yük kabulü açık kalır.
- Bu kaynak için yeni Native MSSQL koşusu yapılmadı. SQL.js late fault/rollback kanıtı native kurum yedeği veya gerçek yük kabulü değildir; önceki native sonucu yeni commit'in kanıtı değildir.
- Gerçek hesap/DB/ayar okunmadı; servis yeniden başlatılmadı. Disk manifesti çalışan backend'in yeni kodu yüklediğini kanıtlamaz. Önceden farklı yerel milestone tarih testi korunur.

## CI kanıtı ve aktarım kontrolü

Test edilen kaynak **`056590ed43a214cfad5c50e44ae4354cf85b748c`**. [Kalite koşusu 37907125530](https://github.com/zaferond/AA-Kaynak-Planlama-Sistemi/actions/runs/37907125530) başarılı: **Ubuntu 574/574**, **Windows 224/224**, **Chromium 141 kontrol**. Fail/skipped/cancelled 0; Windows ile genel süit örtüşür ve toplamlar toplanmaz. Biçim/domain/TypeScript/build/manifest, iki işletim sisteminde temiz paket kabulü ve iki audit Yüksek eşiği geçti. Audit eşiği mevcut backend Orta uyarısını kapatmaz.

[Güvenli metadata, test toplamları ve indirilen log hash kaydı](ci-evidence/quality-056590e-receipt.json). Ham loglar veya bağlantı bilgileri Git'e eklenmez. Kanıt/dokümantasyon commit'i üretim kodunu değiştirmez; ayrı tam CI koşusu iddiası değildir.

Uygulama klasörüne aktarım kontrolü önceki manifest ve dosya hash'lerini, yerel değişikliklerin korunmasını ve doğrulanmış geçici derlemeyle **393 kaynak / 409 site çıktısı / 7 güncel çıktı** eşitliğini denetler. Mevcut site çıktıları aynı olduğundan yeniden yazılmaz veya silinmez. Seçilen dosyalar geri alınabilir yedekle aktarılır, manifest en son yazılır. Yedek konumu: `.deployment-backups/2026-10-09-architecture-bulk-data-final`. Bu işlem servis yeniden başlatması veya çalışan veritabanına işlem içermez.
