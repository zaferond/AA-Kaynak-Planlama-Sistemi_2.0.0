# N3 — Planlanan tek hücre işleminin doğrulama bağımlılıkları — 11 Ekim 2026

## Sonuç

[Doğrulama modüllerinin ayrılmasından](N3-SNAPSHOT-DOGRULAMA-MODULLERI-2026-10-11.md) sonra tek hücre akışının koruması gereken davranışlar haritalandı ve SQL.js / Native MSSQL için ortak karşılaştırma testi eklendi. Başlangıç **`81a00732d4b2e5a1fe83a931e29ee5f402e0315c`**, son test/CI commit'i **`fc4fd88ec6ff3e0e8d242a0ef74c0938cf4212c4`**.

**N3 kısmen giderildi.** Üretim kodu, API, şema, SQL ve arayüz değişmedi. Bu adım otomatik regresyon kapsamını genişletir; yeni bir dar doğrulama/commit yolu açmaz, performans kazancı iddia etmez. Mevcut tek hücre ön kontrolü geçildiğinde hâlâ bütün snapshot okunur ve doğrulanır.

Somut sonuç: **hücreye dokunmayan kayıtlar da yazmayı durdurabilir; tam doğrulama hücre dışındaki verileri normalleştirebilir.** Yalnız hedef takım/proje/hücreyi okuyarak commit etmek mevcut sözleşmeyle eşdeğer değildir.

## Çağrı zinciri ve veri bağımlılıkları

`Store.mutate` → transaction içindeki persisted kullanıcı/sürüm kontrolü → owned tek hücre ön kontrolü → tam okuma → sınırlı draft kopyası → komut staging → tam validate → directory revision → settings/diff → persist → audit → generation → kapsamlı yanıt veya delta → commit.

| Kontrol / modül | Okuduğu veri | Dönüşüm veya etkisi | Tek hücre yazmasındaki gereklilik |
|---|---|---|---|
| `backend/store.mjs`, `planning-preflight.mjs`, `operations.mjs` | Güncel kullanıcı active/version/role/leaders; hedef takım, proje, mevcut değer ve revision | Yetki/revision/clear sahipliği kontrolleri; allocations ve allocation revision staging | Kimlik, kapsam ve revision aynı transaction/lock altında güncel olmalı |
| `shared/snapshot-schema.ts` | Snapshot'ın bütün şema alanları ve bütün sayısal kayıtları | trim/strip/default; nested kopya; users doğrulaması | İlgisiz alandaki şekil hatası da ilk hata olabilir |
| `snapshot-calendar-validation.ts` | workCalendar, personCalendar, kaynak kimlikleri | Tarih/aralık/tür, kayıt limiti, duplicate ve günlük saat sınırı | Hatalı kişisel takvim geçerli hücrenin commit'ini durdurur |
| `snapshot-reference-validation.ts` — katalog/risk | teams/projects/resources/riskSystems/risks | Duplicate/sıralama/ilişki kontrolleri; risk.system katalog adına normalleşir | Hedef dışındaki risk veya katalog da sonucu etkiler |
| `snapshot-timeline-validation.ts` — kaynak | Kaynak sürümleri, takım kimlikleri, previousResources | Tarih normalizasyonu, tarihî dönem istisnası ve önceki sürümlere ayrılış tarihi aktarımı | Hücre yazması kaynak metadata'sının da kaydedilmesine yol açabilir |
| Aynı modül — proje | Bütün proje dönemleri, bar/milestone/not tarihleri | Dönem ve çakışma kontrolü | Hedef dışındaki tarih hatası reddetmeyi etkiler |
| `snapshot-allocation-validation.ts` — planlanan | Bütün allocations, takım kimlikleri, proje kimlikleri ve dönemleri | Sahiplik/ay/dönem kontrolü; proje dışındaki sıfır değer korunur | Yalnız hedef satır geçerliliği bütün map'in geçerliliğini kanıtlamaz |
| Aynı modül — gerçekleşen/saat/yüzde | actualAllocations, actualWorkedHours, actualPercentEntries, kaynak/proje index'leri, ortak/kişisel takvim | Eksik map varsayılanları; yüzde–saat tutarlılığı | Planlanan komutta ilgisiz gerçekleşen kaydı da reddedilir |
| `snapshot-reference-validation.ts` — son kontroller | Kimlikler, leaders, leaderManagers, phases | Kimlik/liderlik/yönetici/ay doğrulaması | Önceki aşamalardan sonra çalışır; hata sırası korunmalı |
| `directory-policy.ts`, `mutation-settings.mjs`, `planning-writer.mjs` | before ve tamamen normalize valid snapshot | Katalog değişirse `directory:shared` artar; gerçek metadata/sayısal farklar kaydedilir | Team adı trim edilirse yalnız allocation revision yeterli değildir |
| `audit.mjs`, `planning-response.mjs`, `Store.prepareMutationView` | before/valid/changeSet, generation, aktif kullanıcı ve görünürlük kapsamı | Audit; metadata veya diğer revision değiştiyse delta yerine tam yanıt | Hücre dışı normalizasyonu, audit'i veya full-response fallback'ini kaybetmemeli |

