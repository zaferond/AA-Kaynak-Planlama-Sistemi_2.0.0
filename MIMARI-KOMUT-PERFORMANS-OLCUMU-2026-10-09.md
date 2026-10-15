# Komut performansı ölçüm doğrulaması — 9 Ekim 2026

## Sonuç ve kapsam

Başlangıç: temiz `main == origin/main`, `fda36edd96ff357aa56e4c74062122856ac1205c`. 7 Ekim mimari/güvenlik/performans raporundaki **N3 kısmen giderildi** durumunu güncel Store, komut, response, okuyucu ve writer çağrı zinciri üzerinden yeniden kontrol ettim. Bu adım ölçüm aracını düzeltti; uygulamanın iş kurallarını veya doğrulama kapsamını değiştirmedi. Yeni bir uygulama hızlandırması ya da N3'ün kapandığı iddiası değildir.

Gerçek hesaplar, `.env`, çalışan veritabanı ve servis kullanılmadı. Ölçümler geçici dizinde oluşturulup kaldırılan SQL.js veritabanlarında, sentetik admin/çalışan/izin/dağıtım verileriyle yapıldı. Yeni kod yalnız `scripts`, `tests` ve CI kalite kapısındadır; backend/frontend/shared uygulama kodu aynı kaldı.

## Doğrulanan ölçüm hatası

`changeAndView` yalnız allocation değişikliklerinde doğrudan `planningCommand` kullanıyor. Store bu komutu WeakSet üyeliğiyle tanıyor ve yalnız planlanan dağıtım/revision haritalarının kopyalandığı dar draft'ı seçiyor. Eski `benchmark-store` ise `stageChanges` çağrısını genel callback içine sarıyordu. Aynı dağıtım komutu için geniş draft yolunu ölçüyor, mevcut dar draft kazanımını hesaba katmıyordu.

Kanıt zinciri: `backend/change-service.mjs` → `backend/operations.mjs` (`planningCommand`, `isPlanningCommand`) → `backend/store.mjs` (`copySnapshot`) → `backend/mutation-snapshot.mjs`. Ölçümde callback ve production komutlarının draft seçim sayaçları sırasıyla **0/1** ve **1/0**; tüm nihai model digest'leri eşit.

`domainMs` ayrıca yalnız callback içindeki staging süresiydi; Store'un son tam `validate` çağrısını kapsamıyordu. Önceki ölçümler bu sütunla tam doğrulama süresini kanıtlamaz. Bu sınır artık çıktıda açıkça yazıyor. Owned komutu zamanlayıcıyla sarmak tekrar marker kaybına yol açacağından bu modda `domainMs: null` kullanılıyor; ölçülmeyen süre 0 olarak sunulmuyor.

## Yapılan dar düzeltme

- `scripts/benchmark-command.mjs`: varsayılan production modunda gerçek owned komutu doğrudan döndürür. `--command=callback` eski yolun karşılaştırma seçeneğidir. Gerçekleşen komutlar genel draft sınırında kalır.
- `scripts/benchmark-store.mjs`: production/callback modu ve helper hash'i, planlanan/genel draft sayaçları rapora eklenir. Her örnekte beklenen draft türü doğrulanır. Store'un son doğrulaması, revision, generation, audit ve commit kontrolleri korunur.
- Değiştirilen tek hücre/revision/generation dışında **bütün model alanlarının değişmediği** ayrıca doğrulanır; son SQL görünümü ve delta birleşimiyle de eşitlik aranır. Sayı ve son hücre değeri ayrıca kontrol edilir.
- Eski `--validation=double` komutları otomatik callback olarak etiketlenmeye devam eder. Açıkça production + double seçilirse hesap/veritabanı oluşturmadan hata verir.
- Yeni 5 test genel Linux ve seçili Windows CI süitine eklendi. CLI testleri actual/allocation ve production/callback yollarını gerçek geçici Store ile çalıştırır. Sentetik `.env` ve ortam değişkenlerinin başka bir dosyayı/veritabanını seçtiremediği, hatalı seçeneklerin çıktı/DB oluşturmadığı ve geçici DB dosyalarının kaldırıldığı da kontrol edilir.

