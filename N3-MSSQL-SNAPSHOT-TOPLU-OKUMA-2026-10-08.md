# N3 — MSSQL snapshot okumalarında gidiş geliş sayısını azaltma

## Başlangıç ve karar

8 Ekim 2026; başlangıç **`369bd6d0dcbf42e4f78b748bb3a4286d52976c75`**. Önceki [dar taslak ve delta aşaması](N3-PLANLANAN-YAZMA-TASLAK-VE-DELTA-2026-10-08.md) korunur. **N3 kısmen giderildi.**

Tek hücre için yalnız tahsis/izin/proje tarihlerini okumak, mevcut tam doğrulamanın ilgisiz bozuk veriyi de reddetme davranışını korumuyor. Güvenilir bir snapshot geçerlilik işareti veya DB genelinde yeterli kısıtlar olmadan satırları atlayan hedefli yazmaya geçilmedi. Bu aşama tam snapshot'ın içerdiği satırları azaltmaz; SQL'e yapılan ayrı isteklerin sayısını azaltır. Global kilit ve tam doğrulama korunur.

## Dar değişiklik ve sınırlar

- `backend/snapshot-metadata.mjs`: ayarlar, liderlik, risk sistemi, takım, proje, risk, aşama, bar, çalışan ve çalışan sürümü için **10 sabit SELECT** tek katalogdadır. SQL.js/ordinary ve native batch aynı sorguları kullanır; sütun/sıra kuralları değiştirilmez.
- `backend/adapters/mssql.mjs`: transaction context'e `queryMany` eklendi. Aynı SQL transaction sahibinde tek driver `query` ile metadata okunur. Array/sonuç sayısı ve her recordset doğrulanır; eksik set veya SQL hatası kabul edilmiş snapshot oluşturamaz. Olağan `query`, yazma, SQL parametreleri, kilit modu/süresi ve commit/rollback kuralları korunur. Raw adapter bir kullanıcı SQL arabirimi değildir; batch yalnız sunucunun sabit kataloğundan üretilir.
- `backend/planning-reader.mjs`: yalnız `mssql` ve `viewUser` verilmeyen tam snapshot okumasında, context bu özelliği sağlıyorsa toplu okur. SQL.js ve kullanıcı kapsamlı view okumaları eski sırayla ilerler. Tahsis/actual/saat/yüzde/revision tabloları tam okunur; scoped okumalarda mevcut dar SQL filtresi devam eder.
- Snapshot başına 10 metadata SQL isteği **1** olur. Beş sayısal tabloyla tam snapshot okuması **15 → 6** SQL isteğine iner; aynı native transaction içinde ordinary/batch eşitliğiyle doğrulandı. Büyük sayısal tablolar batch'e alınmaz. Metadata satırları o snapshot içinde tüketilir; işlem/hesap/generation arasında cache yoktur.
- Adapter'ın mevcut 45 saniyelik request timeout'u artık metadata batch'inin tümüne uygulanır; kurum veri hacminde bu bütçe ayrıca doğrulanmalıdır. Metadata batch'i tüm metadata setlerini driver'dan birlikte alır; yüksek risk/bar/çalışan hacminde buffer bellek maliyeti dikkate alınmalıdır. Bu çalışma bellek azalması, SQL fiziksel IO veya üretim kapasitesi garantisi değildir.

## Güvenli doğrulama

Git HEAD'den geçici kaynak dizini, önceden temiz kurulmuş bağımlılıklar ve sentetik SQL.js verileri kullanıldı. Gerçek `.env`, çalışan DB/hesap ve servis kullanılmadı. MSSQL driver unit testinde `Request.query`/transaction metotları çağrıdan önce stub edilir; bağlantı açılmaz. Yerel fixture'ın takvimi değiştirilirken yüzdeler mevcut komutla yeniden hesaplanır; gerçek iş kuralı gevşetilmedi. SQL.js testleri gerçek MSSQL sonucu gibi sunulmaz.

| Komut | Sonuç |
|---|---|
| `node --test tests/snapshot-metadata.test.mjs tests/mssql-batch.test.mjs tests/transaction-profile.test.mjs tests/planning-snapshot.test.mjs tests/planning-read-scope.test.mjs tests/read-records.test.mjs tests/concurrency.test.mjs tests/store-persistence.test.mjs` | **75/75**, hata/atlama/iptal 0 |
| `npm run format:check` | Tüm seçili kaynak/testlerde Prettier kontrolü başarılı |
| `npm run check:domain` | 35 shared kaynakta AST sınır kontrolü başarılı |
| `npm run build` | TypeScript/site derlemesi ve son 381 kaynak hash'i başarılı |
| `npm run deploy:verify` | Geçici build kaynak/artifact kontrolü başarılı |

Yeni testler tek batch/tek transaction sahibi, null/zero/Unicode, eksik recordset ve SQL hatası, tekrar/unknown sorgu, yeni snapshot'ta güncel değer, sırayla query fallback, tüm veri ve JSON eşitliği, rol kapsamları ve başarısız okumada komutun çalışmaması/audit/generation'ın korunmasını sınar. Windows kalite kapısına iki yeni test modülü eklendi. Profiler native request'in bütün seçeneklerini korur; metadata'nın tüm setlerini sayar, bir batch'i 10 ayrı roundtrip gibi raporlamaz.

