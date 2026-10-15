# N5 — Ağ süre sınırı ve belirsiz kaydetme sonucunu kontrol etme

8 Ekim 2026. Başlangıç: `76d0016db8cf710dd0a6a89d0d0ccc8e202f8515`.
İlişkili bulgu: [7 Ekim incelemesi, N5](MIMARI-GUVENLIK-PERFORMANS-INCELEME-2026-10-07.md).

## Değişiklik ve sınırı

Ortak taşıma yolu artık başlıklarla birlikte JSON gövdesini de kapsayan süre sınırı kullanır: normal GET **60 saniye**, POST **120 saniye**, periyodik version GET **10 saniye**. `HttpTransport` istekleri AbortController ile sahiplenir; süre dolduğunda kendi promise'ini reddeder. Oturum değişiminde bekleyen istekler iptal edilir. Sonradan gelen başlık/gövde eski oturum, generation veya taslak üzerinde etkili olmaz. Timer ve kayıtlı iptal fonksiyonu finally'de kaldırılır. Tarayıcının askıya alınması veya senkron JSON işlemesi nedeniyle bunlar sunucuda uygulanan kesin zaman sınırları değildir.

**Abort, POST'un sunucuda iptal edildiğinin kanıtı değildir.** Ağ hatası, okunamayan/eksik gövde veya süre aşımıyla sonucu belirsizleşen iş yazması otomatik tekrar gönderilmez. Yeni yazmalar durdurulur; kuyruğa daha önce eklenmiş yazmalar, kullanıcı devam etmeyi seçse bile eski kuyruk sürümüyle çalıştırılmaz. Başarıyla tamamlanmış POST'un delta fallback GET'i başarısızsa aynı koruma uygulanır. Tamamlanan 409/503 yanıtı belirsiz ağ hatası olarak sınıflandırılmaz.

Yeni uyarı, **Sunucu Verilerini Kontrol Et** ile mevcut yetkili kapsamın salt okunur GET'ini sunar. Başarılı kontrol ve kullanıcının **Kontrol Ettim, Devam Et** seçimi yeni yazmalara izin verir. Başarısız okuma, arka plan yenilemesi, başka oturumun eski kontrolü veya aynı kontrolün tekrar kullanılması kilidi kaldırmaz. Bu istemci koruması sunucu yetkilendirmesinin yerine geçmez. Taslak/payload, kişisel veri veya sır localStorage/BroadcastChannel'a yazılmaz.

Risk taslağı kendi açılış değerini ve revision'ını tutar. **Sunucu Kaydını Kontrol Et** taslağı değiştirmeden açılış revision'ıyla karşılaştırır. Revision değiştiyse açık çakışma gösterilir; değişmediyse yalnız kullanıcının aynı revision'la tekrar onaylaması mümkündür. Açılış revision'ı yeniden okunana sessizce yükseltilmez. Risk silme ve satır dışına/Enter'a bağlı otomatik kaydetme belirsizlik sırasında durur.

Planlanan kaynak, gerçekleşen kaynak ve çalışılan saat hücreleri de ilk değişiklikteki kaydetme callback'ini (açılış revision'ını taşıyan bağlamı) korur. Sunucudan yeni prop gelmesi açık taslağın metnini değiştirmez. Belirsizlik sonrasında blur otomatik tekrar göndermez; kullanıcı Enter ile tekrar denerse aynı revision kullanılır. Kurtarma düğmelerine tıklanması çalışılan saat hücresinin seçim bağlamını kapatmaz. Mevcut normal dış tıklama/Escape ve başarılı giriş davranışı korunur.

Kontrol GET'i, gecikmiş ilk POST'un daha sonra tamamlanamayacağını kanıtlamaz. Testte ilk komut GET'ten **sonra** teslim edildi; eski revision'lı manuel tekrar 409 ile reddedildi ve yalnız bir değişiklik/audit oluştu. Mevcut sunucu CAS doğrulaması değiştirilmedi. Migration, restore veya import için otomatik replay eklenmedi; bunlar sonuçları ayrıca kontrol edilmeden tekrarlanmamalıdır. Kalıcı işlem makbuzu/idempotency anahtarı veya bütün komutlar için exactly-once garantisi eklenmiş değildir.

## Kanıt ve güvenli doğrulama

Git başlangıç arşivinden geçici kaynak kopyası kullanıldı. Aynı root/frontend lock hash'leri kontrol edilerek önceki temiz `npm ci` ortamının bağımlılıkları kullanıldı. Alt süreçlere sınırlı ortam verildi; gerçek `.env`, DB ayarı, kullanıcı hesabı veya çalışan servis kullanılmadı. Birim testleri fake fetch/timer kullanır; tarayıcı testleri yalnız geçici SQL.js DB, sentetik kullanıcılar ve rastgele loopback HTTP portu açar. Chrome'daki POST deadline'ı testte kontrollü tetiklenir; gerçek proxy/WAN süre ölçümü değildir.

