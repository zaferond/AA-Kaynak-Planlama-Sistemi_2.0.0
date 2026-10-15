# N3 — Tam snapshot doğrulamasının modüllere ayrılması — 11 Ekim 2026

## Sonuç

[Ortak ay takvimi adımından](N3-ORTAK-AY-TAKVIMI-2026-10-11.md) sonra tam doğrulamanın sorumlulukları ayrıldı. Başlangıç **`bc76c9f45f8101f8e3daaf8a6ceab8cf7569f173`**, uygulama/test commit'i **`e501ebe301fbb5ac133424638346855e56d8e5a4`**.

**N3 kısmen giderildi.** Bu adım bakım ve test edilebilirlik içindir. Tam snapshot okuması, bütün kayıtların doğrulanması ve global transaction lock devam eder. Performans kazancı, üretim kapasitesi veya tüm girdiler için biçimsel eşdeğerlik iddia edilmez.

## Değişiklik

`shared/server-domain.ts` mevcut dışa aktarımları koruyan giriş katmanı olarak kaldı. Üretimdeki kurallar aşağıdaki modüllere ayrıldı; mevcut shared politika/helper modülleri kullanılmaya devam eder.

| Modül | Sorumluluk |
|---|---|
| `shared/snapshot-schema.ts` | Şekiller, alan sırası, strict/strip, varsayılanlar ve Zod dönüşümleri |
| `shared/snapshot-calendar-validation.ts` | Ortak ve kişisel takvim kayıt kontrolleri |
| `shared/snapshot-reference-validation.ts` | Katalog/risk ilişkileri ve son kimlik/liderlik kontrolleri |
| `shared/snapshot-timeline-validation.ts` | Kaynak normalizasyonu ve proje/bar/not tarih kontrolleri |
| `shared/snapshot-allocation-validation.ts` | Sayısal kayıt ilişkileri ve yüzde–saat tutarlılığı |
| `shared/snapshot-validation-error.ts` | Mevcut `{status: 400}` domain hata üretimi |

Kontrol sırası korundu:

1. Önceki kaynak sürümleri index'i, ardından **tam** Zod parse; `users` doğrulandıktan sonra sonuçtan çıkarılır.
2. Ortak takvim anahtarları ve takvim kayıt limitleri.
3. Katalog kimlikleri, sistem adları, proje sıra değerleri; risk ilişkileri, sistem adı normalizasyonu ve aksiyon sonrası değerlendirme koşulları.
4. Kişisel takvim sahipliği, aralık, tür, yinelenme ve günlük toplam saat sınırı.
5. Kaynak tarih normalizasyonu, değişmemiş tarihî dönem istisnası, takım ilişkisi ve ayrılış tarihinin önceki dönemlere aktarılması.
6. Proje/bar/milestone/detay not tarihleri, proje sınırı ve bar çakışması kuralları.
7. Planlanan/gerçekleşen dağılım, aylık saat ve yüzde kayıtlarının **tamamı**; sahiplik, dönem, bağlantı ve yüzde–saat tutarlılığı.
8. Kimlik biçimleri, liderlik/yönetici ilişkileri ve proje aşama ayları.

Backend `Store.mutate`, yetki/revision/audit/rollback, API, şema sürümü ve SQL kodu değişmedi. Recursive AST bağımlılık sınırı kontrolü geçti.

## Davranış karşılaştırması

Önceki validator'ın şema ve gövdesi TypeScript 5.9.3 ile **yalnız test için** `tests/snapshot-validation-reference.mjs` içine donduruldu. Kaynak commit ve SHA256 dosyada kayıtlıdır. Facade re-export'ları çıkarıldı, relative import'lar test dizinine uyarlandı. İki sürüm bu adımda değişmeyen shared iş kuralı bağımlılıklarını kullanır; referans üretim modüllerine girmez.

Altı yeni test: bütün normalize sonuç, JSON alan sırası, hata adı/mesajı/status, Zod issue/path sırası ve girdi/previousResources JSON içeriğinin korunması karşılaştırılır. **45 ayrı domain hatası ve 2.025 sıralı hata çifti** kontrol edildi. Defaults, strict/strip, kullanıcı alanlarının çıkarılması, legacy tarihler, ayrılış aktarımı, bar üzerinde milestone, sayısal sınırlar, own `__proto__` yöneticisi ve parse öncesindeki bozuk previousResources davranışı da sınandı. Bunlar sonlu örneklerdir, tüm olası girdilerin kanıtı değildir.

Native MSSQL gate'e SQL'den okunan büyük snapshot'ın iki validator ile karşılaştırılması ve geçersiz dağılımın aynı şekilde reddedilmesi eklendi. Mevcut ön kontrol/reference/rollback ve ilgisiz hatalı verinin commit'i durdurması testleri de geçti.

## Yerel doğrulama

Ayrı `git archive`, izinli çevre değişkenleri listesi, macOS arm64/Node **24.21.0**; yalnız geçici sentetik SQL.js. Gerçek `.env`, hesap, çalışan DB, migration/restore ve servis yeniden başlatması kullanılmadı; yerelde bağımlılık kurulmadı.

