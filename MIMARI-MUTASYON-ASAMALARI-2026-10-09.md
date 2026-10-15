# Mutasyon aşamaları ve takvim karşılaştırması — 9 Ekim 2026

## Özet

Başlangıç commit'i **`c00259ae8b097e1066e52a6111c2d2be2742cc64`**, temiz `main == origin/main`. Önceki N3 ölçüm raporunun ardından tam son doğrulama, settings hazırlama ve yanıt üretme maliyetleri ayrı ölçüldü. Takvim/legacy JSON'un aynı transaction'da settings ve yanıt için tekrar kodlandığı doğrulandı; bu tekrar kaldırıldı.

**N3 kısmen giderildi olarak kalır.** Tam snapshot okuma, tam son doğrulama ve global kilit korunur. Dar değişiklik, settings için zaten hesaplanan JSON eşitliğini aynı doğrulanmış before/valid çiftinin yanıtında yeniden kullanır. Cache yalnız üç sabit metadata alanı için boolean içerir; kullanıcılar, istekler veya generation'lar arasında saklanmaz.

Gerçek `.env`, hesap, veritabanı ve servis kullanılmadı. Tüm test ve ölçümler geçici/sentetik SQL.js ortamındadır. Frontend/shared iş kuralları ve schema/migration değiştirilmedi. Bu kaynak için Native MSSQL yeniden çalıştırılmadı.

## Kod kanıtı ve davranış

- `backend/store.mjs`: `validateSnapshot` aynı shared `validate` fonksiyonunu aynı previousResources seçeneğiyle çağırır. Doğrulama kapsamı azaltılmaz. `prepareMutationView` aynı transaction bağlantısıyla metadata, delta fallback, yeniden okuma ve rol kapsamını yönetir; import result envelope ve generation davranışı korunur.
- `backend/mutation-settings.mjs`: SQL sütunları sabit listeden gelir, değerler parametre olarak kalır. Her before/valid settings değeri bir kez kodlanır. `legacyArchive`, `workCalendar`, `personCalendar` için yalnız raw JSON eşitliği Map'te tutulur ve yanıt hazırlarken kullanılır.
- **Raw metadata ile depolama eşitliği ayrıdır.** `undefined → {}` veya `undefined → null`, veritabanında aynı fallback'e karşılık gelse de metadata normalizasyonudur; transaction içindeki yeniden okuma hâlâ yapılır. Bilinmeyen/diğer metadata alanları eski JSON karşılaştırmasından geçer. Kaynak/proje/takım normalizasyonu cache'e dayanarak atlanmaz.
- `scripts/benchmark-store.mjs`: son tam doğrulama, settings ve yanıt aşamaları süre/sayı olarak ayrı raporlanır. Owned planning komutu timer callback'ine sarılmaz; WeakSet marker ve dar draft yolu korunur. Her mutasyonda bir son doğrulama ve bir settings hazırlığı, seçilen yanıt moduna uygun response çağrı sayısı assert edilir.
- `tests/mutation-settings.test.mjs`: eski settings döngüsü oracle olarak kullanılarak 121 before/valid kombinasyonu karşılaştırılır; SQL parametreleri, null/falsy fallback, property sırası, Türkçe/özel karakterler, raw default normalizasyonu, bilinmeyen metadata ve transaction'lar arasında cache paylaşılmaması kontrol edilir. Takvim kodlama sayısının **before + valid için toplam 4'ten 2'ye** indiği doğrudan spy ile doğrulanır.
- `tests/planning-snapshot.test.mjs`: validation/settings/response aşamalarının her birine ayrı hata enjekte edilir; veri, audit, generation ve disk dosyası korunur. Yeniden açılan geçici Store'da aynı commit görülür. Önceki revision/yetki/aylık limit/delta/normalizasyon/commit hatası testleri de geçer.

## Ölçüm

