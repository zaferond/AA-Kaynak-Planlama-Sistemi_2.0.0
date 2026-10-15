# İşlem geçmişi ve tam veritabanı yedeği

## Politika

2 Ekim 2026'da kullanıcı tarafından seçilen işlem geçmişi saklama süresi **5 takvim yılıdır**. Tek kaynak `shared/data-retention-policy.json` dosyasıdır. Sınır UTC olarak hesaplanır; artık yıl günü karşı yılda yoksa Şubat'ın son gününe alınır. Tam sınır tarihindeki kayıt korunur; yalnız daha eski kayıtlar temizleme adayıdır.

Temizleme yönetici bakım işlemidir. Otomatik zamanlayıcı açılmadı. Süresi dolmayan kayıtlara, proje/kaynak/tahsis verisine, hesaba veya revizyonlara temizleme uygulanmaz. Temizleme; güncel kaynakla birebir eşleşen, doğrulanmış tam yedek ve yerel uygulamanın durdurulmasını gerektirir. Silme ile bakımın kendi geçmiş kaydı aynı transaction'dadır; kayıt/disk hatasında silme geri alınır.

Geçmiş arşivi dosyaya kopyalamadır; kaynak kayıtları kaldırmaz. Arşiv ve tam yedeklerde kalan eski geçmiş için erişim/saklama sorumlusu kurum yöneticisidir. Sadece DB temizlemek eski kopyaları otomatik silmez. Kopyalar için kurumun belirlediği yedek dönüş süresi uygulanmalı; bu araçta dosya silme zamanlayıcısı yoktur. Bu doküman yasal saklama süresi iddiası içermez.

## Yedeklerin kapsamı

| Çıktı | İçerik | Kullanım |
|---|---|---|
| Ekrandaki JSON veri yedeği | Projeler, kaynaklar, dağılımlar, takvim/risk/not verileri | Planlama verisini taşıma/yükleme; hesap ve işlem geçmişini geri getirmez |
| Tam SQL.js yedeği | Veritabanının bütün baytları; hesap/parola özetleri, oturumlar, geçmiş, revision/generation ve varsa eski tablolar | Sistemin belirli bir andaki tam veri görüntüsü |
| Geçmiş arşivi | Tarih sınırından önceki audit kayıtları, kişi/alan farkı ve kaynak hash'i | Geçmişi uygulamadan bağımsız inceleme; tam sistem kurtarma için kullanılamaz |
| Kurtarma için hazırlanan tam kopya | Tam yedeğin yeni kopyası; eski oturumlar kaldırılmış | Geri dönüşte yeniden giriş gerektiren veritabanı hazırlama |

Yedekler şifrelenmiş değildir. Tam yedek hesap/parola özetlerini ve özel personel verisini içerir; kurumun erişimi kısıtlanmış, şifreli yedek deposunda tutulmalıdır. SHA-256 bozulma/değişiklik kontrolüdür; dosyayı değiştirebilen kişinin manifest'i de değiştirmesine karşı imza veya kimlik doğrulaması değildir. `.env`, uygulama kaynak kodu, paketler ve varsa şifreleme anahtarları DB paketine dahil değildir; kurtarma için uygun uygulama sürümü ve ayrı korunan yapılandırma da gerekir.

## Yerel SQL.js komutları

Depo/çalışan uygulama kökünde Node.js 24 ile çalıştırın. Dosyalar açıkça belirtilir; komut `.env` okumaz, migration veya başlangıç hesabı oluşturmaz. Yedek/arşiv/önizleme çalışan SQL.js dosyasını tek seferde okuyabilir: uygulamanın atomik rename ile yazdığı tamamlanmış disk görüntüsü alınır. Sonraki kullanıcı kayıtları daha sonraki yedeğe aittir.

### Tam yedek

```sh
npm run db:backup -- --source="data/planlama.sqlite" --output="../AA Kaynak Yedekleri/tam-yedek"
```

Komut benzersiz bir paket dizini oluşturur ve yolunu JSON olarak yazdırır. İçinde `database.sqlite`, `audit.ndjson` ve `manifest.json` vardır. Aynı ada yazıp eski yedeği ezmez. Paket tamamlanmadan `.aa-pending-*` adındadır; başarısız işlem bu geçici paketi temizler. Web'den sunulan `site/` dizini hedef olamaz. POSIX'te paket dizini 0700, dosyalar 0600 oluşturulur; Windows'ta ayrıca kurumun NTFS erişim izinleri uygulanmalıdır.

