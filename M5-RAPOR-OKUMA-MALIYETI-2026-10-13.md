# M5 — Gerçekleşen dağılım ve aktivite raporu okuma maliyeti

> **14 Ekim 2026 — M6 ek doğrulaması:** Dar gerçekleşen/aktivite SQL okumaları, tam snapshot referansıyla **native MSSQL üzerinde** karşılaştırıldı; Windows ve tarayıcı regresyonları da geçti. Aşağıdaki performans sayıları yerel SQL.js ölçümüdür; gerçek yük/SLA ve kalan tam yazma snapshot/kilit maliyeti doğrulanmış veya giderilmiş sayılmaz. Test edilen bütünleşik kaynak `0193506`; [M6 kanıtı](M6-NATIVE-CI-YAYIN-KABULU-2026-10-13.md). Aşağıdaki özgün kayıt 13 Ekim’deki yerel aşamayı anlatır.

Tarih: 13.10.2026. Başlangıç commit'i: `ee4ebbd3d014454fadf7dbfaba40892028fea1f0`; M1–M4 çalışma ağacı değişiklikleri korundu. Node 24.21.0.

## Durum

**Hedeflenen GET iyileştirmesi tamamlandı; gerçek MSSQL yük/kapasite kabulü doğrulanmadı.** Gerçekleşen görünüm ve aylık aktivite raporu artık tam yazma snapshot'ı okumaz. Başarılı yazmaların tam snapshot doğrulaması ve Shared/Exclusive transaction kilitleri korunur. Bu çalışma önceki N3'ün bütün yazma maliyetini veya tüm GET maliyetlerini ortadan kaldırdığı iddiasını taşımaz.

## Kaynak kod değişiklikleri

- `backend/actual-report-reader.mjs`: yalnız gerçekleşen görünüm/aktivite raporu için çalışan, dönem ve gerekli proje kapsamındaki sayısal kayıtları alan ayrı salt okunur model. SQL'de değerler bind parametreleridir; API'den tablo/kolon veya SQL metni kabul edilmez. Tam snapshot olarak persist/backup/restore/validation akışında kullanılmaz.
- `backend/snapshot-metadata-model.mjs`: mevcut SQL → model eşleştirmesi tek yere taşındı. `planning-reader.mjs` tam okuma ve mutation yollarında aynı eşleştirmeyi kullanır. Ortak kurallar kopyalanmadı.
- `snapshot-metadata.mjs`: rapor okumaları plan tahsisleri ve risk kayıtlarını yüklemez. Aktivite ayrıca risk kataloğu, fazlar, milestone'lar ve kişisel yüzdeleri okumaz. Gereksiz HR notu/kodu ve eski arşiv JSON'u rapor metadata sorgusundan çıkarıldı.
- `read-records.mjs`: gerçekleşen tablolarına çalışan, ay aralığı ve gerekiyorsa proje filtresi eklendi. Mevcut streaming/normal-query sözleşmesi ve eksik satır kontrolü korunur. Büyük parametre listeleri veya eski `|` içeren kimlikler kırpılmaz; güvenli geniş okuma fallback'i ve son projeksiyon çalışır.
- `actual-view.mjs`: ekranın düzenlediği gerçekleşen/saat/takvim revision'ları korunur; plan/risk gibi ilgisiz revision anahtarları bu yanıtın dışındadır. İstenen ayların gerçekleşen tombstone'ları ve kişisel takvimin dönem dışındaki revision'ları korunur. Global `/data` ve yazma yanıtının sözleşmesi değiştirilmedi. Bu, eski endpoint'e göre bilinçli bir yanıt daraltmasıdır; haricî bir tüketici plan/risk revision'larını buradan alıyorsa `/data` kullanmalıdır.
- `shared/employee-directory.ts`: bir okumaya ait çalışan/birim indeksi eklendi. Mevcut tekil arama ile aynı atama, statü ve geçerlilik kuralını kullanır; tekrarlı doğrusal çalışan/takım aramaları azaltıldı. Süreçler/istekler arasında veri önbelleği eklenmedi.
- `backend/report-read-admission.mjs` ve `app.mjs`: iki rapor GET'i ortak olarak instance başına **4**, hesap başına **2** eşzamanlı iş kabul eder. Kuyruk yoktur. Hesap sınırı 429, toplam sınır 503 ve `Retry-After: 1` üretir. Mevcut **Tekrar Dene** ile yeniden yüklenir. Hata veya başarıda yuva bırakılır; tarayıcı bağlantısının kopması çalışan sorgunun yuvasını erken boşaltmaz. Bu başlangıç sınırları kapasite garantisi değildir.

