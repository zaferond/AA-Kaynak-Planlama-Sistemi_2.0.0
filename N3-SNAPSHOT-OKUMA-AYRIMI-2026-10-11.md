# N3 — Snapshot okumasının veri sınıfına göre ölçülmesi — 11 Ekim 2026

## Sonuç

Başlangıç `8b0ac30b4daff9b9c2946af239971d6146dd60b6`; ölçüm/test commit'i **`8fcd188a04be29d2b9c74fc1a722855c6cc6e90e`**. [Önceki bağımlılık sözleşmesindeki](N3-PLANLANAN-HUCRE-DOGRULAMA-BAGIMLILIKLARI-2026-10-11.md) sıradaki okuma/materialization maliyetini ayrıştırma işi ele alındı.

**N3 kısmen giderildi.** Bu adım gözlemlenebilirlik ve güvenli sentetik ölçüm ekler; yeni performans algoritması veya dar commit yolu değildir. Backend/shared/frontend üretim kodu, sorgular, şema, yetki, kilit, son doğrulama, revision/audit/generation ve yanıt davranışı değişmedi. 447 mevcut çıktı ve yedi release dosyası bayt olarak aynı.

## Değişiklik ve ölçüm sınırı

`scripts/transaction-profile.mjs` içinde ayrı async snapshot kapsamı, yalnız `Store.read` sırasında tamamlanan başarılı adapter isteklerini sayar. Kimlik doğrulama, hedef hücre ön kontrolü, audit ve admin kullanıcı projeksiyonu snapshot maliyetine yazılmaz. Eşzamanlı işlemler ile transaction içi tekrar okumalar ayrı kapsamlarını korur; sayaçlar aynı işlem içindeki okumalar boyunca birikir.

| Alan | Ölçülen kapsam |
|---|---|
| `snapshotMetadataMs` | Settings/takvim JSON'u, liderlik/takım, proje/risk/aşama/not ve kaynak/sürüm SELECT istekleri |
| `snapshotNumericMs` | Planlanan, gerçekleşen, çalışılan saat, yüzde ve revision SELECT istekleri |
| `snapshotOtherSqlMs` | Okuyucu içine ileride giren sınıflandırılmamış veya karma istekler |
| `snapshotSqlCalls` | Snapshot kapsamındaki adapter istek sayısı; batch tek sayılır |
| `snapshotBufferedRows` | Buffer edilen sonuç kümelerindeki toplam satır |
| `snapshotStreamedRows` | Streaming consumer'a gelen toplam satır |

Sınıflandırma dahili sabit sorguların tablo adlarına dayanır; bir yetki veya güvenlik kararı değildir. Kimlik doğrulama/ön kontrol aynı tabloyu sorgulasa bile snapshot dışında kalır. Gözlemler SQL parametreleri, satır değerleri, ad, parola veya token tutmaz. Query ve consumer kimlikleri değiştirilmez. Ölçüm kancaları yalnız test Store'larında kurulabilir; gerçek veritabanı bağlamını ayrıca native test runner'ın boş DB/lease kontrolleri sınırlar.

Süreler **istemci adapter isteği** süresidir: ağ bekleme, sürücü decode ve stream consumer çalışması dahildir. Salt SQL Server süresi, IO, CPU veya saf nesne oluşturma maliyeti değildir. `readMs` bu süreleri kapsar ve ayrıca calendar JSON parse/metadata dönüşümleri gibi istek dışı işleri içerir. İç içe süreler ve ayrı p95 değerleri toplanmaz/çıkarılmaz. Satır sayıları heap baytı veya fiziksel IO değildir. Hatalı isteklerin süre/partial satırları yeni sayaçlara dahil değildir; başarısız profil başarılı ölçüm olarak kabul edilmez.

`scripts/native-contention-profile.mjs` yeni alanları ölçüm gözlemlerinde hesaplayıp her grubun özetine taşır. Geçerli yazmada iki snapshot isteği (10 metadata SELECT + 5 numeric SELECT), authenticated okumada 15 snapshot isteği ve bilinmeyen sınıfın sıfır olması assert edilir. Mevcut kapsam/revision/rollback/audit/delta kontrolleri korunur.

## Yerel doğrulama