Bu tablo kaynak kodundan çıkarılmış mevcut bağımlılıklardır; yürütülen bir atlama listesi veya cache politikası değildir. Sıra, `shared/server-domain.ts` girişinin sırasıdır. Şekil hataları domain kontrollerinden önce; komutun yetki/revision hataları ise tam validator'dan önce gelir.

## Yeni otomatik karşılaştırma

`tests/planning-contract-suite.mjs`, disposable Store ile ortak SQL.js/Native suite'tir. `tests/planning-contract.test.mjs` yalnız geçici SQL.js dosyası oluşturur. Native kullanım mevcut boş DB/lease/cleanup korumalarının içindedir.

Referans yol: genel callback + tam draft + dondurulmuş önceki validator. Referans işlem normal persist/audit/generation/response adımlarını tamamladıktan sonra sentetik marker hatasıyla **rollback** edilir. Aynı başlangıç verisinde mevcut owned planning komutu gerçekten commit edilir. Aşağıdakiler karşılaştırılır:

- Tam normalize ve SQL'den yeniden okunan snapshot, revision ve generation.
- Yanıtın bütün içeriği, delta/full fallback ve yöneticiye görünmeyen takımın yanıta girmemesi.
- Audit satır sayısı, aktör, kayıt, action ve changes içeriği. Yalnız rastgele `id` ve zamana bağlı `occurred_at` karşılaştırmadan çıkarılır; bunların doğruluğu için bağımsız kanıt iddia edilmez.
- Hata adı, mesajı, status ve Zod issue'ları; reddedilen işlemden sonra snapshot/audit/generation aynıdır.
- Komut girdisi değişmez; normal yazma revision artırır, olmayan hücreyi temizleme yeni tombstone üretmez. Generation davranışı korunur.

| Grup | Karşılaştırma |
|---|---:|
| Admin/yönetici: oluşturma, sıfır, aynı değer, 10000 sınırı, ondalık, silme, tekrar silme, proje dışı sıfır ve boş hücre temizleme | 20 |
| Yetki/kapsam, forged rol, eski oturum/revision, bilinmeyen hedef, geçersiz ay/değer ve aynı anda hatalı değer + yetki/revision | 17 |
| İlgisiz ortak/kişisel takvim, katalog, risk, kaynak dönemi, planlanan/gerçekleşen/saat/yüzde, liderlik/yönetici/aşama veya strict alan hataları | 20 |
| Aynı anda iki farklı hata: şema/takvim, risk/kişisel takvim, kaynak/gerçekleşen ve yüzde/liderlik | 4 |
| Eski takım/proje adı, risk sistem adı ve ayrılış geçmişi normalizasyonu; directory revision artışı ve full-response fallback | 1 |
| **Toplam** | **62** |

İlgisiz hata testlerinde yalnız komut staging'inin hatayı yakalamadığı ayrıca assert edilir; tam validator iki yolda da reddeder. Normalizasyon örneği gerçek **sentetik** SQL satırlarıyla hazırlanır; yalnız mock edilmiş bir kaydetme sonucu değildir.

Kapsam sınırı: mevcut owned akış ile referans callback karşılaştırılır; gelecekteki dar commit algoritması henüz yoktur. Writer, audit builder, staging ve yetki helper'ları iki yolda ortaktır. Eşit sonuç bu ortak bileşenlerin bağımsız doğruluğunu veya bütün girdileri kanıtlamaz. Yeni matris sıralı işlemlerdir; mevcut eşzamanlılık/HTTP/disk/restart testleri ayrıca çalışır.

## Yerel doğrulama

Ayrı git archive, temiz çevre değişkeni listesi, macOS arm64/Node 24.21.0. Gerçek `.env`, çalışan DB/hesap, migration/restore ve servis yeniden başlatması kullanılmadı. İlk `npm run verify`, root bağımlılıklarındaki eksik TypeScript nedeniyle domain yükleme aşamasında durdu; mevcut frontend TypeScript paketi **yalnız geçici kopyaya** bağlandı. Kurulum veya uygulama bağımlılığı değişikliği yapılmadı.