## Korunan davranış ve güvenlik sınırları

- Store, aynı salt okunur transaction/Shared lock içinde güncel hesap aktifliğini ve version'ını tekrar kontrol eder. Caller'ın eski rolüne/leader listesine güvenilmez. Son projeksiyon mevcut yetki kurallarını uygular.
- Normal kullanıcı/PO'nun takım görünürlüğü, lider/yönetici alt birimleri, eşleştirilmemiş hesaplar, transfer geçmişi, ayrılış/işbaşı ve gelecekteki aylar korunur.
- İzin çalışma kapasitesinden düşer; eğitim dağıtılan çalışmaya katılır. Manuel saat, yüzde, sıfır değer ve tombstone hesapları korunur. M1'in özel günlük takvim sınırı sürer; meslektaşlar yalnız yetkili aylık toplamları alır.
- Yazma yetkisi genişletilmedi. Mutation, audit, generation, optimistic locking ve tam doğrulama kodları aynı kalır. Ortak transaction kilidi kaldırılmadı; migration eklenmedi.

## Doğrulamalar

| Kontrol | Sonuç |
|---|---|
| Yeni SQL projeksiyon karşılaştırması | **96 karşılaştırma**: 6 kullanıcı/yetki durumu × 4 dönem × gerçekleşen ve 3 aktivite proje seçimi. Tam okuma + aynı iş kurallarıyla üretilen referans sonuçlarıyla birebir eşit. DB model/generation değişmedi. |
| Sorgu gözlemleri | Store raporları `Store.read` çağrısı yasaklandığında da çalıştı. Plan/risk tabloları okunmadı; dönem/çalışan/proje parametreleri sorguda gözlendi. Gerekli revision/tombstone ve kişisel takvim gizliliği doğrulandı. |
| SQL.js ve MSSQL sorgu sözleşmesi | Parametre bağlama; SQL görünümlü/`__proto__` kimlikler; sıfır değer; 901 sahipte kırpmadan fallback. MSSQL kısmı mock sözleşme kontrolüdür, native sorgu yürütme değildir. |
| Eski ayırıcı kimlikler | Yalnız geçici DB'ye tarihsel SQL satırı enjekte edildi; daraltma yerine geniş okuma, aynı sonuçları korudu. Güncel üretim kimlik doğrulaması gevşetilmedi. |
| Okuma kabul sınırı | İki endpoint'in ortak kotası; hesap başına 429; toplam 503; diğer okumalara erişim; bağlantı kopmasında yuvanın korunması; parse/servis hatası sonrasında temizlenme ve tekrar çalışma. HTTP testi sentetik Store kullanır, DB açmaz. |
| `npm run verify` | **802/802**, 0 başarısız/atlanan. Biçim, ortak bağımlılık sınırı, TypeScript tip kontrolü ve üretim derlemesi başarılı. Son benchmark fixture düzeltmesi sonrasında yeniden çalıştırıldı. |
| Hedefli Chromium kontrolleri | **13/13**, 0 sayfa hatası. Alt liderlikte mevcut revision ile düzenleme, özel takvim sınırı, stale/403 reddi; takım görünürlüğü ve eski dönem yanıtları; aktivite statüleri, saat/yüzde, eğitim/izin, transfer/gelecek aylar, filtre, sıralama ve freeze davranışı. |
| `git diff --check` | Başarılı. |
| Git deposu ve çalıştırma kopyasında `npm run build` / `npm run deploy:verify` | İkisi de başarılı; kaynak/derleme farkı yok. Aktarılan M5 kaynak/test dosyaları byte bazında eşleşiyor. |

`scripts/benchmark-fixture.mjs` içindeki sentetik çalışan dağıtımı da düzeltildi: 200 kişi üretilirken doğrudan liderlik birimlerine tekrarlı otomatik Lider atanması yeni tekil Lider kuralına takılıyordu. Benchmark çalışanları gerçek takım birimlerine atanır; plan tahsisi örnekleri liderlik birimlerini kapsamaya devam eder. Üretim sorumluluk doğrulaması değiştirilmedi.

## Yerel ölçüm

Yeni `scripts/benchmark-report-reads.mjs`, yalnız geçici SQL.js ve sentetik veri üretir. DB adresi/provider/.env kabul etmez. Her koşulda 200 çalışan, 4.000 gerçekleşen kayıt, 3 aylık görünüm ve 3 ölçüm örneği kullanıldı; ısınma ölçüme alınmadı. Her sonuç referansla karşılaştırıldı. Aşağıdaki süreler medyandır; **SQL okuma + projeksiyon** içindir. HTTP kimlik doğrulaması, ağ, JSON sıkıştırma, tarayıcı render'ı veya üretim p95/p99 ölçümü değildir.

