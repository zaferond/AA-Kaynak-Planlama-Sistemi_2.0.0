# M4 — Backend bağımlılık güvenliği

> **14 Ekim 2026 — M6 ek doğrulaması:** Tedious 20.3.8 / MSSQL 12.7.2, şema 35 ve iki bağımsız havuzla **40/40 native kontrol** geçti. Bağımlılık güncellemesinin bu kaynak için geçici SQL Server kabulü artık mevcut; gerçek kurum CA/NTLM/servis kabulü ayrıca gerekir. Test edilen bütünleşik kaynak `0193506`; [M6 kanıtı](M6-NATIVE-CI-YAYIN-KABULU-2026-10-13.md). Aşağıdaki özgün kayıt 13 Ekim’deki yerel aşamayı anlatır.

Tarih: 13.10.2026. Başlangıç kaynak commit'i: `ee4ebbd3d014454fadf7dbfaba40892028fea1f0`; çalışma ağacındaki M1–M3 değişiklikleri korundu. Node **24.21.0**, npm **11.19.0**.

## Sonuç

**Bağımlılık bulgusu giderildi; native MSSQL/kurum kabulü doğrulanmadı.** `sprintf-js` artık kilit dosyasında ve iki yerel kurulumda bulunmuyor. Backend audit, aynı kökten iki Orta bildirimden **0** bildirime indi; frontend audit **0** kaldı. Bu sonuç uygulamanın bütünüyle güvenli olduğunun kanıtı değildir.

Önceki rapordaki **M4 / Orta**, daha eski **N2 / Kısmen giderildi** kaydının devamıdır. Eski statik biçim kontrolü yalnız maruziyeti sınırlıyordu. Şimdi upstream bağımlılık kaldırma düzeltmesi kullanılıyor; uyarı muafiyeti veya node_modules üzerinde yerel yama eklenmedi.

## Sürüm kararı ve dar değişiklik

- Resmî Tedious **20.3.6** yayını `sprintf-js` bağımlılığını kaldırır. İnceleme sırasında yayımlanmış **20.3.7** TLS zorunluyken şifreleme düşürmeyi reddeder; **20.3.8** Login7 debug çıktısında parola alanlarını gizler. Bu nedenle hedef sürüm **20.3.8** seçildi.
- Mevcut `mssql 12.7.2`, `tedious ^19.2.2 || ^20.0.0` aralığını destekler. Tedious 20.3.8 Node >=22 gerektirir; uygulamanın Node >=24 gereksinimiyle uyumludur. Bu, gerçek bağlantı davranışının native olarak doğrulandığı anlamına gelmez.
- `package.json`: yalnız `mssql` altındaki Tedious için **20.3.8** override eklendi. İleride sürüm değişikliği bu açık seçim ve güvenlik testleriyle birlikte değerlendirilmelidir.
- `package-lock.json`: değişen tek mevcut paket kaydı **Tedious 20.0.0 → 20.3.8**; kaldırılan tek paket kaydı **sprintf-js 1.1.3**. Yeni paket eklenmedi; MSSQL ve diğer bağımlılıkların sürümleri değişmedi. Registry adresi ve integrity npm tarafından birlikte üretildi.
- `.github/workflows/quality.yml`: backend audit eşiği `high` yerine **`moderate`** oldu. CI tanımı güncellendi; bu tur GitHub üzerinde koşturulmadı.
- Migration, uygulama iş kuralı, SQL sorgusu, bağlantı ayarı veya frontend paleti değiştirilmedi. `npm audit fix --force` kullanılmadı.

## Regresyon kontrolleri

`tests/dependency-security.test.mjs` içindeki iki geçici sprintf kullanım testi, kaldırılmış paketi zorunlu arayacağı için değiştirildi. Mevcut iki source-map güvenlik testi korundu. Yeni dört kontrol:

1. Root override ve kilit sürümü uyuşur; tüm kilit kayıtlarında doğrudan veya iç içe `sprintf-js` paketi/bağımlılığı bulunmaz.
2. Kurulu MSSQL'in gerçekten çözümlediği Tedious, kilitle aynı sürümdedir; `sprintf-js` çözümlenemez ve Tedious JavaScript kaynaklarında bu paketin importu kalmamıştır.
3. Sentetik Login7 parola/değiştirilen parola değerleri debug metninde görünmez. Türkçe ve biçim belirteci gibi görünen kullanıcı metni korunur; debug üretimi seri hale getirilmiş giriş paketini değiştirmez.
4. Bellekteki protokol bağlamında TLS zorunluyken `OFF`, `NOT_SUP` veya eksik şifreleme yanıtı **EENCRYPT** ile reddedilir. `ON`/`REQ` TLS çağrısına geçer ve sertifikaya koşulsuz güvenme seçeneği kapalı iletilir. Gerçek TLS el sıkışması/sertifika zinciri denenmez; soket veya DNS kullanılmaz.

Yeni güvenlik davranışı kontrolleri eski Tedious kurulumunda başarısız oldu: bağımlılık hâlâ vardı, sentetik parola debug metninde görünüyordu ve şifreleme düşürme reddedilmiyordu. Bunlar kütüphane davranışı kanıtıdır; uygulamanın gerçek ortamında parolanın loglandığı veya saldırı gerçekleştiği sonucu çıkarılmaz. Yeni sürümde kontroller geçti.

## Çalıştırılan komutlar ve sonuçları

