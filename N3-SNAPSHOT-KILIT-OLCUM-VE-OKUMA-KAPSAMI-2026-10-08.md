# N3 — Snapshot, MSSQL kilit ölçümü ve kişisel okuma kapsamı

Tarih: **8 Ekim 2026**. İlgili bulgu: [7 Ekim incelemesi](MIMARI-GUVENLIK-PERFORMANS-INCELEME-2026-10-07.md), **N3 / Orta**. Durum: **Kısmen giderildi**. Native ölçüm altyapısı ve kişisel yüzde/saat okumalarının kapsamı tamamlandı; küçük yazmaların tam snapshot doğrulaması ve global kilit maliyeti sürüyor.

**Sonraki aşama:** [Planlanan yazmalarda dar taslak ve doğrudan delta](N3-PLANLANAN-YAZMA-TASLAK-VE-DELTA-2026-10-08.md). Aşağıdaki süre ve kayıtlar önceki aşamanın kendi commit'lerine aittir.

## Sürüm ve kısa sonuç

- Ölçüm öncesi uygulama davranışını koruyan profil sürümü: **`f084a34174e85735c337ff946a1e48e4c19eb1c1`**.
- Dar kişisel okuma düzeltmesi: **`ce5c2f007e70b029b6132873d7f3e795c6c87ea5`**.
- Son test edilen paket: **`f3b63835c05830c85847f1c3c0ef04f0b82e7d12`**; kişisel okuma aynı, risk onay test harness’ı düzeltildi. Aşağıdaki son süreler bu commit’in native raporundandır.
- Normal kullanıcı için ilk senaryoda SQL'den dönen kişisel yüzde kayıtları **4.000 → 50**: bu tabloda dönen satır sayısı **%98,75 azaldı**. Kullanıcı görünümü bağımsız tam okuma referansıyla eşit. Bu oran bütün isteğin süresinde/belleğinde aynı iyileşme anlamına gelmez.
- Üç native koşunun her birinde **600 işlem / 300 değişiklik yazması**, iki havuz, generation/revision/audit ve snapshot tutarlılığı kontrolleri geçti. Son koşu **21/21**, hata/atlama/iptal **0**, şema **31**, temizlik doğrulandı.
- 12 eşzamanlı gerçekleşen yazmada son koşunun örnek p95 Store süresi **4.988,399 ms**, SQL kilit edinimi **4.592,617 ms**. Bu sentetik sonuç yazma yolunun sonraki öncelik olduğunu destekliyor; kurum kapasitesini veya kurumda aynı gecikmeyi kanıtlamıyor.

Bu notun sonraki arşiv/dokümantasyon commit'i uygulama/test girdilerini değiştirmez; kanıtın esas sürümü test edilen commit ve dosya hash'leridir.

## Üretim kodundaki dar değişiklik

| Kod | Değişiklik ve korunan davranış |
|---|---|
| `shared/access.ts:48–77` | `actualReadOwnerScope` ortak aday çalışan politikasını verir: admin tam okur; normal kendi bağlı çalışanını; atanmış yönetici geçmiş sürümlerinde görünür takımı bulunan çalışanları. Atanmamış yönetici veya bağlı çalışanı olmayan normal kullanıcı kişisel kayıt okumaz. Yönetici için son yetki kontrolü hâlâ **kaynak + ay + tarihsel takım** üzerinden yapılır. Aday listesi yeni yetki değildir. |
| `backend/planning-reader.mjs:154–179` | Kimliği doğrulanmış okumalarda yalnız `actual_worked_hours` ve `actual_percent_entries` aday çalışanlarla sorgulanır. Anonim tarihsel takım toplamları için gereken `actual_allocations` tam okunur. `viewUser` verilmeyen mutation okumaları tam kalır. |
| `backend/read-records.mjs:45–109` | Sabit katalog sütunu ve bound `@p` parametreleriyle kapsamlı composite sorgu kullanılır. Boş kapsam `WHERE 1=0`; 900 üzeri aday veya legacy `|` kimliği tam okuma/son yetki filtresine döner, kayıt kesilmez. SQL.js sıralaması `ORDER BY rowid` ile korunur. Gerçekleşen FTE tablosunu adaylarla daraltma reddedilir. |
| `shared/server-domain.ts` | Aynı saf politika backend'e yeniden ihraç edilir; ayrı bir kopya iş kuralı yaratılmaz. |

Store aktif kullanıcıyı/verisyonunu DB'den yeniden kontrol eder. Revision/tombstone kapsamı, mutation doğrulaması, aylık kapasite, audit ve transaction kuralları bu optimizasyonla kaldırılmadı. Bu çalışma DB migration gerektirmez.

## Ölçüm altyapısı ve güvenli sınırlar

