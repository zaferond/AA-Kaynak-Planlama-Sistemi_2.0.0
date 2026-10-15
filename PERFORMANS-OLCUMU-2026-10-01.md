# Veri kayıt katmanı ölçümü — 1 Ekim 2026

## Kapsam ve yöntem

Ölçüm, mevcut hücre kayıt yolundaki `Store.mutate` ve ardından gelen `Store.view` çağrılarını kullanır. Her veri boyutunda bir ısınma kaydı ve beş ölçülen kayıt çalıştırıldı. Tek planlanan kaynak hücresi 0,25 / 0,50 arasında değiştirildi. Yanıtın `JSON.stringify` süresi ayrıca ölçüldü; aşağıdaki kayıt + yanıt hazırlığı süresine dahil değildir.

- Node: **24.21.0**, yerel SQL.js. HTTP, ağ ve tarayıcı süreleri ölçülmedi.
- Sentetik 200 çalışan, mevcut katalog takımları, 48 ay ve 1.000 kişisel izin kaydı. Proje sayısı hedef dağıtım sayısına göre oluşturuldu. Başlangıç audit geçmişi sıfır; her hücre kaydı bir olay ekledi.
- 1.000, 10.000 ve 50.000 planlanan dağıtım hücresi; her hücrenin revision kaydı mevcut.
- Veritabanları sistemin geçici dizininde oluşturulup temizlendi. Betik `.env` yüklemez ve veritabanı yolu/provider seçeneği almaz. Gerçek kullanıcı verileri ölçümlere dahil edilmedi.
- Önceki kod: `c97f021`, `backend/store.mjs` SHA-256: `51dcf7339d668d18641b29fd479c65211ac26d5b4709d8d135a976b0011a161a`.
- Güncellenen Store SHA-256: `afe7b7df5a6e04cc9bb3285cd6095d277a6dabdf62848757b9c48f0879452439`.
- Ölçüm zamanı: önce 13:40 UTC, sonra 13:44 UTC. Her iki seri aynı bilgisayarda ve aynı sentetik veri boyutlarında çalıştı.

Tekrar çalıştırmak için:

```sh
npm run bench:store -- --sizes=1000,10000,50000 --samples=5 --calendar-days=1000 --audit-events=0 --output=/tmp/aa-store-new-result.json
```

Çıktı yolu mevcut bir dosyayı ezmez. JSON çıktısı ham örnekleri, kaynak dosyanın hash değerini, SQL satır/yazma sayaçlarını ve aşama sürelerini içerir. İsteğe bağlı `--audit-events` büyük geçmişle ayrı bir deney için kullanılabilir; aşağıdaki sonuçlar böyle bir deneyi kapsamaz.

## Sonuçlar

Süreler milisaniye cinsinden medyandır.

| Planlanan hücre | Kayıt + yanıt önce | Kayıt + yanıt sonra | İki veri okuma önce | İki veri okuma sonra | DB boyutu |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 1.000 | 53,26 | 44,19 | 17,49 | 16,49 | 569.344 bayt |
| 10.000 | 168,81 | 168,97 | 101,68 | 99,64 | 2.179.072 bayt |
| 50.000 | 796,78 | 792,26 | 460,76 | 460,17 | 9.601.024 bayt |

**Büyük veri setinde toplam kayıt süresi belirgin biçimde iyileşmedi.** Gereksiz yazmalar kaldırıldı; tam veri okuma maliyeti devam ediyor. Beş örnek, güvenilir üretim p95 veya kapasite hesabı için yeterli değildir. Örneğin 50.000 hücrede örnek p95 önce 816,82 ms, sonra 871,56 ms; bu sonuçlardan gecikme iyileşme yüzdesi çıkarılmamalı.

| Tek hücre kaydı | Önce | Sonra |
| --- | ---: | ---: |
| `Store.read` çağrısı | 2 | 2 |
| Okunan SQL satırı, 50.000 hücre | 200.977 | 200.977 |
| Yazılan liderlik satırı | 7 | 0 |
| Yazılan tahsis / revision / audit / settings satırı | 1 / 1 / 1 / 1 | 1 / 1 / 1 / 1 |
| Toplam değiştirilen satır | 11 | 4 |
| Yazma SQL parametrelerinin JSON byte uzunluğu | 82.103 | 334 |

Parametre ölçümü ağ trafiği, SQL günlük dosyası veya disk yazma miktarı değildir. Bu sentetik takvimde yaklaşık %99,6 daha az yazma parametresi taşınıyor; SQL.js veritabanı dosyasının tamamını kaydetmeye devam ediyor. Satır sayısı, yalnızca bu tek hücre senaryosundaki gerçek SQL değişiklik sayısıdır.

## Bulgular ve yapılan değişiklikler

1. **Tam veri iki kez okunuyor.** Mutasyon tüm veri modelini okuyup kopyalıyor; kayıt sonrası yanıt için `view` tekrar okuyor. 50.000 hücrede okumalar yaklaşık 460 ms, tüm zincir yaklaşık 792 ms. Bu süreler iç içe ölçülür; `read`, `persist`, domain ve export medyanları birbirine eklenerek toplam hesaplanamaz.
2. **Değişmeyen liderlikler yeniden yazılıyordu.** Artık yalnızca yeni liderlik veya değişen yönetici adı upsert ediliyor. Yeni liderlikler bağlı takım/çalışan satırlarından önce yazılıyor; hesap bağlantısı kontrolleri ve silme sırası korunuyor.
3. **Değişmeyen takvim ve arşiv JSON alanları yeniden gönderiliyordu.** Artık yalnızca değişen `legacy_archive`, `calendar_days`, `person_calendar` kolonları parametreli UPDATE'e dahil. Kolon listesi sabit; kullanıcı girdisi SQL kolon adı olamaz. `generation` her başarılı mutasyonda ilerlemeye devam ediyor.
4. **Restore sırasında opsiyonel arşiv temizlenmiyordu.** Yedekte arşiv yoksa `Object.assign` mevcut arşivi koruyordu. Geçerli yedek tamamen doğrulandıktan sonra, yedekte bulunmayan arşiv artık temizleniyor. Geçersiz yedek mevcut veriyi değiştirmiyor; eski yedek migrasyonunun ürettiği arşiv korunuyor.
5. **Güvenlik ve atomiklik mekanizmaları korundu.** Yetki/oturum kontrolleri, revision çatışmaları, audit, SQL.js rollback/disk kayıt düzeni ve MSSQL işlem kilidi kaldırılmadı. Şema değişikliği yapılmadı. SQL.js ölçümlerinde işlem başına iki DB export çağrısı mevcut; büyük audit geçmişindeki disk maliyeti ayrıca ölçülmeli.

## Doğrulama

- Dört yeni persistence testi: tek hücre/değişmeyen değer, yalnız değişen JSON kolonları ve restore temizliği, liderlik yazma/FK sırası, settings yazıldıktan sonra yapay hata ve yeniden açılışta tam rollback.
- Bir yeni domain testi: arşivin yokluğu/mevcudiyeti, geçersiz yedekte mevcut arşivin korunması, kaynak yedeğin değişmemesi.
- Hedefli persistence + restore + HTTP eşzamanlılık kontrolleri: **20/20**.
- `npm run verify`: **181/181** test; biçim kontrolü, TypeScript ve üretim derlemesi başarılı.
- Gerçek MSSQL performansı veya native MSSQL entegrasyon sonucu raporlanmıyor; ayrı test sunucusu hâlâ gerekli.

## Sıradaki teknik iş

En büyük maliyet tam veri okuması olduğu için sıradaki inceleme, planlanan hücre kaydının sorgu ve yanıt kapsamını daraltmak. Önce mevcut endpoint sözleşmesi ve istemcinin tam snapshot ihtiyacı belirlenmeli. Hedefli okuma; takım/proje yetkisi, revision, referans bütünlüğü, toplu kayıt atomikliği, audit ve generation kontrollerini korumalı. Gerçekleşen kaynak, takvim ve restore yolları daha geniş ortak kontroller gerektirdiğinden ayrı değerlendirilmelidir.

Global işlem kilidini kaldırmak veya tam snapshot'ı önbelleğe almak bu ölçümün sonucu olarak uygulanmadı. Çok sunuculu tutarlılık ve MSSQL davranışı ayrı ortamda doğrulanmadan bu karar verilemez. Audit saklama/arşivleme politikası da ayrıca açık.

## Devam ölçümü — planlanan hücre kaydında ikinci okumanın kaldırılması

On beşinci adımda, yalnız `allocation` kayıtlarından oluşan `/api/changes` paketleri için yanıt aynı yazma işleminde hazırlanıyor. Bu seçim yeni bir yetki yolu değildir; aynı `applyChanges` şeması, yetki, revision, son veri doğrulaması ve audit kuralları çalışıyor. Karışık paketler ve diğer işlem türleri mevcut kayıt + yeniden okuma yolunda kalıyor.

`backend/change-service.mjs` yanıt yolunu seçiyor. `Store.projectView` hem normal okuma hem kayıt yanıtında aynı görünürlük kurallarını ve admin kullanıcı listesini kullanıyor. Admin olmayan kullanıcıya hesap listesi/arşiv veya yetki kapsamı dışındaki çalışan/takvim verileri eklenmiyor. Kullanıcı işlem kilidi altında veritabanından yeniden doğrulanıyor; generation yanıtı aynı commit'in numarası oluyor.

Değişmeyen proje/takım/çalışan verileri ilk SQL okumasının biçimiyle korunuyor; yalnız tahsis ve revision haritaları doğrulanmış sonuçtan alınıyor. Doğrulama eski metadata'yı normalize ettiyse aynı transaction içinde SQL'den tekrar okunuyor. Böylece veritabanına yansıyan varsayılanlar ile yanıtın farklılaşması önleniyor. Yanıt, adapter commit ve SQL.js dosya kaydı başarıyla bittikten sonra HTTP'ye veriliyor. Paylaşılan veri önbelleği veya istemci API değişikliği eklenmedi.

Yeni betikle eski ve yeni yanıt yolları sırayla, aynı veri boyutlarında tekrar ölçüldü. Varsayılan `--response=separate` önceki kayıt + ayrı view yolunu korur; yeni yol için `--response=planning` kullanılır:

```sh
npm run bench:store -- --response=separate --output=/tmp/aa-separate-new.json
npm run bench:store -- --response=planning --output=/tmp/aa-planning-new.json
```

Node 24.21.0, beş örnek, bir ısınma kaydı, 200 çalışan / 1.000 izin kaydı / sıfır başlangıç audit geçmişi. Ölçüm: 16:08 UTC (19:08 İstanbul). İki yol da aynı Store kaynak hash'iyle ölçüldü: `ad937539159ce091ada2c89b2a0e17a99fef37ce14ad69bebc5d1c1874ad438e`. Süreler yerel milisaniye medyanlarıdır; HTTP/ağ/MSSQL dahil değildir.

| Planlanan hücre | Ayrı view | İşlem içinde yanıt | Tam okuma süresi önce / sonra | Okunan SQL satırı önce / sonra | Yanıt boyutu, iki yolda aynı |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 1.000 | 44,67 | 32,86 | 16,35 / 9,00 | 4.929 / 2.465 | 191.203 bayt |
| 10.000 | 165,60 | 117,46 | 98,54 / 49,36 | 40.937 / 20.469 | 764.447 bayt |
| 50.000 | 761,04 | 548,62 | 452,84 / 229,49 | 200.977 / 100.489 | 3.371.253 bayt |

Her veri boyutunda tam veri okuma **2'den 1'e** indi; yazılan satır sayısı **4**, yazma parametre boyutu **334 bayt** olarak kaldı. 50.000 hücrede bu deneyde toplam medyan yaklaşık **%27,9 azaldı**. Bu oran üretim/MSSQL hız garantisi değildir. Beş örneğin p95 değerleri sırasıyla 47,68 / 36,14; 180,05 / 123,17; 774,70 / 558,01 ms; üretim p95 tahmini olarak kullanılmamalı. Yanıt JSON serileştirme süresi bu tabloda toplam süreye dahil değil; 50.000 hücrede yaklaşık 18–19 ms ve ayrıca ölçülüyor.

### Doğrulama ve kalan maliyet