macOS, Node **24.21.0**, SQL.js. İki ardışık sürüm, iki veri boyutu, her biri warm-up ardından 7 örnek. Ortak veri: 10.000 planlanan hücre, 10.000 gerçekleşen hücre, 1.000 yüzde kaydı, 200 çalışan. Kişisel takvim 1.000 veya 10.000 kayıttır. Tek planlanan hücre değiştirilir, delta yanıt alınır.

Referans, başlangıç kodunun aşamaları yalnız ölçüm için ayrılmış ve eski çift JSON karşılaştırması korunmuş halidir; başlangıç Git Store'u byte olarak aynısı değildir. Referans ölçümden önce 32 testle kontrol edildi. Referans ve yeni Store/benchmark/helper hash'leri kanıtta bulunur. Her veri boyutunda **tam nihai snapshot digest'leri eşit**, değiştirilmeyen tüm model alanları korunmuş, audit/revision/generation sayaçları doğru.

| Takvim kaydı | Sürüm | Son tam doğrulama medyanı | Settings hazırlama medyanı | Yanıt hazırlama medyanı | Mutasyon/yanıt medyanı |
|---|---|---:|---:|---:|---:|
| 1.000 | Referans | 52,70 ms | 0,38 ms | 5,36 ms | 123,82 ms |
| 1.000 | Yeni | 49,12 ms | 0,38 ms | 4,92 ms | 118,87 ms |
| 10.000 | Referans | 74,56 ms | 4,78 ms | 9,94 ms | 166,13 ms |
| 10.000 | Yeni | 68,89 ms | 4,78 ms | 5,19 ms | 154,87 ms |

Takvim kodlama tekrarının kaldırılması kod/testle kanıtlanır. Son doğrulama aynı işlemi yapar; tablodaki doğrulama/okuma farklarını bu düzeltmeye bağlamıyorum. İşletim sistemi, GC ve ardışık koşu etkileri nedeniyle toplam süre farkı üretim hızlanma oranına çevrilmez. Yedi örneğin p95'i en yüksek örnektir; gerçek yük/SLA kanıtı değildir.

`validateSnapshotMs` yalnız Store'un son doğrulamasıdır; double-validation referans modundaki staging doğrulaması ayrıca domainMs içine dahildir. `prepareMutationViewMs`, metadata karşılaştırması + delta/full projection ve gerekirse aynı transaction'daki yeniden okumayı içerir. `readMs`, response yeniden okumalarıyla örtüşür. JSON encode/decode/istemci merge ayrı zamanlanır; HTTP/ağ/tarayıcı ölçülmez, medyanlar toplanmaz.