`scripts/transaction-profile.mjs` yalnız `NODE_ENV=test`, native MSSQL ve `_test` adlı DB Store'larını kabul eder. `scripts/native-contention-profile.mjs` bu korumayı **seed veya okumadan önce** çağırır. Gerçek güvenlik sınırı ayrıca native fixture'ın boş DB doğrulaması ve temizlik boyunca tuttuğu ayrı test kilididir.

Ölçüm sırasında instance metotları geçici olarak sarılır; üretim adapter/Store koduna timing hook eklenmedi. Eşzamanlı istekler AsyncLocalStorage ile ayrılır. Hata olduğunda bütün çalışan worker'lar tamamlanır; hook'lar ve bellek zamanlayıcısı `finally` ile kaldırılır. Devam eden ölçüm varken hook kaldırılması reddedilir. Testler orijinal hata, SQL parametreleri, Shared/Exclusive modu, timeout ve metot descriptor'larının korunmasını sınar.

`--contention` opt-in seçeneği varsayılan olarak kapalıdır; planlanan kayıt, actual kayıt, istek sayısı ve eşzamanlılık sınırları bağlantıdan önce doğrulanır. Zamanlanmış native CI hafif varsayılan koşuyu korur. Ayrıntılı komut ve sınırlar [MSSQL test kılavuzunda](MSSQL-TEST-KILAVUZU.md) bulunur.

## Native sonuç ve doğrudan satır kanıtı