| Komut | Gözlenen sonuç |
|---|---|
| `node --test tests/snapshot-validation.test.mjs tests/validation-records.test.mjs tests/planning-snapshot.test.mjs tests/planning-preflight.test.mjs tests/record-access.test.mjs tests/person-month-index.test.mjs` | **56/56** |
| `npm run verify` | **679/679**; format/domain/TypeScript/build geçti |
| `node --check tests/mssql.integration.mjs` | Geçti; syntax kontrolü Native test yerine geçmez |
| `node scripts/verify-deployment.mjs` | Stage ve iki uygulama klasöründe geçti |
| `node scripts/check-deployment-package.mjs` | **416 kaynak / 7 güncel çıktı**, 432 tarihî çıktı hariç |
| `git diff --check` | Geçti |

İlk odaklı testte yeni testin aylık saat üst sınırı varsayımı 744 olduğu için bir beklenti başarısız oldu. Mevcut üretim sınırı 1000; iki validator bu durumda da eşleşiyordu. Yalnız test beklentisi düzeltildi; son odaklı ve tam testler geçti, fail/cancelled/skipped/todo 0.

Oturum devam ettiğinde ilk geçici stage ve logları artık mevcut değildi. Yerel sonuçlar önceki araç çıktısında gözlendi; kayıp loglar için hash üretilmedi. Korunan aktarım makbuzu ve güncel dosya hash'leri tekrar doğrulandı. Aynı kaynak commit'inin aşağıdaki GitHub log/hash makbuzları ayrıca arşivlendi. [Yerel gözlem ve aktarım kanıtı](ci-evidence/validation-split-e501ebe-local.json).

## GitHub kanıtı

Aynı **`e501ebe`** uygulama/test commit'i üzerinde:

- [Kalite koşusu 38144151819](https://github.com/zaferond/AA-Kaynak-Planlama-Sistemi/actions/runs/38144151819) başarılı: Ubuntu **679/679**, Windows **325/325**, Chromium **155/155**. Format/domain/TypeScript/build/manifest/temiz paket ve iki high audit gate geçti. Testlerde fail/cancelled/skipped/todo 0. Kapsamlar örtüşür; tek bağımsız toplam olarak toplanmaz. [Kalite makbuzu](ci-evidence/quality-e501ebe-receipt.json).
- [Native koşusu 38144160143](https://github.com/zaferond/AA-Kaynak-Planlama-Sistemi/actions/runs/38144160143) başarılı: **31/31**, fail/cancelled/skipped/todo 0; cleanup doğrulandı. Node **24.21.0**, SQL Server **16.0.4295.3 Developer**, compatibility 160, şema 31; geçici loopback container ve boş sentetik test DB. [Native rapor](ci-evidence/native-mssql-e501ebe.json), [koşu/hash makbuzu](ci-evidence/native-mssql-e501ebe-receipt.json).
- **522 kaynak/test/workflow hash'i** Git commit'ine eşleşti; Windows launcher CRLF checkout kuralı uygulandı. İndirilen ZIP SHA256'sı GitHub artifact digest'ine eşleşti. Ham log/credential/bağlantı ayarları Git'e alınmadı.
- Native contention profili **10.000 planlanan / 4.000 gerçekleşen**, **1/4/12 worker**, **16 senaryo / 640 işlem / 340 yazma** ile bütünlük, revision, audit ve eşzamanlılık kontrollerini geçti. Önceki `1ade784` raporundaki **425 tablo/grup row-count özeti** aynı kaldı; veri kapsamı daraltılmadı. Farklı CI koşularının sürelerinden hız veya kapasite sonucu çıkarılmaz.

Rapor/kanıt arşivi sonraki dokümantasyon commit'ine girer. Native kanıtın kaynak kimliği **`e501ebe`** olarak korunur; dokümantasyon push'u yeni Native test olarak sunulmaz.

## Kontrollü aktarım

Başlangıç manifest'indeki bütün kaynak ve çıktı hash'leri iki klasörde kontrol edildi. 12 kaynak/test/workflow dosyası ve manifest iki kopyaya yedek, atomik dosya değiştirme ve hata halinde geri alma hazırlığıyla aktarıldı: **26 dosya güncellemesi**. Yedek: `.deployment-backups/n3-validation-split-20261011T134047Z`.

Son manifest **416 kaynak / 439 mevcut çıktı / 7 güncel release çıktısı** içerir. Frontend build çıktısı aynı baytlardır; site dosyası değişmedi. Tarihî asset'ler korundu. Runtime'a özgü milestone testi ve önceden farklı HTTP config testi korundu; runtime test ağacı canonical CI ağacıyla özdeş değildir. Gerçek veriye dokunulmadı; servis yeniden başlatılmadı.

## Kalan sıra

1. **N3:** Ayrılan doğrulama adımlarının değişiklik bağımlılıklarını açık haritaya dökmek; dar planlanan hücre işlemi için tam doğrulamayla normalizasyon, ilk hata, revision, audit ve rollback eşdeğerliğini kanıtlamak. Bu kanıt olmadan bütün doğrulamayı atlayan dar commit yolu açılmamalı. Global lock ve tam okuma maliyeti sürer.
2. Gerçek SQL execution plan/IO/CPU, HTTP admission kapasitesi, çoklu instance/auth yükü ve kurum WAN/proxy yükü için operasyonel kabul.
3. **N2** bağımlılık uyarıları ve **N6** asset/yayın politikası; high audit gate orta uyarıları kapatmaz.
4. Windows servis hesabı/ACL, NTLM, proxy/TLS/CA ve kurum yedek RPO/RTO doğrulamaları yerel kod incelemesiyle kapanmaz.