Yeni taşıma/kuyruk testleri şu durumları kapsar: açık kalan başlık, açık kalan gövde, network/JSON hatası, geç gelen eski yanıt, timer temizliği, oturum iptali, eski kuyruk sürümü, eski kontrol makbuzu, başarısız kontrol GET'i, delta fallback GET hatası ve 409'un belirsiz sayılmaması. Beş yeni tarayıcı grubu; gerçekten kaydedilip gövdesi takılan risk, GET sonrasında gelen eski POST, planlanan hücre, gerçekleşen yüzde hücresi ve çalışma saati taslağı için gerçek sentetik HTTP/CAS davranışını sınar. Windows kalite kapısına taşıma testleri eklendi; Ubuntu tüm kaynak testlerini çalıştırır.

Yerel ara test hataları başarı olarak sayılmadı: Node'un strip-only çalıştırmasında constructor parameter property desteklenmediği için açık class alanlarına geçildi. Yeni browser fixture komutlarında `key` yerine API'nin `id` alanı ve tab seçicisinde doğru `tab` rolü kullanıldı; actual sonuç assert'i modeldeki `actualPercentEntries` / `actualWorkedHours` alanlarına düzeltildi. Sunucu validasyonu veya rol/CAS kontrolleri bu testleri geçirmek için gevşetilmedi.

Eski bir oturum browser testi, logout sonrasında tutulan GET'in normal response event'i üretmesini bekliyordu. Yeni taşıma isteği hemen abort ettiği için bu beklenti süre aşımına uğradı. Test, tam olarak tutulan request'in `requestfailed` olmasını ve geç cevap bırakıldıktan sonra yeni hesabın scoped görünümünün korunmasını doğrulayacak şekilde güncellendi. Önceki başarısız genel koşu başarı olarak sayılmadı.

| Yerel komut | Sonuç |
|---|---|
| `node --test tests/http-transport.test.mjs tests/storage-order.test.mjs` | **26/26**, fail/cancelled/skipped 0; mock fetch/timer, DB/network yok |
| `node scripts/run-browser-checks.mjs` | **138** kontrol başarılı; 133 mevcut + 5 yeni grup, sentetik SQL.js/HTTP ve Chrome |
| `npm run format:check` | Başarılı; değişen session browser dosyası ayrıca Prettier ile kontrol edildi |
| `npm run check:domain` | 35 shared kaynak için AST bağımlılık kontrolü başarılı |
| `npm run build` | TypeScript ve site derlemesi başarılı |
| `npm run deploy:verify` | Geçici kaynak/artifact hash'leri eşit; eski release varlıkları korunarak tekrar doğrulandı |
| `git diff --check` | Başarılı |

## GitHub kalite kanıtı

Test edilen kaynak **`f7d5a0eb011485f0408a4961f261e468af0a618c`**.
[37813756755 kalite koşusu](https://github.com/zaferond/AA-Kaynak-Planlama-Sistemi/actions/runs/37813756755) başarılı: Ubuntu **557/557**, Windows **208/208**, Chromium **138** kontrol. Fail/cancelled/skipped 0; Windows ve hedefli testler genel süitle örtüşür, kapsam toplamı olarak toplanmaz. Format/domain/TypeScript/build/manifest ve iki Yüksek eşikli audit kapısı geçti. [Kalite kaydı](ci-evidence/quality-f7d5a0e-receipt.json) koşu/commit ve job kimlikleri, toplamlar ve indirilen log hash'lerini içerir; ham log, hesap veya token arşivlenmedi.

Sonraki yalnız belge/kanıt commit'i yeni test edilmiş kaynak iddiası değildir. Backend/shared/migration değişmediği için bu frontend aşamasında yeni native MSSQL koşusu başlatılmadı. Önceki native kanıt kendi commit kapsamındadır.

Uygulama kopyasının başlangıç `76d0016` manifesti kaynak/artifact farkı olmadan doğrulandı. Hazırlanan dağıtım **385 kaynak / 401 artifact** içerir; mevcut eski release varlıkları korunur, yalnız yeni aktif JS/CSS ve index eklenir/güncellenir. Aktarım yedeği `.deployment-backups/2026-10-08-n5-transport-final` altında tutulur; son kurulum kontrolü `npm run deploy:verify` ile yapılır. Bu hash kontrolü açık backend sürecinin yeniden başladığının veya kullanıcı tarayıcısının yeni JS'i yüklediğinin kanıtı değildir.

## Durum ve kalan işler

**N5 kod ve açıklanan sentetik test kapsamıyla giderildi.** Kalıcı, tarayıcı yeniden açılışından sonra taslak kurtarma veya sunucuda işlem makbuzu bu kapsamın dışındadır. Sayfayı kapatma/yenileme, filtreyle hücreyi kaldırma veya açıkça iptal etme bellek içindeki taslağı kaybettirebilir. Gerçek kurum proxy'sinin uzun import/restore süreleri ve deadline uygunluğu ayrıca ölçülmelidir; tarayıcı timeout'u gerçek DB işlemini durdurmaz.

N3 tam snapshot/global kilit maliyeti **kısmen giderilmiş** olarak kalır. N2 backend Orta bağımlılık uyarısı ve N6 eski public asset yaşam döngüsü ayrıca açıktır. Native MSSQL, Windows servis/ACL, kurum CA/proxy/TLS, gerçek yedek kurtarma ve temsilî üretim yükü için önceki sınırlamalar devam eder. Bu frontend aşaması yeni native/kurum kabulü iddiası oluşturmaz.
