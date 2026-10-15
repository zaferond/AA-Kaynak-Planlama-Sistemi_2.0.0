# M3 — AD erişim reddinde kalıcı oturum iptali

Tarih: 13.10.2026. Başlangıç kaynak commit'i: `ee4ebbd3d014454fadf7dbfaba40892028fea1f0`.

## Durum

**Giderildi — kaynak kod ve sentetik HTTP/SQL.js doğrulaması.** M1 ve M2 değişiklikleri korunarak incelendi. Kurumun gerçek AD, native MSSQL, Windows veya çoklu sunucu ortamına bağlanılmadı. Bu sonuç diğer inceleme maddelerini kapatmaz.

## Bulgu ve düzeltme

Önceki akışta `backend/app.mjs` içindeki kimlik doğrulama, `directory.ensureActive` erişimi reddettiğinde 401 döndürüyor; sunucu oturum kaydını kaldırmıyordu. Böylece AD erişimi tekrar açıldığında henüz süresi dolmamış eski oturum kullanılabiliyordu.

- Dizin etkinliği kontrolünün **401 erişim reddi**, kullanıcının tüm sunucu oturumlarını mevcut `Store.transaction` ve `revokeUser` üzerinden iptal eder. İşlem kalıcı olarak tamamlandıktan sonra isteği yapan tarayıcının çerezi de temizlenir. Yalnız bir çerezin silinmesine güvenilmez.
- **503 bağlantı/kullanılamama hatası** oturum iptali tetiklemez. Geçici bağlantı kesintisinde istek reddedilir; bağlantı düzeldiğinde süresi dolmamış oturum kullanılabilir.
- AD kontrolü tamamlandıktan sonra mevcut oturum yeniden okunur. Başka bir istek oturumları iptal ederken beklemekte olan eski bir olumlu AD yanıtı, silinmiş oturumu yetkilendiremez. Bu kontrol LDAP hesaplarının doğrulamasına bir ek, token hash ile anahtar sorgusu ekler.
- Uygulama hesabının `active`, rol, version, revision ve çalışan eşleştirmesi değiştirilmez. İş verileri ve başka kullanıcıların oturumları korunur. Migration gerekmez.
- Oturum silme transaction'ı başarısızsa işlem hatası yutulmaz: istek 500 olur, iptal tamamlandı gibi gösterilmez ve transaction geri alınır. Kalıcı iptal garantisi veritabanına başarılı yazmaya bağlıdır.

`backend/active-directory.mjs` sözleşmesi incelendi: uygun dizin profili bulunamaması 401; LDAP bağlantı/servis hataları 503 üretir. Olumlu etkinlik önbelleği ve giriş/parola doğrulama yöntemi değiştirilmedi. Kullanıcı girişindeki yanlış parola yanıtı, bu oturum etkinliği kontrolünün dışında kalır ve burada tüm oturumları iptal etmez.

## Güvenli yeniden üretim ve testler

Yeni `tests/directory-session-http.test.mjs`, yalnız geçici SQL.js dosyası, bellekte sentetik dizin ve rastgele loopback portu kullanır. `tests/directory-fixture.mjs` dosyasına yalnız test için yeniden etkinleştirme işlevi eklendi.