| Kontrol | Sonuç ve ortam |
|---|---|
| Geçici kaynak kopyasında `npm install --package-lock-only --ignore-scripts --audit=false --fund=false` | Yeni override için yalnız yukarıdaki iki kilit kaydı değişti. |
| Aynı kopyada `npm ci --ignore-scripts --audit=false --fund=false` | Yeni kilitten temiz kurulum; 142 paket. Lifecycle script'leri çalıştırılmadı. |
| Eski testle yeni kurulum | 4 testten 3'ü geçti; kaldırılmış sprintf çağrısını zorunlu arayan test beklenen şekilde başarısız oldu. |
| Yeni testle eski kurulum | 6 testten 2 source-map testi geçti; yeni 4 kontrol başarısız oldu. |
| `node --test tests/dependency-security.test.mjs tests/config.test.mjs tests/mssql-batch.test.mjs tests/mssql-scan.test.mjs tests/mssql-test-environment.test.mjs` | **34/34**, atlama yok. DB bağlantısı yok. TLS/NTLM ayarları, parametreler, çoklu sonuçlar, akış hatası/iptali ve dinleyici temizliği mevcut testlerle kontrol edildi; MSSQL istek taşıması mock kullanır. |
| Eski backend kilidinde `npm audit --package-lock-only --json --audit-level=moderate` | Exit 1; **2 Orta**, paket bildirimleri `sprintf-js`, `tedious`. Tarama hatası yok. |
| Yeni backend kilidinde aynı audit | Exit 0; **0** bildirim. |
| Frontend kilidinde aynı audit | Exit 0; **0** bildirim. Kilitler audit sırasında değişmedi. |
| Geçici kaynak kopyasında `npm run verify` | **795/795**, 0 atlanan. Biçim, ortak bağımlılık sınırı, TypeScript tip kontrolü ve üretim derlemesi başarılı. |
| Git deposu ve çalıştırma kopyasında temiz `npm ci --ignore-scripts --audit=false --fund=false` | İkisi de başarılı. Gerçek çözüm Tedious 20.3.8; sprintf-js kurulu değil. |
| İki yerel kopyada `node --test tests/dependency-security.test.mjs` | Her birinde **6/6** başarılı. |
| İki yerel kopyada `npm run build` | İkisi de başarılı. |
| İki yerel kopyada `npm run deploy:verify`; `git diff --check` | Başarılı; kaynak/derleme farkı ve whitespace hatası yok. |

Kurulum ve tarama için boş, birbirinden ayrı npm user/global config dosyaları, geçici cache/HOME ve sınırlı ortam kullanıldı. Dışarı yalnız kamuya açık paket metadata/audit bilgileri gönderildi. Kaynak kod, `.env`, parola, token ve çalışan verisi gönderilmedi. Kaynak test kopyasına `.env`/gerçek `data` kopyalanmadı; SQL.js testleri kendi geçici sentetik DB'lerini kullandı. Gerçek kullanıcıyla giriş veya çalışan DB'sinde işlem yapılmadı.

Geçici kaynak ortamı ve npm cache'i çalışma sonunda temizlendi. Çalıştırma kopyasındaki değişen dosyalar aktarılmadan önce eski içerikleri HEAD ile karşılaştırıldı; M1–M3 dosyaları ve gerçek ortam ayarları korunarak yalnız M4 dosyaları aktarıldı.

## Kalan doğrulama ve işletim sınırı

- Komut satırında Docker/sqlcmd bulunmadı; güvenli geçici SQL Server sağlanmadığı için **native MSSQL testi çalıştırılmadı**. Gerçek bağlantı/TLS/NTLM, Unicode/uzun metin aktarımı, transaction rollback/commit ve eşzamanlılık yeni sürümle native CI/kurum test ortamında ayrıca doğrulanmalıdır. Mock/sentetik testler bunun yerine geçmez.
- Tedious 20.0.0–20.3.8 arasında token parser, iptal ve veri aktarımıyla ilgili upstream değişiklikler de vardır. Aynı majör sürüm ve mevcut test başarısı, her kurum verisi için uyumluluk garantisi değildir.
- Gerçek uygulama sunucusu bu çalışmada başlatılmadı/yeniden başlatılmadı. Çalışan bir Node süreci eski sürümü bellekte tutabilir; güncellemeyi yüklemesi için sonraki başlatma/yeniden başlatma gerekir.
- Commit/push ve GitHub workflow çalıştırması bu tur yapılmadı. Audit sonucu **13.10.2026** anlık kaydıdır; yeni duyurular için CI taraması sürer.

## Resmî kaynaklar

- [sprintf-js GHSA-hp3w-g68c-fv3c duyurusu](https://github.com/advisories/GHSA-hp3w-g68c-fv3c)
- [Tedious 20.3.6 — sprintf-js bağımlılığını kaldırma](https://github.com/tediousjs/tedious/releases/tag/v20.3.6)
- [Tedious 20.3.7 — zorunlu şifrelemede TLS düşürmeyi reddetme](https://github.com/tediousjs/tedious/releases/tag/v20.3.7)
- [Tedious 20.3.8 — Login7 debug parolalarını gizleme](https://github.com/tediousjs/tedious/releases/tag/v20.3.8)
- [npm MSSQL 12.7.2 metadata](https://registry.npmjs.org/mssql/12.7.2), [npm Tedious 20.3.8 metadata](https://registry.npmjs.org/tedious/20.3.8)
