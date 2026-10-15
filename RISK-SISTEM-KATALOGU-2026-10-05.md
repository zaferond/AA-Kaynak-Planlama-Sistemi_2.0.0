# Risk Sistem / Alt Sistem kataloğu — 5 Ekim 2026

## Durum ve kullanıcı akışı

Kaynak, testler ve üretim derlemesi hazırdır. Kullanıcının **“mevcut uygulamaya aktarabilir misin”** onayıyla çalışan üst klasördeki uygulama 5 Ekim 2026'da güncellendi; şema 31 ve 75 başlangıç tanımı mevcut yerel SQL.js DB'ye uygulandı. Doğrulanmış geçiş öncesi yedek alındı; mevcut tabloların içeriği korundu ve uygulama yeniden başlatıldı. Commit veya push yapılmadı. Temel Git HEAD `05b99e5556aaa7e472e99923f492fc37eab3487f`; değişiklikler `main` çalışma ağacındadır.

- Risk Ekle düğmesinin hemen yanında **Sistem / Alt Sistem Ekle** yer alır. Mevcut liderlik/takım yönetimiyle aynı editör altyapısı ve askeri yeşil tema kullanılır.
- Admin listede arama yapabilir, yeni tanım ekleyebilir, adını değiştirebilir veya kullanılmayan tanımı silebilir. Yönetici ve normal kullanıcılar katalog yönetemez; sunucu bunu da denetler.
- Risk tablosundaki Sistem / Alt Sistem hücresi düzenlenirken katalogdan seçim yapılır. Seçim bütün risk düzenleme rollerine açıktır; risk sahipliği kuralları değişmez.
- Ad değişikliği sabit ID ile bağlı risklere yansır. Bu risklerin revision'ları artar; önceden açılmış taslak yeni adı eski değere geri çeviremez. Çakışmada kullanıcı taslağı korunur ve açık yeniden yükleme gerekir.
- Kullanılan tanımın silinmesi engellenir. Aynı adı farklı harf/boşluk biçiminde tekrar eklemek reddedilir; ad 1–200 karakterdir.
- Önceden elle girilmiş katalog dışı sistem adları korunur; hücrede “mevcut kayıt” seçeneği olarak görülebilir. Katalog adıyla eşleşen eski riskler, ilgili ad yeniden adlandırılırken sabit ID'ye bağlanır.

## Excel kaynağı

Kullanıcının paylaştığı `Epic-5-10-2026.xlsx` salt okunur ZIP/XML yöntemiyle okundu. Gerçek sütun adı **Epic Adı**, kaynak aralığı **Sayfa!B2:B76**; **75 farklı ad** vardır. A sütunundaki Epic ID'leri `epic_<ID>` katalog ID'lerine dönüştürüldü; kodlar ve adlar korundu. Workbook değiştirilmedi, dış servise gönderilmedi. Başlangıç listesi `shared/risk-system-seed.ts` içindedir.

## Mimari ve kalıcılık

| Alan | Değişiklik |
|---|---|
| Shared | `RiskSystem`, opsiyonel `Data.riskSystems` ve `Risk.systemId`; strict şema, ad tekilliği ve ortak kullanım politikası |
| Backend | Mevcut CSRF/rol/revision korumalı `/api/changes` içinde `riskSystem`; katalog kalıcılığı ve bağlı risk güncellemesi |
| Frontend | Ortak `useDirectoryEditor`, `RiskSystemDialog` ve native select hücresi; kayıt hatasında taslak korunur |
| Migration | `031_sqljs.sql` ve `031_mssql.sql`, `kp_risk_systems` tablosu; ilk geçişte 75 başlangıç kaydı |
| Revision | Mevcut revision tablosunda `allocation` + `@riskSystem:` isim alanı; diğer türlerin saklama biçimi değişmez |

Şema 30→31 yalnız katalog tablosunu, migration işaretini, başlangıç adlarını ve generation güncellemesini ekler. Var olan risk/kaynak/proje verileri ilk geçişte değiştirilmez. Geçiş Store'un mevcut tek migration transaction'ı içinde çalışır; katalog eklemesi başarısızsa tablo/sürüm/veri geri alınır. SQL.js byte karşılaştırmalı sentetik test bunu doğruladı. MSSQL SQL dosyası hazırdır; **native SQL Server çalıştırması bu tur doğrulanmadı**. Production MSSQL otomatik migration açılmadan açık IT migration komutu gerekir.

