# IT için MSSQL kurulumu ve geçiş

## Mimari ve hedef

Node.js 24+, Express, `mssql` (Tedious) ve yerel test için `sql.js` kullanılır. Arayüz/API/iş kuralları ortaktır; SQLite ve SQL Server için ayrı SQL bağlantı katmanları ve şemalar bulunur. SQL Server'a geçişte Node.js kodunu yeniden yazmak gerekmez. `.env` değişir; uygulama yeniden başlatılır. `sql.js` dosyası SQL Server tarafından doğrudan açılamaz.

MSSQL tarafı SQL Server 2016+ / veritabanı compatibility level **130+** gerektirir (`OPENJSON` kullanılır). Kurumun desteklenen güncel SQL Server sürümünde test edilmelidir. Mevcut kurumsal tabloları kullanmaz; uygulamaya ayrılmış veritabanında `dbo.kp_*` tablolarını kullanır. Veritabanı hesabının varsayılan şeması dbo olmalıdır.

Uygulama bir SQL Server veritabanı/sunucusu oluşturmaz, uzak veritabanına kendiliğinden yayın yapmaz. Yerel modda Docker/SQL Server gerekmez. Gerçek MSSQL testi için IT'nin test sunucusu veya ayrı SQL Server kurulumu gerekir. SQL Server Linux container'ları için x86-64 desteği vardır; Apple Silicon üzerinde emülasyonu desteklenen kurulum olarak varsaymayın.

## 1. IT'den gereken bilgiler

- SQL Server FQDN/hostname ve TCP portu veya named instance adı.
- Uygulamaya ayrılmış boş veritabanı ve ayrı boş test veritabanı.
- Giriş yöntemi: SQL login veya domain kullanıcı/parolasıyla NTLM.
- Şema kurabilen geçici migration hesabı; çalışma zamanı için yalnızca uygulama tablolarına erişen ayrı hesap.
- Uygulama sunucusundan MSSQL'e ağ/VPN/firewall erişimi.
- SQL Server sertifikası için geçerli sunucu adı ve güvenilen sertifika zinciri.
- Portalın HTTPS adresi ve ters proxy/servis ortamı.

Varsayılan Tedious sürücüsü SQL login ve yapılandırılmış NTLM kullanıcı/parolasını destekler. Mevcut Windows oturumunu otomatik kullanma, Kerberos/gMSA/Entra gibi farklı kurum yöntemleri bu pakette yapılandırılmış değildir; IT yöntemi doğrulanmadan yalnızca kullanıcı/parola alanlarının yeterli olduğu varsayılmamalıdır.

## 2. Ortam ayarları

Uygulamayı durdurun. Yerel `.env` dosyasını özel bir yerde saklayın; `.env.mssql.example` dosyasından yeni `.env` oluşturup IT bilgileriyle doldurun:

```dotenv
DB_PROVIDER=mssql
DB_SERVER=sqlserver.sirketiniz.local
DB_PORT=1433
DB_DATABASE=AA_KaynakPlanlama
DB_AUTH=sql
DB_USER=aa_planlama_app
DB_PASSWORD='size-verilen-parola'
DB_ENCRYPT=true
DB_TRUST_SERVER_CERTIFICATE=false
DB_AUTO_MIGRATE=false
APP_ORIGIN=https://planlama.sirketiniz.com
HOST=127.0.0.1
PORT=3000
NODE_ENV=production
ADMIN_USERNAME=mehmetzaferonder@gmail.com
ADMIN_PASSWORD='yalnizca-ilk-kurulumda-gereken-portal-sifresi'
```

DB_USER/DB_PASSWORD SQL Server servis hesabıdır; ADMIN_USERNAME/ADMIN_PASSWORD portalın ilk yönetici hesabıdır. İkisi farklıdır. İlk yönetici yalnızca hesap yoksa oluşturulur; sonraki açılışta ADMIN_PASSWORD değiştirmek var olan şifreyi değiştirmez. İlk kurulumdan sonra ADMIN_PASSWORD satırını kaldırabilirsiniz.