| Plan tahsisi | Görünüm | Tam referans → yeni süre | SQL'den dönen toplam satır: tam → yeni |
|---:|---|---:|---:|
| 10.000 | Gerçekleşen | 45,42 → 8,08 ms | 32.556 → 1.809 |
| 10.000 | Aktivite | 34,12 → 1,84 ms | 32.556 → 489 |
| 50.000 | Gerçekleşen | 134,74 → 16,79 ms | 112.572 → 1.825 |
| 50.000 | Aktivite | 113,94 → 2,07 ms | 112.572 → 505 |

50.000 tahsis senaryosunda uygulamaya dönen satırlar gerçekleşende **%98,38**, aktivitede **%99,55** azaldı. Bu değerler fiziksel DB sayfa okumaları veya incelenen SQL satırları değildir: filtreli sorgu yine büyük bir tabloyu tarayabilir. Bellek zirvesi ölçülmedi. Referans, mevcut ortak projeksiyonu tam DB okumasıyla çalıştırır; önceki binary'nin HTTP gecikmesi olarak sunulmaz.

Makine tarafından okunabilir yerel sonuç: [ci-evidence/report-read-m5-local-2026-10-13.json](ci-evidence/report-read-m5-local-2026-10-13.json). Bu dosya GitHub CI kanıtı değildir.

```sh
node --test tests/actual-report-reader.test.mjs tests/report-read-admission.test.mjs
npm run verify
node scripts/benchmark-report-reads.mjs --size=10000 --samples=3 --output=/tmp/rapor-10000.json
node scripts/benchmark-report-reads.mjs --size=50000 --samples=3 --output=/tmp/rapor-50000.json
```

Tarayıcı kontrolü geçici kaynak kopyasındaki ayrı runner ile mevcut `checkActualManagerHierarchy`, `checkActualTeamView` ve `checkActivityReport` işlevlerinden çalıştırıldı. Her kontrol grubu kendi sentetik fixture'ını kullandı; gerçek kullanıcı/profil/veritabanı açılmadı.

## Kalan sınırlamalar

1. Başarılı yazmalar, `/data`, yedek/restore ve genel model doğrulaması tam snapshot kullanmaya devam eder. Bunları bu projeksiyonla değiştirmek veri bütünlüğünü bozardı.
2. Yetki ve güncel atama kapsamını belirlemek için organizasyon/çalışan geçmişi metadata'sı hâlâ okunur. Takvimler tek JSON alanında saklandığı için önce JSON okunup ayrıştırılır. Gerçekleşen görünümün proje detayları mevcut ekran sözleşmesi için korunur.
3. 900'ü aşan parametre kapsamı ve eski `|` kimlikleri geniş okumaya dönebilir. Tamamlayıcı son yetki/proje/dönem projeksiyonu korunur; veriler kırpılmaz. Revision sorgusunun fiziksel erişim planı/native indeks kullanımı ölçülmedi.
4. GET kabul sınırı yalnız iki rapor endpoint'ine ve tek instance'a aittir. Çoklu instance ortak kota, diğer GET uçları ve kurum yükünde optimal eşzamanlılık ayrıca değerlendirilmelidir. Başlamış DB sorgusu client bağlantısı koptu diye otomatik iptal edilmez.
5. Native MSSQL yürütmesi, Windows, gerçek AD/TLS/proxy, kurum verisi, p95/p99, bellek zirvesi ve kilit/pool bekleme ölçümü yapılmadı. Yerel SQL.js sonucu üretim kapasitesi garantisi değildir.

Test/ölçüm kaynak kopyalarına `.env`, gerçek `data`, Git deposu ve mevcut site çıktıları alınmadı. Sınırlı çocuk süreç ortamı ve mevcut bağımlılıklar kullanıldı. Geçici kaynak, test DB, browser profilleri ve sentetik görseller temizlendi. Gerçek kullanıcı girişi, çalışan DB'sinde yazma, migration veya restore yapılmadı. Bu tur commit/push ve gerçek uygulama sunucusu yeniden başlatması yapılmadı.

Çalıştırma kopyasına aktarım öncesinde değişen kaynak dosyalarının M5 öncesi içerikleri karşılaştırıldı. Bu kopyanın README'sinde önceden bulunmayan manuel bağlantısı bölümü korunarak yalnız yeni M5 notu eklendi; diğer doküman farklarının üzerine yazılmadı. Backend iyileştirmesinin çalışan servise yüklenmesi için sonraki sunucu başlatması/yeniden başlatması gerekir.
