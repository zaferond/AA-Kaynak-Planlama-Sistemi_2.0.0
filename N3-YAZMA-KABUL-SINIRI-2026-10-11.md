# N3 — Sınırlandırılmış yazma kabulü — 11 Ekim 2026

## Sonuç ve kaynak kimliği

Önceki [Native okuma/kilit raporundaki](N3-NATIVE-OKUMA-KILIT-2026-10-11.md) sıradaki çalışma uygulandı. Başlangıç commit'i `3dd21d131fbf5a889bd16ddebb55d95b9e64f706`; bu değişikliğin kaynak/test commit'i **`35f240510b05e7f0d0fc2d1dfb4ba2bbd3f9ff4e`**. N3 bütünüyle kapanmış sayılmaz: bu adım HTTP yazmalarının kabulünü sınırlar; tam snapshot okuma/doğrulama ve SQL application lock maliyeti sürer.

## Davranış ve sınırlar

- `backend/mutation-admission.mjs`: her uygulama instance'ında **2 aktif, 8 FIFO bekleyen istek, kuyrukta 5 saniye**. Kuyruk dolduğunda/bekleme süresi dolduğunda iş komutu başlamadan **503**, `Retry-After: 1` ve kaydedilmediğini söyleyen mesaj döner. Kullanıcı yeniden kaydetmeyi kendisi başlatır; otomatik yazma tekrarı eklenmedi.
- `backend/app.mjs`: ilk oturum/CSRF kontrolünden sonra, JSON gövdesi buffer edilmeden önce kabul uygulanır. Altı iş yazma endpoint'i ortak handler ile sarılır. Bekleme ve gövde alımından sonra oturum/CSRF yeniden kontrol edilir; Store içindeki yetki/version/revision/transaction kontrolleri korunur.
- Kuyruktaki bağlantının kopması bekleyen yeri boşaltır. İş handler'ı başladıktan sonra bağlantı koparsa aktif yer **handler tamamlanana kadar tutulur**; çalışan transaction iptal edilmez veya başka istek için erken yer açılmaz. Hata/rollback ve normal tamamlanma yerini bırakır. Kapanış bekleyenleri reddeder, aktif işlemi sonlandırmış gibi davranmaz.
- Kabulden sonra handler başlamadan gövde alımı için varsayılan **60 saniye** vardır. Süre dolarsa socket kapatılır; iş mutasyonu çalışmaz. İstemci kesin HTTP hata yanıtı alamadığı için mevcut belirsiz-yazma korumasını kullanır. Bu senaryo, JSON 503 alıp taslağını koruyan senaryodan farklıdır. Başlamış işin toplam süresine yeni iptal sınırı konmadı.
- Ayarlar: `MUTATION_ACTIVE_LIMIT` 1–8, `MUTATION_PENDING_LIMIT` 0–32, `MUTATION_WAIT_MS` 100–10000, `MUTATION_BODY_MS` 1000–120000. `backend/server.mjs` bunları DB açılmadan doğrular; geçersiz değerin içeriğini loglamaz. Gerçek `.env` değiştirilmedi.
- GET/HEAD, giriş ve çıkış bu **iş** kuyruğunun dışında kalır. Okumalar SQL kilidini yine bekleyebilir. İlk kimlik doğrulama sorguları, login rate limiter/oturum işlemleri, doğrudan Store/CLI kullanımı ve genel socket/ingress trafiği bu kotaya dahil değildir. Instance sınırı cluster genel kotası, kullanıcı başına adil paylaşım veya üretim kapasite garantisi değildir.
- Yeni iş yazma endpoint'leri ortak admission handler kullanmalıdır. README kuralları ve ayar aralıklarını açıklar. Şema, migration, iş hesapları ve frontend görünümü değiştirilmedi.

## Güvenli yerel doğrulama

