# Native MSSQL doğrulaması — 31. adım

**Tarihsel durum — 8 Ekim 2026:** geçici GitHub CI SQL Server 2022 Developer ortamında `f3b63835c05830c85847f1c3c0ef04f0b82e7d12` commit'i **21/21** native testi geçti; **şema 31**, iki bağımsız havuz ve temizlik doğrulandı. Ek profil 10.000 planlanan / 4.000 actual kayıt üzerinde **600 işlem / 300 değişiklik** içerir. Raporun **466 kaynak hash'i** aynı commit ile eşleşti. Aynı kaynak için Windows 153/153, Ubuntu 524/524 ve 133 Chromium kontrolü, tüm kalite/audit kapıları başarılı. [N3 ölçüm ve dar kişisel okuma kaydı](N3-SNAPSHOT-KILIT-OLCUM-VE-OKUMA-KAPSAMI-2026-10-08.md) ve [CI kanıt arşivi](CI-KANIT-ARSIVI.md). N3 global yazma snapshot/kilit maliyeti sürüyor; backend Orta bağımlılık uyarısı da açık. Bu sentetik koşular kurum SQL/TLS/Windows servis/proxy ve gerçek yük kabulü değildir.

**Önceki 8 Ekim kaydı:** `731f5281f123f324628de7d0085508d2aaf54e48`, 20/20 native, 463 hash; Windows 143/143, Ubuntu 509/509 ve 133 Chromium kontrolü. [N4 yenileme kaydı](N4-NATIVE-WINDOWS-KANIT-YENILEME-2026-10-08.md) korunur. Sonraki iki `ce5c2f0` kalite denemesi browser timeout'u ile başarısızdı; arşivde ayrı kayıtlıdır. `f3b6383` risk onay testinin event-turn/promise takibini düzeltti; üretim onay kuralları aynı kaldı.

**Tarihsel durum — 4 Ekim 2026:** geçici GitHub CI SQL Server 2022 Developer ortamında `63780fc4538829c16c7b14739f882a9851629f59` commit'i 19/19 native testi geçti; şema 30 ve temizlik doğrulandı. Önceki sonuç ve 48 kaynak hash'i arşivde korunur; yeni kaynak için bu eski kayıt kullanılmaz.

**Tarihsel durum — 2 Ekim 2026:** bu bilgisayarda SQL Server/Docker veya ayrılmış test bağlantısı olmadığı için o tarihte native sonuç yoktu. Bu sınırlama 4 Ekim'de GitHub'ın geçici test ortamıyla giderildi; bu bilgisayarda veya kurumda native test yapılmış sayılmaz. Yerel güvenlik testleri gerçek MSSQL çalıştırması değildir.

## 13–14 Ekim 2026 — aynı commit için CI kabulü

Push ve pull request sonrasında `Quality checks`, yeniden kullanılabilir native workflow'u da çalıştırır. `Release acceptance` yalnız Ubuntu kalite, Windows sentetik ve native MSSQL işlerinin **aynı commit için** başarılı olmasıyla geçer. Yayın öncesi bu kontrolün başarısı aranmalıdır; GitHub branch protection/ruleset ve kurum dağıtım yetkisi ayrıca yönetilir. İş akışı tek başına manuel dağıtımı engellemez.

Native artifact'i, güncel şema kataloğu, kilit dosyasındaki MSSQL/Tedious sürümleri, uygulama/test/workflow kaynak hash'leri, beş güncel kabul kontrolü ve veritabanı temizliğiyle otomatik karşılaştırılır. Başka commit/şema/kaynak için sonuç kabul edilmez. Artifact saklama süresi 90 gündür; uzun süreli kanıt için seçilen JSON ve koşu metadata'sı depodaki arşive ayrıca alınır. 14 Ekim’de `0193506` için 40/40 native, 405/405 Windows, 811/811 Ubuntu ve 233 Chromium kontrol grubu başarılı; şema 35 ve 600 kaynak hash’i doğrulandı. Kullanıcı kararıyla dal koruması kurulmadı. Ayrıntılar: [M6 raporu](M6-NATIVE-CI-YAYIN-KABULU-2026-10-13.md).

Ek kontroller: güncel liderlik hiyerarşisi ve Leader/Product Owner benzersizliği, günlük kişisel takvimlerin gizliliği, dar rapor okumalarının tam snapshot sonuçlarıyla eşitliği, iki bağımsız SQL havuzunda sentetik AD oturum iptali/geçici kesinti davranışı ve SQL Server'ın bildirdiği bağlantı şifrelemesi. Yerel SQL.js karşılığı native havuz/TLS kanıtı olarak kabul edilmez. Dondurulmuş eski validator yalnız kendi şemasına indirgenen veriyle karşılaştırılır; güncel şema ayrıca doğrulanır.

