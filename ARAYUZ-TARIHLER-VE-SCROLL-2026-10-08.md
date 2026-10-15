# Üst açıklama tarihleri ve tablodan ana sayfaya kaydırma

8 Ekim 2026; başlangıç `63301011492d5ed2f51a13318819a8fb8ae4f33f`. N5'in ağ/taslak koruma değişiklikleri korunur.

- Başlık Düzenle ekranındaki **Tarih Aralığı** başlangıç/bitiş alanları salt okunurdur. Elle tarih değiştiren handler'lar kaldırıldı, açıklama metni güncellendi. Alt not tarihi değişince mevcut ortak `rangeWithNoteDates` kuralı üst aralığı en erken/en geç dolu not tarihlerinden hesaplar. Hem genişleme hem daralma desteklenir. Tarih aralığının milestone'a dönüştürülmesi ve tek tarihli milestone tarihi düzenlenebilir kalır.
- Daha önce saklanan manuel üst aralıklar açılışta topluca değiştirilmez; ilgili alt not düzenlendiğinde hesaplanır. Takvim sınırı, geçersiz/eksik tarih ve diğer barlarla çakışma kontrolleri korunur. Backend/shared iş kuralı, migration veya veritabanı dönüşümü değiştirilmedi.
- Proje/planlanan ana tablosu ve özet tablosundaki `overscroll-behavior-y: contain`, `auto` oldu; gerçekleşen tabloda da `auto` açıkça tanımlandı. Tablo üst sınırındayken yukarı mouse wheel ana sayfada devam eder. Yeni wheel handler, global preventDefault veya yapay scroll eklenmedi. Alt sayfa sınırı, iç tablo kaydırması, yatay kaydırma ve frozen sütunlar korunur.

## Yerel doğrulama

Gerçek `.env`, hesap, veritabanı veya çalışan servis kullanılmadı. Önceki temiz bağımlılıklı geçici kaynak kopyasında sınırlı ortam ile derleme yapıldı. Browser testleri yalnız sentetik SQL.js, rastgele loopback port ve Chrome kullanır.

| Kontrol | Sonuç |
|---|---|
| `node --test tests/milestone-note-dates.test.mjs tests/milestone-point.test.mjs` | **16/16**, fail/cancelled/skipped 0 |
| Hedefli browser çalıştırıcısı: `checkMilestoneParentDates` + `checkViewportScroll` | **10** grup başarılı; üst alan klavye ile değişmez, alt tarihlerin iki yönlü etkisi HTTP kaydında ve yeniden açılışta korunur; milestone tarihi düzenlenebilir; üç tablodan ana sayfaya yukarı wheel geçer |
| `npm run build` | TypeScript/site başarılı |
| `npm run format:check`, `npm run deploy:verify`, `git diff --check` | Başarılı |

Plan/proje kaydırma kontrolü 1800×1050 ve 1000×720 viewport'larda, aylık/haftalık görünüm ve mevcut özet/grup kontrolleriyle çalışır. Gerçekleşen kontrolü ayrı sentetik çalışan bağlamında çalışır. Dokunmatik cihaz ve kurum tarayıcısı davranışı ayrıca doğrulanmadı.

## CI ve aktarım

Kaynak **`07b889a94b7dc2b9ef798a2b6d1f22a7d30d9070`** için [37815612801 kalite koşusu](https://github.com/zaferond/AA-Kaynak-Planlama-Sistemi/actions/runs/37815612801) başarılı: Ubuntu **557/557**, Windows **208/208**, Chromium **140**; fail/cancelled/skipped 0. Format/domain/TypeScript/build/manifest ve iki Yüksek eşikli audit kapısı geçti. [Koşu kaydı](ci-evidence/quality-07b889a-receipt.json) ham log veya sır içermez; Windows/hedefli sonuçlar genel süitle örtüşür. N5'in beş browser senaryosu da bu genel koşuda korundu. Sonraki belge/kanıt commit'i yeni test edilmiş kaynak iddiası değildir.

Kaynak ve derleme, `.deployment-backups/2026-10-08-date-scroll-final` yedeğiyle uygulama kopyasına aktarıldı. Kanonik ve uygulama manifesti **386 kaynak / 405 artifact** için kaynak/artifact changed/missing/added listeleri boş olarak doğrulandı. Eski public varlıklar korunur; N6 yaşam döngüsü konusu burada çözülmüş sayılmaz. Backend yeniden başlatılmadı; arayüz için tarayıcı sayfası yenilenmelidir. Gerçek DB/migration/hesap işlemi yapılmadı. Daha sonraki yalnız belge/kanıt aktarımı ayrı yedekle korunur.

## Boş açıklamanın tarih katkısı — sonraki düzeltme

Başlangıç `bc59d86d43f569f061d94b5055f89cd0e75af6dc`. Kullanıcının bildirdiği durumda `rangeWithNoteDates`, metni boş detayları filtreliyordu. Tarih hesabı artık boş veya yalnız boşluk içeren metinden bağımsız bütün detay tarihlerini kullanır. Eksik/ters tarihli düzenlemede mevcut üst aralığı koruma davranışı devam eder. API şeması, migration veya boş açıklamayı rapora ekleme kuralı değiştirilmedi. Kayıtta mevcut boş metin temizliği uygulanır; üst barın hesaplanan tarihleri saklanır.

Geçici sentetik ortamda dört milestone test dosyası **32/32** geçti (`milestone-note-dates`, `milestone-point`, `milestones`, `milestone-mixed-details`); fail/cancelled/skipped 0. İki hedefli Chrome grubu başarılı: önceki dolu metin/readonly/milestone kontrolleri ve boş/whitespace detay tarihinin üst aralığı iki yönde değiştirmesi, HTTP kaydı ve yeniden açılışta üst aralığın korunması. Rapora Ekle işaretli boş metnin kayıt/revision değiştirmeden reddedildiği ayrıca doğrulandı. İlk browser denemesi bu mevcut kural yüzünden response beklerken başarısızdı; fixture senaryosu doğru rapor seçimiyle düzenlendi, uygulama kuralı gevşetilmedi.

Domain bağımlılık kontrolü, TypeScript/site derlemesi, değişen dosyaların Prettier kontrolü, geçici manifest ve `git diff --check` başarılı. Gerçek DB/hesap/servis kullanılmadı. Bu sonuç, yukarıdaki önceki commit'in 140 browser CI sonucunun yeni düzeltme için tekrar alınması anlamına gelmez; sonraki push kalite koşusu ayrıca izlenir.
