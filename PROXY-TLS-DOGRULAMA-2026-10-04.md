# Proxy/TLS yapılandırma incelemesi — 4 Ekim 2026

## Sonuç ve sürüm

Windows başlatma kontrolünün ardından proxy/TLS için kaynak çağrı zinciri ve sentetik HTTP/HTTPS davranışı incelendi. Başlangıç commit'i `d1419680ca0fe280ce3a6d0e063588263e5b862a`; Git çalışma ağacı temizdi. Bu turun değişiklikleri adres/port ön kontrolü, HTTPS istek koruması, ilgili testler ve kılavuzlarla sınırlıdır. Şema, migration, DB adaptörleri, kaynak iş kuralları veya frontend değiştirilmedi.

Kod/test/CI/kılavuz düzeltmesi `d17a0d9b20180f65cf646ae254ba54ba6c500238` ile main'e gönderildi. [37195873933 kalite koşusu](https://github.com/zaferond/AA-Kaynak-Planlama-Sistemi/actions/runs/37195873933) Ubuntu ve Windows'ta başarılıdır. Job loglarında **426/426 genel test, 77/77 Windows sentetik test ve 69 başarılı tarayıcı kontrol grubu**, sıfır başarısız/atlanan test doğrulandı. Format/domain/TypeScript/site build ve iki npm audit kapısı da geçti; audit çıktıları o koşuda sıfır bilinen bağımlılık açığı bildirir. Bu, yeni veya uygulama mantığına ait açık bulunmadığının kanıtı değildir.

İki kök neden giderildi; biri yapılandırma kaynaklı kullanılabilirlik sorunu, diğeri HTTPS dağıtımında savunma derinliğidir. Yetkisiz veri erişimi veya gerçek ortamda istismar gösterilmedi. Bu çalışma kurum TLS/ağ kabulünün veya uygulamanın bütünüyle güvenli olduğunun kanıtı değildir.

## Bulgular, kanıt ve düzeltme

| # | Önem | Başlangıç kodu / çağrı zinciri | Etki ve güvenli yeniden üretim | En dar düzeltme ve güncel durum |
|---|---|---|---|---|
| P1 | ORTA | `backend/server.mjs:6–14, 35–43`: yalnız `startsWith("https://")`, ardından Store açma/bootstrap; `backend/app.mjs:48–62`: URL yalnız istekte ayrıştırılıyor, Origin ham ayarla karşılaştırılıyordu. Dinleme portu `Number(...)` ile ancak DB açıldıktan sonra kullanılıyordu. | Hatalı dağıtım ayarı önkoşuldur. Sentetik `https://synthetic.invalid/` ve tarayıcı biçimindeki Origin ile giriş 403; `https://` ile ilk istek 500 oldu. Geçersiz port ve bozuk Origin için DB açma/bootstrap öncesi durma garantisi yoktu. Ham Origin başlangıç mesajında yer aldığından yanlışlıkla kullanıcı/parola içeren URL'nin loga taşınması da mümkündü; gerçek log veya gizli ayar okunmadı. | Yeni `backend/http-config.mjs` URL'yi yapılandırma aşamasında doğrular; root slash, büyük harf ve varsayılan portu tarayıcı Origin biçimine çevirir. Alt yol/sorgu/fragment/kullanıcı bilgisi reddedilir. Port 1–65535 tam sayı olmalıdır. `server.mjs` bunu Store oluşturulmadan çağırır; `app.mjs` de adresi kurulumda doğrular. Hatalar girilen değeri yazmaz. Sentetik başlangıç tripwire testi hiçbir DB kurucusuna ulaşılmadığını doğrular. **Düzeltildi; yüksek güven.** |
| P2 | DÜŞÜK | `backend/app.mjs:28–50, 83–88`: Secure cookie/HSTS ayarı vardı; HTTPS yapılandırmasında isteğin protokolü kontrol edilmiyordu. | Backend HTTP portuna erişim ve doğru Host/Origin önkoşuldur. Doğrudan HTTP ve güvenilmeyen bağlantının `X-Forwarded-Proto: https` iddiası, `{}` gövdesiyle giriş doğrulamasına ulaşıp 400 döndü. Bu test giriş veya yetki atlama göstermez. Gerçek veri/oturum etkisi için ayrıca geçerli kimlik bilgisi/token gerekir; tarayıcının Secure cookie göndermemesi sunucu tarafı protokol kontrolünden ayrıdır. | HTTPS adresinde Express `req.secure` şartı eklendi. Eksik/HTTP/geçersiz protokol ve güvenilmeyen peer'in HTTPS iddiası artık 403; JSON, sayaç, oturum ve API erişiminden önce reddedilir. Güvenilen proxy'nin HTTPS bilgisi kabul edilir. Secure cookie/HSTS doğrudan doğrulanan şemadan türetilir. **Düzeltildi; yüksek güven.** Ağ sınırı ve proxy header overwrite hâlâ gerekir. |