1. Üretim düzeltmesi öncesi yeni üç senaryonun **ikisi başarısızdı**: 401 sonrasında sunucu oturumu yerinde kalıyordu; bekleyen eski olumlu AD yanıtı iptal senaryosunda 200 dönebiliyordu. Bağlantı kesintisi senaryosu geçiyordu.
2. Düzeltme sonrası AD, hesap erişimi ve yazma kabulü dosyalarıyla hedefli kontrol: **72/72 başarılı**. Ardından kalıcı yazma hatası için dördüncü regresyon senaryosu eklendi ve tam pakette geçti.
3. Normal Kullanıcı, Yönetici ve Admin rollerinin her birinde iki oturum açıldı. Tek oturumdan algılanan erişim reddi bütün hesap oturumlarını kaldırdı. DB kapatılıp açıldıktan ve dizin yeniden etkinleştirildikten sonra eski çerezler `/auth/me`, `/data`, `/version` ve `/changes` için 401 aldı. Yeni AD girişi başarılı oldu. Hesap ve iş verileri değişmedi; diğer kimlikler erişmeye devam etti.
4. Geçici bağlantı kesintisinde iki oturum 503 aldı; çerez, hesap ve DB oturum kayıtları korunup bağlantı düzeldiğinde aynı oturumlar kabul edildi. Yerel yönetici erişimi korundu.
5. Kontrollü eşzamanlı istek senaryosunda bir AD kontrolü bekletildi; ikinci istekte erişim reddi oturumları sildi. Bekleyen olumlu yanıt serbest bırakıldığında ilk istek de 401 aldı.
6. Oturum silme sonrasına sentetik hata enjekte edildi. Transaction silmeyi geri aldı, yanıt 500 oldu ve iç hata ayrıntısı yanıta eklenmedi. Hata kaldırıldığında sonraki ret kalıcı iptali tamamladı.
7. Geçici kaynak ortamında `npm run verify`: **793/793 başarılı, 0 atlanan test**. Biçim, ortak bağımlılık sınırı, TypeScript ve üretim derlemesi başarılı.
8. Git deposu ve dıştaki çalıştırma kopyası ayrı ayrı `npm run build` ile derlendi; her iki kopyada `npm run deploy:verify` kaynak/çıktı farkı göstermeden geçti. Aktarılan mevcut dosyaların dış kopyadaki önceki içerikleri HEAD ile karşılaştırıldı. `git diff --check` başarılı. Sunucu başlatılmadı/yeniden başlatılmadı; commit veya push yapılmadı. Backend düzeltmesinin servis tarafından yüklenmesi için sonraki sunucu başlatması/yeniden başlatması gerekir.

```sh
node --test tests/directory-session-http.test.mjs
node --test tests/directory-session-http.test.mjs tests/active-directory.test.mjs tests/record-access-http.test.mjs tests/mutation-admission-http.test.mjs
npm run verify
npm run build
npm run deploy:verify
git diff --check
```

Test kaynak kopyasına `.env`, gerçek `data`, mevcut derleme ve Git dizini alınmadı. Çocuk süreç yalnız gerekli işletim sistemi ortam değişkenlerini aldı; DB/AD bağlantı sırları aktarılmadı. Bağımlılıklar mevcut kurulumdan kullanıldı; paket kurulumu ve gerçek kullanıcı girişi yapılmadı. Geçici kaynak ve DB dosyaları temizlendi. `npm run test:db`, restore veya çalışan DB'sinde migration çalıştırılmadı.

## İşletim ve doğrulama sınırları

- Dizin etkinliğinin mevcut **en fazla 60 saniyelik olumlu önbelleği** korunur. Bu çalışma AD değişikliğini anlık algılama garantisi vermez; kurum kapatma politikasıyla IT tarafından teyit edilmelidir.
- Ağ kesintisi ve LDAP servis hataları, kalıcı erişim reddinden ayrı değerlendirilir. Gerçek DC/grup/referral davranışı ve replikasyon gecikmeleri sentetik dizin testinden çıkarılamaz.
- İptalden önce tamamlanmış işlemler geri alınmaz. Kontrol sonrasında başlayan tüm olası dağıtık yarışlar veya çoklu instance gecikmeleri için bu çalışma tam bir ispat değildir.
- Native MSSQL transaction davranışı, kurumun servis/DB yetkileri ve gerçek yük ayrıca doğrulanmalıdır. DB yazması başarısızsa kalıcı iptal tamamlanmış sayılmaz.
- IT oturum davranışı notu `ACTIVE-DIRECTORY-LDAP.md` içinde güncellendi. Diğer bölümlerdeki tarihsel ekran/şema anlatımları bu değişikliğin kapsamında yeniden yazılmadı.
