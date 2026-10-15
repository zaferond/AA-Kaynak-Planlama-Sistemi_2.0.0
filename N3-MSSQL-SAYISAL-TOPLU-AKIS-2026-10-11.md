# N3 — MSSQL sayısal snapshot okumalarında tek akış — 11 Ekim 2026

## Sonuç ve sınır

[Önceki adımın](N3-PLANLANAN-HUCRE-ON-KONTROL-2026-10-11.md) ardından geçerli yazmaların tam snapshot okumasındaki beş ayrı sayısal SELECT isteği tek streaming isteğinde birleştirildi. Başlangıç commit'i `06c523aa5a207bc7c72c05e42f543055540c449f`; uygulama/test commit'i **`6bcf0faae3595b65ce704f564b10653e4473f8a7`**.

**N3 kısmen giderildi.** Tam doğrulama ilgisiz metadata'yı normalleştirebildiği ve ilgisiz hatalı kayıtları reddettiği için, geçerli komutlarda veri kapsamı daraltılmadı. Bu değişiklik beş sayısal sorgunun döndürdüğü bütün satırları korur; yalnız MSSQL istemci/sunucu istek sayısını beşten bire indirir. SQL execution plan, fiziksel IO veya tam validation maliyetinin azaldığı iddia edilmez.

## Uygulama

- `backend/adapters/mssql.mjs`: transaction bağlantısına `scanMany` yeteneği eklendi. 1–16 sabit SELECT ve eş sayıda senkron consumer doğrulanır; boş/sparse/çoklu statement/NUL/malformed girdiler sürücüye gitmeden reddedilir. SQL metinleri dahili snapshot kataloğundan gelir; istemci SQL oluşturmaz. Batch parametre almaz. Mevcut parametreli tek SELECT yolu aynı ortak akış yaşam döngüsünü kullanır.
- `backend/read-records.mjs`: aynı sorgu kurucuları ve aynı map collector tekli ve toplu yollar tarafından kullanılır. Planlanan, gerçekleşen, çalışılan saat, yüzde girişi ve revision haritaları eksiksiz okunur. Sıfır değerler, özel revision namespace'leri, silme tombstone'ları ve SELECT sırası korunur. Her sonuç kümesinde tüketilen ve bildirilen satır sayısı eşleşmelidir.
- `backend/planning-reader.mjs`: yalnız `provider=mssql`, **viewUser bulunmayan tam snapshot** ve `scanMany` yeteneği mevcutken yeni yolu seçer. Authenticated `Store.view`, admin dahil kullanıcı kapsamlı mevcut okumayı kullanır. SQL.js ve capability bulunmayan bağlantılar mevcut yolları kullanır.
- Başarısız consumer/schema/SQL/timeout sonrasında sonraki satırlar tüketilmez, ilk hata korunur ve sürücünün tamamlanması beklenir. Eksik/çok sonuç kümesi veya beklenmedik buffered çıktı kabul edilmez. Listener'lar temizlenir. Transaction rollback sürücü akışı tamamlanmadan başlamaz; kısmi map persist/response için kullanılamaz.
- Mevcut Exclusive/Shared SQL application lock, persisted principal/version denetimi, ön kontrol, tam snapshot validation, diff/persist, audit, generation, revision ve delta/full yanıt sözleşmesi korunur. Migration, şema, cache veya endpoint eklenmedi. Her batch yalnız kendi transaction'ına aittir; aynı bağlantıda paralel request yoktur.
- `scripts/transaction-profile.mjs`: yeni akış ayrı instrument edilir. `numericBatchCalls` gerçek batch isteğini, `numericBatchStatements` içindeki SELECT sayısını sayar. `scanCalls` tekli scan isteklerini saymaya devam eder. `sqlCalls` batch'i yalnız bir kez sayar; `sqlRows` her sonuç kümesini ayrı sayar. Row değerleri veya SQL parametreleri profil raporunda tutulmaz.

## Yerel doğrulama