[Sayısal örnekler, konfigürasyon, kaynak hash'leri ve model digest eşitliği](ci-evidence/mutation-stages-2026-10-09.json). Gerçek kişi/veri, parola, token veya ham servis logu içermez.

Yeniden üretim (çıktı yeni geçici dosya yolu olmalı; gerçek `.env` yüklenmez, provider/DB yolu seçme seçeneği yoktur):

```sh
node scripts/benchmark-store.mjs --sizes=10000 --samples=7 --actuals=10000 --percentages=1000 --response=delta --calendar-days=10000 --output="$output"
```

## Yerel kontrol ve ortam

Temiz Git arşivi geçici dizine çıkarıldı; lock dosyaları doğrulanmış mevcut test bağımlılıkları kullanıldı. Build/paket çıktıları yalnız geçici dizine yazıldı. Gerçek DB/servis ve kurulu bağımlılıklara yazılmadı. Uygulama klasöründeki mevcut yerel test değişikliği koruma kapsamındadır.

| Komut | Sonuç |
|---|---|
| `node --test tests/mutation-settings.test.mjs tests/planning-snapshot.test.mjs tests/benchmark-command.test.mjs tests/mutation-snapshot.test.mjs` | **38/38**, fail/skipped/cancelled 0; yalnız geçici/sentetik veri. |
| `npm run check:domain` | 35 shared kaynak dosyasının AST bağımlılık kontrolü geçti. |
| `npm run format:check` | Geçti, salt okunur biçim kontrolü. |
| `npm run build` | TypeScript + frontend build geçti; geçici çıktı. |
| `npm run deploy:verify` | Kaynak/site hash'lerinde changed/missing/added 0. |
| `node scripts/check-deployment-package.mjs` | 400 kaynak, 7 güncel çıktı, 406 tarihî çıktı hariç; geçici temiz paket kabulü geçti. |
| Dört benchmark koşusu | Her biri 7 örnek; draft/doğrulama/settings/response sayıları, tam model, audit/revision/generation ve SQL view eşitliği geçti. |

Yeni 5 helper testi Windows süitine eklendi; mevcut Windows planning testi yeni aşama hata/rollback kontrolünü de içerir. Genel Linux süiti bu testleri otomatik alır.

## CI kanıtı ve aktarım kontrolü

Test edilen kaynak **`a5661f8d63cac67a5fd3ad0507eb4de9967d1a0b`**. [Kalite koşusu 37924961901](https://github.com/zaferond/AA-Kaynak-Planlama-Sistemi/actions/runs/37924961901) başarılı: **Ubuntu 613/613**, **Windows 263/263**, **Chromium 145 kontrol**. Fail/skipped/cancelled 0; Windows ve genel süit örtüşür, toplamlar toplanmaz. Biçim/domain/TypeScript/build/manifest, iki işletim sisteminde temiz paket kabulü ve iki audit Yüksek eşiği geçti. Audit eşiği backend Orta bağımlılık uyarısını kapatmaz.

[Metadata, test toplamları ve indirilen log hash kaydı](ci-evidence/quality-a5661f8-receipt.json). Ham loglar, kişisel veriler veya bağlantı bilgileri Git'e eklenmez. Sonraki kanıt/dokümantasyon commit'i uygulama kodunu değiştirmez ve ayrı tam CI başarısı iddiası değildir.

Aktarım ön kontrolü önceki manifest/file hash'lerini, yerel test değişikliğinin korunmasını ve doğrulanmış geçici derlemeyle **400 kaynak / 413 site çıktısı / 7 güncel çıktı** eşitliğini denetledi. Frontend çıktıları byte olarak aynı; yeni bundle veya tarihî çıktı silme işlemi yoktur. Seçilen kod/test/CI/rapor dosyaları geri alınabilir yedekle aktarılır, manifest son yazılır. Yedek: `.deployment-backups/2026-10-09-mutation-stages-final`. Çalışan servis yeniden başlatılmaz ve gerçek DB'ye işlem yapılmaz; backend dosyaları sonraki servis başlatmada yüklenir.

## Kalan işler

1. **N3:** yaklaşık 49–75 ms'lik tam doğrulama ve 39–48 ms'lik tam okuma bu sentetik yükte başlıca maliyetler. Sıradaki dar inceleme sayısal harita şema doğrulamasının maliyetini ayırmak ve davranış eşdeğerliğini koruyabilecek iyileştirmeyi değerlendirmek olmalı. Yalnız değişen satırı kontrol etmek, normalizasyon/cascade/aylık sınır kontrollerini atlamak veya owned olmayan komutlara dar draft açmak bu değişikliğin parçası değildir.
2. **Doğrulanamadı:** bu kaynakta Native MSSQL kilit beklemesi, gerçek concurrent yük/bellek, Windows servis ACL, proxy/TLS, kurum CA/SQL yetkileri, yedek RPO/RTO ve SLA kabulü. Yerel kod veya SQL.js ölçümü bunları kapatmaz.
3. Önceki **N2 Orta bağımlılık** ve **N6 canlı yayın/eski varlık saklama** çalışmaları ayrıca sürer. Yüksek audit eşiğinin geçmesi, bütün bağımlılık uyarılarının giderildiği anlamına gelmez.

Bu rapor kapsamlı yeni güvenlik denetimi veya uygulamanın tamamı için güvenlik/stabilite garantisi değildir; mevcut kontrolleri koruyan dar performans ve test edilebilirlik çalışmasının kanıtıdır.