Named instance için `DB_INSTANCE=INSTANCE_ADI` tanımlayın; bu durumda DB_PORT kullanılmaz. SQL Browser ve ilgili ağ erişimi gerekir; IT sabit TCP portu sağlıyorsa port üzerinden bağlantı daha nettir. DB_SERVER alanına `sunucu\\instance` yerine yalnızca sunucu adı girin.

Domain hesabı gerekiyorsa `DB_AUTH=ntlm`, `DB_DOMAIN=DOMAIN`, `DB_USER=kullanici`, `DB_PASSWORD=...` kullanın. Bu, mevcut Windows oturumunu parolasız devralmak değildir.

Kurum CA'sı Node.js tarafından güvenilmiyorsa IT, Node sürecini başlatmadan önce `NODE_EXTRA_CA_CERTS` ortam değişkeniyle CA PEM dosyasını sağlamalıdır. Sertifika hatasını canlıda `DB_TRUST_SERVER_CERTIFICATE=true` yaparak geçmeyin; uygulama production modunda bunu reddeder. Yerel bir SQL Server testinin self-signed sertifikası için development modunda kullanılabilir; canlıya taşımayın.

MSSQL'i yerel bilgisayarda test ederken portal ayarları `APP_ORIGIN=http://localhost:3000`, `HOST=127.0.0.1`, `NODE_ENV=development` kalabilir. Veritabanı uzakta olsa da web uygulaması yerelde çalışır.

## 3. Şema ve başlangıç listeleri

Paket kurulumundan sonra:

```powershell
npm.cmd ci --omit=dev
npm.cmd run db:check
```

Bağlantı sağlandıysa IT, şema oluşturma yetkili hesapla **bir defa** şu komutu çalıştırır:

```powershell
npm.cmd run db:migrate
```

Komut yeni kurulumda `backend/migrations/001_mssql.sql` şemasını, başlangıçtaki 54 takım/7 liderliği ve güncel şema sürümünü hazırlar. Daha önce kişi bazlı sürüm 2 kurulmuşsa kişi tahsisleri ilgili ayın takımına toplanarak `kp_allocations` tablosuna aktarılır. Var olan takım tahsisleri korunur. Şema dosyaları IT incelemesi için düz T-SQL olarak bulunur; scriptler GO ayıracı içermez.

Ardından `.env` dosyasında çalışma zamanı hesabına dönün. Bu hesaba uygulamanın `dbo.kp_*` tablolarında SELECT/INSERT/UPDATE/DELETE ve şema sürüm tablosunda SELECT yeterlidir; CREATE TABLE/db_owner çalışma zamanı için gerekmez. Başlangıçta migration hesabını kalıcı olarak kullanmayın. Veritabanında `sp_getapplock` kullanımının kurum politikasıyla uyumunu kontrol edin.

Production modunda otomatik DDL kapalıdır. `DB_AUTO_MIGRATE=false` korunsun; açık migration komutu yönetici/IT operasyonudur. `.env` ve parolalar kaynak kod deposuna veya tarayıcıya gönderilmez.

## 4. Başlatma ve veri aktarımı

```powershell
npm.cmd start
```

HTTPS proxy gelen Host başlığını korumalı ve Node.js portuna yönlendirmelidir. `APP_ORIGIN` kullanıcının tarayıcıdan açtığı tam origin ile eşleşmelidir. Şirket ortamında Node.js'i servis olarak çalıştırın, yedekleme ve izleme tanımlayın.

Yerel sql.js verilerini taşımak için:

1. Yerel portalda admin olarak **Veri yedeği indir**.
2. Yerel portalı durdurun; MSSQL ayarları ve şema hazır olsun.
3. MSSQL modunda portalı açın, **Yedek yükle** ile JSON dosyasını seçin.
4. Proje/çalışan/takım/dağılım sonuçlarını kontrol edin; kullanıcıları Yetkilendirme sekmesinden yeniden oluşturun.

