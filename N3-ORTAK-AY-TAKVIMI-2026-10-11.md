# N3 — Tam doğrulamada ortak ay takviminin paylaşılması — 11 Ekim 2026

## Sonuç

[Sayısal MSSQL okuma adımından](N3-MSSQL-SAYISAL-TOPLU-AKIS-2026-10-11.md) sonra, tam doğrulamanın yüzde/saat tutarlılık kontrolünde aynı ayın ortak tatil ve hafta sonu hesabının her çalışan için tekrarlanması azaltıldı. Başlangıç **`b977f1a4395c5cf7fd3a5788f137e4c5084c1636`**; uygulama/test commit'i **`1ade784e2ea47e7c7c018fc6c480451b2b8b9125`**.

**N3 kısmen giderildi.** Bu adım ortak ay hesabını azaltır; tam snapshot okuması, bütün kayıtların şema/ilişki doğrulaması ve global transaction lock korunur. Dar hücreyi doğrudan commit etme veya validation atlama yoktur. Üretim kapasitesi, güvenlik veya SLA garantisi verilmez.

## Değişiklik ve çağrı zinciri

- `shared/actual-units.ts`: `createPersonMonthHoursIndex` içinde mevcut çalışan-ay sonucu cache'ine ek olarak **yalnız o index örneğinin ömründe** ortak ay planı tutulur. Plan, gün/tarih/ortak takvim kapasitesi ve tarihî hafta içi saat bazını içerir. İlk istek gelmeden hazırlanmaz; yalnız istenen aylar hesaplanır.
- İzin, eğitim, manuel aylık saat ve efektif saat **her çalışan için ayrı** hesaplanır. Günlerin artan sırası, toplama sırası, izin önceliği, eğitim için kalan kapasite, tam/yarım tatil, hafta sonu, sıfır saat, fazla mesai ve 180 saat FTE bazının davranışı korunur.
- `personalMonthTotals` ve `hoursFromTotals` özel yardımcıları ortak aritmetiği tek yerde tutar. Doğrudan `personMonthHours` yolu günlük plan dizisi üretmez; index yolu hazırlanmış ay günlerini kullanır. Test oracle'ındaki sabit 9/1000 değerleri önceki sürümün dondurulmuş referansıdır, üretimde ikinci bir iş kuralı değildir.
- `shared/server-domain.ts` tam `schema.parse` ve metadata normalizasyonundan sonra yeni index oluşturur. Tüm yüzde satırları kontrol edilir; eski snapshot'a ait index kullanılmaz. Bu dosyanın kodu değişmedi.
- `backend/actual-calendar-commands.mjs` index'i bütün takvim/saat komutları bittikten sonraki final yeniden hesaplamada oluşturur; döngü yalnız yüzde/revision alanlarını değiştirir. Takvim veya kişisel saatler cache kullanılırken değiştirilmez. Bu dosyanın kodu değişmedi.
- Index global, session veya transactionlar arası cache değildir. Takvim/izin/saat değiştiğinde yeni index oluşturma sözleşmesi korunur. SQL/yetki/revision/audit/rollback, şema, API ve filtre davranışı değiştirilmedi.

## Yerel doğrulama

Ayrı `git archive`, temiz çevre listesi, macOS arm64/Node **24.21.0**, yalnız geçici sentetik SQL.js verisi. Gerçek `.env`, hesap, çalışan DB, migration/restore veya servis yeniden başlatması kullanılmadı. Yerelde bağımlılık kurulmadı/güncellenmedi.

| Kontrol | Sonuç |
|---|---|
| `node --test tests/person-month-index.test.mjs tests/actual-units.test.mjs tests/validation-records.test.mjs tests/planning-preflight.test.mjs` | **23/23**, fail/cancelled/skipped/todo 0 |
| `npm run verify` | **673/673**, fail/cancelled/skipped/todo 0; format/domain/TypeScript/build geçti |
| `node --check tests/mssql.integration.mjs` | Geçti; syntax kontrolü Native test yerine geçmez |
| `node scripts/verify-deployment.mjs` | Geçici kopya ve iki uygulama klasöründe geçti |
| `node scripts/check-deployment-package.mjs` | **410 kaynak / 7 güncel çıktı**, 432 tarihî çıktı hariç |
| `git diff --check` | Geçti |