## Sentetik ölçümler

Her mod için 7 örnek, öncesinde aynı zincirde warm-up. İki koşu sırayla yapıldı; istatistiksel hızlanma veya üretim kapasitesi sonucuna çevrilmez. Ortak veri: **200 çalışan, 10.000 gerçekleşen hücre, 1.000 yüzde kaydı, 1.000 kişisel takvim günü**, SQL.js, Node 24.21.0. Tek planlanan hücre değiştirilir, delta yanıt alınır.

| Planlanan hücre | Komut | Mutasyon/yanıt medyanı | Snapshot okuma medyanı | Draft kopyalama medyanı | Örnek p95 |
|---|---|---:|---:|---:|---:|
| 1.000 | Eski callback | 90,37 ms | 25,43 ms | 5,41 ms | 105,38 ms |
| 1.000 | Mevcut production | 86,59 ms | 26,02 ms | 2,23 ms | 102,49 ms |
| 10.000 | Eski callback | 118,96 ms | 39,38 ms | 10,85 ms | 132,50 ms |
| 10.000 | Mevcut production | 115,86 ms | 41,34 ms | 5,20 ms | 132,09 ms |

`pipelineMs` mutasyon + seçilen yanıt okumasını ölçer. JSON encode/decode ve istemci merge ayrı ölçülür; HTTP/ağ/tarayıcı süresi değildir. İç içe sürelerin medyanları toplanmamalıdır. Yedi örneğin p95'i en yüksek örnektir; operasyonel p95/SLA kanıtı değildir. Tam doğrulama/audit/settings/projection/GC maliyetleri bu çalışmada ayrı ölçülmedi; kalan zamanı sadece validation'a atfetmiyorum.