Ayrı `git archive` kopyası, temiz çevre listesi, macOS arm64/Node 24.21.0 ve geçici sentetik SQL.js veritabanları kullanıldı. Gerçek `.env`, kullanıcı hesabı, çalışan veritabanı veya servis kullanılmadı. Yerelde bağımlılık kurulmadı/güncellenmedi; mevcut bağımlılıklar salt kullanım için bağlandı. Sürücü unit testlerinde gerçek Request event/promise wrapper'ı çalışır, alt `_query` stub edilir; bu unit testler gerçek SQL Server testi olarak sunulmaz.

| Komut | Sonuç |
|---|---|
| `node --test tests/mssql-scan.test.mjs tests/read-records.test.mjs tests/transaction-profile.test.mjs` | **33/33**, fail/cancelled/skipped/todo 0 |
| `npm run verify` | **669/669**, fail/cancelled/skipped/todo 0; format/domain/TypeScript/build geçti |
| `node --check tests/mssql-native-suite.mjs` | Geçti; syntax kontrolü Native test yerine geçmez |
| `node scripts/verify-deployment.mjs` | Geçici kopya ve her iki uygulama klasöründe geçti |
| `node scripts/check-deployment-package.mjs` | Geçti: **410 kaynak / 7 güncel çıktı**, 430 tarihî çıktı hariç |
| `git diff --check` | Geçti |

Yedi yeni unit test eklendi; mevcut SQL.js Store fixture'ında tam toplu snapshot eşitliği ve authenticated view için batch kullanılmaması kontrolü de genişletildi. Windows kalite listesine mevcut `read-records.test.mjs` dosyası dahil edildi. Test beklentileri gevşetilmedi veya atlanmadı. Eski metadata batch testi sayısal capability'yi açıkça kapatarak metadata değişikliğini bağımsız kontrol eder; Native sayısal testi buffered/tekli-stream/toplu-stream üçlü karşılaştırmasını yapar.

Odaklı kapsam: farklı genişlikte ve boş sonuç kümeleri; tek istek; reserved key/Unicode/sıfır; eksik/çok/malformed kümeler; yanlış satır sayısı; ortadaki consumer/SQL/timeout hatası; geç satır ve ikincil hata; bir kez cancel; listener temizliği; driver drain öncesi rollback yapılmaması; yeni isteğin kullanılabilirliği. Store fixture'ında calendar metadata, actual percent/worked hours ve deletion revision içeren bütün snapshot ve JSON bayt dizilişi eski okumayla karşılaştırılır.

## GitHub kanıtı

Aynı **`6bcf0fa`** uygulama/test commit'i üzerinde:

- [Kalite koşusu 38139955736](https://github.com/zaferond/AA-Kaynak-Planlama-Sistemi/actions/runs/38139955736) başarılı: Ubuntu **669/669**, Windows **311/311**, Chromium **155/155**. Fail/cancelled/skipped/todo 0; format/domain/TypeScript/build/manifest/temiz paket ve iki high audit gate geçti. Windows ve Ubuntu kapsamları örtüşür; toplanarak bağımsız test sayısı sunulmaz. [Kalite makbuzu](ci-evidence/quality-6bcf0fa-receipt.json).
- [Native MSSQL koşusu 38139955412](https://github.com/zaferond/AA-Kaynak-Planlama-Sistemi/actions/runs/38139955412) başarılı: **29/29**, fail/cancelled/skipped/todo 0; cleanup doğrulandı. Ubuntu 24.04/Node 24.21.0, SQL Server **16.0.4295.3 Developer**, compatibility 160, şema 31; geçici 4 GiB loopback container ve boş test DB kullanıldı. Üçlü tam snapshot/JSON eşitliği, orta sonuç kümesinde consumer/SQL hatası, iptal sonrası yeni transaction ve SQL hatasında komutun stage edilmemesi/veri-audit değişmemesi gerçek sürücüyle kontrol edildi. [Native rapor](ci-evidence/native-mssql-6bcf0fa.json), [koşu/hash makbuzu](ci-evidence/native-mssql-6bcf0fa-receipt.json).
- **512 kaynak/test/workflow hash'i** Git commit'ine eşleşti; Windows launcher CRLF checkout kuralı uygulandı. İndirilen ZIP SHA256'sı GitHub artifact digest'ine eşleşti. Ham loglar ve credential/bağlantı ayarları Git'e alınmadı. [Yerel kanıt](ci-evidence/numeric-batch-6bcf0fa-local.json).
- Contention: **10.000 planlanan / 4.000 gerçekleşen**, **1/4/12 worker**, **16 senaryo / 640 işlem / 340 yazma**; bütünlük kontrolleri geçti. Bütün yazma gruplarında `numericBatchCalls=1`, `numericBatchStatements=5`, `scanCalls=0`; scoped read gruplarında `numericBatchCalls=0`, `scanCalls=5` doğrulandı.

Aynı sentetik fixture ve sayaç tanımıyla, önceki `eec6723` raporundaki **125 sayısal row-count özeti** güncel artifact ile birebir aynı. İşlem verisi daraltılmadı. Tek worker/40 gözlem için bütün işlemdeki instrument edilen request sayıları:

| Senaryo | Önceki `sqlCalls` medyan/max | Güncel medyan/max | Sayısal okuma |
|---|---:|---:|---|
| Geçerli planlanan yazma, tam yanıt | 16 / 16 | **12 / 12** | 5 SELECT / 1 stream request |
| Ardışık planlanan delta yazma | 14 / 14 | **10 / 10** | 5 SELECT / 1 stream request |

Bu tablo request sayısını karşılaştırır; süre iyileşmesi veya üretim SLA sonucu çıkarmaz. `sqlRows` sürücünün döndürdüğü satırdır, fiziksel disk IO değildir. Joined preflight sorgusu profiler'da ilk tablo olan `teams` altında sayılır. Tam validator ve global lock maliyeti devam eder; ham zaman/bellek sonuçları artifact'ta arşivlenir.

Bu rapor ve kanıt arşivi sonraki dokümantasyon commit'ine aittir; Native kanıtın kaynak kimliği **`6bcf0fa`** olarak korunur. Dokümantasyon push'u yeni Native koşu olarak sunulmaz.

## Kontrollü aktarım

İki uygulama klasöründe başlangıç manifest'indeki bütün kaynak ve çıktı hash'leri doğrulandı. On test edilmiş kaynak/test/workflow dosyası ve manifest iki kopyaya aktarıldı: **22 dosya güncellemesi**. Yedek `.deployment-backups/n3-numeric-batch-20261011T123701Z` altında; atomik dosya değiştirme ve hata halinde geri alma hazırlığıyla aktarıldı.

Manifest **410 kaynak / 437 mevcut çıktı / 7 güncel paket çıktısı** içerir. Frontend değişmedi; 437 çıktı ve yedi güncel release artifact'ının baytları başlangıçla aynıdır. Runtime'a özgü milestone testi ve önceden farklı olan HTTP config testi korunur. Runtime test ağacı canonical CI ağacıyla özdeş ilan edilmez; uygulama kaynaklarının baytları eşittir. Gerçek DB/account/migration/restore işlemi ve servis yeniden başlatması yapılmadı.

## Kalan işler ve önerilen sıra

1. **N3:** tam validation maliyeti ve global lock süresi sürer. Sonraki tasarım, validator'ın ilgili iş kuralı ve ilgisiz normalizasyon sorumluluklarını davranışı koruyarak ayırmalıdır. Hedef hücreyi okuyup doğrudan persist etmek henüz güvenli kabul edilmez. Dar commit için tam referansa karşı normalizasyon/kapsam/revision/audit/rollback/eşzamanlılık eşdeğerliği ayrıca kanıtlanmalı.
2. Kurum iş yükünde SQL execution plan/index seek/IO/CPU, HTTP admission kapasitesi, çoklu instance, auth yükü ve gerçek WAN/proxy gecikmesi ölçülmeli. Bu sentetik profil üretim SLA veya kapasite garantisi değildir; farklı CI runner koşularından hız yüzdesi çıkarılmaz.
3. **N2** bağımlılık uyarıları ve **N6** asset/yayın politikası kısmen açıktır. High audit gate başarısı orta uyarıları kapatmaz.
4. Windows servis hesabı/ACL, NTLM, proxy/TLS/CA, kurum yedek RPO/RTO ve gerçek yük kontrolleri ayrı operasyonel kanıt gerektirir.
