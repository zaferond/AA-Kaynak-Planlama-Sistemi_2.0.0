# Yerelde başlatma — SQLJS + MSSQL sürümü

Bu paket iki mod içerir:

- **Yerel test:** Node.js + `sql.js`. Kayıtlar bilgisayarınızda `data/planlama.sqlite` dosyasına yazılır. Docker veya SQL Server kurmanız gerekmez.
- **Şirket ortamı:** Node.js + `mssql`. Kayıtlar IT'nin SQL Server veritabanına yazılır. Bağlantı `.env` dosyasında tanımlanır.

`sql.js`, SQL Server değildir; SQLite kullanır. Canlı bağlantıyı mümkün kılan, bu projeye eklenen ayrı MSSQL bağlantı katmanıdır. Yerel test, SQL Server üzerinde son doğrulamanın yerini tutmaz.

## Windows'ta başlatma

1. ZIP'e sağ tıklayın → **Tümünü ayıkla**. Yeni klasörü kullanın; eski PostgreSQL/MongoDB klasörünün üzerine kopyalamayın.
2. **Node.js 24 veya daha yenisi** kurulu olmalı. Docker Desktop açmanız gerekmez.
3. Çıkan klasörde **baslat-windows.cmd** dosyasına çift tıklayın.
4. İlk çalıştırmada giriş e-postası sorulur. `mehmetzaferonder@gmail.com` için Enter'a basın veya başka bir kullanıcı adı yazın.
5. En az 10 karakterlik kendi şifrenizi belirleyin; istenince tekrar yazın. Yazarken görünmez; bu normaldir. Bu kurulum aracında tek tırnak karakteri kullanmayın.
6. Paketlerin internetten indirilmesini bekleyin. **Sistem hazır: http://localhost:3000** mesajı geldiğinde tarayıcıda bu adresi açın.

Pencere açık kalmalıdır. Sonraki açılışlarda aynı `baslat-windows.cmd` dosyasını çalıştırın; veriler ve şifre korunur.

Komutları kendiniz çalıştırmak isterseniz `package.json` bulunan klasörde PowerShell açıp sırayla:

```powershell
node backend/setup.mjs
npm.cmd ci --omit=dev
npm.cmd start
```

Sonraki açılışlarda yalnızca `npm.cmd start` yeterlidir. Durdurmak için Ctrl+C basın. Aynı anda ikinci bir kopya açmayın.

## Mac'te başlatma

Node.js 24 veya daha yenisi kurulu olmalıdır. Docker gerekmez; bu yerel mod Apple Silicon Mac'lerde de SQL Server emülasyonu gerektirmez.

ZIP'e çift tıklayıp çıkarın. Terminal'e `cd` ve bir boşluk yazın; `baslat-mac.sh` dosyasını içeren klasörü Terminal'e sürükleyip Enter'a basın. Ardından:

```bash
bash baslat-mac.sh
```

İlk giriş bilgilerinizi belirleyin. Hazır mesajından sonra **http://localhost:3000** açın. Sonraki açılışlarda aynı komutu kullanın; durdurmak için Control+C.

## Veriler nerede?

- Proje/çalışan/dağılım kayıtları ve hesaplar: `data/planlama.sqlite`.
- Bağlantı ve başlangıç ayarları: `.env`.
- Başlangıçta 54 takım ve 7 liderlik listesi bulunur; çalışan/proje/dağılım kayıtları boştur.
- `.env` veya `data` klasörünü silmeyin. Paketi yeniden çıkarmanız verileri otomatik yeni klasöre taşımaz.
- Uygulama içindeki **Veri yedeği indir** planlama yedeğini verir. Bu JSON şifreli değildir, kullanıcı hesaplarını içermez.
- Tam yerel yedek için uygulamayı durdurduktan sonra `data/planlama.sqlite` dosyasını kontrollü bir konuma kopyalayın. Dosya şifrelenmiş değildir; parolalar dosyada hash olarak saklansa da çalışan kayıtları okunabilir. İşletim sistemi hesabınızın erişimini koruyun.

Bu yerel mod tek Node.js süreciyle test içindir. Şirketin ortak kullanımı için MSSQL modunu seçin.

## Eski verilerimi kullanabilir miyim?

Eski PostgreSQL veya MongoDB portalından **Veri yedeği indir** ile JSON alın. Yeni portalda admin girişiyle **Yedek yükle** yapın. Mevcut planlama verileri yedektekilerle değiştirilir; birleştirme yapılmaz. Önce mevcut verinizi yedekleyin. Kullanıcılar ve şifreler taşınmaz; Yetkilendirme sekmesinden yeniden oluşturulur.

Eski tek HTML sürümünün şifreli yedeği için `IT-MSSQL-GECIS.md` dosyasındaki dönüştürme adımını kullanın.

## Sık karşılaşılan sorunlar

| Durum | Çözüm |
|---|---|
| Node.js bulunamadı / sürüm eski | Node.js 24+ kurup Terminal/PowerShell'i yeniden açın. |
| `3000 portu kullanımda` | Eski portalı veya diğer açık pencereyi Ctrl+C ile durdurun. |
| Tarayıcı açılmıyor | Hazır mesajını bekleyin; adresi `http://localhost:3000` olarak yazın. Pencere açık kalmalı. |
| Giriş hatalı | Kurulumda belirlediğiniz giriş bilgilerini kullanın; ChatGPT şifresiyle bağlantısı yoktur. |
| Dosya kullanımda / kilit kaldı | Önce bu portalın diğer Node.js pencerelerini kapatın. Hiçbir kopya çalışmadığından emin olduktan sonra sadece `data/planlama.sqlite.lock` dosyasını silip tekrar başlatın. **planlama.sqlite dosyasını silmeyin.** |
| İndirme hatası | İnternet/proxy ayarlarını kontrol edip komutu tekrar çalıştırın. |
| Eski veriler kaybolmuş gibi | Aynı proje klasörünü ve aynı `.env` ayarını kullandığınızı kontrol edin. |

Şifre değiştirmek için sistemi durdurun, `.env` içine geçici `NEW_ADMIN_PASSWORD='yeni-sifreniz'` ekleyin, `npm.cmd run admin:password` çalıştırın (Mac'te `npm run admin:password`). Sonra geçici satırı kaldırıp uygulamayı yeniden başlatın.

## Canlıya geçiş

`.env.mssql.example` örneği ve `IT-MSSQL-GECIS.md` dosyası IT içindir. MSSQL modu seçilip bağlantı ayarları girildiğinde aynı arayüz MSSQL kullanır. Ancak IT'nin önce veritabanını, şemayı, erişim ve sertifika ayarlarını hazırlaması gerekir. Yereldeki veriler otomatik taşınmaz; yedek aktarması ayrıca yapılır.

Bu teslimde yerel sql.js uçtan uca akışı ve 6 otomatik test grubu geçti. TypeScript ve arayüz derlemesi geçti. Gerçek şirket MSSQL bağlantısı ve Windows çift tıklama akışı bu ortamda çalıştırılamadı. MSSQL test komutu pakette mevcuttur.