Dört yeni unit test; genişleyen dosya Windows gate'e eklendi. Önceki hesap `tests/person-month-reference.mjs` içinde test amaçlı donduruldu. **2.400 ay × dört çalışan/saat durumu = 9.600 senaryoda**, hem doğrudan helper hem index bütün sonuç alanlarıyla bu bağımsız referansa eşleşir. Başlangıç/bitiş yılları, artık yıllar, Unicode ve özel kimlikler, otomatik/sıfır/230/1000 saat, legacy/typed kişisel kayıtlar, hafta sonu ve tatil kırpması dahildir. Girdi değişmediği de assert edilir. Bu helper testi, eski duplicate tür girdilerinin domain'de kabul edildiği anlamına gelmez; tam validator'ın ayrı kontrolleri sürer.

Deterministik iş sayısı: **80 çalışan × Ocak/Şubat 2026** için ortak hafta içi tatil lookup'ı **3.360 → 42**. Aynı index'te tekrar istek yeni lookup yapmaz. Yeni snapshot index'i değişen ortak tatil, izin ve manuel saati görür. Farklı çalışanlar aynı ayı paylaşırken tam validator, doğru yüzde/saat girdisini kabul eder; yanlış değerleri reddeder ve girdi değişmez. Mevcut ön kontrol/reference/rollback ve unrelated hatalı veri testleri de geçti.

## Yerel performans ölçümü

Önceki `b977f1a` shared kaynaklarının tamamı geçici referans dizinine kopyalandı; kaynak hash'leri başlangıç manifest'iyle eşleştirildi. Önceki ve yeni kod **aynı Node sürecinde**, dönüşümlü sırayla, dört ısınma ve **20 ölçümle** karşılaştırıldı. Tam validator çıktısı ve girdinin değişmemesi ayrıca kontrol edildi. Ham örnekler, ortam bilgisi ve tekrar üretim betikleri [yerel kanıtta](ci-evidence/month-calendar-1ade784-local.json) bulunur. Betikler geçici `.reference` dizininde çalıştı; üretim benchmark komutu değiştirilmedi.

| Saf CPU ölçümü | Önceki medyan / örnek p95 | Yeni medyan / örnek p95 |
|---|---:|---:|
| Index: 80 çalışan × 9 ay | 14,289 / 16,450 ms | **7,254 / 7,535 ms** |
| Doğrudan helper: aynı 720 çalışan-ay | 14,061 / 14,491 ms | 14,218 / 14,504 ms |
| Tam validate: 10.000 planlanan, 4.000 gerçekleşen, 4.000 yüzde, 80 çalışan, 1.000 izin günü | 38,550 / 42,149 ms | **30,364 / 33,264 ms** |

Bu ölçümler yalnız bu yerel sentetik veri ve saf fonksiyonları kapsar. SQL, HTTP, tarayıcı, gerçek yük ve kurum ağ gecikmesi bu sürelerde yoktur. Doğrudan helper'da hızlanma iddia edilmez. Farklı CI runner sürelerinden kazanç yüzdesi çıkarılmaz; saf helper kazancı uygulamanın tamamına genellenmez.

## GitHub kanıtı

Aynı **`1ade784`** uygulama/test commit'i üzerinde:

- [Kalite koşusu 38141143584](https://github.com/zaferond/AA-Kaynak-Planlama-Sistemi/actions/runs/38141143584) başarılı: Ubuntu **673/673**, Windows **319/319**, Chromium **155/155**; kaynak testlerinde fail/cancelled/skipped/todo 0. Format/domain/TypeScript/build/manifest/temiz paket ve iki high audit gate geçti. Kapsamlar örtüşür, tek bağımsız toplam olarak toplanmaz. [Kalite makbuzu](ci-evidence/quality-1ade784-receipt.json).
- [Native koşusu 38141143265](https://github.com/zaferond/AA-Kaynak-Planlama-Sistemi/actions/runs/38141143265) başarılı: **30/30**, fail/cancelled/skipped/todo 0; cleanup doğrulandı. Yeni kontrol, SQL'den okunmuş snapshot'ın kaynak/ay saatlerini dondurulmuş önceki hesapla birebir karşılaştırır. Ubuntu 24.04/Node 24.21.0, SQL Server **16.0.4295.3 Developer**, compatibility 160, şema 31; geçici 4 GiB loopback container ve boş sentetik test DB kullanıldı. [Native rapor](ci-evidence/native-mssql-1ade784.json), [koşu/hash makbuzu](ci-evidence/native-mssql-1ade784-receipt.json).
- **513 kaynak/test/workflow hash'i** Git commit'ine eşleşti; Windows launcher CRLF checkout kuralı uygulandı. İndirilen ZIP SHA256'sı GitHub artifact digest'ine eşleşti. Ham log/credential/bağlantı ayarları Git'e alınmadı.
- Native contention profili **10.000 planlanan / 4.000 gerçekleşen**, **1/4/12 worker**, **16 senaryo / 640 işlem / 340 yazma** ile bütünlük, revision, audit ve eşzamanlılık kontrollerini geçti. Önceki `6bcf0fa` artifact'ındaki **125 sayısal row-count özeti** aynı kaldı; veri kapsamı daraltılmadı. Ham zaman/bellek sonuçları arşivlenir; farklı koşuların sürelerinden hız yüzdesi veya kapasite sonucu çıkarılmaz.

Rapor/kanıt arşivi sonraki dokümantasyon commit'ine girer. Native kanıtın kaynak kimliği **`1ade784`** olarak korunur; dokümantasyon push'u yeni Native test olarak sunulmaz.

## Kontrollü aktarım

Başlangıç manifest'indeki bütün kaynak ve çıktı hash'leri her iki klasörde doğrulandı. Beş kaynak/test/workflow dosyası, dört build dosyası ve manifest iki kopyaya kontrollü aktarıldı: **20 dosya güncellemesi**. Yedek `.deployment-backups/n3-month-index-20261011T125527Z`; atomik dosya değiştirme ve hata halinde geri alma hazırlığı kullanıldı.

Son manifest **410 kaynak / 439 mevcut çıktı / 7 güncel release çıktısı** içerir. Ortak helper frontend bundle'ına da girdiği için JS ve HTML referansları yeniden derlendi. Başlangıçtaki tarihî asset'ler korunur; iki yeni JS çıktısı eklenir, `index.html` ve gzip'i güncellenir. Geçici stage'deki ara derleme asset'leri dağıtıma alınmadı. Temiz release paketi yalnız yedi güncel dosyayı içerir.

Runtime'a özgü milestone testi ve önceden farklı HTTP config testi korunur; runtime test ağacı canonical CI ağacıyla özdeş değildir. Uygulama kaynakları/çıktıları test edilen baytlardır. Gerçek veriye dokunulmadı; servis yeniden başlatılmadı.

## Kalan sıra

1. **N3:** tam validator'ın şema, metadata normalizasyonu ve kayıt ilişkisi sorumluluklarını davranış/reddetme sırasını koruyarak modüler ayırmak; dar commit tasarımının ön koşulu olan normalizasyon/kapsam/revision/audit/rollback eşdeğerliğini hazırlamak. Geçerli yazmalar hâlâ bütün snapshot'ı okur ve doğrular; global lock maliyeti sürer.
2. Gerçek SQL execution plan/IO/CPU, HTTP admission kapasitesi, çoklu instance/auth yükü ve kurum WAN/proxy yükü için operasyonel kabul.
3. **N2** bağımlılık uyarıları, **N6** asset/yayın politikası; high audit gate başarısı orta uyarıları kapatmaz.
4. Windows servis hesabı/ACL, NTLM, proxy/TLS/CA ve kurum yedek RPO/RTO doğrulamaları yerel kod incelemesiyle kapanmaz.