Başlangıç: [37768092380](https://github.com/zaferond/AA-Kaynak-Planlama-Sistemi/actions/runs/37768092380). Dar okuma: [37770061188](https://github.com/zaferond/AA-Kaynak-Planlama-Sistemi/actions/runs/37770061188). Son paket: [37771735208](https://github.com/zaferond/AA-Kaynak-Planlama-Sistemi/actions/runs/37771735208). Üçü de SQL Server **16.0.4295.3 Developer**, uyumluluk **160**, Node **24.21.0**; 10.000 planlanan, 4.000 actual, başlangıçta 4.000 yüzde kaydı, 80 çalışan, 20 kişisel takvim kaydı.

| Normal okuma, eşzamanlılık | Önce yüzde satırı / istek medyanı | Sonra yüzde satırı / istek medyanı | Sonra FTE satırı / istek medyanı |
|---|---:|---:|---:|
| 1 | 4.000 | 50 | 4.000 |
| 4 | 3.960 | 10 | 4.000 |
| 12 | 3.960 | 10 | 4.000 |

Sonraki senaryolarda yüzde sayısının azalması önceki actual yazmalarının ilgili yüzde girişini mevcut kuralla temizlemesindendir. Senaryolar aynı fixture üzerinde sırayla çalışır; eşzamanlılık düzeyleri birbirinin bağımsız tekrarı değildir. İlk okuma karşılaştırması başlangıç fixture'ında yapılır.

Native fixture'da manuel çalışma saati tablosu boştu; bu koşu saat satırı azalmasını kanıtlamaz. Ayrı SQL.js sentetik testinde **21 → 2 saat kaydı** ve **200 → 10 yüzde kaydı** doğrudan sorgudan sayıldı; sonuç tam referansla eşit. SQL'den dönen satır sayısı fiziksel IO veya query plan ölçümü değildir.

### Son koşunun örnek gecikmeleri

Her aşağıdaki hücre **40 örnek** üzerinden nearest-rank `sampleP95` değeridir, birim **ms**. Süre istek Store/changeAndView sonucunu içerir; JSON üretimi ayrıca ölçülür.

| Eşzamanlılık | Normal okuma | Plan yazması | Plan kilit edinimi | Actual yazması | Actual kilit edinimi |
|---|---:|---:|---:|---:|---:|
| 1 | 152,325 | 445,588 | 0 | 444,360 | 0 |
| 4 | 508,020 | 1.633,477 | 1.247,881 | 1.720,762 | 1.315,821 |
| 12 | 1.413,515 | 5.172,058 | 4.736,813 | 4.988,399 | 4.592,617 |

12 eşzamanlı actual yazma için `sampleP99` **5.003,825 ms**; 40 örnekte p99 en uzun gözlemle aynı olabilir. Okuma medyanı **274,247 ms**, doğrulama/diff hazırlığı medyanı **59,689 ms**; her istek bir tam Store okuması, bir kopyalama, persistence, projection ve kilit kullanır. Bu maliyetler birbirleriyle örtüşen SQL sürelerini de içerir; bütün metrikler toplanmaz.

Sunucu metriği `sp_getapplock` etrafındaki SQL saatiyle **yordam süresi + edinim beklemesini** kapsar; saf DMV lock wait değildir. Client transaction girişinde havuz/begin/roundtrip maliyeti de bulunur. `queueMs` benchmark worker kuyruğudur, uygulamanın HTTP kabul kuyruğu değildir. Ölçüm ek SELECT/örnekleme maliyeti getirir.

12 eşzamanlı son senaryolarda örneklenen heap tepe değerleri normal okumada **238,5 MiB**, plan yazmada **239,9 MiB**, actual yazmada **248,8 MiB**. Bunlar fixture/referans/enstrümantasyon dahil tüm Node sürecidir; istek başı tahsis veya garanti edilen tepe değildir. CPU'nun bloke olduğu aralarda kaçan bellek/GC zirvesi ve SQL Server belleği ölçülmedi.

Önceki ve sonraki koşular ayrı CI runner'larında çalıştı. Satır sayısı farkı ve referans eşitliği doğrudan doğrulanmıştır; süre/bellek farkını yalnız koda bağlayan kontrollü A/B iddiası yapılmaz.

## Doğrulamalar ve kanıt arşivi

- Geçici kaynak kopyası, önceden temiz kurulmuş bağımlılıklar ve temiz npm ayarları kullanıldı; çalışan `.env`, DB veya hesap taşınmadı. SQL.js fixture'ları yalnız geçici sentetik dosyalara yazar.
- `node --test tests/transaction-profile.test.mjs tests/planning-read-scope.test.mjs`: profil geliştirmesinin ilk yerel kontrolü **21/21**.
- `node --test tests/planning-read-scope.test.mjs tests/scope-index.test.mjs tests/record-access-http.test.mjs tests/actual-allocation-commands.test.mjs tests/concurrency.test.mjs`: son okuma düzeltmesi **49/49**. Admin/manager/normal/no-owner/unassigned kapsamı, tarihsel takım değişimi/ay kontrolü, legacy fallback, boş/900/901 kapsamı, bound parametreler ve sıfır değerler; actual mutation'ın tam okuma ve diğer kişilerin verisini koruması sınandı.
- Değişen yedi kaynak/test dosyasında Prettier `--check`: başarılı. Geçici kopyada `npm run build`: TypeScript/Vite başarılı.
- `npm run test:db -- --size 10000 --samples 3 --report native-mssql-report.json --contention`: üç native koşu **21/21**; 15 senaryo, 600 işlem, 300 gerçek değişiklik, iki bağımsız havuz, referans görünüm, own-resource ayrımı, her commit snapshot'ı ve delta reconstruct, generation/revision/audit, yeniden bağlantı ve temizliği geçti. Bağlantı yalnız CI'nin geçici test DB'sine `TEST_DB_*` ile verildi.
- Native raporların **466 dosyasının tamamı** ilgili test edilen Git commit'iyle karşılaştırıldı. Windows `.cmd` için `.gitattributes` CRLF checkout baytları kullanıldı. [Başlangıç JSON](ci-evidence/native-mssql-f084a34.json), [başlangıç native kaydı](ci-evidence/native-mssql-f084a34-receipt.json), [dar okuma JSON](ci-evidence/native-mssql-ce5c2f0.json), [dar okuma native kaydı](ci-evidence/native-mssql-ce5c2f0-receipt.json), [son paket JSON](ci-evidence/native-mssql-f3b6383.json), [son paket native kaydı](ci-evidence/native-mssql-f3b6383-receipt.json). JSON byte olarak korunur; ham loglar ve bağlantı bilgileri Git'e eklenmez.
- Başlangıç kalite [37767837466](https://github.com/zaferond/AA-Kaynak-Planlama-Sistemi/actions/runs/37767837466): **519/519 Ubuntu**, **153/153 Windows**, **133 Chromium kontrolü**, tüm kapılar başarılı. [Kayıt](ci-evidence/quality-f084a34-receipt.json).
- Dar okuma sürümü `ce5c2f0` için ilk [37770060613 kalite denemesi](https://github.com/zaferond/AA-Kaynak-Planlama-Sistemi/actions/runs/37770060613) **başarısız**: Ubuntu kaynak testi **524/524**, Windows **153/153** geçti; risk onay testinde `risk-save-confirmation.mjs:124` yanıt bekleme timeout'u nedeniyle tarayıcı işi durdu. Audit adımları atlandı; geçmiş gibi sayılmadı. [İlk deneme kaydı](ci-evidence/quality-ce5c2f0-attempt1-receipt.json) korundu. Aynı dört risk onay kontrolü geçici yerel SQL.js/Chrome fixture'ında **4/4** geçti. Bu tek koşuyla timeout'un kök nedeni doğrulanmadı; uygulama veya test kodu varsayımla değiştirilmedi.
- Aynı kaynakta yalnız başarısız iş bir kez yeniden çalıştırıldı; ikinci deneme de aynı noktada durdu. [İkinci deneme kaydı](ci-evidence/quality-ce5c2f0-attempt2-receipt.json) ayrı korundu. Aynı kaynakla yerel tam Chrome koşusu **133/133** geçti. Sonuçlar CI başarısı gibi gösterilmedi.
- Test harness'ında iki somut zayıflık düzeltildi (`scripts/browser-checks/risk-save-confirmation.mjs:86–90,127–135`): ret sonrası bağımsız ikinci etkileşim, uygulamanın aynı event turn içinde tekrar onayı önleyen `setTimeout(0)` korumasının tamamlanmasından sonra başlıyor; onay ve yanıt promise'lerine `Promise.all` ile hemen hata işleyicisi bağlanıyor. Önceki logda görülen unhandled response rejection'ın asıl dialog/action hatasını maskelemesi önleniyor. Test timeout'u artırılmadı, onay sayısı/öncesinde yazmama/revision/veri beklentileri kaldırılmadı; üretim risk kaydetme kodu değiştirilmedi. Dar yerel kontrol **4/4**, yeniden TypeScript/build ve bu dosyada Prettier başarılı. Bu değişiklik `f3b6383` commit'indedir; kişisel SQL okuma davranışı `ce5c2f0` ile aynıdır. İşletim sistemleri arasındaki zamanlama farkının ayrıntılı kök nedeni ayrıca doğrulanmadı.

- Son **`f3b6383`** [37771685013 kalite koşusu](https://github.com/zaferond/AA-Kaynak-Planlama-Sistemi/actions/runs/37771685013) **başarılı**: **524/524 Ubuntu**, **153/153 Windows**, **133 Chromium kontrolü**; biçim/domain/TypeScript/build/manifest ve iki Yüksek eşikli audit kapısı başarılı. Hata/atlama/iptal yok. [Son kalite kaydı](ci-evidence/quality-f3b6383-receipt.json). Son native aynı commit ile **21/21**, 466 hash eşit ve temizlik başarılı. Windows genel testlerle örtüşür; sayılar bağımsız kapsam gibi toplanmaz. Backend Orta uyarısı sürüyor.

İlk yerel fixture denemesinde eksik başlangıç resource revision'ı ve DELETE sorgusunun okuma sayacına katılması test hatasına yol açtı. Fixture `revision || 0` ve yalnız `SELECT` sayımıyla düzeltildi; yetki beklentileri gevşetilmedi. Artifact/log indirmesindeki geçici DNS hatası bağlantı adresleri veya sırlar rapora yazılmadan yeniden denendi.

## Kalan işler ve sınırlar

1. **N3 devamı:** `backend/store.mjs:173–186` her küçük yazmada bütün snapshot'ı okur/kopyalar/doğrular. `backend/adapters/mssql.mjs:87–125` Shared/Exclusive global kilidi korur. İlk hedef sık planlanan tahsis komutları için gerekli veri/validasyon kapsamını daraltmaktır; mevcut native senaryolar referans/güvenlik kapısı olur. Aynı revision yarışı, aylık toplam, rol/takım kontrolü, phantom delete, audit, generation, kendi commit yanıtı ve rollback eşitliği korunmalıdır. Kilidi doğrudan kaldırmak veya yeni API kotalarını ölçümsüz seçmek bu çalışmayla gerekçelendirilmedi.
2. **N2 kalan bağımlılık:** backend `sprintf-js` zincirinin Orta uyarısı açık. Yüksek eşikli audit kapısı uyarının giderildiğini kanıtlamaz.
3. **N5:** ortak fetch deadline, taslağın korunması ve timeout sonrası yazmanın sonucu belirsizken revision/generation uzlaştırması.
4. **N6:** eski hash'li varlıkların kontrollü saklama/temiz staging yayın yaşam döngüsü.

HTTP/tarayıcı/WAN yükü, hedef kurum veri hacmi, admission kuyruğu, SQL execution plan/fiziksel IO, SQL Server belleği, kurum CA/NTLM/proxy, asgari SQL yetkileri, Windows servis/ACL ve kurum backup/recovery kabulü bu profille doğrulanmadı. Yeni uygulama genel işlem kotası eklenmedi. Sentetik fixture, gerçek kullanıcı davranışının temsili kabul edilmedi.

Gerçek kullanıcıyla giriş, çalışan DB'ye kayıt/silme/migration/restore veya sunucu yeniden başlatma yapılmadı. Disk paketi hash doğrulaması açık backend sürecinin yeni modülleri yüklediğini kanıtlamaz. Başarılı sentetik testler uygulamanın bütünü için güvenlik/stabilite garantisi değildir.