```sh
npm run db:verify-backup -- --backup="TAM_YEDEK_PAKETININ_YOLU"
```

Doğrulama: dosya boyutu/SHA-256, beklenen dosyalar, şema kaynak hash'i, SQLite integrity/foreign key kontrolü, bütün tablo sayıları, generation ve DB'deki geçmiş ile NDJSON'ın birebir eşleşmesi. Eksik, symlink veya değiştirilmiş payload reddedilir. Şema kaynakları farklıysa yedeğe uygun Git sürümünü ayrı klasörde kullanın.

**3 Ekim 2026 şema kontrolleri:** Kodla çalışan 3/12 dahil bütün zorunlu migration kayıtları, gerekli sütun/tip/nullability/default/anahtarlar, FK/UNIQUE/CHECK ve uygulamanın model/hesap okuması doğrulanır. Karşılaştırma şeması ortak katalogdaki DDL'den, ayrı boş bellek içi DB'de üretilir. Kaynak dosyada migration veya otomatik tamamlama çalıştırılmaz. Eksik geçmiş ya da şema için kaynak korunan ayrı bir kurtarma incelemesi gerekir.

Yeni paketlerin kaynak hash'i migration kodunu da kapsar. Aynı şema sürümündeki, aynı SQL kaynaklarının eski hash'ini taşıyan geçerli v1 paketler yeni kontrollerden geçerse kullanılabilir. Farklı sürüm paketleri için uygun uygulama kaynaklarıyla çalışılır. Gerçek uygulamada geri dönüş ve parola ile giriş kontrolleri ayrı kurtarma ortamında tamamlanmalıdır.

### Geçmiş arşivi

```sh
npm run audit:archive -- --source="data/planlama.sqlite" --output="../AA Kaynak Yedekleri/gecmis" --before="2021-10-02"
```

`--before` gerçek bir gün olmalıdır. Örnekte **2 Ekim 2021 00:00 UTC'den önceki** kayıtlar seçilir; sınır günü dahil değildir. Bu tarih elle seçilen arşiv sınırıdır. 5 yıllık temizleme ise aşağıdaki komutta bakım anının saatini de koruyarak hesaplanır. Arşiv Türkçe/çok satırlı alanları JSON olarak korur; `db:verify-backup` ile doğrulanabilir. Kaynak DB değişmez.

### 5 yıllık saklama önizlemesi ve yönetici temizliği

```sh
npm run audit:retention -- --source="data/planlama.sqlite"
```

Bu komut yalnız sınır tarihi, toplam/adayı kayıt sayısı ve kaynak SHA-256'sını gösterir. Süresi dolan kayıt yoksa uygulanacak işlem yoktur.

Temizleme yapılacaksa yerel sunucuyu durdurun, **durdurduktan sonra** yeni tam yedek alın ve doğrulayın. Ardından açık uygulama isteğiyle:

```sh
npm run audit:retention -- --source="data/planlama.sqlite" --backup="GUNCEL_TAM_YEDEK_PAKETININ_YOLU" --apply
```

Çalışan uygulamanın dosya kilidi, geçmiş arşivini tam yedek yerine verme, eski/farklı kaynak yedeği ve yedek dosyasının kendisini temizleme reddedilir. Başarılı işlemde yalnız süresi dolmuş audit kayıtları kaldırılır; silinen sayı ve yedek hash'i yeni bir **Geçmiş bakımı** kaydına yazılır. Sonuç JSON'u yönetici bakım kaydına eklenebilir. Yeniden önizleme ve uygulamanın Yetki Kontrol Ekranı → Değişiklik Geçmişi ile sonuç kontrol edilir.

### Geri dönüş hazırlama

```sh
npm run db:prepare-recovery -- --backup="TAM_YEDEK_PAKETININ_YOLU" --output="../AA Kaynak Yedekleri/kurtarma"
```

Bu komut doğrulanmış yedekten **yeni bir tam paket** üretir; yalnız eski oturum kayıtlarını kaldırır. Canlı DB'yi değiştirmez. Canlı geri dönüşte yönetici sunucuyu durdurur, o anki DB'nin de tam yedeğini alır, hazırlanmış `database.sqlite` dosyasını `data/planlama.sqlite` yerine koyar ve dosya izinlerini korur. Çalışan sunucunun dosyasını değiştirmek bellekteki veri ile diski ayırır; önce durdurma zorunludur. `.lock` dosyasını çalışan süreç varken silmeyin. Uygulamayı uygun sürüm/yapılandırmayla başlatıp yeniden giriş, proje/risk, dağılım, takvim, yetki ve geçmiş kontrollerini yapın. Ayrı ortamda geri dönüş denemesi yapılmadan üretim geri dönüşü planlanmamalıdır.