[Sürüm/hash, konfigürasyon, ham sayısal örnekler ve nihai snapshot digest'leri](ci-evidence/store-command-2026-10-09.json). Gerçek kişi/kayıt, parola veya ham servis logu içermez. İki boyutta callback/production nihai snapshot SHA256 değerleri aynı; her mutasyonda yalnız bir allocation kaydı değişti.

Yeniden üretim (uygulama Git deposunda, `.env` yüklemeden; `$output` yeni bir geçici dosya yolu olmalı, var olan dosya üzerine yazılmaz):

```sh
node scripts/benchmark-store.mjs --sizes=1000,10000 --samples=7 --actuals=10000 --percentages=1000 --response=delta --command=production --output="$output"
```

Aynı komutu yeni bir çıktı dosyası ve `--command=callback` ile çalıştırarak karşılaştırın. Provider veya DB dosyası seçme argümanı yoktur; betik yalnız geçici SQL.js kullanır.

## Yerel kontroller

Kaynaklar temiz Git arşivinden geçici dizine çıkarıldı; kilit dosyaları doğrulanmış mevcut test bağımlılıkları kullanıldı. Derleme/paket çıktıları yalnız geçici dizine yazıldı. Uygulama klasöründeki önceden var olan yerel test değişikliği korunur.

| Komut | Sonuç / ortam |
|---|---|
| `node --test tests/benchmark-command.test.mjs tests/planning-snapshot.test.mjs tests/mutation-snapshot.test.mjs tests/change-set.test.mjs` | **37/37**, fail/skipped/cancelled 0; yalnız geçici/sentetik veri. Mevcut scope, yetki, revision, aylık sınır, unrelated-invalid-data, disk hatası, rollback/reopen ve delta fallback kontrolleri geçti. |
| `npm run check:domain` | 35 shared dosya, AST bağımlılık kontrolü geçti. |
| `npm run format:check` | Geçti; salt okunur biçim kontrolü. |
| `npm run build` | TypeScript + frontend build geçti; geçici çıktı. |
| `npm run deploy:verify` | Kaynak/site hash'lerinde changed/missing/added 0. |
| `node scripts/check-deployment-package.mjs` | 399 kaynak, 7 güncel çıktı, 406 tarihî çıktı hariç; geçici temiz paket kabulü geçti. |
| İki karşılaştırmalı benchmark | Her modda iki boyut × 7 mutasyon; tüm veri/audit/revision/generation/draft/model koruma kontrolleri geçti. |

İlk yeni test denemesinde gerçekleşen hücre için yanlışlıkla iki okuma bekleniyordu; metadata değişmediği için mevcut Store bir okuma kullanıyor. Test beklentisi güncel çağrı zincirine göre düzeltildi; uygulama değiştirilmedi. Son 37 testlik koşu başarılıdır.

## CI kanıtı ve aktarım kontrolü

Test edilen kaynak **`7c46c23bee294a410ee885c7a51d5f9ae9dc6c64`**. [Kalite koşusu 37918831327](https://github.com/zaferond/AA-Kaynak-Planlama-Sistemi/actions/runs/37918831327) başarılı: **Ubuntu 607/607**, **Windows 257/257**, **Chromium 145 kontrol**. Fail/skipped/cancelled 0; Windows ve genel süit örtüşür, toplamlar toplanmaz. Biçim/domain/TypeScript/build/manifest, iki işletim sisteminde temiz paket kabulü ve iki audit Yüksek eşiği geçti. Audit eşiği backend Orta bağımlılık uyarısını kapatmaz.

[Metadata, test toplamları ve indirilen log hash kaydı](ci-evidence/quality-7c46c23-receipt.json). Ham loglar, kişisel veriler veya bağlantı bilgileri Git'e eklenmez. Sonraki kanıt/dokümantasyon commit'i uygulama kodunu değiştirmez ve ayrı tam CI başarısı iddiası değildir. İlk kaynak gönderimine ek olarak forced-full-copy sayacı ve kabul kontrolü daraltıldı; kanıt son kaynak commit'ine aittir.

Aktarım ön kontrolü önceki manifest/file hash'lerini, yerel test değişikliğinin korunmasını ve doğrulanmış geçici derlemeyle **399 kaynak / 413 site çıktısı / 7 güncel çıktı** eşitliğini denetledi. Frontend çıktıları byte olarak aynı; yeni bundle üretilmedi veya tarihî çıktı silinmedi. Seçilen kod/test/CI/rapor dosyaları geri alınabilir yedekle aktarılır, manifest son yazılır. Yedek: `.deployment-backups/2026-10-09-store-command-final`. Çalışan servis yeniden başlatılmaz; gerçek veritabanına işlem yapılmaz.

## Kalan iş ve önerilen sıra

1. **N3 kısmen giderildi:** tam snapshot okumaları, tam nihai doğrulama ve global transaction kilidi sürüyor. Sonraki dar çalışma tam doğrulama/response maliyetini ayrı ölçmek ve eşdeğerlik kanıtıyla pahalı aşamayı azaltmak olmalı. Owned olmayan callback'lere dar draft veya doğrulama atlama uygulanmamalı.
2. Yerel SQL.js sonucu Native MSSQL lock beklemesi, gerçek concurrent yük/bellek, Windows servis ACL, proxy/TLS veya kurum SLA kabulünün kanıtı değildir. Bu kaynak için yeni native koşu çalıştırılmadı.
3. Önceki **N2 Orta bağımlılık** ve **N6 canlı yayın/eski varlık saklama** konuları bu adımda kapatılmadı. Kurum CA/SQL yetkileri, yedek RPO/RTO ve gerçek yük kabulü ayrıca doğrulanmalı.

Bir performans optimizasyonunu ölçmeden kapatmak yerine, karşılaştırma artık gerçek komut sınırını ve ölçülmeyen aşamaları doğru gösteriyor. Uygulamanın tümü için güvenlik veya stabilite garantisi çıkarılmaz.