Aynı kaynak checkout’unda dosya üzerinden kanıt doğrulama (DB bağlantısı açmaz):

```sh
node scripts/verify-native-evidence.mjs --report native-mssql-report.json --commit <test-edilen-tam-commit-SHA>
```

## Ayrı test sunucusunda çalıştırma

Node.js 24 ve `npm ci` gerekir. IT boş, ayrı ve adı `_test` ile biten bir veritabanı ayırır. Test hesabının varsayılan şeması `dbo`; yetkileri veritabanında `VIEW DEFINITION`, `CREATE TABLE` ve `dbo` şemasında `ALTER`, `SELECT`, `INSERT`, `UPDATE`, `DELETE` olmalıdır. Bu yetkiler yalnız ayrı test veritabanı içindir. Veritabanı uyumluluk seviyesi en az 130 olmalıdır; [OPENJSON gereksinimi](https://learn.microsoft.com/en-us/sql/t-sql/functions/openjson-transact-sql) bunu gerektirir.

`.env.mssql.test.example` dosyasını `.env.mssql.test` olarak kopyalayıp yalnız test hesabı bilgileriyle doldurun. Bu dosya Git'e dahil edilmez; uygulamanın `.env` dosyası okunmaz ve `DB_*` alanlarına geri dönülmez. SQL veya NTLM bağlantısı kullanılabilir; NTLM için ayrıca `TEST_DB_DOMAIN` gerekir. Şifreyi sohbet veya rapora eklemeyin.

```sh
npm run test:db -- --env-file .env.mssql.test --report native-mssql-report.json
```

Mevcut rapor dosyasının üzerine yazılmaz. Tekrar çalıştırmada farklı rapor adı verin. Ortam değişkenleriyle çalıştırılacaksa bütün bağlantı alanları `TEST_DB_*` olmalıdır. Normal uygulama başlatma ve `db:migrate` komutları değişmedi.

## Korunan sınırlar

- Bağlanılan veritabanı adı, `dbo`, metadata erişimi ve uyumluluk seviyesi ilk aşamada kontrol edilir. Herhangi bir kullanıcı tablosu, görünüm, yordam, fonksiyon, synonym, sequence veya trigger bulunan veritabanı reddedilir.
- Ayrı transaction'a ait `aa_kaynak_native_test` kilidi boşluk kontrolünden temizliğe kadar tutulur. İkinci test çalıştırıcısı aynı veritabanını kullanamaz. Bu kilit uygulamanın `aa_kaynak_data` kilidinden ayrıdır. [MSSQL application lock sözleşmesi](https://learn.microsoft.com/en-us/sql/relational-databases/system-stored-procedures/sp-getapplock-transact-sql) kullanılır.
- Yalnız boşluğu doğrulandıktan sonra sahiplenilen test şemasında temizlik yapılır. Temizlikte sabit uygulama tablo listesi ve `dbo` kullanılır; beklenmeyen nesne oluşursa silme başlamadan işlem durur.
- Başarı raporu ancak bütün kontroller, havuz kapatma, tablo temizliği ve test kilidinin bırakılması tamamlandıktan sonra yazılır. Alt test hatası sonraki aşamaya veya başarı raporuna geçmez.
- Uygulamanın veritabanı, hesapları, `.env` dosyası veya 3000 portundaki çalışan sunucu kullanılmaz. Native HTTP senaryoları ayrı geçici localhost portu açar.

## Native senaryolar

1. Eski v2 kişi dağılımlarının güncel şemaya (8 Ekim: 31) taşınması, Türkçe veri ve toplamların korunması, yeniden bağlantıda dönüşümün tekrarlanmaması.
2. Ortak HTTP suite: CRUD, yetki/CSRF/oturum iptali, FK/CHECK, toplu geri alma, içe aktarma sayaçları, generation/revision, restore ve liderlik işlemleri.
3. Ortak eşzamanlılık suite: aynı hücrede tek kazanan, 24 bağımsız kayıt, çakışan batch, aylık sınır/takvim/izin/eğitim ve tutarlı okuyucular.
4. **İki bağımsız native bağlantı havuzu:** aynı revision yarışı; ortak okuma kilitlerinin birlikte çalışması; yazmanın okuyucuya yarım veri göstermemesi; kilitlerin sıfır timeout ile doğrudan sınanması.
5. Yanıt hazırlama hatasında reset'in verileri, sürümleri, generation ve audit ile geri alınması.
6. OPENJSON üzerinden uzun Türkçe not, tamamlandı bilgisi, karma aralık/Milestone ve içi boş baklavanın korunması; yanlış display/diamond değerlerinin native CHECK tarafından reddedilmesi.
7. BIN2 karşılaştırmalı revision kapsamı: büyük/küçük harf, Türkçe, wildcard karakterleri, özel/tombstone sürümler, 900 parametre ve 901/legacy fallback.
8. Rol bazlı filtreli snapshot'ın bağımsız tam okuma referansıyla eşitliği; 24 bağımsız yazmanın kendi commit yanıtı; bağlantı yeniden açıldığında veri/şema eşitliği.
9. İki bağımsız MSSQL havuzunda 40 eşzamanlı sayaç rezervasyonundan yalnız 15'inin kabulü; yeni hizmette kotanın korunması; iki HTTP hizmetinde ortak IP/kullanıcı adı sınırı. Kaynak verilerinin genel kilidi tutulurken sayaç kilidinin bağımsız çalışması. Bu senaryolar belirtilen 4 Ekim CI koşusunda geçti; kurum proxy topolojisi veya giriş kapasitesi ölçümü değildir.
10. N1 silme regresyonu: normal kullanıcının 32 hayali kaydı ve bozuk anahtarı reddedilir; geçerli boş silme yeni revision üretmez. Gerçek silme, tekrar, eski revision, yeniden oluşturma ve batch geri alma doğrudan kalıcı revision tablosuyla doğrulanır. Bu ek kontrol 8 Ekim koşusunda başarılıdır.

**8 Ekim metadata okuma kontrolü:** Aynı kilitli native transaction'da ordinary snapshot ile 10 SELECT'i tek istekle okuyan snapshot/JSON eşitliği ve 15→6 okuma isteği doğrulanır. Geçersiz SQL dönüşümü sonrası komutun başlamadığı, generation/audit/değerlerin korunduğu bağımsız havuzdan kontrol edilir. Profiler'daki `metadataBatchCalls` gerçek roundtrip, `metadataBatchStatements` ise SELECT sayısıdır; her recordset'in satır sayısı ayrı korunur. [Güncel kaynak ve sonuç](N3-MSSQL-SNAPSHOT-TOPLU-OKUMA-2026-10-08.md).

## Ölçüm ve rapor

Varsayılan: 1.000 planlanan kayıt, 80 çalışan, 200 gerçekleşen/yüzde kaydı, 20 kişisel gün; bir ısınma ve üç ölçüm. HTTP suite ve havuz suite'leri bittiğinde ölçüm için şema yeniden oluşturulur; önceki fixture/audit taşınmaz. Admin/yönetici/normal görünüm için medyan/en uzun süre, SQL'den dönen allocation/revision satırları ve JSON boyutu raporlanır. 24 yazma iki havuza dağıtılır; toplam süre global kilidi de içerir.

```sh
npm run test:db -- --env-file .env.mssql.test --size 10000 --samples 5 --report native-mssql-10000.json
```

`size`: 24–100.000; `samples`: 1–10. Rapor sürücü/Store/SQL kaynak hash'leri, Node ve SQL Server sürümü, şema ve uyumluluk seviyesi içerir. Kullanıcı verileri, bağlantı adresi, kullanıcı adı ve şifre içermez. SQL satırı sayısı dönen satırdır; SQL Server'ın fiziksel tarama/IO/sorgu planı ölçümü değildir. Store ölçümü HTTP/tarayıcı/WAN, üretim p95 veya kapasite garantisi değildir.

Global uygulama kilidi bu pakette korunur. Kaldırılması veya repository kapsamının değiştirilmesi ancak native sonuçlar incelendikten sonra değerlendirilebilir.

### İsteğe bağlı eşzamanlılık ve bellek profili

`--contention` varsayılan olarak kapalıdır. Yalnız yukarıdaki boşluk kontrolü ve test kilidiyle sahiplenilen ayrı test veritabanında çalışır; önceki ölçüm fixture'ı temizlenip sentetik veri yeniden oluşturulur. Gerçek `.env` veya uygulama DB'si kullanılmaz.

```sh
npm run test:db -- --env-file .env.mssql.test --size 10000 --contention --profile-requests 40 --profile-actuals 4000 --profile-concurrency 1,4,12 --report native-mssql-contention.json
```

- `profile-requests`: her senaryo için 20–200 istek; `size` bu sayıyı karşılamalıdır. `profile-actuals`: 200–50.000 gerçekleşen/yüzde kaydı. En fazla dört farklı eşzamanlılık düzeyi, her biri 1–20 ve istek sayısından küçük/eşit olabilir. Geçersiz seçenekler DB'ye bağlanmadan reddedilir.
- Admin/normal okuma, planlanan/gerçekleşen yazma ve karma yük ayrı ölçülür. Sabit tabanlı beş senaryo × üç düzey × 40 istek = **600 işlem / 300 değişiklik yazması**. Ek `planning-delta-chain`, her yanıttan sonra taban generation'ını güncelleyerek 40 ardışık yazmayı iki havuzda sınar; güncel varsayılan toplam **16 senaryo / 640 işlem / 340 yazma** olur. Zincirin sonu bağımsız SQL view ile eşittir; her adım dar kopya ve tam view hazırlığı olmadan delta üretmelidir. Her yazma revision/generation/audit ve iki bağımsız havuzdaki kalıcılık ile doğrulanır; admin snapshot'ı kendi generation'ının tüm yazmalarını içerir.
- Sunucu saatiyle `sp_getapplock` edinimi, transaction giriş/çıkışı, okuma, kopyalama, **komut + doğrulama/diff hazırlığı birleşik süresi**, persistence, tam view/delta projection, kopyalama yolu sayıları, SQL satırları ve JSON üretimi kaydedilir. Planlanan komut kimliği ölçüm sırasında değiştirilmez; şema doğrulaması tek başına ölçülmüş sayılmaz. SQL süreleri aşama süreleriyle örtüşür; hepsi toplanmaz. Kilit metriği yordam süresini de içerir, saf DMV bekleme süresi değildir.
- `sampleP95/sampleP99` açık örnek sayısıyla nearest-rank örnek yüzdelikleridir. Karma senaryoda her grup yalnız 10 örnektir; üretim kuyruk gecikmesi veya p95/p99 garantisi değildir. Benchmark worker kuyruğu uygulamanın HTTP kabul kuyruğu değildir.
- Bellek tüm Node sürecinden aralıklarla ve aşama sınırlarında örneklenir; fixture, referans veri ve ölçüm araçları dahildir. Bu değer istek başına tahsis, kesin tepe bellek veya SQL Server belleği değildir. Profiling ek SELECT ve örnekleme maliyeti getirir; üretim adapter'ında enstrümantasyon yoktur.
- Başarı artifact'i yalnız yeniden bağlantı eşitliği, temizlik ve test kilidinin bırakılması tamamlanınca üretilir. Rapor SQL/parametre/değer, adres, kullanıcı adı veya parola kaydetmez. Zamanlanmış workflow hafif varsayılan koşuyu korur; manuel workflow'da `contention` seçeneği açılabilir.

## GitHub üzerinde zamanlanmış ve manuel test ortamı

`Native MSSQL verification` workflow'u **her pazartesi 02:20 UTC ve elle çalıştırılır**. Ubuntu x64 üzerinde geçici SQL Server 2022 Developer container'ı ve boş test veritabanı oluşturur; her çalıştırmada ayrı rastgele şifre üretir, loglarda maskeler ve sonuç JSON'unu artifact olarak saklar. Çalışma sonunda container silinir. Push ve pull request bu testi `Quality checks` içinden otomatik başlatır; zamanlanmış/manuel koşular ayrıca korunur.

Bu workflow'un container'ında şifreleme açık, self-signed sertifika için trust açıktır. Bu koşu kurumun CA/hostname doğrulamasını, NTLM/domain bağlantısını, şirket proxy'sini veya Windows servis kurulumunu doğrulamaz. Kurum bağlantısı bunlar için ayrı test gerektirir. [Microsoft container desteği](https://learn.microsoft.com/en-us/sql/linux/sql-server-linux-docker-container-deployment) x86-64 Linux içindir; bu bilgisayar ARM64 olduğundan yerel bir koşu yapılmış sayılmaz.

4 Ekim'deki [başarılı native koşu](https://github.com/zaferond/AA-Kaynak-Planlama-Sistemi/actions/runs/37186385433), 31. adımın belirtilen commit ve sentetik CI ortamı için native kanıtıdır. Kaynak hash'leri yalnız raporun kapsadığı dosyalarla karşılaştırılır; hash eşitliği bütün uygulamanın veya yeni HTTP/başlatıcı değişikliklerinin native testi sayılmaz. Kurumun asgari yetkili SQL hesabı, CA/hostname/NTLM, Windows servis/ACL, backup/restore kabulü ve gerçek yük ayrıca doğrulanmalıdır. Güncel kalite CI'si ve bu önceki native koşu ayrı kayıtlardır.