Bu işlem hedefteki planlama verisini değiştirir; birleştirme değildir. Hedefte mevcut veri varsa önce yedek alın. JSON yedeği kullanıcı parolalarını/hesaplarını taşımaz. JSON şifrelenmiş değildir ve personel verisi içerir; erişimini sınırlayın. Yerel SQLite dosyasını MSSQL'e kopyalamak bu aktarımın yerine geçmez.

Önceki PostgreSQL/MongoDB sürümünün `aa-planning-data-v1` yedeği de yüklenebilir. Çok eski tek HTML sürümünün şifreli yedeğini dönüştürmek için `.env` içine geçici `LEGACY_PASSWORD='eski-ana-yonetici-parolasi'` ekleyin:

```powershell
node --env-file=.env backend/convert-legacy.mjs eski-yedek.json aktarim.json
```

İşlem bitince LEGACY_PASSWORD satırını kaldırın. `aktarim.json` dosyasını portalda yükleyin. Eski ana yönetici şifresi bilinmiyorsa bu araç şifreli yedeği açamaz.

## 5. Tablolar ve tutarlılık

`kp_leaders`, `kp_teams`, `kp_projects`, `kp_project_phases`, `kp_resources`, `kp_resource_versions`, `kp_allocations`, `kp_revisions`, `kp_users`, `kp_user_leaders`, `kp_sessions`, `kp_settings`, `kp_schema_migrations`. Daha önce sürüm 2 kullanıldıysa boşaltılan `kp_person_allocations` tablosu da bulunabilir.

Takım–proje–ay tahsisi benzersizdir. Kaynakların geçerlilik sürümleri ayrı satırlardır. Türkçe metinler NVARCHAR; kimlik/metin karşılaştırmaları BIN2 kolasyonla tanımlıdır. Başlangıç tarihi olmayan dahil aktif ilan reddedilir. Ana kayıtlar ilişkisel tablolarda tutulur; yalnızca eski takım arşivi JSON metnidir. Oturum son kullanma tarihleri iki motor arasında aynı UTC ISO biçiminde tutulur.

SQL girdileri parametrelerle gönderilir. Toplu MSSQL yazmaları parametreli OPENJSON satır kümeleriyle gerçekleştirilir. JSON metni SQL komutu olarak çalıştırılmaz. SQL Server transaction ve `sp_getapplock` ile ortak veri görünümü tutarlı okunur, yazmalar sıralanır. Revizyon kontrolü eski ekranın başka kullanıcının değişikliğinin üstüne yazmasını engeller. Transaction hatasında tamamı geri alınır. Kayıt silinince yalnızca revizyon bilgisi korunur.

sql.js yerel dosyayı geçici dosya + atomik yeniden adlandırma ile kaydeder. Kaydetme başarısızsa bellek içi durum da önceki haline döner. Tek süreç dosya kilidi ikinci kopyanın aynı dosyayı bozmasını önler. Çökmeden sonra kalan `.lock` dosyası, başka süreç olmadığı doğrulandıktan sonra elle kaldırılır. Diskteki dosya şifrelenmez; kişisel bilgisayarda test içindir. Production ortamında sqljs modu reddedilir.

Arayüz performans optimizasyonları, sayfalama, 60 aylık takvim ve filtreleme korunur. Backend hâlâ kapsam görünümünü toplu okur; yüksek kayıt hacmi/çok yoğun yazma için ayrıca yük testi ve sunucu sayfalaması gerekir. Giriş denemesi sınırlayıcısı tek uygulama süreci içindir; birden fazla Node sunucusunda ortak rate-limit deposu gerekir.

## 6. Testler ve teslim sınırı

```powershell
npm.cmd test
```

