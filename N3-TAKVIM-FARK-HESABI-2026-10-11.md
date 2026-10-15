# N3 — Takvim fark hesabındaki tekrar — 11 Ekim 2026

## Sonuç ve kapsam

Başlangıç **`ff91440`**, temiz `main`. Önceki [sayısal harita doğrulama raporunun](MIMARI-SAYISAL-HARITA-DOGRULAMA-2026-10-09.md) sıradaki okuma/fark maliyeti konusu incelendi. **N3 kısmen giderildi olarak kalır.** Değişmeyen takvimlerin settings için zaten hesaplanan JSON eşitliği, fark hesabında da yeniden kullanılır. Tam SQL snapshot, tam son doğrulama, global transaction kilidi ve bütün sayısal haritaların taranması devam eder.

Gerçek `.env`, hesap, çalışan veritabanı, migration/restore veya çalışan servis kullanılmadı. Geçici Git arşivinde SQL.js ve sentetik veriyle çalışıldı. Bağımlılıklar salt okunur bağlantılarla kullanıldı; eksik kök TypeScript yalnız geçici dizinde mevcut frontend TypeScript paketiyle çözümlendi. Kurulu bağımlılıklara yazılmadı. Yeni güvenlik denetimi veya üretim kapasitesi garantisi değildir.

## Kod ve korumalar

- `backend/store.mjs`: son tam doğrulama ve katalog revision hesabından sonra **saf** settings hazırlığı çalışır. Aynı before/valid çifti persist ve yanıt hazırlığına gider. SQL settings/generation yazımı hâlâ persistence ve audit sonrasında aynı transaction içindedir. Settings hazırlığında hata olduğunda artık persistence başlamaz; önceki ve sonraki hata durumlarında committed veri korunur.
- `backend/mutation-settings.mjs`: eşitlik izni varsayılan olarak kapalıdır. Store, tam doğrulamadan sonra açar. Yalnız `workCalendar` ve `personCalendar` kapsanır; raw JSON eşitliği şarttır. Sonuç aynı iki snapshot nesnesine bağlıdır. Boolean değerler kapalı fonksiyon içinde yakalanır; public equality Map değiştirilerek bir takvim değişikliği saklanamaz. Her transaction yeni sonuç oluşturur; global veya generation'lar arasında cache yoktur. Hazırlanmış çiftin persistence boyunca değişmemesi mevcut Store sözleşmesidir.
- `backend/change-set.mjs`: sadece bu izinle, değişmediği bilinen takvim için boş fark döner. Değişen takvimler, normalizasyon/default farkları, başka snapshot çiftleri ve bağımsız çağrılar mevcut kayıt karşılaştırmasına devam eder. Tahsis, gerçekleşen, saat/yüzde, proje, kaynak, liderlik ve takım kayıtlarının fark hesabı aynı kalır.
- `backend/planning-writer.mjs`: aynı ortak change-set persistence ve audit tarafından kullanılır. SQL tanımlayıcıları sabit katalogdan, değerler parametrelerden gelir. API yetki, revision, generation, aylık kapasite ve cascade kontrolleri değiştirilmedi. Şema/migration/bağımlılık değişmedi.

## Ölçüm ve eşdeğerlik

Node **24.21.0**, macOS, geçici SQL.js. Önce değişmemiş `ff91440`, sonra aday sürüm aynı benchmark ile ölçüldü. İkisinde de 200 çalışan, 10.000 actual, 1.000 yüzde ve 10.000 kişisel takvim kaydı; warm-up + 7 örnek; owned planning komutuyla tek hücre ve delta yanıt.

| Planlanan hücre | Read medyanı önce/sonra | Persist medyanı önce/sonra | Pipeline medyanı önce/sonra |
|---|---:|---:|---:|
| 10.000 | 44,13 / 44,68 ms | 13,02 / 7,64 ms | 157,46 / 158,99 ms |
| 50.000 | 121,59 / 121,59 ms | 29,60 / 24,39 ms | 337,43 / 327,98 ms |

**Tam nihai snapshot digest'leri eşit.** SQL okunan/yazılan satırlar, change-set sayıları, doğrulama/settings/yanıt çağrı sayıları ve yanıt boyutları eşit. Benchmark ayrıca ilgisiz model alanlarının korunmasını, generation/revision, audit toplamlarını ve delta/fresh SQL view eşitliğini assert eder.

Ayrı helper ölçümü, 50.000 planlanan + 10.000 actual kayıtta settings hazırlığı ve fark hesabını beraber ölçer. Referans helper'lar `ff91440` kaynaklarının yalnız test import yolları uyarlanmış kopyalarıdır. Warm-up ardından 9 örnek, önce/sonra çalışma sırası dönüşümlü:

| Kişisel takvim kaydı | Referans medyanı | Aday medyanı |
|---|---:|---:|
| 1.000 | 14,82 ms | 14,35 ms |
| 10.000 | 23,92 ms | 19,21 ms |

Fark çıktıları ve settings SQL değerleri aynıdır. Birim testi, değişmeyen takvimde kayıt başına yeniden JSON çağrısı yapılmadığını; bütün takvimin before/valid kodlamasının hâlâ birer kez yapıldığını doğrudan kontrol eder.

Toplam süre **her boyutta iyileşmedi**. GC, işletim sistemi ve ardışık ölçüm etkileri nedeniyle genel hızlanma yüzdesi veya SLA sonucu çıkarılmaz; medyanlar toplanmaz. Native MSSQL, ağ, HTTP ve concurrent yük ölçülmedi. Tam okuma/doğrulama baskın maliyet olarak sürer.

[Ham sayısal örnekler, dönüşümlü probe kaynağı, kaynak hash'leri ve eşdeğerlik assertion'ları](ci-evidence/calendar-diff-2026-10-11.json). Kanıt gerçek veri/parola/token/ham servis logu içermez.

Store ölçümü yeni geçici çıktı dosyasıyla yeniden üretilebilir; script provider veya gerçek DB yolu kabul etmez ve `.env` yüklemez:

```sh
node scripts/benchmark-store.mjs --sizes=10000,50000 --samples=7 --actuals=10000 --percentages=1000 --calendar-days=10000 --response=delta --command=production --output="$output"
```

## Kontroller

- `node --test tests/calendar-diff.test.mjs tests/change-set.test.mjs tests/mutation-settings.test.mjs tests/planning-snapshot.test.mjs tests/calendar-commands.test.mjs tests/restore.test.mjs tests/record-access.test.mjs tests/audit-log.test.mjs tests/concurrency.test.mjs tests/transaction-profile.test.mjs`: **102/102**, fail/skipped/cancelled 0; yalnız geçici sentetik DB/loopback.
- Yeni 5 test: değişiklik/silme/default/aralık/anahtar sırası eşdeğerliği; gereksiz kayıt JSON çağrılarının kalkması; opt-in ve snapshot bağı; private boolean/Map değişikliği koruması; takvim/izin/eğitim güncellemelerinde saat/actual/revision, audit ve yeniden açılış; saf settings hatasının yazmadan geri dönmesi. Son iki test geçici SQL.js entegrasyonudur.
- Mevcut testler: rol/yetki ve stale revision reddi, aylık kapasite, cascade/restore, invalid ilgisiz verinin son doğrulamada reddi, concurrency, audit/disk/response hata rollback ve restart.
- `npm run format:check`, `npm run check:domain` (**36 shared dosya**), `npm run build`, `npm run deploy:verify`: geçti.
- `node scripts/check-deployment-package.mjs`: **407 kaynak / 7 güncel çıktı**, 430 tarihî çıktı temiz paket dışında; geçti. Frontend bundle/HTML/CSS byte'ları önceki derlemeyle aynı.
- Yeni test Windows kalite listesine eklendi; Linux glob'u otomatik alır. **Bu kaynak için Windows, Native MSSQL veya GitHub CI koşusu yapılmış sayılmaz.**

İlk yeni entegrasyon testinin beklenen audit değeri JSON string, API okuması array idi; assertion aynı gösterime normalize edilerek düzeltildi. Başarısız ilk koşu 102 geçen teste dahil edilmez. Uygulama davranışı bunun için değiştirilmedi.

## Aktarım ve kalan işler

Test edilmiş kaynaklar ve manifest, mevcut hash'ler doğrulanıp geri alınabilir dosya yedeği oluşturularak Git ve uygulama kopyasına aktarıldı. Gerçek `.env`/data aktarım dışındadır; bağımsız yerel milestone testi korunur. **Çalışan backend yeniden başlatılmaz; yeni backend kodu bir sonraki yeniden başlatmada yüklenir.** Otomatik commit/push yapılmaz.

N3'ün tam snapshot/global kilit, gerçek eşzamanlı yük, kuyruk sınırı ve native p95/p99 kabulü sürer. Sonraki çalışma tam okuma ve kilit maliyetinin güncel native test ortamında ayrılmasıdır; yalnız değişen satırı doğrulayarak bütünlük kurallarını atlamak önerilmez. N2 bağımlılık ve N6 canlı yayın/eski asset politikası bu tur yeniden incelenmedi. Kurum TLS/proxy/CA, servis hesabı/ACL ve yedek RPO/RTO kabulü yerel SQL.js ölçümüyle doğrulanamaz.
