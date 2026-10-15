# M2 — Test modülü yükleme ve kalite kapısı

Tarih: 13.10.2026. Başlangıç commit'i: `ee4ebbd3d014454fadf7dbfaba40892028fea1f0`.

## Durum

**Giderildi — Node 24.21.0, geçici kaynak ortamı ve sentetik SQL.js verileriyle doğrulandı.** Çalışma ağacındaki M1 değişiklikleri korunarak kontrol edildi. Gerçek AD/MSSQL bağlantısı, Windows ve GitHub CI bu çalışmada çalıştırılmadı.

## Düzeltme

`frontend/src/storage.ts` içindeki çalışma zamanında kullanılan `resource-roles` importuna `.ts` uzantısı eklendi. Node'un doğrudan TypeScript yüklemesi uzantısız bu yolu çözemiyordu; testler davranış kontrollerine ulaşmadan `ERR_MODULE_NOT_FOUND` ile kesiliyordu. İstemcinin mevcut TypeScript ayarları bu uzantıyı destekler. Özel yükleyici, test atlama veya üretim iş kuralı değişikliği gerekmedi.

## Tam kontrolde bulunan eski test beklentileri

İlk tam kontrolde **789 testten 780'i geçti, 9 başarısız sonuç** alındı; bu sayıya başarısız alt testleri olan üst test de dahildir. Yükleme sorunu giderildikten sonra görünen bu sonuçlar ayrı ayrı incelendi:

- Takvim ve milestone geçici DB testlerinde organizasyon tamamen değiştirilirken, başlangıç kataloğunun `leadershipUnits` eşleştirmeleri yanlışlıkla bırakılıyordu. Test verileri boş `leaderParents` ve `leadershipUnits` ile açıkça tamamlandı. Üretimdeki referans doğrulaması korundu.
- Takvim kapsamı testi, M1 öncesindeki yöneticinin günlük izin kayıtlarını görebilmesi beklentisini taşıyordu. Artık özel günlük kayıtlar ve revision anahtarlarının gönderilmediğini; sahibinin tam tarih aralığını görmeye devam ettiğini denetler.
- Planlama testlerinde yöneticinin tüm planlama birimlerini görmesi, yalnız yetkilendirildiği birimlere yazabilmesi politikası güncellendi. Diğer birimdeki tahsis görünür ve değişmeden kalır; kişinin adı, notu ve kodu gizlidir. Yetkisiz yazma, eski revision, pasif hesap ve rollback kontrolleri korundu.
- HTTP entegrasyonundaki sabit 54 toplam satır beklentisi, gerçek takım kataloğu ve ayrıca oluşturulan doğrudan liderlik kaynak birimlerini ayrı ayrı doğrulayacak şekilde değiştirildi. Benzersiz birim kimliği ve liderlik eşleşmeleri de kontrol edilir.
- Planlama sözleşmesinin **dondurulmuş bağımsız doğrulayıcı dosyası değiştirilmedi**. Bu doğrulayıcı yeni organizasyon alanlarından önceye aittir. Karşılaştırma verisi açıkça eski şema alanına alındı; küçük test uyarlayıcısı yalnız boş organizasyon sözlüklerini korur ve yeni roller veya dolu hiyerarşi sözlükleri geldiğinde hata verir. Bu test yeni hiyerarşi davranışının bağımsız doğrulaması olarak sunulmaz. Yeni hiyerarşi, rol ve yetki testleri tam paket içinde ayrıca çalışır. Tam yanıt, veri, revision, generation, ilk hata, audit ve rollback eşitliği kontrolleri korundu.

## Doğrulama

1. Düzeltmeden önce `node --test tests/storage-order.test.mjs`: **21 başarısız**, modül yükleme hatası.
2. Import düzeltmesinden sonra aynı komut: **21/21 başarılı**. Oturum değişimi, eski yanıt, istek sıralaması, planlama delta ve hata akışları mevcut testlerle kontrol edildi.
3. Takvim, milestone, planlama sözleşmesi/snapshot, SQL.js HTTP entegrasyonu ve storage-order dosyaları birlikte: **78/78 başarılı**.
4. `npm run verify`: **789/789 başarılı, 0 atlanan test**. Biçim kontrolü, ortak alan bağımlılık kontrolü, TypeScript tip kontrolü ve üretim derlemesi de başarılı.
5. `git diff --check`: başarılı.
6. Git deposu ve dıştaki çalıştırma kopyası ayrı ayrı `npm run build` ile derlendi; her ikisinde `npm run deploy:verify` başarılı, kaynak/çıktı farkı yok. Aktarılan altı dosyanın dış kopyadaki önceki içerikleri HEAD ile karşılaştırıldı. Sunucu başlatılmadı/yeniden başlatılmadı; commit veya push yapılmadı.

Tam kontrol ve 78 testlik kontrol, yalnız Git'in izlediği/ignore etmediği uygulama kaynaklarının kopyalandığı geçici bir dizinde çalıştı. `.env`, gerçek `data`, Git deposu ve mevcut derleme çıktıları kopyalanmadı. Bağımlılıklar mevcut kurulumdan kullanıldı; bağlantı sırları çocuk sürece aktarılmadı. DB testleri kendi geçici SQL.js dosyalarını ve sentetik hesaplarını kullandı; HTTP kontrolleri loopback üzerinde rastgele portlarla yapıldı. Test sonunda geçici kaynak dizini temizlendi. Native MSSQL test komutu çalıştırılmadı.

```sh
node --test tests/storage-order.test.mjs
node --test tests/calendar-commands.test.mjs tests/milestone-point.test.mjs tests/planning-contract.test.mjs tests/planning-snapshot.test.mjs tests/sqljs.test.mjs tests/storage-order.test.mjs
npm run verify
npm run build
npm run deploy:verify
git diff --check
```

## Kapsam sınırı

Bu çalışma M2 ve tam kalite kontrolünü engelleyen eski test verisi/beklenti uyumsuzluklarını giderir. M3 ve sonraki inceleme maddelerinin giderildiği anlamına gelmez. Testlerin geçmesi gerçek kurum altyapısının güvenli veya yük altında yeterli olduğunu tek başına kanıtlamaz. Migration ve veri dönüşümü eklenmedi; gerçek kullanıcı hesabıyla giriş veya çalışan DB'sine yazma yapılmadı.