Katalog yalnız migration 31 ilk uygulandığında ekilir. Sonradan tüm tanımlar silinirse yeniden açılış başlangıç listesini geri getirmez. Eksik `riskSystems` alanı olan eski JSON plan yedeği başlangıç listesini alır; açıkça boş `[]` içeren yeni JSON yedeği boş katalog olarak korunur.

Tam DB yedeğinin migration fingerprint'i yeni SQL ve başlangıç kaynağını kapsar. Eski şema 30 tam yedeği şema 31 paketine uyumlu sayılmadı: eski yedek, eşleşen eski paketle kurtarıldıktan sonra açık migration sürecinden geçirilmelidir. JSON plan yedeği hesapları/işlem geçmişini içermez. Çalışan DB'de restore veya yedek test işlemi yapılmadı.

## Doğrulamalar

Node **24.21.0**, işletim sistemi geçici dizininde kaynak kopyası, teste ait SQL.js dosyaları, rastgele loopback port ve ayrı headless Chrome bağlamları kullanıldı. Ortam yalnız PATH/TMP/LANG gibi seçilmiş değişkenleri taşıdı; `.env`, gerçek hesap veya çalışan DB kullanılmadı. İş verisi/parola/token bu kayda yazılmadı.

```sh
node --test tests/risk-systems.test.mjs tests/risk-management.test.mjs \
  tests/migration-policy.test.mjs tests/domain-boundaries.test.mjs tests/domain.test.mjs \
  tests/store-persistence.test.mjs tests/planning-snapshot.test.mjs tests/restore.test.mjs \
  tests/data-response.test.mjs tests/risk-export.test.mjs tests/sqljs.test.mjs
```

**99/99 geçti**: yeni katalog için 9 test, yeni mimari kapısı ve mevcut risk/SQL.js HTTP/migration/rollback/restart/restore/yanıt/Excel regresyonları. SQL.js ortak integration suite'ine katalog CRUD ve eski revision reddi eklendi; aynı suite native işinde de kullanılacak. İki eski migration testindeki sabit `30` bekleyişi merkezi `schemaVersion` değerine bağlandı.

```sh
node --test --test-name-pattern '^(approved catalog fingerprints|valid legacy fingerprint|full backup creation|backup catalog|backups reject)' tests/data-maintenance.test.mjs
```

**5/5 geçti**: şema uyumlu fingerprint kabulü, legacy/arşiv doğrulaması, tam yedek üretimi/katalog ve bozuk ya da uyumsuz yedek reddi. Bütün işlemler sentetik/geçici yedekler üzerindedir.

TypeScript `--noEmit`, `node scripts/check-domain.mjs` (**33 kaynak dosyası**) ve `node frontend/build.mjs` geçti. Geçici browser runner mevcut dizin yönetimini (5), risk kataloğunu (5), risk kayıt onayını (4) çalıştırdı: **14/14 geçti**, yakalanmamış tarayıcı hatası yok. Yeni beş kontrol grubu kalıcı tam runner'a eklendi. Yönetim penceresi %90 ölçekli ekran görüntüsünde görsel olarak incelendi; arama, kaydırma ve yeşil palet kontrol edildi.

Derleme girdilerinin hash'leri Git köküyle karşılaştırıldı; hazır HTML/aktif JS/CSS ve dağıtım manifest'i yalnız Git köküne aktarıldı. `node scripts/verify-deployment.mjs` **`ok: true`**, kaynak/çıktı fark listeleri boş. Hedefli Prettier kontrolü ve `git diff --check` geçti. Çalışan üst klasörün dosyaları, backend süreci ve DB bu hazırlık sırasında değiştirilmedi.

Son kanıtlar geçici `aa-picker-review-2026-10-05-wc8_ix4k/risk-systems-final-tests.log`, `risk-systems-backup.log` ve `aa-browser-checks-uowEOh/result.json` içindedir. İşletim sistemi bu dosyaları daha sonra temizleyebilir.

