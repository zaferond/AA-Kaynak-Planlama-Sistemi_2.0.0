# N3 — Planlanan tek hücre işlemlerinde dar ön kontrol — 11 Ekim 2026

## Sonuç

[Önceki adımın](N3-YAZMA-KABUL-SINIRI-2026-10-11.md) ardından, planlanan dağılımda çakışmış veya yetkisiz **tek hücre** istekleri için dar transaction ön kontrolü eklendi. Başlangıç `d84a0e53687b5f0b07a462a47399aa778a84a9cd`; uygulama/test commit'i **`eec67232ff8f7b8628c1e2fd264aecbef3db4331`**. Kod ve yerel test kanıtı bu commit'e aittir.

**N3 kısmen giderildi.** Reddedilecek uygun tek hücre komutları artık tam snapshot yüklemez. Geçerli kayıtların tam okuma/doğrulaması korunur; her geçerli uygun komutta bir ek hedef sorgusu vardır. Bu adım başarılı yazmaların toplam yükünü azalttığı veya üretim kapasitesini artırdığı iddiasını içermez.

## Uygulama ve güvenlik sınırı

- `backend/operations.mjs`: yalnız uygulamanın oluşturduğu, WeakMap ile tanınan `planningCommand` için tek hücre girdisi transaction içinde parse edilir ve yakalanır. Dar kontrol ve tam staging aynı parse edilmiş primitive komutu kullanır. İstemci arbitrary callback'i bu komut gibi işaretleyemez. Kinds kontrolü ortak fonksiyondadır; yetki/revision/silme kararları mevcut `stageParsedChanges` kodunda kalır.
- `backend/planning-preflight.mjs`: **tek sabit SQL sorgusu, dört bağlı parametre** ile hedef takım/liderlik, proje varlığı, dağılım hücresi ve silme sonrası revision kaydı okunur. İstemci SQL adı veya parçası oluşturamaz. Tam okuyucudaki gibi SQL'in döndürdüğü kimlikler aynen kullanılır; istenen key altında farklı case/boşluk içeren kimlik üretilemez. Sıfır değer ve tombstone revision kaybolmaz. Sorgu tam bir sonuç satırı vermiyorsa işlem hata ile durur; sessiz fallback yapılmaz.
- `backend/store.mjs`: güncel persisted hesabı ve version kontrolünden sonra, **aynı mevcut Exclusive transaction** içinde dar bağlam üzerinde komut stage edilir. 403/409 ve hedefi olmayan silmede 404 burada oluşabilir; bu reddedilen isteklerde tam `Store.read` çağrısı yoktur. SQL application lock kaldırılmadı veya gevşetilmedi.
- Dar kontrolü geçen komut, önceki tam snapshot → staging → `validateSnapshot` → diff/persist → audit → generation → delta/full yanıt akışına girer. Kısmi bağlam hiçbir zaman validate/persist/response için snapshot yerine kullanılmaz. Unrelated geçersiz veri hâlâ valid bir isteğin commit'ini durdurur.
- Toplu/karma komutlar, arbitrary Store callback'leri, eski/malformed composite key'ler ve seçilen primitive değer aralığı dışındaki girdiler mevcut tam okuma yolunu kullanır. Değer uygunluğu yalnız optimizasyonu seçer; asıl iş doğrulaması tam shared validator'dadır. Kullanıcı yetkileri, silme/revision/generation kuralları ve frontend sözleşmesi değişmez.
- İlk auth sorguları ve SQL kilidini edinme yine gereklidir. Dar kontrol, HTTP admission kuyruğundan ayrı bir transaction içi kontroldür. Cluster kotası, kullanıcı başına adil paylaşım veya lock beklemesini tamamen kaldırma sağlamaz. Migration/şema, cache veya yeni endpoint eklenmedi.

## Yerel doğrulama

Ayrı `git archive` kopyası, temiz çevre listesi, macOS Node **24.21.0** ve yeni geçici **sentetik SQL.js** veritabanları kullanıldı. Gerçek `.env`, DB, kullanıcı hesabı veya çalışan servis kullanılmadı; bağımlılık kurulum/güncellemesi yapılmadı.