- Beş yeni regresyon testi: oluşturma/0/aynı değer/toplu kayıt/silme yanıtının fresh SQL view ile eşitliği ve bir okuma; manager kapsamı/yetkisiz/eski revision/kapalı hesap; karışık paketlerde SQL varsayılanları/geçersiz paketin atomikliği; eski metadata normalizasyonunda güvenli yeniden okuma; yanıt hazırlanmışken dosya commit hatasında yanıtın reddedilmesi ve yeniden açılışta tüm verinin korunması.
- SQL.js ve MSSQL için ortak HTTP eşzamanlılık suite'inde 24 kayıt yanıtının her biri kendi commit'inin generation/tahsis/revision görüntüsü olarak kontrol ediliyor. Native MSSQL ortamı yok; bu geliştirilmiş senaryo SQL.js üzerinde çalıştı.
- Mevcut istemci testleri eski yanıtların yeni görüntü/yetkileri geri almamasını, oturum değişimini ve kayıt/okuma sırasını doğrulamaya devam ediyor. İstemci sözleşmesi ve ön yüz değişmedi.
- `npm run verify`: **186/186** test; biçim, TypeScript ve üretim derlemesi başarılı.
- Tek tam veri okuması, tam veri kopyalama/doğrulama/diff ve tam JSON yanıt hâlâ mevcut. İlk sorguyu da daraltmak daha kapsamlı bir kayıt/yanıt sözleşmesi gerektiriyor. Sıradaki inceleme bu kalan maliyetleri ve özellikle iki katmanlı doğrulamanın sorumluluğunu ayırmak; yetki, FK, toplu işlem ve audit doğrulaması korunmalı.

## Devam ölçümü — API kayıtlarında tek son model doğrulaması

On altıncı adımda `applyChanges` iki sorumluluğa ayrıldı. `stageChanges` komut şemasını, yetkiyi, revision'ı ve aylık limitleri kontrol edip son taslağı ve türetilmiş yüzdeleri hazırlar. `/api/changes` bu işlevi yalnız `Store.mutate` içinde çalıştırır; Store son modelin tamamını **kaydetmeden önce bir kez** doğrular ve normalize eder. Veri bütünlüğü kontrolü kaldırılmadı, istemciden gelen bir doğrulama-atlama seçeneği eklenmedi.

`applyChanges` doğrudan çağrıldığında staging + tam doğrulama/normalizasyon yapmaya devam eder. Böylece transaction dışında bu fonksiyonu kullanan domain çağrıları aynı sözleşmeyi korur. Liderlik, import, restore gibi diğer endpoint'lerin akışları bu adımda değiştirilmedi. Planlanan hücreler aynı commit'ten yanıt almaya, diğer değişiklik paketleri mevcut SQL view yolunu kullanmaya devam ediyor.

Betik artık `--validation=double|single` ile eski ve yeni yolları aynı Store üzerinde ölçer. Varsayılan `single`, güncel API akışıdır. Önceki bölümlerin iki doğrulamalı sonuçlarını yeniden üretirken `--validation=double` seçilmeli. JSON çıktısına operations/service kaynak hash'leri ve global `structuredClone` çağrı sayısı/süresi eklendi; bu süre Zod'un şema parse sırasında yaptığı kopyalamaları kapsamaz.

```sh
npm run bench:store -- --response=planning --validation=double --output=/tmp/aa-double-new.json
npm run bench:store -- --response=planning --validation=single --output=/tmp/aa-single-new.json
```

Aynı sentetik boyutlar, beş örnek ve bir ısınma kaydı; Node 24.21.0 / SQL.js. Ölçümler 16:24–16:25 UTC (19:24–19:25 İstanbul). Store hash'i önceki bölümle aynı; operations hash'i `0343f1106bdc24afc2fa029179073105ba57cd8e78c076ee4e74cd03cb20b669`, service hash'i `5539af3b6309ed379284cbe4867b4bed6c1480adbe28ce5677258cb2fe3f80b1`. Süreler yerel milisaniye medyanlarıdır; HTTP/ağ/MSSQL dahil değildir.

| Planlanan hücre | Çift doğrulamalı kayıt + yanıt | Tek son doğrulama | Tam okuma önce / sonra | `structuredClone` önce / sonra |
| ---: | ---: | ---: | ---: | ---: |
| 1.000 | 36,54 | 28,67 | 8,93 / 8,07 | 1,08 / 1,06 |
| 10.000 | 117,72 | 100,52 | 48,35 / 49,72 | 6,99 / 7,07 |
| 50.000 | 545,02 | 459,66 | 228,13 / 234,71 | 42,58 / 38,69 |

50.000 hücrede bu deneyde toplam medyan yaklaşık **%15,7 azaldı**. Tam okuma ve `structuredClone` sayısı iki yolda da bir; yazılan satır dört, yazma parametre boyutu 334 bayt ve yanıt boyutu 3.371.253 bayt olarak kaldı. Önceki/yeni p95 örnek değerleri 1.000 hücrede 40,50 / 31,02; 10.000'de 119,97 / 111,72; 50.000'de 565,48 / 466,69 ms. Beş örnek üretim p95 veya MSSQL hız garantisi sağlamaz.

Eski komut fonksiyonu staging + tam doğrulama, yenisi yalnız staging yaptığı için `domainMs` farklı kapsamlar ölçüyor. Yeni 50.000 hücre ölçümündeki 0,08 ms **tam veri doğrulamasının süresi değildir**; Store'un tam son doğrulaması transaction süresinde kalıyor. İç içe ölçülen medyanlar toplanarak toplam hesaplanmamalı.

### Kopyalama ve doğrulama güvenliği

- Önceki görüntünün tam kopyası korundu. Takım liderliği değişince çalışan sürümleri yerinde güncelleniyor; audit ve persist'in eski iç içe değerleri görmesi gerekiyor. Sığ kopya bu değerleri de değiştirebilir. Yeni testte takım değişikliği çalışan revision'ını ilerletti ve audit'te eski/yeni `versions[0].lead` değerleri doğru çıktı. Yaklaşık 39 ms'lik kopyalama maliyeti, genel mutasyon sözleşmesi yeniden tasarlanmadan kaldırılmadı.
- Negatif/sınır üstü tahsis, proje dönemi dışı kaynak, boş proje adı, olmayan takım bağlantısı ve çakışan kritik tarih içeren altı paket reddedildi. Aynı paketin geçerli ilk hücresi de kaydedilmedi; persist hiç çağrılmadı, veri/generation/revision/audit korundu. Hatalar model/400 doğrulama hataları; SQL constraint'e bırakılmadı.
- Tek son doğrulama proje/sorumlu metnini temizledi, ay biçimindeki işbaşı/ayrılış tarihlerini güne çevirdi ve geçmiş çalışma dönemlerinin ayrılış bitişini eşitledi. Gelen komutlar değişmedi; dönen yanıt fresh SQL view ile aynı.
- Üç yeni regresyon testi ile `npm run verify`: **189/189** test; biçim, TypeScript ve üretim derlemesi başarılı. Gerçek SQL.js HTTP CRUD/eşzamanlılık suite'leri güncel service yolunu kullandı. Native MSSQL ortamı hâlâ gerekli.
- Kalan maliyet: tam okuma, bir tam kopya/son doğrulama, persist ve audit'in değişiklikleri ayrı taraması, tam JSON yanıt. Sıradaki inceleme persist/audit için değişiklik tespitini ortaklaştırmak. Yetki, normalizasyonun türettiği değişiklikler, revision ve atomiklik korunmalı.


## Devam ölçümü — persist ve audit için tek kayıt farkı

On yedinci adımda `dataChanges` doğrulanmış tam görüntülerin eski/yeni kayıt farkını üretir. Persist bu sonucu SQL işlemlerine dönüştürür ve aynı sonucu audit'e verir. Sayısal hücreler aynıysa JSON serileştirme yapılmaz; audit yalnız aday değişikliklerin temizlenmiş alanlarını inceler. Kişisel açıklamalar/notlar audit'ten çıkarılmaya devam eder. Revision-only değişiklikler bu kayıt farkına dahil değildir; mevcut revision/generation yazımı devam eder.

Ölçüm, önce `998526d` kaynaklarıyla 16:37 UTC (19:37 İstanbul), sonra yeni kaynaklarla 16:56 UTC (19:56 İstanbul) yapıldı. Aynı bilgisayar, Node 24.21.0, geçici SQL.js, 200 çalışan, 48 ay, 1.000 izin kaydı, sıfır başlangıç audit geçmişi, beş örnek ve bir ısınma kaydı. Zaman ve çalışma ortamı değişkenliği sonuçları etkileyebilir. Ölçümler HTTP/ağ/native MSSQL içermez.

```sh
npm run bench:store -- --response=planning --validation=single --output=/tmp/aa-shared-diff-new.json
```

| Planlanan hücre | Önce kayıt + yanıt | Ortak fark ile | Tam okuma önce / sonra | Tam kopya önce / sonra | Yanıt boyutu, aynı |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 1.000 | 28,21 ms | 29,90 ms | 8,28 / 8,76 ms | 1,14 / 1,14 ms | 191.203 bayt |
| 10.000 | 109,57 ms | 100,89 ms | 52,12 / 54,68 ms | 7,65 / 7,80 ms | 764.447 bayt |
| 50.000 | 462,44 ms | 418,41 ms | 233,57 / 229,08 ms | 44,48 / 41,83 ms | 3.371.253 bayt |

50.000 hücrede bu deneyde yaklaşık **%9,5 azalma**; küçük veri setinde belirgin iyileşme yok. Önce/sonra p95 örnekleri 1.000'de 32,83 / 32,61; 10.000'de 126,25 / 105,24; 50.000'de 468,92 / 426,35 ms. Beş örnek üretim p95/kapasite hesabına yeterli değildir. JSON yanıt serileştirmesi toplam zincirden ayrı ölçülür; büyük durumda yaklaşık 19 ms.

Her boyutta tam okuma ve `structuredClone` sayısı bir; okunan SQL satırları sırasıyla 2.465 / 20.469 / 100.489. Tahsis/revision/audit/settings satırlarının her birinden bir yazılıyor (toplam dört), yazma parametrelerinin JSON boyutu 334 bayt. Yeni betik yalnız fark sayısını raporlar: bu senaryoda `allocation: 1`, diğer kayıt türleri `0`. Ham farktaki kimlikler, açıklamalar veya özel metinler ölçüm çıktısına konmaz.

Persist süresi önce 1,66 / 8,28 / 40,49 ms, sonra 3,05 / 7,19 / 31,94 ms. **Faz kapsamı değişti:** yeni persist takvim/kişisel gün farkını da üretir; önceden bu audit sırasında taranıyordu. Bu değerler saf SQL süresi değildir; iç içe medyanları toplayarak toplam hesaplanmamalı. Yeni betiğin fark sayısı ölçümünün de küçük ek maliyeti var.

### Kaynak izlenebilirliği ve doğrulama