P1/P2 önceki B1–B6 bulgularının tekrar açılması olarak değerlendirilmedi; kalan operasyonel **proxy/TLS kabulü** başlığında bulunan bu turun kod bulgularıdır. Satır numaraları başlangıç commit'ine aittir; yeni doğrulama modülü ve testler yukarıda adlarıyla belirtilmiştir.

## Çalıştırılan komutlar ve ortam

| Komut / yöntem | Sonuç ve dokunduğu ortam |
|---|---|
| Git durum/HEAD/diff ve seçili kod okumaları | Başlangıç sürümü ve bu turun farkları doğrulandı. Gerçek `.env`, hesap, çalışan verisi veya DB içeriği okunmadı. |
| Başlangıç sürümünün geçici Git archive kopyasında `node --input-type=module` | Dört sentetik HTTP senaryosu, yalnız loopback/rastgele port ve bellek stub'ı: root slash 403; bozuk HTTPS Origin 500; doğrudan HTTP ve güvenilmeyen HTTPS iddiası 400. İlk denemede fetch bilinçli Host başlığını hedeflenen şekilde iletmedi; o sonuç kanıt sayılmadı. `node:http` ile header kontrolü yapılarak tekrarlandı. Geçici çıktıda yalnız sentetik değerler bulunur. |
| `node --test tests/http-config.test.mjs tests/proxy-transport.test.mjs tests/proxy-tls.test.mjs tests/login-security.test.mjs tests/config.test.mjs` | Mac / Node 24.21.0, güncel kaynakların geçici kopyasında **15/15**, sıfır başarısız/atlanan test. Başlangıç alt süreçlerinde yalnız açık sentetik env ve gerekli OS geçici dizin değişkenleri vardır; `.env` yüklenmez. DB, auth ve app tripwire'larıyla yapılandırma hatalarının gerçek server giriş noktasında Store oluşturulmadan durduğu kontrol edilir. |
| Gerçek HTTPS proxy testi | Teste ait bir günlük self-signed sertifika ve yalnız sentetik SQL.js tempfile. Güvenilmeyen CA ve yanlış hostname reddi, root slash ile başarılı giriş, client'ın sahte protokolünün proxy tarafından değiştirilmesi, Secure/HttpOnly/SameSite cookie, HSTS, no-store, oturum kimliği, Host/Origin/CSRF, logout ve ortak bağlantı IP kotası kontrol edildi. Genel TLS doğrulaması kapatılmadı; gerçek hesap kullanılmadı. |
| Değişen MJS dosyalarında Prettier; `git diff --check` | Geçti. Formatter yalnız seçili dosyaları geçici kaynak kopyasında düzenledi; ilgisiz kaynaklar topluca değiştirilmedi. |

Yeni **4 yapılandırma + 3 transport testi** Ubuntu genel testlerine ve Windows sentetik işine eklendi ve yukarıdaki kalite koşusunda geçti. Sertifika üreten `proxy-tls.test.mjs` Ubuntu genel testlerinde kalır; Windows işi için OpenSSL bulunduğu varsayılmaz.