| Komut | Sonuç |
|---|---|
| `node --test tests/planning-preflight.test.mjs tests/mutation-snapshot.test.mjs tests/planning-read-scope.test.mjs tests/planning-snapshot.test.mjs tests/concurrency.test.mjs` | **57/57**, fail/cancelled/skipped/todo 0 |
| `npm run verify` | **662/662**, fail/cancelled/skipped/todo 0; format/domain/TypeScript/build geçti |
| `node scripts/verify-deployment.mjs` | Geçici kopyada ve iki uygulama klasöründe geçti |
| `node scripts/check-deployment-package.mjs` | Geçti: **410 kaynak, 7 güncel çıktı**, 430 tarihî çıktı hariç |
| `git diff --check` | Geçti |

Yeni sekiz otomatik kontrol: iki saf lookup/komut testi, SQL.js parent ve beş ortak entegrasyon senaryosu. Yeni ortak suite ayrıca Native MSSQL runner'a bağlandı; Windows kalite listesine yeni test dosyası eklendi. Önceki testlerin beklentileri azaltılmadı ve test atlanmadı. Bu adımda yerel dar/geniş koşuların ikisi de ilk çalıştırmada geçti.

Ortak fixture: 1.000 planlanan, 200 gerçekleşen, 200 yüzde kaydı, 20 kaynak ve kişisel takvim verisi. Doğrulamalar:

1. Dört rol/yetki durumu × on komut = **40 staging karşılaştırması**: dar bağlam ile tam snapshot aynı hedef değer/revision veya aynı hata/status verir. Mevcut/yeni/sıfır hücre, stale revision, gerçek silme tombstone'u, boş hücreyi silme ve eksik takım/proje dahildir.
2. Stale/yetkisiz isteklerde **0 tam snapshot çağrısı**; veri, audit ve generation değişmez. Sahte çağıran rolü yerine persisted rol, kaldırılmış liderlik eşlemesi ve güncel account version kullanılır.
3. İlgisiz, proje dönemi dışında sentetik gerçekleşen kayıt varken uygun planlanan komut dar kontrolden geçer; **tam validation yine reddeder**, rollback sonrası bütün veri/audit/generation aynıdır.
4. Tam okuyuculu referans callback transaction'ı bilerek rollback edilerek commit öncesi snapshot, delta ve audit yakalanır. Ardından gerçek owned komut commit edilir: veri, revision/generation ve delta aynı; audit'te yalnız rastgele event ID ve timestamp karşılaştırma dışıdır. Referans rollback sonrası veri değişmediği de assert edilir.
5. Dar SQL sorgusu hata verirse commit olmaz. SQL binding, eksik/çok sonuç satırı, returned kimliklerin korunması, sıfır/tombstone ve SQL await sırasında input'un metadata komutuna dönüştürülememesi saf testlerle kontrol edilir.

## GitHub kanıtı

Aynı **`eec6723`** kaynak/test commit'i üzerinde:

- [Kalite koşusu 38137719512](https://github.com/zaferond/AA-Kaynak-Planlama-Sistemi/actions/runs/38137719512) başarılı: Ubuntu **662/662**, Windows **299/299**, Chromium **155/155**. Kaynak testlerinde fail/cancelled/skipped/todo 0. Format/domain/TypeScript/build/manifest/temiz paket ve her iki high audit gate geçti. Windows/Ubuntu kapsamları örtüşür; tek bağımsız test toplamı sayılmaz. [Kalite makbuzu](ci-evidence/quality-eec6723-receipt.json).
- [Native MSSQL koşusu 38137728115](https://github.com/zaferond/AA-Kaynak-Planlama-Sistemi/actions/runs/38137728115) başarılı: yeni ortak ön kontrol senaryoları dahil **29/29**, fail/cancelled/skipped/todo 0, cleanup doğrulandı. Ubuntu 24.04/Node 24.21.0, SQL Server 16.0.4295.3 Developer/compatibility 160, şema 31. Geçici 4 GiB loopback container, boş test DB ve bağımsız pool kontrolleri kullanıldı. [Native rapor](ci-evidence/native-mssql-eec6723.json), [koşu/hash makbuzu](ci-evidence/native-mssql-eec6723-receipt.json).
- Native artifact'ın **512 kaynak/test/workflow hash'i** commit ile eşleşti; Windows CRLF checkout kuralı `.gitattributes` üzerinden uygulandı. İndirilen ZIP SHA256'sı GitHub artifact digest'iyle eşleşti. Job log hash'i geçici ham loga, arşiv rapor hash'i JSON baytlarına aittir. Ham log/credential/bağlantı ayarları Git'e alınmadı. [Yerel kanıt](ci-evidence/planning-preflight-eec6723-local.json).
- Native contention profili ayrıca **10.000 planlanan / 4.000 gerçekleşen**, **1/4/12 worker**, **16 senaryo / 640 işlem / 340 yazma** ile bütünlük kontrollerini geçti. Tam okuma maliyetinin kapanmış sayılmaması için ham sonuç arşivlenir. SQL row sayıları döndürülen satırlardır; joined lookup profiler'da ilk tablo olan `teams` altında sayılır, her join tablosunun fiziksel IO'su değildir.

Bu rapor ve kanıt arşivi sonraki dokümantasyon commit'ine girer; uygulama/test kaynakları değişmez. Kanıtın kaynak kimliği `eec6723` olarak korunur; dokümantasyon push'u yeni Native koşu değildir.

Native Store profili her geçerli uygun yazmada yeni hedef lookup'ını da çalıştırır, fakat kabul edilmiş yazmaların tam snapshot maliyeti devam eder. Profilin salt geçerli yazmaları, stale ön kontrolünün üretimde kaç isteği tasarruf edeceğini göstermez. Farklı runner/zaman ölçümlerinden hız yüzdesi veya gerileme sonucu çıkarılmaz. Gerçek SQL execution plan/index seek/IO/CPU ve kurum WAN/proxy yükü doğrulanmadı.

## Aktarım ve Git

İki klasörde başlangıç manifest'indeki **bütün kaynak/çıktı hash'leri** doğrulandı. Test edilen sekiz değişik dosya ve manifest iki kopyaya kontrollü aktarıldı: **18 dosya güncellemesi**. Yedek `.deployment-backups/n3-planning-preflight-20261011T120134Z` altında; hata halinde geri alma hazırlığıyla aktarıldı. Mevcut 437 derleme dosyasının baytları ve yedi güncel paket çıktısı değişmedi. Son manifest **410 kaynak / 437 çıktı** ile doğrulandı.

Runtime'a özgü milestone testi ve önceki raporda belirtilen farklı HTTP config testi korunur; runtime test ağacı canonical CI ağacıyla özdeş ilan edilmez. Uygulama kaynakları iki klasörde aynı test edilen baytlardır. Gerçek DB/account/migration/restore işlemi yapılmadı; çalışan servis yeniden başlatılmadı.

## Kalan işler

1. **N3:** geçerli planlanan komutların tam okuma/doğrulama maliyetini azaltacak bir sonraki tasarım. Mevcut validator unrelated metadata'yı normalleştirebildiği için, sadece hedef hücreyi okuyup persist etmek bu adımla güvenli hale gelmiş değildir. Dar commit yolu, tam referansa karşı normalizasyon/kapsam/revision/audit/rollback ve eşzamanlılık eşdeğerliğiyle ayrıca hazırlanmalı.
2. Ön kontrolün kurum iş yükündeki kabul/çatışma oranı ve SQL execution plan maliyeti; HTTP admission kapasite kabulü, çoklu instance ve auth sorgu yükü.
3. N2 bağımlılık uyarıları ve N6 asset/yayın politikası; high audit gate başarısı orta uyarıları gidermiş sayılmaz.
4. Windows servis hesabı/ACL, NTLM, proxy/TLS/CA, kurum yedek RPO/RTO ve gerçek yük kontrolleri ayrı operasyonel kanıt gerektirir.