Kaynak `git archive` ile geçici dizine alındı; boş çevre değişkenleri listesi ve geçici SQL.js/loopback/sentetik hesaplar kullanıldı. Gerçek `.env`, DB, hesap veya servis kullanılmadı. Bağımlılıklar mevcut dizinlerden salt okunarak kullanıldı; bu bağlantılar üzerinden kurulum/güncelleme yapılmadı.

| Komut / kontrol | Sonuç | Kapsam |
|---|---|---|
| `npm run verify` | **654/654**, fail/cancelled/skipped/todo 0; format/domain/TypeScript/build geçti | Son kaynak kopyası, macOS Node 24.21.0 |
| Admission + HTTP/config/login/access/storage/transport hedefli `node --test` | **66/66** | Son rollback testi eklenmeden önceki dar koşu; rollback son 654 test içinde |
| Geçici `admission-browser-probe.mjs` | **1/1**, pageerror yok | Gerçek HTTP 503 → risk taslağı korunur → otomatik tekrar yok → kullanıcı retry → tek kayıt |
| `node scripts/verify-deployment.mjs` | Geçti | Stage ve iki uygulama klasörünün kaynak/çıktı hash'leri |
| `node scripts/check-deployment-package.mjs` | Geçti | Geçici temiz paket: **409 kaynak, 7 güncel çıktı**, 430 tarihî çıktı hariç |
| `git diff --check` | Geçti | Commit öncesi dar değişiklik kümesi |

Yeni 11 test: dört saf kuyruk, altı HTTP entegrasyon, bir istemci storage 503 testi. HTTP testleri FIFO/sınır/süre, bütün iş endpoint'lerinde JSON'dan önce ret, GET/logout, yetkisiz/CSRF istekleri, beklerken kapanan oturum, kuyrukta ve aktif bağlantı kopması, bozuk/yarım body, bilinmeyen route, rollback, generation/revision/audit bütünlüğünü kapsar.

Ara başarısızlıklar gizlenmedi: startup test fixture'ı yeni saf modülü kopyalamadığı için ilk dar koşu başarısız oldu; fixture listesi düzeltildi. Browser ilk denemesi yeni taslak için yanlış hata selector'ını bekledi; gerçek inline hata selector'ıyla aynı davranış assert edildi. İlk geniş koşuda 24 kabul edilmiş yazmayı sınayan eski fixture varsayılan 2+8 limite takıldı. O fixture'a sınırlar içinde 32 bekleyen/10 saniye tanımlandı; tüm 24 yanıt geldikten sonra status assertion yapılır. Başarı, revision, audit ve eşzamanlı okuyucu assertion'ları korunur. Production varsayılanı yükseltilmedi; aşırı yük ret sözleşmesi ayrı HTTP testlerindedir. Son 654 test tekrar çalıştırıldı.

## GitHub doğrulaması

Aynı **`35f2405`** kaynak commit'i üzerinde:

- [Kalite koşusu 38136160171](https://github.com/zaferond/AA-Kaynak-Planlama-Sistemi/actions/runs/38136160171): **başarılı**. Ubuntu **654/654**, Windows **291/291**, Chromium **155/155**. Kaynak testlerinde fail/cancelled/skipped/todo 0. Format/domain/TypeScript/build/manifest/temiz paket ve her iki `npm audit --audit-level=high` adımı geçti. Windows ve Ubuntu testleri örtüşür; sayılar tek bir bağımsız test toplamına eklenmez. [Kalite makbuzu](ci-evidence/quality-35f2405-receipt.json).
- [Native MSSQL koşusu 38136168401](https://github.com/zaferond/AA-Kaynak-Planlama-Sistemi/actions/runs/38136168401): **23/23**, fail/cancelled/skipped/todo 0; cleanup doğrulandı. Ubuntu 24.04, Node 24.21.0, SQL Server 16.0.4295.3 Developer/compatibility 160, şema 31; loopback ve 4 GiB geçici container/boş test DB. Contention profili 10.000 planlanan/4.000 gerçekleşen kayıt, 1/4/12 worker, **16 senaryo/640 işlem/340 yazma** kullandı. [Native rapor](ci-evidence/native-mssql-35f2405.json), [koşu/hash makbuzu](ci-evidence/native-mssql-35f2405-receipt.json).
- Native artifact'ın **509 kaynak/test/workflow hash'i** test edilen commit ile eşleşti; `.gitattributes` Windows CRLF checkout kuralı uygulandı. İndirilen ZIP hash'i GitHub artifact digest'iyle eşleşti. Arşiv rapor ve geçici job log hash'leri makbuzda ayrı alanlardır; ham log/credential/bağlantı ayarları Git'e eklenmedi. [Yerel kanıt makbuzu](ci-evidence/mutation-admission-35f2405-local.json).

Bu rapor/kanıtlar sonraki dokümantasyon commit'inde arşivlenir; uygulama/test kaynakları değişmez. Yukarıdaki sonuçların kaynak kimliği `35f2405` olarak korunur; dokümantasyon push'u yeni native test sayılmaz.

Native Store contention profili HTTP admission katmanından geçmez. Native HTTP concurrency suite'i kabul edilmiş istekler için daha geniş test kotası kullanır; varsayılan 2+8 HTTP taşma sözleşmesi SQL.js/Chromium testlerinde doğrulanır. Native profil sonucundan yeni HTTP sınırının üretim gecikmesini azalttığı veya kurum yükünü karşıladığı çıkarılmaz.

## Kontrollü aktarım

İşlem öncesi iki klasörde başlangıç manifest'indeki bütün kaynak/çıktı hash'leri kontrol edildi. 13 dosyalık değişiklik Git kopyasına, bunlardan 12'si runtime kopyasına ve iki güncel manifest kontrollü olarak aktarıldı; **27 dosya güncellemesi**. Geri alınabilir yedek `.deployment-backups/n3-mutation-admission-20261011T113503Z` altında. Son concurrency test assertion'ı üç kopyada aynı şekilde korundu ve geniş doğrulama tekrar geçti.

Runtime'daki `tests/http-config.test.mjs`, çalışma başlangıcında Git sürümünden farklıydı; bu yerel test ezilmedi. Yeni startup kontrolleri canonical Git kopyasında yer alır ve CI'da çalışır. Runtime'a özgü `tests/milestone-note-dates.test.mjs` de değişmedi. Bu iki yerel testin bulunduğu runtime test ağacı, canonical CI test ağacıyla özdeş ilan edilmez. Uygulama kaynakları ve derleme ise manifest ile doğrulandı: **409 kaynak, 437 disk çıktısı, 7 güncel paket çıktısı**. Mevcut frontend çıktı baytları değişmedi.

Gerçek DB/account/migration/restore işlemi yapılmadı. Çalışan uygulama süreci yeniden başlatılmadı; diskteki yeni backend kodunun mevcut süreçte yüklendiği iddia edilmez.

## Kalan işler ve önerilen sıra

1. **N3:** komut bazlı dar SQL okuma/doğrulama tasarımı; tam-read referansına karşı revision, yetki, audit, kapsam ve hata/rollback eşdeğerliğiyle ilerlemek. Global kilidi veya son doğrulamayı doğrudan kaldırmamak.
2. Varsayılan admission sınırları için hedef kurum yükü ve proxy ile kapasite kabulü. Çoklu instance/kişisel adil paylaşım, ilk auth DB yükü ve büyük upload ayarları bu adımla kabul edilmiş değildir.
3. N2 bağımlılık uyarıları ve N6 tarihî asset/canlı yayın politikasının kalan işleri; yüksek eşikli audit başarısı orta uyarıları kapatmaz.
4. Windows servis hesabı/ACL, NTLM, proxy/TLS/CA, kurum yedekleme RPO/RTO ve gerçek SQL execution plan/IO/GC/WAN davranışı operasyonel ortamda ayrıca doğrulanmalı.