## Yedek operasyonu

Günlük tam yedek; sürüm/migration, toplu içe aktarma, JSON restore ve geçmiş temizliği öncesinde ek tam yedek alınması önerilir. Günlük yedekler tek başına bir günlük veri kaybı hedefini ancak koşular gerçekten başarıyla çalışıp izleniyorsa destekler; saatlik ihtiyaç varsa sıklık ayrıca ayarlanmalıdır. Bu adım işletim sistemi zamanlayıcısı kurmadı. Yönetici komutu cron/Task Scheduler veya kurum yedek hizmetine bağlayıp başarısız çıkış kodunu izlemelidir.

Yerel disk kopyasına ek olarak erişimi kısıtlanmış ayrı depoda bir kopya tutulmalı; kopyalama sonrası tekrar doğrulanmalı ve düzenli olarak ayrı ortamda geri dönüş denenmelidir. DB'nin 5 yıllık geçmiş politikası ile yedeklerin kaç gün/ay tutulacağı farklı ayarlardır; yedek kopyalarının süreleri kurum yöneticisi tarafından belirlenir. Saklama süresi dolan kopyaların temizliği bu komutlar tarafından yapılmaz.

## MSSQL

Yukarıdaki dosya komutları SQL.js içindir; `.mdf/.ldf` dosyasını kopyalamak veya SQL.js aracına vermek MSSQL yedeği oluşturmaz. SQL Server'ın kendi yedek mekanizmasını kurum DBA hesabıyla kullanın. Değişiklik öncesi ek tam yedekte `COPY_ONLY`, mevcut differential yedek temelini değiştirmez. [Microsoft: Copy-only backups](https://learn.microsoft.com/en-us/sql/relational-databases/backup-restore/copy-only-backups-sql-server).

Aşağıdaki örnekte veritabanı adını doğrulayın ve `<...>` yolunu SQL Server'ın erişebildiği **benzersiz sunucu dosyası** ile değiştirin. Yol Mac'teki uygulama bilgisayarının yolu değildir. Uygulama runtime hesabına yedekleme yetkisi eklemek gerekmez; işlem DBA/yedek hesabından yapılır.

```sql
DECLARE @BackupFile nvarchar(4000) = N'<SQL_SERVER_YEDEK_DOSYASI.bak>';
IF LEFT(@BackupFile, 1) = N'<'
    THROW 50001, 'Set a unique server backup path first', 1;

BACKUP DATABASE [AA_KaynakPlanlama]
TO DISK = @BackupFile
WITH COPY_ONLY, CHECKSUM, STOP_ON_ERROR;

RESTORE VERIFYONLY FROM DISK = @BackupFile WITH CHECKSUM;
```

`CHECKSUM` yedek/okuma hatalarını kontrol etmek için kullanılır. `VERIFYONLY` gerçek geri yükleme ve tüm veri yapısı kontrolünün yerini tutmaz; ayrı bir test DB'sine geri dönüş, DBCC CHECKDB ve uygulama kontrolleri de gerekir. [Microsoft: Backup checksums](https://learn.microsoft.com/en-us/sql/relational-databases/backup-restore/enable-or-disable-backup-checksums-during-backup-or-restore-sql-server), [Microsoft: RESTORE VERIFYONLY](https://learn.microsoft.com/en-us/sql/t-sql/statements/restore-statements-verifyonly-transact-sql).

MSSQL'de aynı 5 yıllık politika geçerlidir; SQL.js temizleme komutu MSSQL'e bağlanmaz. Native arşiv/temizleme ve yedek/geri dönüş koşusu bu ortamda yapılmadı; **31. adımın ayrı MSSQL ortamında** DBA ile doğrulanmalıdır. Temizleme ancak doğrulanmış güncel yedek, transaction, uygulamanın `aa_kaynak_data` kilidi ve bakım kaydıyla birlikte uygulanmalıdır. Şifreli SQL Server yedeklerinde geri dönüş için gereken sertifika/anahtar ayrıca korunmalıdır. [Microsoft: Backup encryption](https://learn.microsoft.com/en-us/sql/relational-databases/backup-restore/backup-encryption).
