# Windows başlatma incelemesi ve doğrulaması — 4 Ekim 2026

## Sonuç ve kapsam

[Native MSSQL kabulünün](MSSQL-CI-DOGRULAMA-2026-10-04.md) ardından Windows başlatma/kurulum akışı incelendi. Bu tur **kaynak kodu ve sentetik başlatıcı kabulünü** tamamlar; kurum Windows servis/ACL/TLS kabulü tamamlandı anlamına gelmez.

Başlangıç Git commit'i `06215696afe74bd73bad82c0371d3496299fad3e`, çalışma ağacı temizdi. Uygulama/CI düzeltmesi `68e99f074c0f10b1bea7f4329a477324e7f49df6`; test sürücüsü düzeltmeleri `d9817e366459f6ea7fd5879d5e37a95dbb79544d` ve `b3c98c4542bbc20b60d23e875426697ae98dbccc`.

Son kod için [37193757804 kalite koşusu](https://github.com/zaferond/AA-Kaynak-Planlama-Sistemi/actions/runs/37193757804) başarılıdır. Önceki başarılı [37193690912 koşusunun](https://github.com/zaferond/AA-Kaynak-Planlama-Sistemi/actions/runs/37193690912) logunda **419/419 genel test, 69/69 tarayıcı grubu, Windows 70/70 sentetik test** doğrulandı. Yeni kodda yalnız test ortamına Windows `PATHEXT` aktarımı eklendi; son koşunun iki işi de başarılıdır.

## Bulgular ve en dar düzeltmeler

| Önem | Dosya / kod kanıtı | Önkoşul ve sonuç | Düzeltme / doğrulama |
|---|---|---|---|
| ORTA | `backend/ensure-dependencies.mjs:8–13, 35–40, 57–64`: frontend için boş npm seçenekleri; gereken dev paketleri kurulmadan başarı hash'i yazılabiliyordu. | Kurulum sürecinde `NODE_ENV=production` olduğunda npm devDependencies'i atlar. TypeScript/Vite bulunmaz ve build/başlatma durur. Yetki atlama veya veri kaybı gösterilmedi. | Frontend için açık `--include=dev`, backend için mevcut `--omit=dev`; cache kontrolünün gerekli dev paketlerini sayması korunur. Gerçek npm/yerel `file:` paketleri ile çevrimdışı önce eksik, sonra mevcut; iki kurulum da exit 0. |
| DÜŞÜK | `backend/setup.mjs:6–23`: `fs.access` yalnız varlığı kontrol ediyordu, `.env` adlı dizin geçerli ayar kabul ediliyordu; bütün erişim hataları dosya yokmuş gibi ele alınıyordu. | Dizin, kopuk symlink veya erişim hatasında yanlış kurulum mesajı/akışı. Dizin senaryosu yeniden üretildi; gerçek Windows EACCES/NTFS sonucu test edilmedi. | Varlık, normal dosya ve okunabilirlik denetlenir; yalnız gerçekten olmayan dosya ilk kuruluma geçer. Hata ayar içeriğini yazdırmadan bildirilir. Yeni test dizini reddeder, mevcut sentetik dosyayı byte olarak korur. |
| DÜŞÜK | `baslat-windows.cmd:2–17`: klasöre geçiş sonucu kontrol edilmiyordu; npm eksikliği kurulumdan sonra fark ediliyordu. | Klasöre geçilemezse yanlış cwd'de komut yürütme, npm yoksa sonuçsuz kurulum. Bu koşullardan üretim veri kaybı iddia edilmez. | `cd` hata kontrolü ve setup öncesi npm kontrolü; `setlocal EnableExtensions DisableDelayedExpansion`; `.gitattributes` ile CRLF. Gerçek Windows cmd.exe'de özel karakterli yol, tekrar açılış, dört aşama hatası, npm eksikliği ve geçersiz ayar testi. `cd` erişim reddi Windows'ta ayrıca yeniden üretilmedi. |

Bu bulgular önceki rapordaki açık **Windows operasyonel kabul** başlığının kod incelemesinde bulundu. Önceki B1–B6 bulgularının yeniden açılması veya yeni bir yetki ihlali kanıtı değildir. İş kuralları, veri şeması, oturum/API ve arayüz değiştirilmedi.

## Çalıştırılan kontroller

| Komut / yöntem | Sonuç ve dokunduğu ortam |
|---|---|
| `node --test tests/startup-tools.test.mjs` | Mac'te ayrı kaynak kopyasında **5/5**, sıfır başarısız/atlanan test. Kopyalanan gerçek CLI kodları OS geçici fixture'larında çalışır; npm stub'ı kullanılır. Production paketleri/cache/eksik paket/kilit değişimi, hata/retry, mevcut `.env`/sentetik veri korunması, geçersiz ayar ve headless ilk kurulum kontrol edilir. |
| Gerçek npm ile çevrimdışı önce/sonra | Yalnız sentetik manifest/lock ve yerel `file:` paketleri, ayrı boş user/global config/cache. Offline, ignore-scripts, audit/fund kapalı; registry loopback kullanılmaz adrese ayarlandı. Eski kod derleme paketini atlayıp başarı işareti yazdı; yeni kod paketi kurdu. İlk minimal fixture denemelerinde runtime bağımlılığı olmadığı için `node_modules` oluşmadı; uygulama hatası olarak sayılmadı, gerçek akışa uygun sentetik runtime bağımlılığı eklendi. |
| `node --check` ve değişen MJS dosyalarında Prettier | Syntax/format kontrolü geçti; kaynak kopyası dışında build veya uygulama verisine yazma yapılmadı. |
| Windows `node --test ... tests/startup-tools.test.mjs tests/windows-launcher.integration.mjs` | Yeni **5 taşınabilir + 7 Windows başlatıcı testi** mevcut 58 teste eklendi. Gerçek Windows cmd.exe ve gerçek .cmd; npm ci/build/start stub. Gerçek sunucu veya DB açılmaz; mevcut sentetik `.env` ve DB sentinel'i değişmez. |
| CI `npm run verify`, tarayıcı kontrolü, npm audit kapıları | Linux format/domain/TypeScript/derleme ve genel/tarayıcı testleri, Windows gerçek arayüz derlemesi ve seçili sentetik testler geçti. Test DB'leri ayrı sentetik fixture'larda; üretim bağlantısı kullanılmadı. |
| `git diff --check` ve kaynak karşılaştırması | Yalnız bu turun başlatıcı/kod/test/CI/kılavuz değişiklikleri gönderilir. Gizli ayar, gerçek DB, log veya geçici npm/test artifact'i Git'e eklenmez. |
| Native rapor kaynak hash karşılaştırması | Önceki native CI'ın kapsadığı **48 dosya aynı**; SQL migration/Store/API iş kuralları değiştirilmediği için SQL Server testi gereksiz yere yeniden çalıştırılmadı. Bu kontrol yeni başlatıcı veya servis için native kabul iddiası değildir. |

## İlk Windows koşusunun test sürücüsü hatası

[37193481659](https://github.com/zaferond/AA-Kaynak-Planlama-Sistemi/actions/runs/37193481659) Linux'ta geçti, Windows'ta başarısız oldu. Test sürücüsünün `cmd /s /c` tırnaklaması özel karakterli yolun dış tırnaklarını kaybettirdi; `.cmd` kodu çalışmadan komut yorumlayıcı hata verdi. Bu uygulama başlatıcısı hatası diye raporlanmaz.

Sürücüye komut yorumlayıcının kaldıracağı dış tırnak çifti eklendi. Geçersiz `.env` testi de yalnız exit 1 yerine beklenen gerçek hata mesajını şart koşar; yanlış sebeple duran test başarı sayılmaz. `PATHEXT` standart OS değişkeni izole Windows alt sürecine aktarılır. Kontroller gevşetilmedi veya başarısız senaryolar atlanmadı.

## Çalışan uygulama ve gerçek ortam sınırı

Gerçek `.env`, hesap veya çalışan veritabanı okunarak test yapılmadı. Kaynak incelemesinde yalnız setup kodu görüldü; gerçek ayar dosyasının içeriği açılmadı. Yeni testler geçici sentetik klasörlerini kapanışta siler. Çalışan localhost uygulaması yeniden başlatılmadı, gerçek hesaba giriş yapılmadı; migration/restore veya test kaydı çalıştırılmadı.

Kuruma ait servis hesabı, NTFS DACL, Explorer çift tıklama/ilk parola TTY'si, gerçek Ctrl+C/SCM stop/boot/crash, asgari izinli SQL/NTLM hesabı ve CA zinciri **doğrulanmadı**. Windows CI'daki npm/start stub'ları gerçek sunucu süreci yönetimini kanıtlamaz. POSIX `0600` Windows erişim kontrolünün kanıtı değildir.

Uygulanacak adımlar ve kaydedilecek kanıtlar [Windows başlatma/servis kılavuzunda](WINDOWS-BASLATMA-VE-SERVIS-KILAVUZU.md). Servis kurmak veya kurum izinlerini değiştirmek bu turun kapsamına alınmadı.

## Kopyalar ve Git kapanışı

Git deposundaki kaynak ve kılavuzlar güncellendi; çalışan üst kopyaya başlatma araçları/testler/kılavuzlar yansıtıldı. Üst kopyadaki `ONCE-BUNU-OKUYUN.md` ve Windows başlatıcısı başlangıçta Git sürümünden farklıydı: frontend build adımı çıkarılmıştı. Bu farklılık kullanıcı çalışması kabul edilerek ezilmedi. Üst başlatıcıya aynı npm/cwd/ortam kontrolleri uygulanırken mevcut build yapmama davranışı korundu; farklı başlangıç belgesi korunur. Windows CI'ın doğruladığı `.cmd`, Git deposundaki build içeren sürümdür; üst no-build varyantı için ayrı Windows çalıştırma kanıtı iddia edilmez. Güncel dağıtım kılavuzları Git deposunda ve yeni Windows kılavuzunda bulunur.

## Sonraki adım

Windows başlığının kalan kısmı, IT'nin ayrı sentetik Windows test ortamında **servis hesabı/ACL ve durdurma–yeniden başlatma kabulü**dür. Ortam sağlanana kadar yerel kod incelemesiyle devam edilebilecek sonraki başlık kurum proxy/TLS yapılandırmasının dağıtım gereksinimleridir. Gerçek proxy/sertifika zinciri için ayrıca kurum ortamı gerekir.

Teknik dayanaklar: [npm omit/include](https://docs.npmjs.com/cli/v11/commands/npm-ci/), [Microsoft cmd /s](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/cmd), [Node 24 Windows alt süreçleri](https://nodejs.org/download/release/latest-v24.x/docs/api/child_process.html).