Altı otomatik test grubu: parola, yetki, revizyon, iş kuralları, ortam yapılandırması, sql.js üzerinde HTTP/SQL uçtan uca testler. Ekleme/silme, FK/check kısıtları, toplu rollback, eşzamanlı istek, import, yedek, oturum iptali, diskten yeniden açma, çift süreç kilidi ve disk yazma hatası doğrulanır. Arayüz build ve TypeScript kontrolü de geçti.

Gerçek SQL Server erişimi olmadığından native MSSQL testi bu teslim ortamında çalıştırılamadı. Yerel SQLite testleri MSSQL'in T-SQL, kimlik doğrulama, sertifika ve çok bağlantılı kilit davranışlarını kanıtlamaz. Canlıya geçmeden önce IT'nin test SQL Server'ında aşağıdaki testi çalıştırın.

IT'nin **boş, ayrı ve adı `_test` ile biten** veritabanı için `.env.mssql.test.example` dosyasını `.env.mssql.test` olarak kopyalayıp `TEST_DB_*` bağlantı alanlarını doldurun. Test komutu uygulamanın `.env` dosyasını okumaz ve `DB_*` alanlarına geri dönmez. Bağlantı hesabının varsayılan şeması `dbo`; yetkileri veritabanında `VIEW DEFINITION`, `CREATE TABLE` ve `dbo` üzerinde `ALTER`, `SELECT`, `INSERT`, `UPDATE`, `DELETE` olmalıdır. Sonra:

```powershell
npm.cmd run test:db -- --env-file .env.mssql.test --report native-mssql-report.json
```

Test, veritabanında herhangi bir kullanıcı tablosu/görünüm/yordam gibi nesne varsa çalışmayı reddeder. Ayrı test kilidi ikinci çalıştırıcının aynı ortamı kullanmasını engeller. Yalnızca boşluğu doğrulanan test veritabanında sabit uygulama tablolarını oluşturur ve temizler; beklenmeyen nesne oluşursa otomatik temizlik durur. Native şema geçişi, HTTP, iki bağımsız havuzda paralel yazma/okuma kilidi ve sentetik rol bazlı ölçüm senaryoları hazırdır. **Gerçek MSSQL koşusu bu bilgisayarda hâlâ yapılmadı.** Komutlar, ölçüm sınırları ve elle çalıştırılabilen GitHub test ortamı [MSSQL test kılavuzunda](MSSQL-TEST-KILAVUZU.md) açıklanır.

## 7. Kod dosyaları

- `backend/adapters/sqljs.mjs`: yerel SQLite, kalıcı dosya, kilit ve atomik kayıt.
- `backend/adapters/mssql.mjs`: mssql havuzu, TLS/kimlik doğrulama, transaction ve toplu SQL.
- `backend/store.mjs`: ortak ilişkisel veri okuma/yazma, yetki ve revizyon.
- `backend/tables.mjs`: sabit tablo/sütun tanımları.
- `backend/app.mjs`: API uçları, oturum/CSRF ve rol kontrolleri.
- `backend/setup.mjs`: yerel ilk kurulum; mevcut .env'yi değiştirmez.
- `backend/migrate.mjs`, `backend/check-db.mjs`: IT şema ve bağlantı komutları.
- `frontend/src/storage.ts`: mevcut arayüzün API bağlantısı.

Frontend değişirse `npm --prefix frontend install`, `npm run build` ve `npm --prefix frontend run typecheck` kullanılır. Pakette site/ hazır derlenmiştir; normal kullanım için yeniden build gerekmez.

Resmî kaynaklar:

- https://github.com/sql-js/sql.js
- https://github.com/tediousjs/node-mssql
- https://learn.microsoft.com/en-us/sql/t-sql/functions/openjson-transact-sql
- https://learn.microsoft.com/en-us/sql/relational-databases/system-stored-procedures/sp-getapplock-transact-sql
- https://learn.microsoft.com/en-us/sql/linux/quickstart-install-connect-docker

### Giriş sınırı ve güvenilen proxy