**Tam test/tarayıcı koşusu, GitHub Windows/native MSSQL CI, Microsoft Excel uygulamasında açma, kurum TLS/yedek/gerçek yük kabulü bu tur çalıştırılmadı.** Yerel sonuçlar bu ortamlardaki davranışın kanıtı değildir. Yeni kaynak testleri Windows kalite komutuna eklendi; native kanıt dosyasının kaynak listesi yeni modülleri kapsayacak şekilde güncellendi. Y4, Y6 ve Y5 kalan işleri ayrı tutulur.

## Mevcut uygulamaya aktarım — 5 Ekim 2026

Bu adım yukarıdaki sentetik testlerden ayrıdır; kullanıcı mevcut uygulamaya aktarımı açıkça onayladı. Çalışan 3000 portu sürecinin üst klasördeki uygulama ve SQL.js sağlayıcısı olduğu doğrulandı. Gerçek hesapla giriş veya gerçek ortamda test kaydı oluşturma yapılmadı; parola/token/iş verisi çıktılara yazılmadı.

1. Hazırlanmış Git kökü dağıtımı `verifyDeployment` ile doğrulandı. Farklı **25 uygulama kaynak dosyası** ve **7 aktif derleme dosyası** belirlendi; başlatıcı, paket dosyaları ve bağımlılık dizinleri değiştirilmedi.
2. Önceki uygulama dosyaları özel bir geri dönüş klasörüne kopyalandı. Çalışan süreç SIGTERM ile düzgün kapandı, DB kilidi kaldırıldı.
3. Henüz eski kaynaklar kullanılırken mevcut bakım CLI'siyle tam DB yedeği üretildi ve ayrı `verify` komutuyla doğrulandı: **şema 30**. Yedek ve geri dönüş dosyaları `Library/Application Support/AA Kaynak Planlama/before-risk-catalog-2026-10-05-*` özel klasöründe; klasör 0700, yedek dosyaları 0600 izinlidir. Otomatik restore yapılmadı.
4. 25 uygulama kaynağı aktarıldı. Mevcut bağımlılık yükleyicisi, Node 24 ve `--env-file=.env` üzerinden **`backend/migrate.mjs`** çalıştırıldı. Ortam değişkenlerinin içeriği okunup rapora yazılmadı.
5. Yedek ve yeni DB salt okunur bellek kopyalarında karşılaştırıldı: şema **30→31**, yeni katalogda tam **75 ID/ad çifti**, integrity/foreign-key kontrolü başarılı. Eski tabloların şemaları ve içerik hash'leri aynı; yalnız migration kaydı ve settings generation (+1) beklenen şekilde değişti. Bu karşılaştırma yeniden başlatmadan önce yapıldı; kaynak/risk/proje/dağılım/hesap/geçmiş kayıtlarında değişiklik yoktu. Ham satırlar veya hash'ler kullanıcı çıktısına yazılmadı.
6. Aktif HTML/JS/CSS dosyaları aktarıldı, mevcut başlangıç komutu ve bağımlılık yükleyicisiyle sunucu yeniden başlatıldı. **`http://localhost:3000`** açıldı; herkese açık HTML/aktif varlıklar doğrulanmış derlemeyle byte olarak eşleşti. Kimliksiz `/api/data` çağrısı **401** verdi. Mevcut kullanıcı hesabıyla ekran testi yapılmadı; ekran davranışı önceki 14 sentetik tarayıcı kontrolüne dayanır.

Aktarım sonuçları özel geri dönüş klasöründeki `migration-result.json`, `publication-result.json` ve `operation.log` içinde tutulur. Yeni kaynaklar ve varlıklar yerinde; açık kullanıcı sekmesinin taslağını korumak için otomatik yenileme yapılmadı. Özelliği görmek için sekme yenilenmelidir. Native MSSQL/Windows ve dağıtım kökü/başlatıcı tutarlılığı (Y5/Y6) bu yerel aktarımın tamamlanmasıyla kapanmaz.