| Son kaynak sürümü üzerinde komut | Sonuç |
|---|---|
| `node --test tests/planning-contract.test.mjs tests/planning-preflight.test.mjs tests/planning-snapshot.test.mjs tests/snapshot-validation.test.mjs` | **42/42** |
| `npm run verify` | **684/684**; format/domain/TypeScript/build geçti |
| `node scripts/verify-deployment.mjs` | Geçti |
| `node scripts/check-deployment-package.mjs` | **416 kaynak / 7 güncel çıktı**, 432 tarihî çıktı hariç |
| `node --check tests/mssql.integration.mjs` | Geçti; Native test yerine geçmez |
| `git diff --check` | Geçti |

Başarılı testlerde fail/cancelled/skipped/todo 0. Log hash'leri, ortam ve ilk blokaj [yerel kanıtta](ci-evidence/planning-contract-fc4fd88-local.json).

## GitHub kanıtı

Aynı **`fc4fd88`** kaynak commit’i üzerinde:
- [Kalite koşusu 38153743800](https://github.com/zaferond/AA-Kaynak-Planlama-Sistemi/actions/runs/38153743800) başarılı: Ubuntu **684/684**, Windows **330/330**, Chromium **155/155**. Format/domain/TypeScript/build/manifest/temiz paket ve iki high audit gate geçti. [Kalite makbuzu](ci-evidence/quality-fc4fd88-receipt.json).
- [Native koşusu 38153760681](https://github.com/zaferond/AA-Kaynak-Planlama-Sistemi/actions/runs/38153760681) başarılı: **36/36**, cleanup doğrulandı. Yeni 62 karşılaştırma aynı suite ile gerçek SQL Server sürücüsü ve sentetik DB üzerinde de çalıştı. Node **24.21.0**, SQL Server **16.0.4295.3 Developer**, compatibility 160, şema 31. [Native rapor](ci-evidence/native-mssql-fc4fd88.json), [koşu/hash makbuzu](ci-evidence/native-mssql-fc4fd88-receipt.json).
- **524 kaynak/test/workflow hash'i** test edilen commit'e eşleşti; Windows launcher CRLF checkout kuralı uygulandı. İndirilen ZIP hash'i GitHub artifact digest'ine eşleşti. Ham log/credential/bağlantı ayarları Git'e alınmadı.
- Native contention: **10.000 planlanan / 4.000 gerçekleşen**, **1/4/12 worker**, **16 senaryo / 640 işlem / 340 yazma**. Önceki `e501ebe` raporuna karşı **425 tablo/grup row-count özeti** aynı kaldı. Bu adımın yeni performans algoritması olmadığı için farklı koşu sürelerinden kazanç hesabı yapılmaz.
- Bütün başarılı kaynak testlerinde fail/cancelled/skipped/todo 0; örtüşen gate sayıları bağımsız toplam olarak toplanmaz.


İlk `fece261` koşuları, açık directory revision assert'i eklenince iptal edilip son commit için yeniden başlatıldı. İptal edilen koşular başarı kanıtı değildir. Rapor/kanıt sonraki dokümantasyon commit'ine girer; test edilen kaynak kimliği **`fc4fd88`** olarak korunur.

## Kontrollü aktarım ve kalan iş

Dört test/CI dosyası iki uygulama klasörüne aktarıldı; son assert için suite dosyası iki kopyada ayrıca güncellendi. Toplam **10 dosya güncellemesi**. Üretim manifest'i ve bütün **416 kaynak / 439 çıktı / 7 release çıktısı** aynı baytlardır. Runtime'a özgü milestone ve önceden farklı HTTP config testleri korunur. Aktarım makbuzu ve yedek yerel kanıttadır; gerçek veriye dokunulmadı.

1. **N3:** Bu 62 senaryo dar commit tasarımının kabul testleridir; dar yolun eşdeğer olduğu kanıtlanmış değildir. Geçerli/normalize bir başlangıcın aynı generation ve doğrulama politikası altında garanti edilmesi, tüm writer/import/restore/migration yollarının bunu koruması ve sertifikanın eski veriyle kullanılmaması için ayrıca tasarım gerekir. Mevcut generation tek başına “tam doğrulanmış ve normalize” kanıtı sayılmamalı.
2. Mevcut davranışı koruyarak okuma/materialization maliyetini ölçmek ve azaltmak daha doğrudan bir sonraki performans çalışmasıdır. Önceki `e501ebe` sentetik tek worker allocation ölçümünde medyan read **184,364 ms**, validation/diff hazırlığı **37,840 ms** idi. Bu eski, aynı koşuya ait faz gözlemidir; bu adım için hız kazancı, SLA veya gerçek kurum kapasitesi sonucu değildir.
3. Native execution plan/IO/CPU, gerçek çoklu instance/auth/WAN/proxy yükü ve Windows ACL/NTLM/TLS/kurum yedek RPO/RTO operasyonel kabul gerektirir. **N2** bağımlılık uyarıları ve **N6** yayın/asset politikası da ayrı kalır.
