# Sayısal harita doğrulaması — 9 Ekim 2026

## Kapsam ve sonuç

Başlangıç Git commit’i `1ca0a47f1b7463e2981c3dd0ab531cf78da9153b`. Çalışma ağacı, önceki izin/eğitim aralığı ve çalışan raporu geliştirmelerini içeriyordu; bu adım temiz HEAD üzerinde çalışılmış gibi sunulmaz. Önceki N3 mutasyon aşamaları raporunun sıradaki işi olan sayısal harita doğrulamasının maliyeti ayrıldı ve davranışı koruyan dar iyileştirme uygulandı.

**N3 kısmen giderildi.** Tam snapshot okuma, son tam doğrulama, global transaction kilidi, yetki/revision/generation, audit, referans/tarih/normalizasyon ve aylık kapasite kontrolleri devam eder. Şema, migration ve veritabanı sorguları değişmedi. Gerçek `.env`, kullanıcı, çalışan veritabanı veya dış servis testlerde kullanılmadı.

## Kod ve eşdeğerlik

`shared/numeric-record-schema.ts`, normal veya null prototype’lı sayısal sözlüklerin bütün alanlarını doğrulayıp yeni bir sözlüğe kopyalar. Alt/üst sınır ve revision tam sayı kontrolü kaldırılmaz. Getter, inherited enumerable alan, `__proto__`, sıra dışı nesne veya geçersiz değer varsa eski `z.record(z.number()...)` yoluna döner. Geçersiz girdilerin Zod hata sırası ve nested path’leri korunur. Cache veya önceden doğrulandı işareti yoktur; her kayıt her doğrulamada yeniden denetlenir.

`shared/server-domain.ts` yalnız allocations, actualAllocations, actualWorkedHours, actualPercentEntries ve revisions alanlarının sayısal şema uygulamasını bu yardımcıya taşır. Opsiyonellik ve default davranışı değişmez. Legacy archive ve diğer alanlar aynı şemalardan geçer. Normalizasyon ve iş kuralları aynı tam `validate` fonksiyonunda çalışır. Owned olmayan callback’lere dar taslak açılmaz.

Yeni 6 test, dört sınır politikasını eski Zod şemasıyla karşılaştırır: NaN/Infinity, negatif/sınır değerler, kesirli revision, hatalı türler, null prototype/inherited/symbol/reserved alanlar, getter’ın tek okunması, frozen kaynak, signed zero, bağımsız kopya, nested hata sırası ve 250 deterministik kombinasyon. Windows kalite işine yeni test dosyası eklendi; Linux test glob’u otomatik alır. Bu değişiklik için yeni CI veya Native MSSQL başarısı iddia edilmez.

## Sentetik ölçüm

macOS, Node 24.21.0, geçici SQL.js. 200 çalışan, 10.000 gerçekleşen hücre, 1.000 yüzde, 10.000 kişisel takvim kaydı. Önce ayrı şema/sayısal/iş kuralı maliyeti ölçüldü; ardından aynı veri üzerinde eski/yeni tam doğrulama sırayla ve ters sırayla 9 örnek karşılaştırıldı. Ek olarak gerçek owned planning komutuyla, delta yanıtlı Store hattı her sürümde warm-up ve 7 örnekle çalıştırıldı.

| Planlanan hücre | Sayısal şema eski/yeni medyan | Tam validate eski/yeni medyan | Store son validate eski/yeni medyan | Store mutasyon+yanıt eski/yeni medyan |
|---|---:|---:|---:|---:|
| 10.000 | 9,39 / 6,13 ms | 79,94 / 78,99 ms | 92,56 / 78,70 ms | 182,68 / 160,69 ms |
| 50.000 | 38,97 / 24,88 ms | 128,77 / 116,04 ms | 146,01 / 118,83 ms | 383,32 / 356,73 ms |

Her boyutta tam nihai model digest’leri aynıdır; yalnız hedeflenen hücre/revision/generation değişmiştir. Snapshot, audit, SQL view/delta ve draft türü assertion’ları geçti. Son doğrulama azaltılmadı; işlem ve şema sonucu eski/yeni karşılaştırması ayrı kontrol edildi.

Bunlar yerel sentetik örneklerdir. GC, işlem sırası, dosya commit’i ve sistem yükü toplam süreyi etkiler; tablo üretim hızlanması veya SLA garantisi değildir. Sürelerin medyanları toplanmaz. HTTP, ağ, native SQL lock beklemesi, çok kullanıcı kapasitesi ve kurum veri büyüklüğü ölçülmedi. Ölçümden sonra yapılan Prettier biçimlendirmesinin son hash’leri, ölçüm anındaki schema hash’lerinden ayrı tutulur.

[Ham sayısal örnekler, kaynak hash’leri ve nihai snapshot digest’leri](ci-evidence/numeric-validation-2026-10-09.json). Gerçek kişi/veri, parola, token veya ham servis logu içermez.