## Kontrol edilen alanlar

- `server → httpConfig → Store → createApp` başlangıç sırası; bozuk ayarda DB/bootstrap öncesi durma, hatada ayar değerinin gizlenmesi.
- `createApp → trust proxy → HTTPS/Host → Origin → login limiter → JSON → auth/session → API` sırası. Bilinçli Host testlerinde `node:http` kullanıldı.
- HTTPS adresinde cookie bayraklarının otomatik seçimi ve HSTS; local HTTP davranışının korunması.
- Açık proxy IP/CIDR doğrulaması ve bağlantı IP bütçesi; X-Forwarded-Host ile Host kontrolünün atlanmaması.
- MSSQL adaptörünün encrypt/sertifika doğrulama varsayılanları ve production'da zayıf TLS ayarını reddeden mevcut config testi. Adaptör değiştirilmedi.

Teknik dayanak: [Express güvenilen proxy ve header davranışı](https://expressjs.com/en/guide/behind-proxies/), [Express req.secure](https://expressjs.com/en/5x/api/request/#req.secure), [Node URL origin](https://nodejs.org/api/url.html#urlorigin). `req.secure` ağ topolojisinin yerine geçmez; güvenilen socket peer'inin ilettiği protokol bilgisini kullanır.

## Doğrulanmayan kurum kabulü

1. Gerçek proxy ürünü/sürümü, adresleri, farklı bağlantı yolları ve çoklu proxy zinciri; header overwrite ve Node portunun dışarıdan kapalı olması.
2. Kurum HTTPS CA/SAN/ara sertifika zinciri, yenileme, TLS sürümü/cipher politikası, HTTP→HTTPS yönlendirmesi ve HSTS'nin kurum alan adına etkisi.
3. Farklı sunucularda proxy–Node trafiğinin korunması. Node sunucusu HTTP dinler; bu değişiklik o bağlantıyı şifrelemez. Güvenilen IP'den veya loopback'ten bağlanabilen başka süreç başlığı taklit edebilir.
4. Windows servis hesabı, ACL/SCM süreç yönetimi, gerçek MSSQL/NTLM/CA ve asgari yetkili DB hesabı.
5. Gerçek kurum yükü/NAT dağılımı ve proxy limitleri/timeoutları; gerçek yedekleme ve geri dönüş tatbikatı.

Bu doğrulamalar ayrı sentetik kurum ortamında yapılmalıdır. Bu tur gerçek servis/proxy/firewall/sertifika ayarı, hesap açma, migration/restore veya üretim verisi işlemi yapmadı. Mevcut localhost uygulaması yeniden başlatılmadı.

Git deposundaki bu turun 10 kaynak/test/CI/kılavuz dosyası üstteki çalışan kaynak kopyasına da yansıtıldı. Başlatıcı ve ilk kullanım belgesinin önceki turda kaydedilen üst kopya farkları korunur; ilgisiz kullanıcı çalışması ezilmedi. Çalışan sayfanın yalnız kimliksiz statik `/` GET kontrolü 200 döndü; mevcut süreç yeni backend kodunu bir sonraki açılışında yükleyecek. Gerçek verilerle yeni sürüm kabulü yapılmış sayılmaz.

## Sonraki iş ve kapsam sınırı

Kod tarafındaki bu başlık tamamlandıktan sonra sıradaki kabul, IT'nin **gerçek proxy/TLS ve Windows servis/ACL** yapılandırmasının ayrı test ortamında doğrulanmasıdır. Gereken kurulum koşulları [proxy kılavuzunda](GIRIS-KORUMASI-VE-PROXY.md) ve [Windows kılavuzunda](WINDOWS-BASLATMA-VE-SERVIS-KILAVUZU.md) bulunur. Bu rapor yeni bir tam mimari denetim, bağımlılık güncellemesi, yük testi veya kurum canlı ortam kabulü değildir. Önceki native MSSQL koşusu yeni HTTP değişikliklerini doğrulayan koşu olarak sunulmaz.
