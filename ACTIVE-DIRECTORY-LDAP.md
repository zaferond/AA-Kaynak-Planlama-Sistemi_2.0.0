# Windows Active Directory / LDAP

## Kullanım

Çalışan & Yetki Tanımlama → **AD Kullanıcısına Yetki Tanımla** ile kurumsal dizinden kullanıcı seçilir. Kullanıcı adı, ad soyad ve e-posta salt okunurdur. Admin uygulamadaki çalışan kaydını, Normal Kullanıcı/Yönetici rolünü ve liderlik kapsamını eşleştirir. Yöneticinin kendi gerçekleşen dağılımı, izin ve eğitim kayıtları çalışan eşleştirmesiyle korunur. Yeni yetkilendirme yalnız admin tarafından yapılabilir; mevcut yetkiler revision denetimiyle güncellenir.

AD bağlantısı tanımlı değilken kullanıcı listesi ve yeni yetkilendirme kapalıdır. Sahte/örnek dizin kullanıcıları uygulamada gösterilmez. Arama ilk 50 uygun sonucu getirir; daha fazla sonuç varsa ad, kullanıcı adı veya e-posta ile daraltılır. Kontrol karakterleri, geçersiz kimlik/e-posta veya uygulamanın 150 karakterlik ad sınırını aşan AD kayıtları listelenmez. Çalışan kaydı ayrıca seçilir; isim eşitliğiyle otomatik eşleştirme yapılmaz.