Mevcut doğrulama/owned komut ölçümü `.env` yüklemeden yeniden üretilebilir; `$output` yeni bir geçici dosya yolu olmalı:

```sh
node scripts/benchmark-store.mjs --sizes=10000,50000 --samples=7 --actuals=10000 --percentages=1000 --calendar-days=10000 --response=delta --command=production --output="$output"
```

Referans sürüm aynı çalışma ağacının bu değişiklikten önceki server-domain şemasıdır; ilk bölümdeki commit tek başına önceki izin aralığı geliştirmelerini içermez. Provider veya çalışan DB yolu komuta verilemez; bütün DB’ler geçici dizinde oluşturulup temizlenir.

## Kontroller

Git arşivi + mevcut değişikliklerden ayrı geçici kopya kuruldu. Kilit dosyalarıyla uyumlu mevcut geçici test bağımlılıkları kullanıldı; gerçek kurulumun bağımlılıkları değiştirilmedi. Boş npm config ve sınırlı ortam kullanıldı. Derleme ve paket çıktıları geçici ortamda oluşturuldu.

- `node --test tests/numeric-record-schema.test.mjs tests/planning-snapshot.test.mjs tests/mutation-snapshot.test.mjs tests/calendar-commands.test.mjs tests/work-calendar.test.mjs tests/domain.test.mjs tests/restore.test.mjs tests/record-access.test.mjs`: **101/101**, fail/skipped/cancelled 0. Final validation, yetki/revision, ilgisiz invalid veri, normalizasyon/cascade, saat sınırları, audit/disk hata rollback/reopen ve restore korumaları geçti.
- `npm run check:domain`: **36 shared dosya**, AST bağımlılık sınırı geçti.
- `npm run format:check`: geçti.
- `npm run build`: TypeScript ve frontend build geçti.
- `npm run deploy:verify`: kaynak/çıktı hash farkı yok.
- `node scripts/check-deployment-package.mjs`: **403 kaynak, 7 güncel çıktı**; tarihî asset’ler temiz pakete alınmadı.

## Kalan işler

1. N3: tam snapshot okuma ve global kilidin yük altında maliyeti hâlâ sürer. Sonraki çalışma, okuma/diff maliyetinin güncel dar ölçümü ve değişiklik kapsamına göre güvenli eşdeğerlik tasarımıdır; doğrulamayı atlamak önerilmez.
2. N2 Orta bağımlılık uyarısı ve N6 canlı sürüm geçişi/eski asset saklama politikası ayrıca açık kalır.
3. Native MSSQL, Windows servis/ACL, kurum CA/proxy/TLS, yedek RPO/RTO ve gerçek eşzamanlı yük kabulü yerel testlerle doğrulanmadı.

Bu çalışma kapsamlı yeni güvenlik denetimi veya tüm uygulama için güvenlik/stabilite garantisi değildir.

## Aynı çalışma sırasında istenen rapor tasarımı

Sonraki kullanıcı talebiyle grafik renkleri ayrı semantik token’lara taşındı: dağıtılan mavi, gerçekleşen turkuaz, eksik kaynak turuncu, öngörü amber ve etkinlik mor. Çizgi kalınlığı artırıldı, dağıtılan serinin kesikli çizgisi legend’a da yansıtıldı. Hesaplama ve filtre modülleri değiştirilmedi. Kritik Proje Konuları görünümünde koyu proje başlıkları, ayrı başlık bantları, bitişik çizgili/alternatif yüzeyli bullet satırları, okunaklı tarih etiketleri ve tamamlanan konuların yeşil çizili durumu düzenlendi. İşlem düğmeleri ve mevcut işlevler korundu.

Sentetik Chromium ortamında `checkResourceReports` içindeki **5 kontrol** geçti: filtre sabitleme, aylık değerler, top-10/seri seçimi, yüzde etkinlik ve izin raporu filtreleri. Ek görsel kabulde iki proje, dört başlık ve on uzun/kısa/tamamlanan madde 1800/900/480 pikselde görüntülendi; satır taşması olmadığı, tamamlandı çizgisinin korunması ve ekran görüntülemenin modelde yazma yapmadığı kontrol edildi. Görseller kişisel/gerçek veri içermez. Son TypeScript/build/biçim/manifest ve temiz paket kontrolleri aynı kaynaklarda geçti.

## Aktarım doğrulaması

Son çalışma kaynakları geri alınabilir dosya yedeğiyle uygulama kopyasına aktarıldı; gerçek `.env` ve data dosyaları aktarımın dışında kaldı. Mevcut bağımsız yerel milestone testi hash’i korunur. **403 kaynak / 433 site çıktısı / 7 güncel çıktı** iki kopyada aynı hash’lerle doğrulandı. Servis düzgün kapatılıp güncel kaynaklarla başlatıldı; hesabıyla giriş yapmadan localhost HTTP 200 ve index/JS/CSS byte hash’leri test edilen derlemeyle eşleşti. Otomatik commit/push yapılmadı; manifest commit alanı kayıt edilmemiş çalışma ağacı için null olarak kalır.