Native suite'te gerçek iki havuzla ordinary ve batch snapshot/JSON eşitliği, sorgu içerik/sırası ve **15/6** sayıları geçti; SQL conversion hatası ile mutation'ın hiç başlamadığı ve verinin/audit'in korunduğu doğrulandı. Mevcut 16 senaryolu profil **640 işlem / 340 yazma** kalır. Planlanan/actual yazmada tek metadata batch, scoped okumada sıfır batch assert'i eklendi.

## Güncel CI kanıtı

Test edilen kaynak **`f798747eb1e9c4b67220efd28ac19fa138a5e9ec`**.

| Koşu | Sonuç |
|---|---|
| [37781214895 kalite](https://github.com/zaferond/AA-Kaynak-Planlama-Sistemi/actions/runs/37781214895) | Ubuntu **538/538**, Windows **189/189**, Chromium **133**; biçim/domain/TypeScript/build/manifest ve backend/frontend Yüksek eşikli audit kapıları başarılı |
| [37781315933 native](https://github.com/zaferond/AA-Kaynak-Planlama-Sistemi/actions/runs/37781315933) | **22/22**; ordinary/batch eşitliği ve SQL hata rollback'i; 16 senaryo / **640 işlem / 340 yazma**, iki havuz, şema **31**, temizlik başarılı |

[Kalite kaydı](ci-evidence/quality-f798747-receipt.json), [native kaydı](ci-evidence/native-mssql-f798747-receipt.json), [byte olarak korunan native JSON](ci-evidence/native-mssql-f798747.json). Native JSON SHA-256: `d190e82894540c0af65e654314b5c333f943a54b936cc8b4e1c6f442fd7d1b32`. **470/470** hash ilgili test commit'iyle eşit; 381 uygulama/derleme/ölçüm girdisi, doğrudan test modülleri ve iki workflow dahildir. `.cmd` için CRLF checkout kuralı kullanıldı. Hash kimliği tüm UI işlevlerinin native yürütüldüğü anlamına gelmez. Ham loglar ve bağlantı/hesap bilgileri Git'e eklenmedi. Tüm başarılı toplamlar fail/skipped/cancelled **0**; Windows genel suite ile örtüşür. Audit kapısının yeşil olması backend Orta bağımlılık uyarısının kapandığı anlamına gelmez. Sonraki arşiv/dokümantasyon commit'i yeni test koşusu iddiası değildir.

## Gözlenen iyileştirme ve ölçüm sınırı

- **Aynı transaction'daki native karşılaştırma:** 10 metadata sorgusu aynı içerik ve sırayla 1 SQL isteğinde okundu; beş sayısal tablo ile snapshot okuma istekleri **15 → 6** (**%60 daha az okuma roundtrip'i**). Snapshot ve JSON eşitliği doğrulandı.
- **40/40 güncel tabanlı delta yazması:** her işlem 1 metadata batch/10 SELECT, 1 dar kopya, 0 tam view ve tek lock kullanıyor. Store SQL çağrısı medyanı **13**, önceki aşamadaki **22** yerine. Delta medyanı **297 bayt**, aktif hesap sorgusu 1 satır; son veri bağımsız SQL havuzuyla eşit, audit/generation/revision doğru.
- Bu zincirde Store medyanı **304,260 ms**, örnek p95 **351,023 ms**, okuma medyanı **213,673 ms**. Her sayı 40 gözleme aittir; tüm satır hacmi ve doğrulama maliyeti hâlâ vardır. Farklı CI runner süreleri kontrollü A/B sayılmaz; üretim süresinde yüzde iyileşme veya kapasite iddiası yapılmaz.
- Dönen satır sayısı SQL fiziksel IO/plan ölçümü değildir. Heap/RSS tüm Node süreci örnekleridir; batch'in bellek azalttığı, CPU blokajında kesin tepeyi yakaladığı veya istek başına tahsis ölçtüğü iddia edilmez. HTTP/WAN/kurum kullanıcı yükü bu profile dahil değildir.

## Kalan işler

Tam satır hacmi, doğrulama/diff ve global lock maliyeti sürer. Sonraki N3 adımı ayrı geçerlilik/kısıt tasarımı veya büyük haritalarda native streaming olmalıdır; kullanıcı başına eşzamanlılık ve kurum gerçek yük ölçümü ayrıca değerlendirilir. N5 ağ süre sınırı/taslak uzlaştırma, N6 asset yaşam döngüsü ve N2 backend Orta bağımlılık uyarıları ayrı konulardır. Asgari SQL yetkileri, kurum CA/proxy/TLS/Windows servis, kurum yedek/restore ve gerçek yük bu sentetik çalışmayla kapanmaz.

## Sonraki aşama — güncel bağlantı

Native büyük sayısal haritalarda akışla okuma ve 9931257 kaynak commit'inin güncel kabul sonuçları [N3 sayısal akış raporunda](N3-MSSQL-SAYISAL-AKIS-OKUMA-2026-10-08.md) yer alır. Bu raporun yukarıdaki f798747 sonuçları önceki metadata batch aşamasının kanıtı olarak korunmuştur. N3 bütün olarak hâlâ kısmen giderildi.