AD şifresi okunmaz, içeri aktarılmaz veya uygulama veritabanına kaydedilmez. Kullanıcı mevcut giriş ekranına kurumsal kullanıcı adını (`sAMAccountName`) veya UPN'sini ve AD şifresini yazar. Uygulama şifreyi doğrulanmış TLS bağlantısında kullanıcı bind işlemiyle doğrulatır. UPN ile e-posta her kurumda aynı olmayabilir. Microsoft'un [AD parola açıklaması](https://learn.microsoft.com/en-us/troubleshoot/windows-server/active-directory/change-windows-active-directory-user-password) `unicodePwd` alanının okunamadığını belirtir. Uygulama bu alanı istemez.

## IT bağlantı ayarları

Gerçek değerleri sürüm kontrolü dışında, yalnız yetkili servis hesabının okuyabildiği `.env` dosyasında tutun. Mevcut `.env` dosyasının üzerine örnek dosyayı kopyalamayın. Örnek alanlar `.env.example` / `.env.mssql.example` içindedir:

```dotenv
AD_ENABLED=true
AD_LDAP_URL=ldaps://dc.example.internal:636
AD_BASE_DN=OU=Employees,DC=example,DC=internal
AD_BIND_DN=CN=ReadOnlyService,OU=ServiceAccounts,DC=example,DC=internal
AD_BIND_PASSWORD='IT_TARAFINDAN_TANIMLANACAK'
# İsteğe bağlı: yalnız bu gruba doğrudan/dolaylı üye kullanıcılar.
AD_GROUP_DN=CN=AA-Portal-Users,OU=Groups,DC=example,DC=internal
# İsteğe bağlı: işletim sisteminin güvenmediği kurum CA zinciri (PEM).
AD_CA_FILE=C:/Certificates/company-ca.pem
```

Yalnız **LDAPS**, en az TLS 1.2 ve geçerli sertifika/hostname doğrulaması desteklenir. Düz `ldap://`, URL içinde şifre ve sertifika kontrolünü kapatma desteklenmez. Servis hesabına belirtilen OU/grup içindeki gerekli kullanıcı alanlarını okuma izni yeterlidir; uygulama dizine ekleme, silme veya değiştirme yapmaz. Kurum dışından giriş için uygulamanın kendisi de mevcut HTTPS proxy/TLS kurulumuyla sunulmalıdır. DB_AUTH/NTLM veritabanı bağlantısı, AD kullanıcı girişi ayarından bağımsızdır.

Bağlantı başına 5 saniye timeout, süreç başına en fazla dört LDAP bağlantısı; admin başına 15 dakikada 120 dizin araması uygulanır. LDAP araması belirtilen base DN ve isteğe bağlı grup ile sınırlandırılır; referral başka sunucuya izlenmez. [ldapts resmi belgeleri](https://github.com/ldapts/ldapts) kullanılan istemciyi açıklar.

## Kimlik ve oturum davranışı

- Eşleştirme sabit `objectGUID` kimliğiyle tutulur. Kullanıcı adı/ad/e-posta değişiklikleri başarılı AD girişinde güncellenir; rol, liderlik ve çalışan bağlantısı korunur. Önceki oturumlar iptal edilir.
- Uygulamada önceden yetkilendirilmemiş AD kullanıcıları giriş yapamaz. Kullanıcı adının mevcut yerel hesapla çakışması yetkilendirmeyi durdurur; hesaplar isim üzerinden devralınmaz veya otomatik dönüştürülmez.
- Mevcut yerel hesaplar ve ana yönetici hesabı yerel kalır. AD hesaplarında yerel şifreye geri dönüş yoktur. Yerel hesapların kurumsal politikaya göre kapatılması/dönüştürülmesi bu değişiklikte otomatik yapılmaz.
- AD şifresi yerine, mevcut NOT NULL parola/yedek sözleşmesini korumak için açıklanmayan rastgele bir değerin scrypt özeti bulunur; bu özet AD girişinde kullanılmaz. Tam yedeklerde yerel hesapların parola özetleri mevcut güvenli yedek prosedürüne tabidir; AD şifreleri bulunmaz.
- AD oturum süresi “Beni Hatırla” seçilse de en fazla 12 saattir. Her istekte dizin etkinliği denetlenir; olumlu sonuç en fazla 60 saniye önbellekte tutulur. Pasif, kilitli, süresi dolmuş hesaplar veya izin verilen gruptan çıkan hesaplar bu denetimde reddedilir. Bağlantı kesilirse önbellek süresi bittikten sonra istekler 503 ile durdurulur; yerel doğrulamaya geçilmez. Girişte şifre her seferinde AD'ye doğrulatılır. Parola değişikliği tek başına mevcut uygulama oturumunu hemen iptal etmez; en geç 12 saatlik oturum süresi uygulanır.
- AD grup üyeliği uygulama rolünü yükseltmez. Rol/çalışan eşleştirmesini admin yönetir. Yetki değişiklikleri mevcut oturumları iptal eder.

### AD erişimi reddedildiğinde oturum iptali (13.10.2026)

Dizin etkinliği kontrolü 401 ile erişimi reddettiğinde, ilgili uygulama hesabının **tüm sunucu oturumları** transaction içinde silinir ve isteği yapan tarayıcının oturum çerezi temizlenir. AD hesabı yeniden etkinleştirilse veya uygulama yeniden başlatılsa da eski çerezler geçersiz kalır; kullanıcı tekrar giriş yapmalıdır. Hesabın uygulamadaki aktifliği, rolü, çalışan eşleşmesi ve iş verileri değiştirilmez. Diğer hesapların oturumları korunur.

Geçici AD bağlantı hatası 503 döndürür; oturumlar silinmez. Bağlantı düzeldikten sonra süresi dolmamış oturum kullanılabilir. Mevcut 60 saniyelik olumlu önbellek nedeniyle AD'deki değişikliğin algılanması anlık değildir; kurumun kapatma süresi şartıyla IT tarafından karşılaştırılmalıdır. Veritabanına oturum iptali kalıcı olarak yazılamazsa istek 500 ile reddedilir; iptal tamamlanmış kabul edilmez. Ayrıntılı sentetik doğrulama [M3 düzeltme kaydındadır](M3-AD-OTURUM-IPTALI-2026-10-13.md).

## Dağıtım ve doğrulama

Bu sürüm **şema 32** ile `directory_id`, `email`, `auth_source` ve tekil dizin kimliği kısıtlarını ekler. Mevcut hesaplar `local` kalır; çalışan bağlantıları ve parola özetleri korunur. Çalışan veritabanında bu geliştirme sırasında migration veya hesap oluşturma çalıştırılmamıştır.

IT, mevcut yedek/doğrulama prosedürünü uygulayıp servisi durdurduktan sonra yeni paket ve bağımlılıklarla, doğru test veritabanında `npm run db:migrate` / `npm run db:check` adımlarını doğrulamalıdır. MSSQL'de `DB_AUTO_MIGRATE=false` bırakılır. Eski şema 31 tam yedeği yeni şema 32 olarak kabul edilmez; gerektiğinde eski sürümün doğrulanmış paketiyle izole ortamda geri yüklenip ardından yükseltilir. AD ayarları servis yeniden başlatılınca okunur.

Otomatik testler geçici SQL.js/MSSQL veritabanları ve sentetik dizin kullanır. LDAP istemcisinin sözleşmesi, filtre değerlerinin ayrılması ve ikili GUID/Türkçe karakter kodlaması, parola bind hataları, pasif hesap, timeout/erişilememe davranışı, yetki kapsamı, çakışmalar ve tarayıcı akışı test edilir. Gerçek kurum AD sunucusu, CA zinciri, OU/grup izinleri, ağ/firewall, hesap kilitleme politikası ve gerçek yük IT ortamında ayrıca doğrulanmalıdır. Kurumsal bağlantı bilgileri sağlanmadan gerçek AD bağlantısının çalıştığı iddia edilmez.

## Uygulama yetkisini kaldırma ve yeniden verme

Admin, Çalışan & Yetki Tanımlama'nda ana yönetici dışındaki aktif hesaplarda **Yetkiyi Sil** işlemini kullanabilir. Bu işlem AD hesabını silmez: uygulama erişimini kapatır, açık oturumları sonlandırır, liderlik yetkilerini ve çalışan eşleştirmesini kaldırır. Çalışan, kaynak, izin, eğitim ve risk geçmişi korunur. Hesap kimliği ve AD kimliği korunarak **Yeniden Yetki Ver** ile rol, liderlikler ve çalışan eşleştirmesi tekrar tanımlanabilir. İşlem revision kontrolü ve işlem geçmişiyle aynı transaction içinde yürütülür.

**Tüm Liderlikleri Seç**, arama filtresinden bağımsız olarak mevcut liderlik listesini seçer; daha sonra eklenen liderlikler otomatik olarak bu yetkiye eklenmez.

## Organizasyon ve aylık aktivite görünürlüğü

Liderlik yönetimindeki **Üst Liderlik** alanı organizasyon hiyerarşisini tanımlar. Döngüler ve kendine bağlama reddedilir; bağlı alt liderliği bulunan üst liderlik silinemez. Bağlantı, katalog sürümü, işlem geçmişi ve JSON yedeği ile birlikte korunur. Şema 33 bu bağlantılar için `kp_settings.leader_parents` alanını ekler. MSSQL üretim geçişinde kurum yedeği alındıktan sonra IT mevcut `npm run db:migrate` sürecini uygulamalıdır.

**AA Aylık Aktivite Raporu** için normal kullanıcı eşleştirilmiş çalışanının güncel takımını, yönetici ise eşleştirilmiş çalışanının güncel liderliği ve alt liderliklerinin takımlarını görür. Admin tüm takımları görür. Çalışan eşleştirmesi bulunmayan kullanıcıya bu raporda çalışan satırı açılmaz. Planlama için verilen manuel liderlik erişimi bu raporun görünürlüğünü genişletmez. Geçmiş aylarda başka bir takımda yapılan çalışmalar yetki kapsamı dışında kalır. Raporda yalnız aylık toplamlar bulunur; takım arkadaşlarının izin açıklamaları ve kişisel kayıtları paylaşılmaz, gerçekleşen giriş yetkileri genişletilmez.

**Liderlik Bazında Kalan Kaynak** ve Excel çıktısı, filtreye giren takımları en üst liderliğin altında birleştirir.

### Liderin doğrudan kaynağı

Kaynak girişindeki **Kaynak Rolü**: Lider için yalnız liderlik seçilir; Takım Üyesi için liderlik ve takım seçilir. Lider kaydı, liderliğin ayrı kaynak birimine bağlanır; otomatik oluşturulan bu birim takım yönetiminde gösterilmez. Planlanan dağılımda **Liderlik · Doğrudan Kaynak** satırı kendi kaynak ve dağılım değerlerini tutar; alt takımların toplamı bu satıra eklenmez. Bu bağlantılar da şema 33'teki `leadership_units` alanı, yedek, işlem geçmişi ve katalog revision kontrolüyle korunur. Mevcut takımlar ve çalışan bağlantıları otomatik taşınmaz; daha önce takım olarak girilmiş lider kaydı kaynak düzenlemesinden Lider olarak seçilerek taşınabilir. Bu kaynak rolü uygulama hesabına yönetici yetkisi vermez.

### Çalışan kaynak rolleri (şema 34)

- Kaynak Rolü: Lider, Product Owner, Team Member. Lider doğrudan liderlik birimine; diğer iki rol gerçek takıma atanır.
- Liderlik ve Takımlar ekranının Yönetici sütunu güncel çalışan kayıtlarından üretilir: liderlik için Lider, takım için Product Owner. Birden fazla Lider ataması varsa tüm isimler gösterilir. Aynı takımda kesişen çalışma / görevlendirme dönemlerinde birden fazla Product Owner atanamaz; sunucu mevcut sorumlunun adını içeren hata döndürür, kaynak formu taslağı koruyarak uyarı penceresi gösterir. İlan, gelecekte başlayacak ve ayrılış tarihi geçmiş kayıtlar yönetici olarak gösterilmez. Kaynak planlamasına dahil seçimi bu gösterimi etkilemez.
- Eski doğrudan liderlik kayıtları Lider olarak tanınır. Diğer eski kayıtlar Team Member kabul edilir; Product Owner atamaları çalışan kaydı düzenlenerek yapılır. Eski serbest yönetici adları veritabanında korunur fakat bu ekranda kaynak olarak kullanılmaz.
- Bu roller AD / hesap yetkisini otomatik değiştirmez. Yerel SQL.js açılışta şema 34'e geçer; üretim MSSQL geçişini IT yedek sonrası `npm run db:migrate` ile yapar.

### Birleşik çalışan ve yetki yönetimi

- **Çalışan & Yetki Tanımlama** sekmesindeki Kaynak Ekle / Düzenle formunda çalışan bilgileri ve isteğe bağlı hesap yetkileri birlikte yönetilir. Yeni hesap kimliği AD'den seçilir; eşleştirilmemiş normal kullanıcı / yönetici hesapları da bağlanabilir. Admin hesapları Hesaplar ve Yetkiler bölümünden yönetilir.
- `POST /api/employees/save` yalnız admin tarafından oturum, CSRF, admission ve yetki düzenleme hız sınırı ile kullanılabilir. Bir çalışan ve gerekirse onun eşleştirilmemiş takımına liderlik ataması kabul edilir. Çalışan ve hesap sürümleri, eşleştirme, oturum iptali ve işlem geçmişi aynı SQL transaction içindedir; hata olursa tamamı geri alınır.
- AD sorgusu SQL kilidi alınmadan yapılır. AD kimliğinin tekilliği, çalışan bağlantısı, liderlik kapsamı ve kayıt sürümleri işlem içinde yeniden denetlenir. Başka çalışana bağlı hesap bu formdan taşınamaz.
- Bağlı liderlikler üst liderliğin altında girintili gösterilir; görsel değişiklik erişim kapsamını veya kapasite hesabını değiştirmez.