Ayrı `git archive`, Node 24.21.0/macOS arm64, temiz çevre listesi ve yalnız geçici sentetik SQL.js kullanıldı. Gerçek `.env`, AD/LDAP bağlantısı, hesap veya çalışan veritabanı kullanılmadı; servis başlatma/yeniden başlatma, gerçek migration/restore yapılmadı. Mevcut bağımlılıklar salt kullanım için bağlandı; kurulum/yükseltme yapılmadı.

| Komut | Sonuç |
|---|---|
| `node --test tests/transaction-profile.test.mjs` | **17/17** |
| `npm run verify` | **705/705**, format/domain/TypeScript/build başarılı |
| `node scripts/verify-deployment.mjs` | Başarılı |
| `node scripts/check-deployment-package.mjs` | **423 kaynak / 7 güncel çıktı**, 440 tarihî çıktı paket dışında |
| `git diff --cached --check` | Başarılı |

Başarılı testlerde fail/cancelled/skipped/todo 0. Üç yeni test; metadata/numeric/unknown süre ve satır ayrımı, snapshot dışı auth/ön kontrol/projeksiyonun hariç kalması, sentetik özel metnin rapora girmemesi, eşzamanlı kapsam ayrımı, tekrar okuma birikimi, özgün hata ve scope temizliği/property geri dönüşünü kontrol eder. Native sürücü davranışını taklit eden saf testler gerçek MSSQL doğrulaması olarak sunulmaz.

## Native ve CI kanıtı

Aynı **`8fcd188`** ölçüm/test commit'i için:

- [Kalite 38160426658](https://github.com/zaferond/AA-Kaynak-Planlama-Sistemi/actions/runs/38160426658): Ubuntu **705/705**, Windows **349/349**, Chromium **157/157**; format/domain/TypeScript/build/manifest/temiz paket ve iki high audit kapısı başarılı. [Makbuz](ci-evidence/quality-8fcd188-receipt.json).
- [Native 38160435488](https://github.com/zaferond/AA-Kaynak-Planlama-Sistemi/actions/runs/38160435488): **36/36**, cleanup doğrulandı. Node 24.21.0, SQL Server 16.0.4295.3 Developer/compatibility 160, şema 32. Loopback'e bağlı 4 GiB geçici container, boş `_test` veritabanı, exclusive test lease ve iki bağımsız pool. [Rapor](ci-evidence/native-mssql-8fcd188.json), [makbuz/hash doğrulaması](ci-evidence/native-mssql-8fcd188-receipt.json).
- **533 kaynak/test/workflow hash'i** test edilen commit'e eşleşti. Windows launcher için `.gitattributes` CRLF kuralı uygulandı. İndirilen ZIP SHA256'sı GitHub artifact digest'iyle eşleşti. Kaynak kimliği davranışın tamamının test edildiği anlamına gelmez.
- Native contention: **10.000 planlanan / 4.000 gerçekleşen / başlangıçta 4.000 yüzde**, 80 kaynak, 20 kişisel takvim kaydı; **1/4/12 worker, 16 senaryo, 640 işlem, 340 yazma**. Çalışılan saat override tablosu boş; bu tablo için yoğun yük kanıtı değildir. Ardışık zincirde **40/40 delta**, son durum bağımsız pool'dan tekrar okunan modelle aynı.
- Önceki `8b0ac30` Native raporunun **425 tablo/grup satır sayısı özeti** aynı kaldı. Bu satır kapsamı kontrolüdür; farklı koşuların süre farkından kazanç/gerileme hesabı yapılmaz.
- Başarılı kaynak testlerinde fail/cancelled/skipped/todo 0. Örtüşen işletim sistemi/test kapsamları tek bağımsız toplam olarak toplanmaz. Ham loglar, credential veya bağlantı ayarları Git'e alınmaz. [Yerel kanıt](ci-evidence/snapshot-read-8fcd188-local.json).

### Aynı koşudaki okuma ayrımı

Süreler ms, her ana grup 40 gözlem. Medyanlar ile p95'ler ayrı dağılım özetleridir; toplanmaz veya oranları tek bir isteğin zaman dağılımı sayılmaz. Sayısal süre stream consumer'ı da içerir.

| Akış | Worker | Snapshot medyan / p95 | Metadata medyan | Numeric medyan | Snapshot buffered / streamed satır medyanı |
|---|---:|---:|---:|---:|---:|
| Normal okuma | 1 | 68,376 / 95,724 | 8,613 | 58,828 | 303 / 9.908 |
| Planlanan yazma | 1 | 191,817 / 206,531 | 3,025 | 188,535 | 303 / 32.000 |
| Gerçekleşen yazma | 1 | 185,042 / 209,061 | 2,967 | 181,839 | 303 / 31.980 |
| Normal okuma | 12 | 759,907 / 964,471 | 63,721 | 699,443 | 303 / 9.868 |
| Planlanan yazma | 12 | 188,981 / 212,488 | 3,025 | 185,858 | 303 / 31.960 |
| Gerçekleşen yazma | 12 | 187,752 / 208,230 | 3,047 | 184,561 | 303 / 31.960 |
| Ardışık planlanan delta | 1 | 188,485 / 208,876 | 2,922 | 185,327 | 303 / 31.960 |

Bütün gruplarda `snapshotOtherSqlMs=0`. Geçerli yazmalarda snapshot request sayısı **2**, authenticated okumalarda **15**. Satır sayısı senaryolar ilerledikçe değişebilir: bazı gerçekleşen düzenlemeleri ilgili yüzde girdisini kaldırır; tombstone revision'lar korunur. Bu sayılar kullanıcıya açıklanan veri miktarı değildir; yanıtta kapsam projeksiyonu ayrıca uygulanır.

**Yorum:** bu fixture'da okuma süresinin belirgin yükü tam sayısal stream akışındadır; 303 metadata satırının buffer edilmesini kaldırmak ilk hedef olarak desteklenmiyor. 12-worker planlanan yazmada kilit edinme medyanı **3.232,066 ms**, p95 **3.477,186 ms**; transaction içinde okunan sayısal verinin maliyeti kilidin elde tutulduğu sürenin bir parçasıdır. Ardışık delta yanıtının yaklaşık 297 bayt olması, 31.960 sayısal satırın okunmasını ortadan kaldırmaz.

Bu ölçüm numeric maliyetin ağ/sürücü decode/anahtar oluşturma/map yazma/SQL yürütme arasındaki kesin dağılımını belirlemez. Gerçek execution plan/physical IO/CPU, GC profili, HTTP admission kuyruğu, kurum WAN/proxy/LDAP ve üretim SLA/kapasitesi doğrulanmadı. Hızlanma veya bütün uygulamanın güvenliği/stabilitesi hakkında genel garanti verilmez. Kanıt arşivinin sonraki dokümantasyon commit'i yeni Native koşu sayılmaz; test edilen kaynak kimliği `8fcd188` olarak korunur.

## Kontrollü aktarım

Üç ölçüm/test dosyası ve güncel manifest başlangıç hash'leri kontrol edilerek iki uygulama klasörüne aktarıldı. Yedek `.deployment-backups/n3-read-breakdown-20261011T173720Z`. Runtime'a özgü iki test korundu; uygulama çıktıları değişmedi. Diskteki dosya eşitliği çalışan sürecin yeni kod yüklediği anlamına gelmez; bu adım uygulama davranışı değiştirmez.

## Kalan sıra

1. **N3 için sıradaki dar çalışma:** tam sayısal satır kapsamını koruyup MSSQL composite anahtarların taşınması/oluşturulmasını ayrı bir kontrollü prototipte ölçmek. Mevcut üç anahtar + değer kolonları yerine SQL.js yolundakine benzer anahtar + değer projeksiyonu değerlendirmeye adaydır; henüz uygulanmış veya hızlı olduğu kanıtlanmış değildir. Türkçe/Unicode, eski separator içeren kimlikler, sıfır, tombstone, kolon tipleri/uzunlukları, JSON/map sırası, hata/drain ve tam commit sözleşmesi korunmalı; eşdeğerlik ve aynı ortam karşılaştırması geçmeden devreye alınmamalı. Dar hedef hücre commit'i için tam validator'ın ilgisiz hata/normalizasyon sözleşmesi hâlâ engeldir. Global kilit veya son validation doğrudan kaldırılmamalı.
2. N2: Backend Orta bağımlılık uyarısı; yayımlanmış upstream çözüm ve maruziyet yeniden kontrol edilmeden kapanmış sayılmaz.
3. N6: Kurum ortamında atomik canlı yayın, eski asset saklama/temizlik ve rollback kabulü.
4. Gerçek LDAP/LDAPS, Windows servis hesabı/ACL/NTLM, proxy/TLS/CA, SQL execution plan/IO/CPU, çoklu instance ve gerçek yük, kurum yedek RPO/RTO ayrı ortam kabulü gerektirir.