HTTPS proxy aynı sunucuda çalışıyorsa `.env` içinde `TRUST_PROXY=loopback` tanımlayın. Ayrı sunucudaysa yalnızca o proxy'nin IP adresini veya dar CIDR aralığını yazın; birden fazla adres virgülle ayrılır. Doğrudan yerel kullanımda boş bırakın. `true`, hop sayısı veya tüm ağı kapsayan `/0` kullanılamaz. Node portuna yalnızca güvenilen proxy'nin erişebilmesini sağlayın. Proxy, dışarıdan gelen `X-Forwarded-For` başlığını güvenli biçimde yeniden oluşturmalı/istemci adresini eklemelidir.

Giriş limiti proxy arkasında doğrulanan istemci IP adresinden hesaplanır. Başarılı girişler deneme kotasını tüketmez; başarısız denemeler için IP ve kullanıcı adı sınırları korunur. **Şema 29:** MSSQL'de `kp_rate_limits` ortak sayaç deposu otomatik kullanılır; aynı DB'ye bağlı uygulama örnekleri kotayı paylaşır. Yerel SQL.js sayacı süreç belleğinde kalır. IPv4-mapped adresler normalize edilir, IPv6 `/64` grubu ortak kota kullanır; bozuk/büyük login gövdeleri de sayılır. Depo erişimi kesilirse 503 döner, yerel sayaca geri dönülmez.

MSSQL güncellemesinde tüm uygulama örneklerini durdurun, tam yedek alın, IT migration hesabıyla `npm run db:migrate` çalıştırıp çalışma zamanı hesabına dönün. Sayaç tablosu için SELECT/INSERT/UPDATE/DELETE erişimi gerekir. Ayrı sayaç kilidi kaynak verilerinin genel kilidini değiştirmez. Kurulum, header/firewall ve iki sunuculu test ayrıntıları [giriş koruması kılavuzunda](GIRIS-KORUMASI-VE-PROXY.md). Native koşu ve kurumun gerçek proxy adreslerinin doğrulaması bekliyor.

### 1 Ekim 2026 mimari iyileştirme paketi — şema 25

- Bu sürüm Node.js 24 veya üzerini gerektirir. Sunucu ve arayüz, `shared/` içindeki aynı TypeScript iş kurallarını kullanır; dağıtıma bu klasör de dahil edilmelidir.
- Güncellemeden önce veritabanının yedeğini alın. MSSQL ortamında migration hesabıyla `npm run db:migrate` çalıştırın; ardından çalışma zamanı hesabına dönün. Şema 25, `kp_audit_events` tablosunu ve zaman indeksini ekler. Yerel SQL.js modunda migration başlangıçta otomatik uygulanır.
- Değişiklik geçmişi yönetici yetkisiyle Yetki Kontrol Ekranı → Değişiklik Geçmişi bölümünden görüntülenir. Geçmiş yalnızca bu sürümden sonra yapılan işlemleri kapsar; eski hareketler sonradan üretilemez.
- Uygulama içindeki JSON veri yedeği denetim geçmişini içermez. Geçmişi korumak için tam veritabanı yedeği alın. Saklama süresi ve arşivleme politikası henüz otomatik değildir.
- 2 Ekim 2026 güncellemesi: geçmiş saklama süresi 5 yıl seçildi. SQL.js için doğrulanan bakım araçları ve SQL Server'ın native yedek/geri dönüş prosedürü [veri saklama kılavuzunda](VERI-SAKLAMA-VE-YEDEKLEME.md). Otomatik silme/zamanlayıcı açılmadı; native MSSQL bakım koşusu ayrı test ortamında bekliyor.
- Kilit dosyasına uygun kurulum için `node backend/ensure-dependencies.mjs`; kontrol ve derleme için `npm run verify` kullanın. Windows betiği ve gerçek MSSQL bağlantısı bu pakette yerel olarak çalıştırılarak doğrulanmadı.
