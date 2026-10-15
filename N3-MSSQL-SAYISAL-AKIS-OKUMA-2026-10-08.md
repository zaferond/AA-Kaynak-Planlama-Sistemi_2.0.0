# N3 — Büyük MSSQL kaynak haritalarında akışla okuma

## Başlangıç ve kapsam

8 Ekim 2026; başlangıç `f2f35ac95b57acf2526746ccbb7f64735827bb78`. Önceki metadata batch ve dar planlama taslağı/delta davranışı korunur. **N3 kısmen giderildi**; tam snapshot, tam doğrulama/diff ve global Shared/Exclusive kilit devam eder.

## Değişiklik

- Native transaction context artık `scan` sağlar. Tahsis, gerçekleşen tahsis, çalışma saati, gerçekleşen yüzde ve revision olmak üzere **beş büyük sayısal tablo** mevcut `readRecordMap` üzerinden doğrudan haritaya işlenir. MSSQL Request `stream=true`, `arrayRowMode=true` kullanır; SELECT sütun sırası korunur. Ara driver recordset listesi biriktirilmez. Nihai haritalar ve tam doğrulama kopyaları hâlâ bellektedir.
- SQL/parametre/scope, kilit, revision, audit, generation ve yetki kontrolleri değiştirilmez. Ordinary query ve scan parametre bağlama kodunu paylaşır. SQL.js ve scan sağlamayan context'ler mevcut davranışı korur. Metadata batch hâlâ kendi on küçük sonucunu buffer eder; bu aşama onu değiştirmez.
- Akış hatası ilk hata kimliğiyle saklanır. Mapper/sütun/satır hatası sorguyu iptal eder; sonraki satırlar tüketilmez. `mssql 12.7.2` akışında SQL hatası event üzerinden gelir ve query promise'i yine resolve olabilir: adapter bu hatayı ayrıca reddeder. Query tamamlanıp bağlantı bırakılmadan hata döndürülmez; rollback/sonraki sorguyla yarış önlenir. Kendi listener'ları finally'de kaldırılır. Eksik completion, yanlış/multiple recordset veya beklenmedik buffered sonuç reddedilir.
- Mevcut 45 saniye driver request timeout korunur; ayrı sonsuz bekleyen uygulama promise'i eklenmez. Raw adapter kullanıcı SQL arayüzü değildir; SELECT'ler sunucunun sabit sorgularından gelir. Başlangıç/tek statement kontrolü SQL parser veya kullanıcı SQL yetkilendirmesi olarak sunulmaz.
- Native ölçüm aracı scan çağrılarını SQL çağrı/satır toplamına bir kere dahil eder; yalnız sayı/zaman kaydeder, satır değerini/parametreyi tutmaz. Mevcut 16 senaryo/640 işlem yük profilinde her snapshot için 5 scan assert'i eklenir. Kaynak ve JSON eşitliği native testte ayrıca sınanır.

## Güvenli yerel doğrulama

HEAD Git arşivinden geçici dizin; kilit dosyalarından geçici `npm ci` ve temiz npm config/cache. Gerçek `.env`, DB, hesap veya çalışan servis kullanılmadı. SQL.js fixture'ları geçici ve sentetiktir. Driver unit testleri `_query`/transaction girişini bağlantıdan önce stub eder; gerçek Request promise/event davranışı çalışır, network açılmaz.

| Komut | Sonuç |
|---|---|
| `node --test tests/mssql-scan.test.mjs tests/mssql-batch.test.mjs tests/transaction-profile.test.mjs tests/read-records.test.mjs tests/planning-snapshot.test.mjs tests/planning-read-scope.test.mjs tests/snapshot-metadata.test.mjs tests/concurrency.test.mjs tests/store-persistence.test.mjs` | Son temiz kurulumda **84/84**; fail/cancelled/skipped 0 |
| `npm run format:check` | Başarılı |
| `npm run check:domain` | 35 shared kaynak için başarılı |
| `npm run build` | TypeScript/site derlemesi başarılı |
| `npm run deploy:verify` | Geçici kaynak/artifact hash'leri eşit |

İlk yerel denemelerde ölçüm hook'unun yanlış fonksiyona eklenmesi ve tekrar kurulan test mock'larının birbirine sızması bulundu; hook doğru scope'a taşındı, her test mock'u açıkça geri alındı. Yeni testler fail-closed scan/mapper/SQL/timeout/connection/cleanup/rollback davranışını kapsar. Mevcut üretim DB veya kodda bir hata olduğu iddiası değildir. İlk npm kontrolünde config çakışması ve eksik yerel TypeScript nedeniyle geçici ortam temiz kuruldu; bu sonuçlar başarılı test gibi sayılmadı.

