# Windows başlatma ve servis kabul kılavuzu

## Bu paketteki başlatma biçimi

`baslat-windows.cmd`, kullanıcının açık terminal penceresinde çalıştırdığı başlatıcıdır. Windows servisi kurmaz. İlk kurulum terminalde kullanıcı adı/şifre ister; mevcut okunabilir `.env` varsa değiştirmez. Başlatıcı Node.js 24+, npm, ayarlar, bağımlılık kurulumu ve derlemeyi sırayla kontrol eder; bir adım başarısızsa sunucuyu başlatmaz.

- Çalışma klasörü betiğin bulunduğu proje klasörüne alınır; geçiş başarısızsa durulur.
- npm bulunamazsa hesap kurulumuna başlanmaz.
- Backend çalışma paketleri `npm ci --omit=dev`, frontend derleme paketleri `npm ci --include=dev` ile kilit dosyasından kurulur. Frontend derleyicisi `NODE_ENV=production` olsa da kurulmalıdır. [npm ci — omit/include](https://docs.npmjs.com/cli/v11/commands/npm-ci/).
- Başarılı kurulumun hash işareti tekrar açılışta kullanılır. Kilit/manifest değişirse veya gerekli paket eksikse ilgili kurulum tekrarlanır; başarısız kurulum için yeni başarı işareti yazılmaz.
- Arayüz derlenir, ardından `npm.cmd start` çalışır. Aynı DB'yi kullanan ikinci yerel kopya açılmamalıdır.

Özel karakterli yolların korunması için gecikmeli değişken genişletme kapalıdır. Git Windows başlatıcısını CRLF olarak çıkarır. [Microsoft setlocal](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/setlocal).

## Kurum servisi için hazırlık

Aşağıdaki maddeler dağıtım gereksinimleridir; bu bilgisayarda gerçek servis kurulmadı veya NTFS izinleri değiştirilmedi.

1. IT, uygulamaya özel servis hesabını ve kullandığı servis yöneticisini belirler. Hesaba yalnız gereken haklar verilir; normal çalıştırma için yönetici grubu üyeliği gerekmemelidir. Servis hesabının giriş hakkı ve parola yaşam döngüsü kurum politikasıyla yönetilir. [Microsoft servis hesabı rehberi](https://learn.microsoft.com/en-us/windows/win32/cimwin32prov/change-method-in-class-win32-service).
2. Paketler, `site/` ve `deployment-manifest.json` dağıtımdan önce hazırlanır; hedefte servis başlatılmadan önce `npm.cmd run deploy:verify` başarılı olmalıdır. Bu komut dosyaları yalnız okur; çalışan süreç sürümü, paket bağımlılıklarının içeriği, ACL veya SQL bağlantısı kanıtı değildir. [Dağıtım doğrulama kılavuzu](DAGITIM-DOGRULAMA-KILAVUZU.md) kapsamı açıklar. Servis açılışında internetten paket kurmak, build yapmak veya etkileşimli `setup` çağırmak yerine hazır uygulama çalıştırılır. Başlatıcıdaki `pause` ve ilk kurulum soruları headless servis akışı için uygun değildir.
3. Servis yöneticisi Node.js 24+ çalıştırır. Çalışma dizini `package.json` bulunan proje klasörü, uygulama argümanları `--env-file=.env backend/server.mjs` olmalıdır. Böylece göreli `.env` yanlış bir sistem klasöründen okunmaz. Bu komut kendi başına Windows SCM servis kaydı oluşturmaz.
4. Servis hesabı uygulama kodu, bağımlılıklar, `shared/`, hazırlanmış `site/`, `.env` ve gerekiyorsa CA dosyasını okuyabilmelidir. Kod/ayar/sertifika dosyalarını yazma hakkı yalnız dağıtım yöneticilerine verilmelidir. Servis logları için ayrı ve erişimi sınırlı hedef hazırlanır; sıradan kullanıcılar ayarları ve logları okuyamamalıdır. Bunlar burada uygulanmış ACL sonuçları değildir.
5. Kurum çalışma modu MSSQL'dir: ayrı çalışma zamanı SQL hesabı, doğrulanan TLS ve HTTPS proxy. Şema geçişi dağıtım sırasında ayrı yetkili hesapla açık operasyon olarak yapılır; servis hesabına kalıcı migration yetkisi verilmez. Ayrıntılar [MSSQL geçiş kılavuzunda](IT-MSSQL-GECIS.md).
6. `NODE_EXTRA_CA_CERTS` gerekiyorsa Node süreci başlamadan önce servis ortamına tanımlanır. Windows oturumunu otomatik devralan Kerberos/gMSA bağlantısı bu uygulamada hazır bir özellik değildir; yapılandırılmış SQL login/NTLM ayrıca doğrulanır.

## Gerçek Windows kabulü için kayıt tablosu

Yalnız ayrı ortam ve sentetik veriyle uygulanır. Çalışan/üretim ortamında işlem yapılacaksa önce açık izin alınır.

| Kontrol | Beklenen kanıt | Bu turdaki durum |
|---|---|---|
| Terminal/çift tıklama, ilk kurulum | Parola ekranda/logda görünmez; `.env` bir defa oluşur; mevcut ayarlar korunur. | İlk kurulumun gerçek etkileşimli Windows TTY/Explorer akışı doğrulanmadı. |
| Headless servis açılışı | Doğru cwd, hazır site, doğru servis hesabı; npm kurulumu/build/soru yok. | Kurum servis yöneticisi ve hesabı henüz sağlanmadı. |
| NTFS erişimi | Servis gerekli dosyaları okuyabilir; sıradan kullanıcı `.env`/log/yedek okuyamaz ve kodu değiştiremez. | Gerçek ACL doğrulanmadı. POSIX `0600` Windows ACL kanıtı değildir. |
| Durdurma / yeniden açma | Servis yöneticisinin stop işlemi gerçekten Node'a ulaşır; süreç/port/kilit bırakılır; sentetik kayıtlar korunur. | Gerçek Ctrl+C/SCM stop ve zaman aşımı davranışı doğrulanmadı. |
| Çökme / makine yeniden başlatma | Yeniden başlatma politikası çalışır; yarım işlem görünmez; ayarlar ve sentetik kayıtlar korunur. | Sentetik Store/rollback CI mevcut; kurum servis crash/boot kabulü yok. |
| SQL kimliği / TLS | Asgari izinli kurum test hesabı, doğru sertifika zinciri, ayrı migration hesabı. | Native CI başarı kanıtı vardır; `sa`/test sertifikası kurum hesabını kanıtlamaz. |

## Otomatik kontrollerin kapsamı

- `node --test tests/startup-tools.test.mjs`: gerçek `setup`/`ensure-dependencies` dosyaları geçici sentetik klasöre kopyalanır. npm ağ çağrısı yerine kontrollü stub kullanılır; production derleme paketleri, cache/eksik paket/kilit değişimi, hata/retry ve `.env` korunması kontrol edilir.
- Windows CI ayrıca `node --test tests/windows-launcher.integration.mjs` çalıştırır: gerçek Windows `cmd.exe` ve gerçek `.cmd` betiği, Unicode/boşluk/`&`/parantez/`!` içeren dizin ve sentetik ayarlar kullanılır. npm kurulum/build/start işlemleri stub'dır; gerçek sunucu veya DB başlatılmaz. Mac/Linux'ta bu test gerçek Windows sonucu gibi çalıştırılmaz.
- Kurulum hatası ayrıca gerçek npm ile ağ kapalı, yerel `file:` paketleri ve ayrı boş npm config/cache kullanılarak önce/sonra yeniden üretildi. Uygulamanın gerçek `.env`, `node_modules` veya DB'si kullanılmadı.

Başlatıcı kontrollerinin kapsamı [Windows doğrulama raporunda](WINDOWS-BASLATMA-DOGRULAMA-2026-10-04.md), commit'e bağlı kalite CI sonuçları [CI kanıt arşivinde](CI-KANIT-ARSIVI.md) bulunur. Bu kontroller kurum servis/ACL kabulünün yerine geçmez.


## 7 Ekim 2026 paket koruması

Yeni paket, geliştirme deposunda build ve doğrulama sonrasında `npm.cmd run deploy:package -- --output "..\AA-dagitim"` ile boş hedefe hazırlanabilir. Mevcut klasörü veya veri/ayarları üzerine yazmaz. Servis açılışı `npm.cmd start` kaynak/site manifestini Store oluşturulmadan önce kontrol eder; başarısız doğrulamada paket yeniden güvenilir kaynaktan hazırlanmalıdır. Mac temiz kurulum kabulü Windows kabulünün yerine geçmez.