- Eski Store SHA-256: `ad937539159ce091ada2c89b2a0e17a99fef37ce14ad69bebc5d1c1874ad438e`; eski audit: `fbdd4b68963de859db3410780e78e870feadbcbb3eb3e60ec18d20ce5d37cf0e` (baseline commit'ten). Önceki JSON'da audit hash alanı yoktu.
- Yeni Store: `970ed8f6733ee3009d3d032a31c44302fb7e6b2437344d559cd0ac42ab6ed880`; audit: `65505c4d3047aee1c845672c1eedd9a6c066ba426d3bf3a6ea44687a4df86905`; change-set: `e9fcecc9129c6d7d4f1526f16e43d4be8e820056c788ffcfb0d54628cb0733fe`.
- Operations/service kodları önceki ölçümle aynı. Ham sentetik sonuçlar yerelde `/tmp/aa-shared-diff-before-20261001.json` ve `/tmp/aa-shared-diff-after-20261001.json` dosyalarında; geçici dosyalar kalıcı raporun parçası değildir.
- Beş yeni regresyon testi ile **194/194** test, biçim, TypeScript ve üretim derlemesi başarılı. Audit'e hazır fark verildiğinde tüm allocation haritasının yeniden taranmadığı, özel metinlerin kaydedilip audit'e alınmadığı, bağlantılı silmelerin ve `constructor` kimlikli proje CRUD işlemlerinin doğruluğu kontrol edildi. Mevcut rollback/eşzamanlılık/snapshot/restore kontrolleri geçti.
- Metadata kayıt isimleri ve hesap audit'i için ayrı indeksler, revision/settings karşılaştırması, tam model doğrulaması/kopyası ve tam JSON yanıt devam ediyor. Tam okuma büyük ölçümün yaklaşık 229 ms'sini oluşturuyor; native MSSQL sonuçları ve daha geniş veri/audit profilleri ayrıca gerekli.


## Devam ölçümü — yoğun gerçekleşen veri ve uzun işlem geçmişi

### Profil ve ölçüm kapsamı

Node 24.21.0 / SQL.js, aynı bilgisayar, her profilde bir ısınma kaydı ve **yedi örnek**. Önceki backend kaynakları `abc9835`; her iki ölçümde de aynı genişletilmiş benchmark betiği kullanıldı. Önce 18:05 UTC (21:05 İstanbul), sonra 18:10–18:11 UTC (21:10–21:11 İstanbul), 1 Ekim 2026. Profiller aynı anda değil, sırayla çalıştırıldı. Canlı veritabanı veya `.env` kullanılmadı.

| Profil | Planlanan hücre | Gerçekleşen hücre | Çalışan | Kişisel izin kaydı | Başlangıç audit kaydı |
| --- | ---: | ---: | ---: | ---: | ---: |
| A | 50.000 | 0 | 200 | 1.000 | 0 |
| B | 50.000 | 0 | 200 | 1.000 | 50.000 |
| C | 100.000 | 50.000 | 2.000 | 10.000 | 50.000 |

Planlanan veri 48 aya yayılıyor; gerçekleşen veri Ocak–Eylül 2026'da oluşturuluyor. Sentetik gerçekleşen toplamları sınır altında tutuluyor. Audit UUID'leri rastgele üretildiğinden aynı satır sayısında B-tree/dosya yerleşimi ve dosya boyutu az miktarda farklı olabilir. Sonuçlar gerçek veri şekli, makine yükü, audit metin uzunluğu veya ağ maliyetini temsil etmez.

Yeni profil seçenekleri ile güncel ölçümler tekrar çalıştırılabilir (çıktı dosyaları yeni olmalı; mevcut dosya üzerine yazılmaz):

```sh
npm run bench:store -- --sizes=50000 --samples=7 --resources=200 --actuals=0 --calendar-days=1000 --audit-events=0 --response=planning --validation=single --output=/tmp/aa-profile-a-new.json
npm run bench:store -- --sizes=50000 --samples=7 --resources=200 --actuals=0 --calendar-days=1000 --audit-events=50000 --response=planning --validation=single --output=/tmp/aa-profile-b-new.json
npm run bench:store -- --sizes=100000 --samples=7 --resources=2000 --actuals=50000 --calendar-days=10000 --audit-events=50000 --response=planning --validation=single --output=/tmp/aa-profile-c-new.json
```

Eski sonuçları yeniden üretmek için genişletilmiş betik ayrı `abc9835` çalışma kopyasında kullanılmalı; canlı kaynakları/veritabanını geri almak gerekmez. Betiğin eski commit'teki sürümü yeni çalışan/gerçekleşen seçeneklerini tanımaz. Ölçüm Store zincirini kullanır; HTTP, ağ, tarayıcı çizimi ve native MSSQL içermez.

### Yapılan değişiklikler

1. SQL.js satır çözümlemesinde prepared statement'ın sütun adları bir kez alınıyor. Önce `getAsObject` her satırda sütun adlarını yeniden okuyor/çözümlüyordu (kurulu sql.js kaynağında doğrulandı). Satır değerleri her step'te yeniden okunuyor; auth/veri sonucu önbelleği eklenmedi. SQL, sorgu kapsamı ve seçilen satırlar aynı.
2. Açıkça boş gerçekleşen ay kapsamı için aylık toplam indeksi hazırlanmıyor. Planlanan kayıt bu küme boş olduğu için gereksiz 50.000 gerçekleşen hücre taraması yapıyordu. Restore'un kapsamsız tam kontrolü ve dolu kapsamın hesapları korunuyor; son model doğrulaması Store içinde devam ediyor.
3. Ölçüm betiği SQL tablosu başına raw okuma süresini, satırı ve çağrıyı; geçici veritabanı dosyasının open/write/sync/close/rename toplamını ayrı kaydediyor. Bunlar iç içe fazlar; medyanlar toplanarak toplam hesaplanamaz. Dosya commit ölçümü DB export süresini kapsamaz. Diğer dosyalar bu ölçüme dahil edilmez.

### Yerel sonuçlar

| Profil | Önce kayıt + yanıt | Sonra kayıt + yanıt | Medyan azalma | Tam okuma önce / sonra | Komut hazırlama önce / sonra | JSON serileştirme önce / sonra |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| A | 424,91 ms | 328,41 ms | %22,7 | 232,14 / 128,78 ms | 0,11 / 0,08 ms | 19,26 / 19,70 ms |
| B | 458,82 ms | 346,98 ms | %24,4 | 231,81 / 136,11 ms | 0,12 / 0,08 ms | 19,84 / 19,74 ms |
| C | 1.530,34 ms | 1.151,21 ms | %24,8 | 723,51 / 404,21 ms | 37,88 / 0,09 ms | 74,98 / 75,00 ms |

Bu azalmalar yalnız bu yerel deneyi anlatır. Yedi örneğin p95 değerleri A'da 452,08 / 344,04; B'de 512,80 / 383,53; C'de 1.542,54 / 1.204,54 ms. Bunlar üretim p95 veya kapasite tahmini değildir. JSON serileştirmesi toplam Store zincirinden **ayrı** ölçülüyor; tabloda kayıt+yanıta dahil değil.

| Profil | DB boyutu önce / sonra, bayt | Export süresi önce / sonra | Dosya commit önce / sonra | Tam kopya önce / sonra | Persist önce / sonra |
| --- | ---: | ---: | ---: | ---: | ---: |
| A | 9.601.024 / 9.601.024 | 1,70 / 1,78 ms | 18,86 / 13,77 ms | 42,15 / 42,19 ms | 32,15 / 34,55 ms |
| B | 25.780.224 / 25.812.992 | 4,12 / 4,20 ms | 18,41 / 21,85 ms | 43,71 / 45,45 ms | 32,87 / 33,22 ms |
| C | 48.353.280 / 48.345.088 | 8,13 / 7,00 ms | 40,44 / 38,79 ms | 155,22 / 155,02 ms | 124,90 / 133,44 ms |

Her profilde tek tam okuma ve tek structuredClone kaldı. Okunan SQL satırları A/B'de **100.489**, C'de **304.113**; yanıt boyutları sırasıyla **3.371.253 / 3.371.253 / 11.479.658 bayt**. Önce/sonra bu sayılar ve tahsis/revision/audit/settings için dört satırlık yazma, 334 bayt yazma parametresi aynı olarak doğrulandı. Uzun audit geçmişi `/api/changes` snapshot'ına eklenmez; A/B yanıt boyutu aynı.

SQL.js hâlâ işlem başına **iki DB export** yapar: rollback snapshot'ı ve commit dosyası. B/C audit geçmişi veritabanını büyüttüğü için bu export/dosya yolu daha fazla bayt taşır. Bu küçük ölçümden geçmiş büyüklüğüne bağlı doğrusal gecikme veya tüm ek maliyetin tek fazdan kaynaklandığı sonucu çıkarılamaz. Geçmiş silinmedi, fsync/rename veya rollback koruması azaltılmadı.

### İzlenebilirlik, doğrulama ve kalan maliyet

- SQL.js adapter önce `3eb5dbe626def1a3b694eb5a2d9a461ead2f2ade812c62b627ddf4cea89d81dd`, sonra `e7ead29cad3a25a926a52763e5f99a6258c004ac2a85d65703f193f3b7da035d`.
- Ortak aylık sınır kaynağı önce `32d5721b710e922a05cc456c279e93b09319f404ff32a8ec33eafb77073d2df3`, sonra `73b761ddb5550b9231e9cb367617d6e6e124f596c1760213a8a60f84243115c6` (kaynaklardan ayrıca hesaplandı; ham JSON'da bu alan yok).
- Her iki seride betik hash'i `e380f3dddd6dd24c9fcd54c3f703b3b49dc41af3a7153266e3e67d73a14706b4`, Store `970ed8f6733ee3009d3d032a31c44302fb7e6b2437344d559cd0ac42ab6ed880`; operations/service/schema/audit/change-set hash'leri JSON'da mevcut ve iki seride aynı. Ham dosyalar yerelde `/tmp/aa-profile-{plain,history,dense}-{before,after}-20261001.json`; geçici dosyalar Git raporunun kalıcı parçası değildir.
- Üç yeni SQL.js testi: Unicode/falsy/BLOB/parametrelerde aynı satır sonucu; 100 satırda tek metadata hazırlığı ve sonraki şema/alias değişimleri; decode hatasında statement free/transaction rollback ve yeniden okuma. Bir yeni aylık kapsam testi: boş array/Set/generator tarihsel veriyi taramaz; kapsam verilmezse veya ilgili ay seçilirse %100 aşımı yine reddedilir.
- `npm run verify`: **208/208 test**, biçim, TypeScript ve üretim derlemesi başarılı. HTTP yetki/revision/eşzamanlılık, disk commit hatası/rollback, restore ve aylık sınır regresyonları geçti. Native MSSQL üzerinde ölçüm/entegrasyon iddiası yok.
- Yoğun profilde **11,48 MB** tam yanıt, yaklaşık **75 ms** JSON serileştirmesi, **155 ms** kopya, **133 ms** persist ve **404 ms** tam okuma devam ediyor. Son model doğrulaması ve metadata karşılaştırması bu tabloda ayrıca ölçülmüş fazlar değildir. Bunları veya iç içe medyanları toplayarak toplam hesaplamayın.
- Sonraki mimari inceleme hedefli sorgu/yanıt sözleşmesi ve istemcinin büyük snapshot maliyeti. Bu paket yalnız tek kayıt zincirini ölçtü; yüksek eşzamanlı hacim/global işlem kilidi kapasitesi, tarayıcı performansı ve native MSSQL ayrı doğrulama gerektiriyor.


## Planlanan hücre yanıtı — tam görüntü / küçük yanıt karşılaştırması

1 Ekim 2026, 21:33–21:35 Europe/Istanbul; Node 24.21.0; geçici sentetik SQL.js veritabanı. Aynı kaynak koduyla tam yanıt (`--response=planning`) ve küçük yanıt (`--response=delta`) sırasıyla çalıştırıldı; bir ısınma + yedi örnek. Gerçek veri/.env kullanılmadı. Son istemci görüntüsü yeni SQL görüntüsüne tüm alanlarıyla eşit kontrol edildi. Her mod tek tam okuma, tek structuredClone ve aynı dört satırlık yazmayı kullanıyor; audit/generation/revision sonuçları kontrol ediliyor. İstemci simülasyonu Node'da gerçek ortak birleştirme işleviyle yapıldı; tarayıcı/HTTP/ağ gecikmesi ölçümü değildir.

- medium: 50.000 planlanan hücre, 200 çalışan, 0 gerçekleşen hücre, 1.000 izin kaydı, 50.000 audit.
- dense: 100.000 planlanan hücre, 2.000 çalışan, 50.000 gerçekleşen hücre, 10.000 izin kaydı, 50.000 audit.

| Profil / yanıt | Yanıt bayt | Kayıt + görüntü ms | Sunucu JSON ms | İstemci JSON çözme ms | İstemci harita kopyası ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| medium / full | 3,371,253 | 357.04 | 20.93 | 24.90 | 0.00 |
| medium / delta | 277 | 371.98 | 0.01 | 0.01 | 27.75 |
| dense / full | 11,479,658 | 1222.86 | 78.42 | 95.66 | 0.00 |
| dense / delta | 277 | 1225.22 | 0.01 | 0.01 | 97.10 |

Süreler medyandır. Kayıt + görüntü sütunu JSON serileştirmesini, çözmeyi ve istemci birleştirmesini içermez; bunlar ayrı ölçülür. Ayrı medyanların toplamı toplam sürenin medyanı olarak sunulmaz. Sunucu kayıt zinciri hızlandırılmadı: medium 357,04 → 371,98 ms, dense 1.222,86 → 1.225,22 ms; ölçümde küçük yanıtın bu zincire hız kazancı görülmedi. Beklenen kazanç gönderilen bayt ve sunucu serileştirmesidir. JSON çözme yerine harita kopyalama hâlâ O(N) maliyet taşır: medium 24,90 ms tam çözme / 27,76 ms küçük çözme + kopya; dense 95,66 / 97,11 ms. Tarayıcı CPU iyileşmesi iddia edilmiyor.

Tek hücre yanıtı iki profilde de 277 bayt; gerçek toplu yanıtta değişen hücre sayısı ve kullanıcı alanlarıyla büyür. Bu örnekte boyut azalışı %99,99'dan fazla. Sürüm uyuşmazlığı/metadata normalleşmesi/karma kayıt/ilk yüklemede tam görüntü korunur. Sık eşzamanlı değişikliklerde küçük yanıt yerine tam görüntü daha sık dönebilir. Yedi örnek üretim p95 veya kapasite garantisi değildir; native MSSQL performansı ölçülmedi. Sıkıştırma eklenmedi; kimlik/CSRF sözleşmesi değişmedi.

Tekrar üretme: `node scripts/benchmark-store.mjs --sizes=50000 --samples=7 --resources=200 --actuals=0 --calendar-days=1000 --audit-events=50000 --response=planning --output=/tmp/benzersiz-sonuc.json`. Küçük yanıt için `--response=delta` kullanın; her çalıştırmada ayrı çıktı adı seçin. Dense için `--sizes=100000 --resources=2000 --actuals=50000 --calendar-days=10000`. Çıktı yolu daha önce bulunmamalı. Betik geçici veritabanlarını sonunda siler.

Ham çıktılar bu oturumun `/tmp/aa-response-{medium,dense}-{full,delta}-20261001.json` dosyalarında; kaynak kod, ölçüm zamanı, örnekler, SQL/file commit süreleri ve bayt sayıları içerir, kullanıcı verisi içermez. `/tmp` kalıcı arşiv değildir. Ölçülen kaynak hash'leri:

- storeSha256: `bc8249c576f3073b91108d0e432a1da6814fdcd0775f58c31fffa241ffbd1e21`
- operationsSha256: `41b0cd408246881e04f4536fdbec90fdc14eef2ebe3b576c357966f0778f60e9`
- changeServiceSha256: `f618ff658fae7691436ddf012256eef3a3f666c5cadb0d83e11e2e3001daad7a`
- auditSha256: `ae66df2889c7b5560371b840d01c138cc1abcf2ecab2df4b0fcb7f88f9b6e417`
- sqlJsAdapterSha256: `e7ead29cad3a25a926a52763e5f99a6258c004ac2a85d65703f193f3b7da035d`
- schemaSha256: `40774711b6218062d1ada75511d0c4973c5b338e38b6b951b3519b49b7a9e2d7`
- benchmarkSha256: `0b8ae1bed0d8048901d9fcd02f48ed72b28863a76c7e1dad4c6aa80a19204dae`
- changeSetSha256: `6189c27a21044e2ce3150fc275e1964d5da616ce9323c6e80ce6730e76a9dfc8`
- planningResponseSha256: `07371dd7395807708c1dd9a97bafaf4bb285b95775885760477afa7b622a4b53`


## Kayıt öncesi snapshot kopyası — tek geçişli sayısal haritalar

1 Ekim 2026, 21:54–21:57 Europe/Istanbul; Node 24.21.0; sentetik/geçici SQL.js veritabanları. Son yordamın kaynak hash'i tüm karşılaştırmalarda aynı. `--snapshot-copy=full`, Store'un kopyalama yöntemini benchmark içinde önceki `structuredClone(data)` işlemine geçirir. `numeric`, uygulamanın yeni varsayılanıdır. Her çalışma bir ısınma + yedi ölçüm kullanır; medium numeric → full, dense full → numeric sırayla çalıştırıldı. Sonuçları tek bir değişiklikten kaynaklanan üretim hız farkı veya istatistiksel kapasite garantisi olarak yorumlamayın. Diğer kaynaklar ve ölçüm mantığı iki modda da aynı.

- medium: 50.000 planlanan hücre, 200 çalışan, 0 gerçekleşen hücre, 1.000 izin kaydı, 50.000 audit.
- dense: 100.000 planlanan hücre, 2.000 çalışan, 50.000 gerçekleşen hücre, 10.000 izin kaydı, 50.000 audit.
- Küçük yanıt modu (`--response=delta`), tek son model doğrulaması (`--validation=single`) kullanıldı. Son istemci görüntüsü tüm alanlarıyla yeni SQL görüntüsüne eşit; generation, revision ve audit sayısı kontrol edildi. Gerçek veri/.env kullanılmadı, veritabanları sonunda silindi.

| Profil / kopya | Kayıt + görüntü ms | Tam kopyalama ms | structuredClone alt süresi ms | Tam okuma ms | Persist ms | Dosya commit ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| medium / full | 357.96 | 46.66 | 46.65 | 133.12 | 33.87 | 34.31 |
| medium / numeric | 313.32 | 19.43 | 0.87 | 131.18 | 32.30 | 21.91 |
| dense / full | 1193.46 | 156.44 | 156.44 | 413.52 | 121.61 | 35.04 |
| dense / numeric | 1112.50 | 77.16 | 13.28 | 410.16 | 120.37 | 30.73 |

Süreler medyan. **Tam kopyalama** yeni yöntemin sayısal harita kontrolü/kopyası ve metadata derin kopyasının tümünü içerir. Yeni yöntemde structuredClone alt süresi yalnız metadata olduğundan eski toplam kopyalama süresiyle tek başına karşılaştırılmamalıdır. Dosya commit ve diğer süreler kayıt + görüntünün içindedir; alt süreler toplam medyana eklenmez. Kayıt + görüntü, HTTP/ağ/istemci çizimini içermez. JSON çözme ve istemci immutable merge, önceki adımda olduğu gibi ayrı kalır.

Yoğun profilde kopya 156,44 → 77,16 ms (**%50,7 azalma**), kayıt + görüntü 1.193,46 → 1.112,50 ms (**bu deneyde %6,8 azalma**). Medium kopyası 46,66 → 19,43 ms (%58,4); kayıt + görüntü 357,96 → 313,32 ms (%12,5). Medium dosya commit süreleri de değiştiği için tüm toplam kazancını yalnız kopyalamaya atfetmek doğru olmaz. Her profilde bir tam SQL okuması, bir structuredClone çağrısı ve aynı sayıda seçilen satır korundu: medium 100.489, dense 304.113. Değişen dört satır allocation/revision/audit/settings; 334 bayt yazma parametresi ve tek hücre için 277 bayt yanıt aynı.

İlk denenen `Object.values` kontrolü + spread kopyası, ayrı bir keşif ölçümünde medium kopyasını 44,91 → 49,39 ms'ye çıkararak yavaşladı; terk edildi. Yukarıdaki sonuçlar tek geçişli son sürüme aittir. Tek geçişte kendi alanı olmayan kalıtılmış özellik okunmaz; özel `__proto__` alanı veri özelliği olarak kurulur. Sayısal olmayan map değerinde tam kopya kullanılır; iş sınırları model doğrulamasında kalır. Önceki/yeni yordamın veri bağımsızlığı ve SQL/audit/rollback sonuçları testlerle kontrol edildi. Bellek/GC etkisini veya tarayıcı/native MSSQL performansını ölçen bir çalışma değildir.

Tekrar üretme:

`node scripts/benchmark-store.mjs --sizes=50000 --samples=7 --resources=200 --actuals=0 --calendar-days=1000 --audit-events=50000 --response=delta --snapshot-copy=full --output=/tmp/benzersiz-copy-full.json`

Yeni yordam için `--snapshot-copy=numeric` ve farklı çıktı adı kullanın. Dense profil için `--sizes=100000 --resources=2000 --actuals=50000 --calendar-days=10000`. Betik .env yüklemez, mevcut DB yolu/provider kabul etmez; yalnız geçici SQL.js veritabanlarını oluşturup siler. Çıktı yolu önceden bulunmamalıdır.

Ham final çıktıları bu oturumda `/tmp/aa-copy-{medium,dense}-final-{full,numeric}-20261001.json` dosyalarında. İlk deneme sonuçları final karşılaştırmaya karıştırılmadı. `/tmp` kalıcı arşiv değildir. Final karşılaştırmanın kaynak hash'leri:

- mutationSnapshotSha256: `d42c624a010d89315d6b9759f7149731954df64844cdb9fbee89eb4643638306`
- storeSha256: `55a336610d3df6315e74458fa65911b7f15a450a364c2312860e903212653347`
- operationsSha256: `41b0cd408246881e04f4536fdbec90fdc14eef2ebe3b576c357966f0778f60e9`
- changeServiceSha256: `f618ff658fae7691436ddf012256eef3a3f666c5cadb0d83e11e2e3001daad7a`
- auditSha256: `ae66df2889c7b5560371b840d01c138cc1abcf2ecab2df4b0fcb7f88f9b6e417`
- sqlJsAdapterSha256: `e7ead29cad3a25a926a52763e5f99a6258c004ac2a85d65703f193f3b7da035d`
- schemaSha256: `40774711b6218062d1ada75511d0c4973c5b338e38b6b951b3519b49b7a9e2d7`
- benchmarkSha256: `babd577313c54eb16354c6030b07478616150a6fd458b814bc99d5efaa28390f`
- changeSetSha256: `6189c27a21044e2ce3150fc275e1964d5da616ce9323c6e80ce6730e76a9dfc8`


## Tam SQL okuması — doğrudan kayıt haritası ve bileşik anahtar

1 Ekim 2026, 22:10–22:38 Europe/Istanbul; Node 24.21.0; sentetik/geçici SQL.js. Önceki `d990268` sürümünde medium/dense ölçümleri kod değişmeden tamamlandı; son sürümde aynı profiller ve yedi örnek + bir ısınma ile sırayla yeniden çalıştırıldı. Arada geliştirme/test yapıldı; önce ve sonra aynı anda veya test derlemesiyle paralel ölçülmedi. Zaman farkları kontrollü üretim deneyi veya istatistiksel kapasite garantisi değildir.

- medium: 50.000 planlanan hücre, 200 çalışan, 0 gerçekleşen hücre, 1.000 izin kaydı, 50.000 audit.
- dense: 100.000 planlanan hücre, 2.000 çalışan, 50.000 gerçekleşen hücre, 10.000 izin kaydı, 50.000 audit.
- `--response=delta --snapshot-copy=numeric --validation=single` iki sürümde de aynı. Son istemci görüntüsü bütün alanlarıyla yeni SQL görüntüsüne eşit; audit/revision/generation kontrolleri geçti. Betik .env yüklemedi, mevcut veritabanı kullanılmadı.

| Profil / sürüm | Kayıt + görüntü ms | Tam okuma ms | Kopya ms | Persist ms | Dosya commit ms | Seçilen satır | Ara satır nesnesi |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| medium / before | 314.83 | 132.22 | 19.20 | 32.15 | 22.46 | 100,489 | 100,489 |
| medium / final | 292.68 | 103.53 | 21.04 | 34.18 | 18.33 | 100,489 | 489 |
| dense / before | 1078.56 | 404.09 | 75.00 | 122.18 | 32.88 | 304,113 | 304,113 |
| dense / final | 1040.70 | 327.38 | 84.85 | 127.20 | 38.13 | 304,113 | 4,113 |

Süreler medyan. **Tam okuma** SQL sorguları, değer çözümü ve Data haritalarını oluşturmayı her iki sürümde de içerir. Son sürümün tablo bazında `raw` süresi tüketici callback'ini de içerir; eski `raw` süresi harita oluşturmayı dışarıda bırakıyordu. Bu nedenle tablo bazındaki raw süreleri doğrudan driver hız karşılaştırması değildir; toplam readMs kıyaslanır. Seçilen satır sayımı artık scanner'ın `rowCount` alanını kullanır; boş `rows` dizisini yanlışlıkla sıfır okunmuş satır saymaz. `materializedRows` yalnız normal query'nin oluşturduğu ara satır nesnelerini sayar. Önceki decoder her seçilen satır için bir nesne döndürdüğünden önce değeri selectedRows ile aynıdır; yeni alan önceki ham dosyada yoktur.

Dense okuma **%19,0**, medium **%21,7** azalıyor. Toplam kayıt + görüntü dense **%3,5**, medium **%7,0** azalıyor. Kopya/persist/dosya commit maliyetleri de farklılaştığı için alt sürelerin azalması toplam kazanca birebir taşınmaz. Bir tam okuma, bir snapshot kopyası, dört yazılan satır (allocation/revision/audit/settings), 334 bayt yazma parametresi ve 277 bayt tek hücre yanıtı her profilde aynı. JSON/ağ/istemci çizimi bu kayıt + görüntü sütununda değildir. Native MSSQL performansı ölçülmedi; MSSQL normal kolon/recordset yolu ayrı tutuldu.

İlk yalnız değer-array scanner denemesi dense readMs'i 404,09 → 396,59 ms'ye indirdi, fakat pipelineMs 1.078,56 → 1.082,63 ms oldu. Bu ara deneme son karşılaştırmaya karıştırılmadı. Son yordam dört sayısal tabloda iki kolon (bileşik anahtar + değer) çözerek anahtar kolonlarını ayrı ayrı JS'ye taşımayı azaltıyor; revision ön eklerini JS'de aynı codec çözüyor. PK kolonları ortak tableSpec tanımından gelir, tablo/kolon adları beyaz listeden doğrulanır. Kullanıcı değerleri SQL metnine interpolasyonla eklenmez. İki okuma yolu sıfır/tombstone/takvim/metadata dahil aynı Data üretir; eksik scan kabul edilmez.

300.000 daha az ara satır nesnesi oluşturulması, 300.000 daha az kayıt okunması anlamına gelmez. Son Data/revision haritaları ve SQL.js getter değerleri hâlâ oluşur; tam model/referans/iş sınırı kontrolleri devam eder. Bu deney heap/RSS/GC veya eşzamanlı kullanıcı kapasitesini ölçmez. Yedi örnek üretim p95 sonucu sağlamaz.

Tekrar üretme (son sürüm):

`node scripts/benchmark-store.mjs --sizes=50000 --samples=7 --resources=200 --actuals=0 --calendar-days=1000 --audit-events=50000 --response=delta --snapshot-copy=numeric --output=/tmp/benzersiz-scan-medium.json`

Dense için `--sizes=100000 --resources=2000 --actuals=50000 --calendar-days=10000`. Önceki davranış için ayrı checkout'ta `d990268` commit'inin aynı betiği çalıştırılır. Çıktı adı önceden bulunmamalı; betik yalnız geçici SQL.js veritabanları oluşturup sonunda siler. Ham önce/final çıktılar `/tmp/aa-scan-{medium,dense}-{before,final}-20261001.json` dosyalarında; `/tmp` kalıcı arşiv değildir.

Önceki sürüm Store hash'i: `55a336610d3df6315e74458fa65911b7f15a450a364c2312860e903212653347`; adapter: `e7ead29cad3a25a926a52763e5f99a6258c004ac2a85d65703f193f3b7da035d`; betik: `babd577313c54eb16354c6030b07478616150a6fd458b814bc99d5efaa28390f`. Son sürüm kaynak hash'leri:

- recordReaderSha256: `75d6bce56676235a279861707a723380f760c4c3e1e4afab5aa98a9c5d55bfc5`
- mutationSnapshotSha256: `d42c624a010d89315d6b9759f7149731954df64844cdb9fbee89eb4643638306`
- storeSha256: `355ddfcac40ae55cfe78a490448d8b64ccb2750537b880eb7976b399c9e23d0c`
- operationsSha256: `41b0cd408246881e04f4536fdbec90fdc14eef2ebe3b576c357966f0778f60e9`
- changeServiceSha256: `f618ff658fae7691436ddf012256eef3a3f666c5cadb0d83e11e2e3001daad7a`
- auditSha256: `ae66df2889c7b5560371b840d01c138cc1abcf2ecab2df4b0fcb7f88f9b6e417`
- sqlJsAdapterSha256: `26d1e23372ba2224e598153e9e84a02a86d4be277ce04fa399e708a29ddc5f1e`
- schemaSha256: `40774711b6218062d1ada75511d0c4973c5b338e38b6b951b3519b49b7a9e2d7`
- benchmarkSha256: `eb7f744cfaf4c5e0700a0e0353a6704722acccd1327d03a64b377f322b239b12`
- changeSetSha256: `6189c27a21044e2ce3150fc275e1964d5da616ce9323c6e80ce6730e76a9dfc8`


## Tam doğrulama ve fark karşılaştırması — 2 Ekim 2026

Önceki `22503c1` ve bu paket; Node v24.21.0; yalnız geçici sentetik SQL.js veritabanları. Başlangıç ve bitiş UTC zamanları: `2026-10-02T04:48:42.763Z` / `2026-10-02T04:52:13.695Z`. Bir ısınma ve yedi örnek; ölçümler sırayla ve test/derleme işinden ayrı çalıştı.

Profil: 100.000 planlanan hücre, 50.000 gerçekleşen hücre, 2.000 çalışan, 10.000 kişisel izin kaydı ve 50.000 audit olayı. Gerçekleşen yüzde girdisi bulunmuyor; yoğun yüzde/aylık takvim hesabının hızlanması bu ölçümden çıkarılamaz.

| Medyan maliyet (ms) | Önce | Sonra |
| --- | ---: | ---: |
| Kayıt + görüntü | 1071.99 | 860.09 |
| Tam okuma | 335.40 | 315.06 |
| Snapshot kopyası | 80.68 | 79.76 |
| Fark hesabı + persistence | 128.90 | 84.00 |
| Dosya commit | 54.31 | 40.12 |
| İstemci veri birleştirme | 104.32 | 90.12 |

Gözlenen kayıt + görüntü azalması yaklaşık **%19,8**; persist azalması yaklaşık **%34,8**. Tam model doğrulaması ayrı zamanlanmadığı için doğrudan bir “doğrulama ms” sonucu yok. Tam okuma/dosya maliyetleri de değişti; toplam farkın tamamı değiştirilen kodun kazancı olarak yorumlanmaz. Ağ/HTTP/tarayıcı çizimi/native MSSQL/çok kullanıcı kapasitesi ölçülmedi; yedi örnek istatistiksel üretim p95 sağlamaz. Rastgele sentetik audit kimlikleri nedeniyle fiziksel DB boyutları birebir aynı değildir. Bellek/RSS/GC kapasitesi iddiası yok.

İki koşuda da: tek tam okuma, tek kopya, 304.113 seçilen satır, 4.113 query satır nesnesi, allocation/revision/audit/settings için birer yazma (toplam 4), 334 bayt yazma parametresi ve 277 bayt yanıt. Son istemci snapshot'ı yeni SQL görüntüsüyle eşit; audit/revision/generation kontrolü geçti. Ara çift dizilerinin ve birleşik Set'in kaldırılması okunan/kontrol edilen kayıt kapsamını azaltmaz.

Tekrar üretme:

`node scripts/benchmark-store.mjs --sizes=100000 --samples=7 --resources=2000 --actuals=50000 --calendar-days=10000 --audit-events=50000 --response=delta --snapshot-copy=numeric --output=/tmp/benzersiz-validation-diff.json`

Önceki davranış için ayrı checkout'ta `22503c1` sürümünün aynı betiğini kullanın. Betik .env yüklemez, gerçek DB yolu/provider kabul etmez; yalnız geçici veritabanı oluşturup siler. Ham dosyalar `/tmp/aa-validation-diff-dense-{before,after}-20261002.json`; `/tmp` kalıcı arşiv değildir. Kaynak hash'leri:

| Kaynak | Önce SHA-256 | Sonra SHA-256 |
| --- | --- | --- |
| schemaSha256 | `40774711b6218062d1ada75511d0c4973c5b338e38b6b951b3519b49b7a9e2d7` | `399be2e54b2a89ccdd5147fde62de2aab50fe600838bdbca7adedb18931bf3dd` |
| changeSetSha256 | `6189c27a21044e2ce3150fc275e1964d5da616ce9323c6e80ce6730e76a9dfc8` | `be6d66568b205ad5893bca479285131440d2f100d31dd21d4fda7875a2152439` |
| storeSha256 | `355ddfcac40ae55cfe78a490448d8b64ccb2750537b880eb7976b399c9e23d0c` | `390ed4a3180bdb3ba1c10a5228d6a7172d6dea1afd6702c303791ff0058cff36` |
| benchmarkSha256 | `eb7f744cfaf4c5e0700a0e0353a6704722acccd1327d03a64b377f322b239b12` | `eb7f744cfaf4c5e0700a0e0353a6704722acccd1327d03a64b377f322b239b12` |


## Aylık izin/eğitim/yüzde hesabının tekrar kullanımı — 2 Ekim 2026

Önceki uygulama kodu `d495863`; Node 24.21.0. İki ayrı ölçüm sırayla, bir ısınma ve yedi örnekle çalıştı. Önce benchmark'lar genişletildi ve mevcut davranış ölçüldü; daha sonra hesap/persistence testleri ve son davranış ölçüldü. Test/build aynı anda çalıştırılmadı.

### Saf takvim değişikliği + tam model doğrulaması

400 çalışan, 20 proje, 6 ay: 48.000 yüzde kaydı / 2.400 çalışan-ay; bir tatil tam günden yarım güne değişiyor ve 400 çalışan-ay etkileniyor. Aynı güne girilmiş legacy izin + typed eğitim, kişisel izin, hafta sonu ve tam/yarım ortak tatil, otomatik/230/0 saat birlikte kullanılıyor. Veri kopyası, SQL, dosya, HTTP, JSON yanıt ve ekran çizimi zaman aralığının dışında.

| Medyan (ms) | Önce | Sonra |
| --- | ---: | ---: |
| Komut hazırlama / sınır / yüzde güncellemesi | 8819.95 | 84.24 |
| Tam doğrulama | 769.10 | 152.00 |
| Toplam saf işlem | 9593.39 | 241.19 |

Ölçüm zamanları UTC: `2026-10-02T05:38:44.899Z` / `2026-10-02T05:44:25.641Z`. Toplam saf işlemde yaklaşık %97,5 azalma, bütün uygulamanın hızlanma oranı değildir. Final doğrulanmış model hash'i iki koşuda da `5ad4e9803579db51b6f439a752e256a2f8b0e9d73d36ea69277e6f743614b490`. Depolanmış proje FTE/saat değerleri aynı; etkilenen yüzdeler mevcut formülle eşit, revision/generation beklentileri kontrol edildi. Önceki yöntem etkilenen çalışan/ay başına 48.000 yüzde anahtarını tarıyordu; yeni yöntem bütün final batch için haritayı tek kez dolaşıyor.

Tekrar üretme:

`node scripts/benchmark-actual-months.mjs --resources=400 --projects=20 --months=6 --samples=7 --output=/tmp/benzersiz-actual-months.json`

Saf betik veritabanı veya .env kullanmaz. Önceki davranış için `d495863` checkout'una aynı betik eklenerek çalıştırılır. Ham dosyalar `/tmp/aa-actual-months-{before,after}-20261002.json`.

### Yoğun yüzde modeliyle SQL.js kayıt zinciri

100.000 planlanan, 48.000 gerçekleşen ve 48.000 yüzde hücresi; 400 çalışan, 2.000 izin kaydı ve 50.000 audit. Takvim yazımı değil, tek planlanan hücre güncellemesi + küçük görüntü yanıtı ölçülüyor; tüm yüzde modeli yine final doğrulamadan geçiyor. Bu SQL profili eğitim veya elle girilen saat kaydı içermiyor; bunlar saf profil ve regresyon testlerinde kontrol edildi.

| Medyan (ms) | Önce | Sonra |
| --- | ---: | ---: |
| Kayıt + görüntü | 1994.66 | 1021.64 |
| Tam okuma | 354.38 | 340.56 |
| Snapshot kopyası | 73.11 | 73.16 |
| Fark + persistence | 89.35 | 88.70 |
| Dosya commit | 43.36 | 48.35 |
| İstemci veri birleştirme | 85.96 | 86.14 |

Zamanlar UTC: `2026-10-02T05:39:44.383Z` / `2026-10-02T05:45:02.063Z`. Bu yerel deneyde kayıt + görüntü yaklaşık %48,8 azalıyor. Diğer alt maliyetler de değişti; gözlenen toplam kazanç tek fonksiyona atfedilmez. Tek okuma/kopya, 344.913 seçilen satır, 913 ara query nesnesi, 4 yazılan SQL satırı, 334 bayt parametre ve 277 bayt yanıt aynı. Son istemci modeli SQL görüntüsüne eşit; audit/revision/generation kontrolleri geçti. Rastgele audit kimlikleri yüzünden fiziksel DB bayt sayıları birebir aynı değil.

Tekrar üretme:

`node scripts/benchmark-store.mjs --sizes=100000 --samples=7 --resources=400 --actuals=48000 --percentages=48000 --calendar-days=2000 --audit-events=50000 --response=delta --snapshot-copy=numeric --output=/tmp/benzersiz-actual-store.json`

Yeni --percentages seçeneği varsayılan 0; önceki profilleri değiştirmez. Sayı actuals değerini aşamaz. Sentetik yüzdeler mevcut FTE ve takvim saatlerinden türetilir. Betik .env yüklemez ve mevcut DB/provider yolu kabul etmez; yalnız geçici SQL.js dosyalarını oluşturup siler. Önceki davranışı ölçmek için `d495863` checkout'una bu aynı benchmark betiği alınır. Ham dosyalar `/tmp/aa-actual-store-{before,after}-20261002.json`; `/tmp` kalıcı arşiv değildir.

Gerçek kullanıcı verisi, native MSSQL, ağ/tarayıcı/çok kullanıcı kapasitesi ve bellek/GC ölçülmedi. Yedi örnek üretim p95 veya hız garantisi sağlamaz. Hesap ve normalleşme sonuçları korunur; doğrulanan kayıt kapsamı daraltılmadı. Kaynak hash'leri:

| Kaynak | Önce SHA-256 | Sonra SHA-256 |
| --- | --- | --- |
| shared/actual-units.ts | `78137f2afdba6d9f144a6954fba44c5d181192d5ccfc88bdd01010034eff3d14` | `a6dcb85976dd682a8ca8a1dc8240d91d9c24f73cfb542ff8a1e07c8b6df3d146` |
| shared/actual-months.ts | `17187ca26ce1e4e9099250d6f392e1583b867cc5d8726c3f3fa722ea5d1f0917` | `17187ca26ce1e4e9099250d6f392e1583b867cc5d8726c3f3fa722ea5d1f0917` |
| shared/server-domain.ts | `399be2e54b2a89ccdd5147fde62de2aab50fe600838bdbca7adedb18931bf3dd` | `94e46eca9efb125d7096cd0f13329408bdf876fedf8f8d2e1c9ea6a6de67a065` |
| backend/operations.mjs | `41b0cd408246881e04f4536fdbec90fdc14eef2ebe3b576c357966f0778f60e9` | `777c070923bcf4832f75a54fbbcf42b850197c50f144c43f8793834279f00508` |
| scripts/benchmark-actual-months.mjs | `1001332a7f6d1da228f5791c54720e33cdcaaa7bfd9d481388bb39ca940fe4f6` | `1001332a7f6d1da228f5791c54720e33cdcaaa7bfd9d481388bb39ca940fe4f6` |
| scripts/benchmark-store.mjs | `9c01f0b4ddc5cf7cb644a244f26cdac715d52f9d15a3882b5641dd943be7fd4d` | `9c01f0b4ddc5cf7cb644a244f26cdac715d52f9d15a3882b5641dd943be7fd4d` |


## Günlük kayıt yanıtı — 2 Ekim 2026

Başlangıç `0dba218`, Node 24.21.0. Aynı son betik ve hesap koduyla iki yanıt yolu sırayla çalıştırıldı: `separate`, önceki mutate + ayrı Store.view davranışını; `full`, yeni transaction içi tam yanıtı ölçer. Her koşuda bir ısınma + yedi örnek var; test/build eşzamanlı çalıştırılmadı. Ölçüm zamanları UTC: 2026-10-02T06:13:16.025Z / 2026-10-02T06:13:34.950Z.

100.000 planlanan, 48.000 gerçekleşen ve başlangıçta 48.000 yüzde hücresi; 400 çalışan, 2.000 izin kaydı, 50.000 audit. Düzenlenen gerçekleşen hücre doğrudan FTE değerine çevrilir, o hücrenin yüzde kaydı ısınmada kaldırılır. Bütün kalan yüzde modeli tam doğrulamadan geçer. Admin kapsamı / yerel SQL.js dosyası kullanılıyor.

| Medyan maliyet (ms) | Ayrı yanıt okuması | Transaction içi yanıt |
| --- | ---: | ---: |
| Kayıt + görüntü | 1335.43 | 1056.74 |
| Tam SQL okuma toplamı | 683.83 | 344.07 |
| Snapshot kopyası | 74.75 | 73.86 |
| Fark + persistence | 89.34 | 88.06 |
| Komut hazırlama / aylık sınır | 60.10 | 59.88 |
| Dosya commit | 49.95 | 59.00 |
| JSON yanıt üretimi | 76.29 | 77.10 |
| JSON yanıt ayrıştırma | 99.96 | 99.02 |

Kayıt + görüntü bu deneyde yaklaşık %20.9 azalıyor; iki tam okuma tek okumaya iniyor. Seçilen satır **689.823 → 344.912**, normal query satır nesnesi **1.825 → 913**. Snapshot kopyası bir; her iki yolda actual/revision/audit/settings için toplam dört yazma ve 348 bayt parametre aynı. Yanıt **12.580.420 bayt** olarak aynı; HTTP/ağ aktarımı veya ekran çizimi ölçümde yok. JSON üretimi/ayrıştırma tabloda ayrıca gösteriliyor, pipeline süresine dahil değil.

Her koşunun son yanıtı yeni SQL görüntüsüyle derin karşılaştırıldı; generation/revision/audit sayıları denetlendi. Tam snapshot'ın nesne anahtar sırasından bağımsız SHA-256 değeri iki koşuda da `96c60ce53de7fc5874b92dbf0d5b7caaed9e95c1ab7f2aad694c9ba7a9fbdb5b`. Dizilerin sırası korunur; hash hesaplama ölçüm aralıkları dışındadır. İlk denemede sıraya duyarlı JSON hash'i farklı çıktı; her iki model kendi SQL görüntüsüyle eşitti. Karşılaştırma için betik canonical hash'e geçirildi ve iki yol aynı betikle tekrar ölçüldü. Raporda bu son koşular kullanılıyor.

Tekrar üretme, aşağıdaki komutları sırayla çalıştırın:

```sh
node scripts/benchmark-store.mjs --sizes=100000 --samples=7 --resources=400 --actuals=48000 --percentages=48000 --calendar-days=2000 --audit-events=50000 --operation=actual --response=separate --output=/tmp/benzersiz-full-view-before.json
node scripts/benchmark-store.mjs --sizes=100000 --samples=7 --resources=400 --actuals=48000 --percentages=48000 --calendar-days=2000 --audit-events=50000 --operation=actual --response=full --output=/tmp/benzersiz-full-view-after.json
```

Ham dosyalar `/tmp/aa-full-view-{before,after}-v2-20261002.json`; /tmp kalıcı arşiv değildir. Betik .env yüklemez ve gerçek DB/provider yolu kabul etmez, yalnız geçici SQL.js dosyaları oluşturup siler. Yeni `--operation` varsayılan allocation, actual için gerçekleşen veri gerekir ve allocation-only delta yasaktır. Önceki planning/delta profilleri çalışmaya devam eder.

Bütün `/api/changes` komutlarının yanıtı artık kendi transaction'ında hazırlanır; metadata değişen işlemler yeniden okumayı korur. Bu sayılar tek gerçekleşen hücrenin admin yanıtına aittir; tüm komutlar veya kullanıcı kapsamları için aynı hızlanma varsayılmaz. Dosya/JSON süreleri de değişti; toplam fark tek bir fonksiyonun hızlanma oranı değildir. Native MSSQL, ilk yükleme, ağ, tarayıcı, bellek/RSS/GC ve çok kullanıcı kapasitesi ölçülmedi. Yedi örnek üretim p95/hız garantisi sağlamaz.


## İlk yükleme HTTP gövdesinin sıkıştırılması — 2 Ekim 2026

Başlangıç `cae26ba`; Node v24.21.0. Sentetik geçici SQL.js: 100.000 planlanan, 48.000 gerçekleşen, 48.000 yüzde hücresi / 400 çalışan / 2.000 izin / 49 proje. Audit başlangıç kaydı 0; bu route audit tablosunu okumuyor. Login ölçüm dışında; data isteğinin mevcut oturum ve kullanıcı sorguları ölçüm içinde. Her encoding için bir ısınma + yedi örnek; identity/gzip sırası örnekler arasında dönüşümlü. Önce/sonra ayrı süreçlerde sırayla çalıştırıldı; test/build eşzamanlı değildi. Zamanlar UTC: 2026-10-02T06:26:28.595Z / 2026-10-02T06:36:48.041Z.

| Gzip isteyen istemci | Önce | Sonra |
| --- | ---: | ---: |
| HTTP gövdesi (bayt) | 12580465 | 983621 |
| Açılmış JSON (bayt) | 12580465 | 12580465 |
| Yerel HTTP tamamlanma medyanı (ms) | 463.71 | 460.02 |
| İlk response başlıklarına kadar (ms) | 457.34 | 459.33 |
| Store.view / SQL + kapsam (ms) | 348.46 | 341.19 |
| Tam SQL okuma (ms) | 348.27 | 341.01 |
| İstemci gzip açma (ms) | 0.00 | 12.24 |
| JSON ayrıştırma (ms) | 112.02 | 108.79 |

Ana kazanım ağda taşınacak gövdenin **%92.2** azalmasıdır. SQL okuma sayısı bir, veri modeli ve açılmış JSON boyutu aynı. Decode ve parse yerel Node istemcisinde ayrıca ölçülür; HTTP süresine dahil değildir. Tarayıcı JSON parsing/çizim belleği bu paketle azalmaz. Sıkıştırmanın ayrıca sunucu CPU/threadpool maliyeti vardır; üstteki Store.view dışında kalan süre tek başına sıkıştırma süresi değildir (auth, JSON, socket de içerir). Gözlenen yerel süre farkı WAN/tarayıcı hız garantisi veya genel uygulama hızlanma oranı değildir.

Son sürümde identity kontrol profili: HTTP 464.28 ms, view 344.16 ms, 12580465 bayt. Gzip açılmış gövde her örnekte ham identity gövdesi ve beklenen SQL görüntüsünün JSON'u ile byte/hash ve derin karşılaştırıldı. Son model/generation değişmedi. Bütün örneklerin JSON SHA-256 değeri `e259fb2ab71c3e1565dc44be22182ca5ec6bda9ead66952c45049ea5ede4adfe`. Bu ölçüm bir admin kapsamına aittir; diğer kapsamların doğruluğu HTTP regresyon testlerinde denetlendi, onlar için aynı hız/boyut oranı varsayılmaz.

Tekrar üretme:

```sh
node scripts/benchmark-load.mjs --samples=7 --size=100000 --resources=400 --actuals=48000 --percentages=48000 --calendar-days=2000 --output=/tmp/benzersiz-load.json
```

Betik gzip/identity'yi raw node:http ile ister; fetch'in otomatik açması wire ölçümünü gizlemez. Son rapor her source için SHA-256 içerir. Önceki davranış için `cae26ba` checkout'una yeni benchmark-load ve benchmark-fixture dosyalarını ekleyin; source hash listesinden o sürümde mevcut olmayan backend/data-response.mjs girdisini kaldırın. Profil ve ölçüm döngüsünü değiştirmeyin. Ham önce dosyası `/tmp/aa-load-before-20261002.json`, son kodla ölçülen sonra dosyası `/tmp/aa-load-after-v2-20261002.json`; /tmp kalıcı arşiv değildir. İlk sonra koşusundan ardından erken bağlantı-kopma kontrolü ve sender kaynak hash'i eklendi; rapor son koşunun verilerini kullanır.

Ortak seed fixture'ına taşıma sonrası mevcut write/delta betiği ayrı 1.000 planlanan / 200 gerçekleşen / 200 yüzde / 20 çalışan / 20 izin profiliyle smoke kontrolünden geçti; 277 bayt delta ve final SQL snapshot/revision/audit eşitliği doğrulandı. Bu smoke sonucu yeni hız oranı olarak kullanılmaz.

Betikler .env yüklemez ve gerçek DB/provider yolu kabul etmez; yalnız os.tmpdir içindeki sentetik SQL.js dosyalarını oluşturup siler. Şema/bağımlılıklar değişmedi. Native MSSQL, gerçek tarayıcı, WAN, bellek/RSS/GC ve çok kullanıcı yükü ölçülmedi. Yedi örnek üretim p95 veya kapasite garantisi sağlamaz.


## İlk yüklemede kullanıcı kapsamı — 2 Ekim 2026

Başlangıç `9b0579c`; Node v24.21.0. SQL okuma ile projectView ayrı ölçüldü. 100.000 planlanan, 48.000 gerçekleşen, 48.000 yüzde / 400 çalışan / 2.000 izin / 49 proje; üç sentetik kullanıcı. Yönetici ilk atanmış liderlikte, normal aynı liderlikteki bench-r0'a bağlı; admin bütün görünümü alır. Bu deney atanmamış yönetici ölçmüyor; doğruluğu regresyon testlerinde denetlendi.

Bir rol/encoding başına bir ısınma + yedi örnek; identity/gzip sırası örnekler arasında dönüşümlü. Rol sırası admin → manager → normal. Önce/sonra ayrı süreçlerde sırayla çalıştı; test/build eşzamanlı değildi. Zamanlar UTC: 2026-10-02T06:50:03.101Z / 2026-10-02T07:01:06.993Z. projectView scope + public principal hazırlığını, admin'de ek user sorgusunu da içerir. readMs tam model SQL okumasını; viewMs read + projection + transaction'ı ölçer. Her sütun ayrı medyan olduğu için süreler birebir toplanmak zorunda değildir.

| Rol / istenen encoding | Projection önce/sonra (ms) | SQL önce/sonra (ms) | Store.view önce/sonra (ms) | HTTP önce/sonra (ms) |
| --- | ---: | ---: | ---: | ---: |
| admin / identity | 0.16 / 0.14 | 340.91 / 337.55 | 341.11 / 337.75 | 453.70 / 447.42 |
| admin / gzip | 0.14 / 0.13 | 340.34 / 336.31 | 340.55 / 336.50 | 455.51 / 447.44 |
| manager / identity | 271.96 / 178.08 | 344.71 / 343.25 | 616.76 / 521.41 | 638.32 / 542.59 |
| manager / gzip | 279.65 / 177.09 | 343.47 / 339.55 | 618.51 / 517.45 | 651.12 / 549.45 |
| normal / identity | 240.98 / 132.71 | 387.71 / 342.84 | 627.49 / 476.16 | 642.94 / 483.17 |
| normal / gzip | 237.44 / 133.14 | 345.20 / 395.87 | 582.72 / 529.17 | 592.83 / 542.37 |

Gzip profillerinde yönetici projection yaklaşık %36,7, normal %43,9 azalıyor; bunun tamamı belirli bir lookup fonksiyonuna atfedilemez. SQL sorguları ve okunan kapsam değişmedi. Normal gzip koşusunda SQL medyanı 345,20 → 395,87 ms yükseldi; bu nedenle HTTP toplam kazanımı daha düşük. Ayrı süreç/rol sırası, bellek/GC ve yerel sistem değişkenliği bu raporla ayrıştırılmadı. Admin projection zaten yaklaşık 0,1 ms; oradaki küçük fark yeni bir anlamlı hızlanma iddiası değildir.

| Rol | Identity / gzip baytları (iki koşuda eşit) | Açılmış tam JSON SHA-256 (iki koşuda eşit) |
| --- | ---: | --- |
| admin | 12580866 / 983727 | `18df5faaf0c640a42f97773ebc1e04b916f586b6c35a7eb0251b6b01a40b83bd` |
| manager | 2339452 / 184034 | `40eb7e07db4a01acad69c980732d4444096298cdcc31cb61902ab011642ce069` |
| normal | 586380 / 48421 | `a781acc1277d10751db26c09faeba009d52c6991b1b7e7fd94896a33ff767143` |

Her örnek açılmış gövdeyi o rolün SQL görüntüsünün JSON'u ile derin ve byte/hash olarak karşılaştırır. Projection optimizasyonundan sonra hiçbir alan, numeric değer, JSON sırası, revision, kullanıcı kapsamı veya yanıt boyutu değişmedi. Gzip kazanımı önceki paketteydi; bu pakette aktarım byte miktarı azaltılmadı. Decode/parse HTTP süresinden ayrı tutulur ve ham raporda vardır. Tam read sayısı her örnekte bir; SQL ve iş kuralı doğrulaması atlanmadı.

Tekrar üretme:

```sh
node scripts/benchmark-load.mjs --samples=7 --size=100000 --resources=400 --actuals=48000 --percentages=48000 --calendar-days=2000 --roles=admin,manager,normal --output=/tmp/benzersiz-scope.json
```

Önceki davranış için `9b0579c` checkout'una son benchmark-load betiğini alın. Son betikte rol bazlı ölçüm ve access/model/records kaynak hash'leri eklendi; eski tek admin komutunun varsayılan profili korunur. .env veya mevcut DB/provider yolu kabul edilmez; yalnız sentetik os.tmpdir SQL.js dosyaları oluşturulur ve silinir. Ham raporlar `/tmp/aa-scope-{before,after}-20261002.json`; /tmp kalıcı arşiv değildir. Kaynak SHA-256 değerleri bu dosyalarda bulunur.

Gerçek tarayıcı, WAN, native MSSQL, peak memory/RSS/GC, eşzamanlı kapasite ve istatistiksel üretim p95 ölçülmedi. Yedi örnek hız garantisi sağlamaz. Shared fonksiyonlar kayıt yanıtlarında/ön yüz fallback toplamlarında da kullanılır; onlar için bu ilk yükleme oranları varsayılmaz. Sonraki maliyet SQL'deki tam okunan satırlar; kullanıcı kapsamına göre SQL daraltma bu pakette yapılmadı.


## İlk yüklemede planlanan SQL satırlarını daraltma — 2 Ekim 2026

Başlangıç `fbfbd69`; Node v24.21.0. Aynı sentetik profil: 100.000 planlanan, 48.000 gerçekleşen ve 48.000 yüzde kaydı / 400 çalışan / 2.000 izin / 49 proje. Yönetici ilk atanmış liderlikte; normal aynı liderlikteki bench-r0'a bağlı. Admin, manager, normal sırayla; her rol/encoding için bir ısınma + yedi ölçüm, identity/gzip sırası dönüşümlü. Önce/sonra ayrı süreçlerde sırayla, test/build eşzamanlı olmadan çalıştı. Zamanlar UTC: 2026-10-02T07:41:41.384Z / 2026-10-02T07:49:47.816Z.

Salt okunur Store.view, güncel hesabı aynı transaction'da tekrar doğrular; yüklenen takım/liderlik metadata'sından mevcut görünürlük kuralıyla planlanan SQL filtresini üretir. Admin ve kayıt/validasyon işlemleri tam model okumaya devam eder. Gerçekleşen/saat/yüzde/revision/takvim metadata kapsamları bu pakette daraltılmadı; anonim tarihsel takım toplamları diğer çalışanların gerçekleşenlerini de gerektirir. İlk yüklemenin readMs sütunu artık rolün SQL okuması ve küçük kapsam hazırlığıdır; her zaman tam model okuması anlamına gelmez.

| Rol / encoding | Planlanan SQL satırları önce/sonra | SQL okuma önce/sonra (ms) | Projection önce/sonra (ms) | Store.view önce/sonra (ms) | HTTP önce/sonra (ms) |
| --- | ---: | ---: | ---: | ---: | ---: |
| admin / identity | 100000 / 100000 | 348.73 / 340.38 | 0.14 / 0.14 | 348.94 / 340.58 | 459.76 / 451.16 |
| admin / gzip | 100000 / 100000 | 349.36 / 339.02 | 0.15 / 0.14 | 349.59 / 339.23 | 460.54 / 451.55 |
| manager / identity | 100000 / 18602 | 351.76 / 276.82 | 179.08 / 145.69 | 531.21 / 421.42 | 551.99 / 442.92 |
| manager / gzip | 100000 / 18602 | 401.77 / 277.10 | 184.51 / 149.33 | 587.33 / 426.13 | 614.58 / 456.82 |
| normal / identity | 100000 / 18602 | 351.05 / 276.85 | 131.58 / 96.36 | 482.71 / 372.56 | 489.88 / 379.58 |
| normal / gzip | 100000 / 18602 | 351.35 / 274.21 | 132.90 / 97.91 | 483.85 / 372.20 | 499.36 / 380.50 |

Yönetici/normal profillerinde **planlanan** SQL satırları %81,4 azalıyor; bu oran bütün SQL tablolarına ait değildir. Gzip isteyen yönetici SQL medyanı 401,77 → 277,10 ms, normal 351,35 → 274,21 ms. Yönetici önceki identity/gzip SQL değerleri birbirinden farklıydı; süreç/GC/sistem değişkenliği bu deneyde ayrıştırılmadı. Admin'e daraltma uygulanmadığı için küçük süre farkı iyileştirme iddiası sayılmaz. Scope projection da daha küçük planlanan haritasıyla çalışır; oradaki fark yalnız SQL işlem süresi değildir. Ayrı medyan sütunları birebir toplanmaz. Yedi örnek tarayıcı/WAN/üretim kapasitesi veya p95 garantisi sağlamaz.

Betik SQL.js raw SELECT sonuçlarında tablo başına dönen satır sayılarını ayrıca kaydeder. Bu metrik SQL motorunun taradığı tüm satır sayısı, fiziksel I/O, index planı ya da RSS ölçümü değildir. Planlanan 18.602 satır, bu sentetik kullanıcıların seçili liderliğine aittir; gerçek kullanıcı/team kapsamına göre değişir. Gerçekleşen 48.000, yüzde 48.000 ve revision 148.000 satır hâlâ okunuyor. Sorgu sayısı ve Store.read çağrı sayısı değişmedi; ilk yükleme başına bir model okuma var. Sonraki SQL önceliği özellikle revision okumalarının kapsamı.

İlk denemede SQLite IN sorgusu takım index sırasını kullanınca JSON kayıt sırası ve gzip boyutu değişti. Son sorgu filtrelenmiş SQLite sonuçlarını mevcut tablo satır sırasına döndürüyor (ORDER BY rowid); eski JSON ve downstream toplama sırası korunuyor. İlk denemenin süre/byte değerleri son tabloya kullanılmadı. Son koşuda **altı rol/encoding profilinin tamamının snapshot SHA-256 ve wire byte sayıları önceki sürümle aynı**: admin 12.580.866 / 983.727; manager 2.339.452 / 184.034; normal 586.380 / 48.421 (identity/gzip). SQL motorunun sıralama maliyeti son ölçüme dahildir.

Her rolün beklenen modeli ayrıca kapsam daraltması almayan bağımsız Store.read + projectView referansıyla derin karşılaştırılır. Her HTTP örneği beklenen JSON'un byte/hash'iyle denetlenir. Model/generation/revision/mahremiyet/anonim toplam korunur. Bu veri setinde yeni risk kayıtları yoktur; risk ve diğer özel revision davranışları mevcut regresyon testlerinde korunur. MSSQL sorgusu sabit whitelist kolonlar ve bağlı @p parametreleri kullanır; native sunucuda hız/sorgu planı/JSON sırası doğrulanmadı. 900'den fazla görünür takımda tüm okuma + nihai scope fallback'i uygulanır; hiçbir takım listesi kesilmez. Legacy takım kimliğinde birleşik anahtar ayıracı varsa da tam okuma korunur.

Tekrar üretme:

```sh
node scripts/benchmark-load.mjs --samples=7 --size=100000 --resources=400 --actuals=48000 --percentages=48000 --calendar-days=2000 --roles=admin,manager,normal --output=/tmp/benzersiz-planning-read.json
```

Önceki davranış için `fbfbd69` checkout'una bu paketin benchmark-load betiğini alın. Profil/döngü aynı; betik SQL satır sayacı ve bağımsız tam okuma referansını ekler. Betik .env yüklemez, mevcut DB/provider yolu kabul etmez; yalnız os.tmpdir içinde sentetik SQL.js dosyası üretip siler. Ham raporlar `/tmp/aa-sql-scope-before-20261002.json` ve `/tmp/aa-sql-scope-after-v2-20261002.json`; /tmp kalıcı arşiv değildir. Kaynak hash'leri raporlarda bulunur. Native MSSQL, gerçek tarayıcı, WAN, peak memory/GC ve eşzamanlı kapasite test edilmedi.

## İlk yüklemede planlanan revision satırlarını daraltma — 2 Ekim 2026

Başlangıç `987ce76`; Node v24.21.0; şema 28. Önce/sonra aynı sentetik SQL.js profili: 100.000 planlanan, 48.000 gerçekleşen ve 48.000 yüzde kaydı; 400 çalışan, 2.000 izin, 49 proje. Her rol/encoding için bir ısınma ve yedi ölçüm; identity/gzip sırası dönüşümlü. İki süreç sırayla, test/build ile eşzamanlı olmadan çalıştı. Ölçüm zamanları UTC: `2026-10-02T11:01:40.189Z` / `2026-10-02T11:06:15.993Z`.

| Rol / encoding | Revision SQL satırları önce/sonra | SQL okuma önce/sonra (ms) | Store.view önce/sonra (ms) | Yerel HTTP önce/sonra (ms) |
| --- | ---: | ---: | ---: | ---: |
| admin / identity | 148000 / 148000 | 337.96 / 338.83 | 338.17 / 339.03 | 448.83 / 449.35 |
| admin / gzip | 148000 / 148000 | 337.69 / 338.77 | 337.89 / 339.00 | 451.38 / 451.78 |
| manager / identity | 148000 / 66602 | 313.05 / 222.66 | 464.59 / 347.84 | 492.19 / 368.08 |
| manager / gzip | 148000 / 66602 | 346.43 / 221.86 | 515.94 / 346.32 | 542.71 / 371.56 |
| normal / identity | 148000 / 48000 | 298.63 / 181.13 | 398.96 / 268.41 | 405.98 / 275.18 |
| normal / gzip | 148000 / 48000 | 276.95 / 181.26 | 391.20 / 267.97 | 402.36 / 275.84 |

Yönetici için dönen revision satırları yaklaşık %55,0, normal kullanıcı için %67,6 azalıyor. Bunlar SQL motorunun taradığı satırlar veya bütün veri tablolarına ait oranlar değildir. SQL ifadesi birleşik anahtarın ilk parçasını karşılaştırır; yeni index veya fiziksel I/O kazancı iddiası yoktur. Bu sentetik profilde özel revision satırları hâlâ 48.000 olarak tam okunur. Admin'e daraltma uygulanmaz; küçük süre farkı iyileştirme sayılmaz.

Gzip profillerinde yerel HTTP medyanı yönetici için 542,71 → 371,56 ms, normal için 402,36 → 275,84 ms oldu. Yedi örnek, yerel SQL.js/HTTP ölçümü; native MSSQL, WAN, tarayıcı çizimi, p95, peak memory/GC ve eşzamanlı kullanıcı kapasitesi ölçülmedi. Başlangıç yönetici identity/gzip süreleri farklı; süreç/GC/sistem etkileri ayrıştırılmadı. Gözlenen süre bütün uygulama için hız garantisi değildir.

Altı rol/encoding profilinin **snapshot SHA-256, JSON byte içeriği, yanıt boyutu ve Store.read sayısı aynı**. Admin 12.580.866 / 983.727; yönetici 2.339.452 / 184.034; normal 586.380 / 48.421 identity/gzip bayt. Her örnek ayrıca kapsam daraltması uygulanmayan Store.read + projectView referansıyla karşılaştırılır. SQL.js için filtreli revision sonuçlarında ORDER BY rowid önceki anahtar sırasını korur. MSSQL'in önceki sorgusu da sırasızdı; native sunucuda JSON sıra garantisi veya hız sonucu iddia edilmez.

Yalnız authenticated, salt okunur Store.view yolunda planlanan sürüm satırları daraltılır. Yönetici için güncel visibleTeamScope kullanılır; normal kullanıcı planlanan revision almadığı için bu satırlar hiç okunmaz. `@` ile başlayan tüm özel namespace'ler, risk silme sürümleri, gerçekleşen/saat/kişisel takvim/ortak takvim kayıtları ve ordinary metadata tam kalır. Nihai scopeData aynı tarihsel mahremiyet denetimini yapar. Admin ve mutate/restore/migration/default Store.read tam model/sürüm haritası okur. 900'den fazla takım veya legacy ayıraçlı kimlikte tam okuma fallback'i vardır; listeler kesilmez.

Tekrar üretme:

```sh
node scripts/benchmark-load.mjs --samples=7 --size=100000 --resources=400 --actuals=48000 --percentages=48000 --calendar-days=2000 --roles=admin,manager,normal --output=/tmp/benzersiz-revision-read.json
```

Önceki davranış `987ce76` sürümüyle aynı betik/profil kullanılarak ölçülebilir. Betik .env yüklemez ve gerçek DB/provider yolu kabul etmez; yalnız geçici sentetik SQL.js dosyaları oluşturup siler. Ham raporlar `/tmp/aa-revision-read-before-20261002.json` ve `/tmp/aa-revision-read-after-20261002.json`; kaynak hash'leri raporlarda yer alır. /tmp kalıcı arşiv değildir. Sonraki ana inceleme toplu yönetim/import/restore işlemleridir; ilk yüklemenin kalan actual/saat/yüzde/özel revision maliyetleri ayrıca açık tutulur.

## Toplu dağılım sıfırlama ve yanıt maliyeti — 2 Ekim 2026

Başlangıç `52795e8`; Node v24.21.0, şema 28. `scripts/benchmark-reset.mjs` yeni sentetik ölçüm betiği: .env yüklemez, gerçek DB/provider yolu kabul etmez; geçici SQL.js dosyalarını temizler. Her örnek aynı seed DB byte'larından açılır; bir ısınma + beş ölçüm. 10.000 planlanan, 1.000 gerçekleşen, 1.000 yüzde kaydı; 80 çalışan, 20 kişisel gün. Önce separate (mutate ardından view), sonra committed (returnView). İki süreç sırayla, test/build eşzamanlı olmadan çalıştı. Zamanlar UTC: `2026-10-02T11:19:29.071Z` / `2026-10-02T11:27:21.151Z`.

| Metrik | Önce | Sonra |
| --- | ---: | ---: |
| Tam model okuma sayısı | 2 | 1 |
| Store transaction sayısı | 2 | 1 |
| SQL SELECT'in döndürdüğü satırlar | 36.457 | 23.229 |
| SQL/model okuma medyanı (ms) | 37,51 | 21,29 |
| Reset + snapshot + disk commit medyanı (ms) | 563,98 | 544,42 |
| JSON yanıt baytı | 505.662 | 505.662 |

Son JSON modelinin canonical SHA-256 değeri aynı. Her örnek güncel SQL view ile derin karşılaştırılır; generation +1, her allocation revision +1, planlanan haritanın boşluğu, actual haritasının korunması ve 10.000 audit olayı doğrulanır. Rastgele audit ID/timestamp nedeniyle fiziksel DB byte eşitliği iddia edilmez. Refill/restore maliyeti ölçüme gizlenmez; örnekler aynı seed dosyasından başlar.

Okuma süresi bu koşuda azalırken toplam pipeline yaklaşık %3,5 azalıyor; bulk silme/yazma/audit maliyeti baskındır. Beş örnek üretim p95/hız garantisi değildir. HTTP/ağ/tarayıcı çizimi, peak memory/GC, native MSSQL ve eşzamanlı kapasite ölçülmedi. Dönen SELECT satır sayısı SQL motorunun taradığı satır veya fiziksel I/O değildir. Önce/sonra request revision doğrulaması da değişti; bütün fark tek bir fonksiyonun etkisi olarak sunulmaz.

Bu ölçüm yalnız reset profilidir. Import, restore ve liderlik değişimi metadata değiştirdiğinden aynı transaction içinde ikinci model okumasını gerektirebilir. Milestone bulunan değişmemiş metadata da SQL/şema field sırası veya normalizasyon farkında konservatif reread'e düşebilir; gerçek HTTP testi bu davranışı ayrıca doğrular. Diğer kullanıcı yetkisi değişiminde uygun snapshot yeniden kullanılabilir. Beş endpoint'in yanıt/commit bütünlüğü ve disk/projection hatası ayrı HTTP regresyon testlerindedir.

Tekrar üretme:

```sh
node scripts/benchmark-reset.mjs --mode=separate --size=10000 --samples=5 --output=/tmp/benzersiz-reset-before.json
node scripts/benchmark-reset.mjs --mode=committed --size=10000 --samples=5 --output=/tmp/benzersiz-reset-after.json
```

İlk rapor `52795e8` davranışı ve yeni betikle, ikinci rapor bu paketin returnView yoluyla alınmıştır. Betiğin biçimlendirilmesi profil/döngüyü değiştirmez; kaynak hash'leri raporlarda bulunur. Ham raporlar `/tmp/aa-bulk-reset-before-20261002.json` ve `/tmp/aa-bulk-reset-after-20261002.json`; /tmp kalıcı arşiv değildir. Toplu import/restore iş kuralı maliyetinin ve MSSQL global kilidinin ayrıca ölçülmesi hâlâ gereklidir.

## 31. adım — native MSSQL ölçüm paketi hazır, sonuç bekleniyor

2 Ekim 2026. Ayrı MSSQL bağlantısı/engine bulunmadığından **bu bölümde ölçülmüş native süre, satır azaltma oranı veya üretim kapasitesi sonucu yoktur**. Önceki SQL.js sayıları MSSQL sonucu olarak kullanılmaz.

`npm run test:db` artık uygulama `.env` dosyasından bağımsız `TEST_DB_*` bağlantısı kullanır. Boş veritabanı/dbo/yetki/compatibility kontrolü, ayrı test lease'i ve kontrollü temizliğin ardından native senaryolar ve sentetik profil çalışır. [Komutlar ve kapsam](MSSQL-TEST-KILAVUZU.md) kılavuzda yer alır.

Profil: 24–100.000 planlanan kayıt, 80 çalışan, 200 gerçekleşen/yüzde kaydı, 20 kişisel gün; bir ısınma ve 1–10 örnek. Admin/yönetici/normal snapshot bağımsız tam SQL okuma referansıyla karşılaştırılır. Rol başına Store.view medyanı/en uzun örneği, allocation/revision query'lerinden dönen satır sayısı ve JSON baytı raporlanır. İki bağımsız havuzdaki 24 yazmanın toplam süresi ve kendi commit/generation/revision görüntüsü kontrol edilir. Profil öncesinde test şeması yenilenerek önceki suite verisi ve audit'i temizlenir.

Rapor bütün testler ve temizlik başarılı olduktan sonra, mevcut dosyanın üzerine yazmadan oluşturulur. Node/SQL Server/şema/compatibility bilgisi, Store/adapter/domain/test/fixture kaynakları ve bütün MSSQL migration SQL hash'leri bulunur. Şifre, hesap veya kullanıcı verisi rapora yazılmaz.

Global veri kilidi korunur. Bu ölçüm Store/SQL zinciridir; HTTP/WAN/tarayıcı çizimi, fiziksel SQL IO/sorgu planı, istatistiksel üretim p95, bellek/GC veya kurum kapasitesi sonucu vermez. Mevcut ilk yükleme ve bulk iş kurallarının kalan maliyetleri hâlâ açıktır. Elle başlatılabilir GitHub workflow'u hazırdır; native koşu sonucu henüz doğrulanmamıştır.