## Native kabul ve kalan işler

Test edilen kaynak **`99312575e7fc82de1ed6f1caaae9abd4ba714ade`**.

| Koşu | Sonuç |
|---|---|
| [37808304484 kalite](https://github.com/zaferond/AA-Kaynak-Planlama-Sistemi/actions/runs/37808304484) | Ubuntu **547/547**, Windows **198/198**, Chromium **133**; format/domain/TypeScript/build/manifest ve iki Yüksek eşikli audit kapısı başarılı |
| [37808343096 native MSSQL](https://github.com/zaferond/AA-Kaynak-Planlama-Sistemi/actions/runs/37808343096) | **23/23**; iki gerçek havuz, **16 senaryo / 640 işlem / 340 yazma**, şema **31**, temizlik başarılı |

[Kalite kaydı](ci-evidence/quality-9931257-receipt.json), [native kaydı](ci-evidence/native-mssql-9931257-receipt.json), [byte olarak korunan native JSON](ci-evidence/native-mssql-9931257.json). Tüm başarılı toplamlar fail/cancelled/skipped 0; Windows testleri genel suite ile örtüşür. Native raporun **471/471** dosya hash'i test edilen commit ile eşit: 381 uygulama/derleme/ölçüm girdisi, doğrudan test modülleri ve iki workflow. `.cmd` için CRLF checkout kuralı kullanıldı. Hash kimliği tüm UI işlevlerinin native yürütüldüğü anlamına gelmez. Sonraki arşiv/dokümantasyon commit'i yeni native koşu iddiası değildir. Ham log/hesap/bağlantı bilgileri arşivlenmedi.

Native suite aynı transaction'da buffered/streamed snapshot ve JSON eşitliğini, beş tablo satır sayılarını, parametre/null/Unicode, iptal sonrası yeni kilitli transaction'ın kullanılmasını, SQL conversion hatasında mutation'ın başlamamasını ve bağımsız havuzdan veri/audit korunmasını **doğruladı**. Ordinary/batch 15/6 okuma sayısı, rol kapsamları, stale revision, eşzamanlı yazma, audit/generation ve eski rollback testleri de geçti.

Her profil snapshot'ı **5 scan** kullanır. 40/40 güncel tabanlı delta yazmasında 1 metadata batch/10 SELECT, 1 dar kopya, 0 tam view; SQL çağrısı medyanı **13**, yanıt **297 bayt**. Store medyanı **294,693 ms**, örnek p95 **346,222 ms**, okuma medyanı **205,989 ms**; bu 40 gözlemin betimlemesidir. Tam veri hâlâ okunur: 10.000 tahsis, 4.000 actual, önceki actual güncellemeleri sonrası 3.960 yüzde ve 14.000 revision. Ara buffer'ın kaldırılması satırları atlayan bir optimizasyon değildir.

Native JSON SHA-256: `9e0b70c24d4f04f537c67ba9a68c96fb178ca0787fcc026e07f1cf3103308a32`.


Ara listelerin kaldırılması kod ve driver contract üzerinden gözlemlenebilir; kesin heap/RSS azalması, istek başına tahsis veya üretim hızında yüzde kazanç iddiası yapılmaz. Native profildeki farklı CI runner süreleri kontrollü A/B değildir. Tam satır hacmi/validasyon/global lock, kullanıcı başına eşzamanlılık, N5 ağ süre sınırı/uzlaştırma, N6 eski asset yaşam döngüsü ve N2 backend Orta bağımlılık uyarısı ayrıca kalır. Kurum CA/proxy/TLS, asgari SQL yetkileri, Windows servis/ACL, kurum yedek kurtarma ve gerçek HTTP/WAN yük kabulü bu sentetik testlerle doğrulanmaz.

İlk native koşu [37807884682](https://github.com/zaferond/AA-Kaynak-Planlama-Sistemi/actions/runs/37807884682) test varsayımı nedeniyle başarısız oldu: iptal sonrası aynı transaction içinde devam etme denemesi `ENOTBEGUN` verdi. Mevcut `XACT_ABORT` iptal edilen transaction'ı sonlandırır. Mapper'ın özgün hatası ve cancellation drain korunmuştu; native test başarısız transaction'ın dışına çıkıp yeni kilitli transaction'la havuzun kullanılabilirliğini doğrulayacak şekilde düzeltildi. Abort/rollback ayarı ve uygulama davranışı gevşetilmedi. [Başarısız koşu kaydı](ci-evidence/native-mssql-46a67c2-failed-receipt.json) saklandı; bu koşu başarı kanıtı olarak kullanılmaz.
