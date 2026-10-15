# M6 — Native MSSQL ve aynı commit için CI kabulü

13–14 Ekim 2026. Başlangıç kaynak commit'i: `ee4ebbd3d014454fadf7dbfaba40892028fea1f0`. M1–M5 düzeltmeleri bu incelemede çalışma ağacındaydı; M6 bunların bütünleşik güncel kaynağını doğrular.

## Yönetici özeti

**Güncel kaynak için native MSSQL ve Windows/kalite kabul kanıtı tamamlandı.** Test edilen kod: `01935066146382be29a615452e45d9bd831d9a6f`. Gerçekleşen dağılımda belirsiz kayıt/yenileme sırasında yerel taslağı kaybettiren sorun düzeltildi. Eski test beklentileri güncel gizlilik, hiyerarşi, AD ve rol arayüzüne uyarlandı; kayıt/revision/doğru sonuç koşulları korundu.

Native kontrol artık her kod push/PR akışına bağlıdır. Kullanıcı tercihiyle GitHub dal koruması kurulmadı; kabul işinin başarılı olması tek başına manuel yayını engellemez. Kurum ortamı kabulü ayrıca gereklidir.

## Bulgu ve doğrulanan fark

13 Ekim mimari/güvenlik incelemesindeki **M6 (Orta — kabul eksikliği)**, önceki N4/Y5 kabul alanıyla ilişkilidir. Depodaki önceki native arşiv şema 32 için; güncel katalog 35. GitHub API sorgusunda 12 Ekim tarihli başarılı native koşu da bulundu (`38196324153`, kaynak `5fcad2730f767c40a01fd4d5c02cc1b165e83eeb`); bu, bugünkü M1–M5 değişikliklerini kapsamaz. Eski başarılı koşu güncel kaynak kabulü olarak kullanılmadı.

## Yapılan değişiklikler

- `Quality checks` her push/PR için native reusable workflow'u çağırır. `Release acceptance`, Ubuntu kalite, Windows ve native işlerin aynı commit'te başarılı olmasını gerektirir; atlanan/iptal edilen/başarısız iş kabulü geçiremez.
- Native artifact; commit, katalog şeması, kilit dosyasına karşı kurulu MSSQL/Tedious sürümleri, uygulama/test/workflow SHA-256 envanteri, güncel beş kabul kontrolü ve DB temizliği açısından doğrulanır. Yanlış/eski/eksik kanıt başarısız olur. Artifact süresi 7 → 90 gün.
- Native suite'e güncel şema/hiyerarşi ve Leader/Product Owner çatışmalarının atomik reddi; kişisel gün/aylık toplam ayrımı; dar raporların tam snapshot ile eşitliği; iki bağımsız havuzda sentetik AD oturum iptali ve geçici kesinti; SQL Server tarafından bildirilen bağlantı şifrelemesi eklendi.
- Dondurulmuş eski validator değiştirilmedi. Eski şema karşılaştırması açıkça legacy projeksiyonla sınırlı; güncel model ayrıca tam doğrulanır. Leader/PO verisi sessizce eski oracle'a sokulamaz.
- Windows açık test listesine M3, M5 ve M6 regresyonları eklendi. Yerel SQL.js karşılığı TLS/native havuz kontrolünü doğrulamış sayılmaz.

## Yerel kontroller

Kaynak dosyaları geçici dizine kopyalandı; gerçek `.env`, DB, kullanıcı/AD ve çalışan servis kullanılmadı. Mevcut bağımlılıklar yalnız okundu.

| Komut | Sonuç |
|---|---|
| `npm run verify` (ilk M6 kaynak kopyası) | **811/811**; fail/skipped 0; biçim, domain, TypeScript ve build başarılı |
| `node --test tests/native-evidence.test.mjs tests/native-release.test.mjs` (kaynak kopyası) | **9/9**; fail/skipped 0 |
| `node --test tests/native-release.test.mjs` (legacy projeksiyon ek kontrolünden sonra) | **6/6**; fail/skipped 0 |
| `git diff --check` | Başarılı |

## Güncel uzak kabul durumu

**Başarılı — 14 Ekim 2026.** [Aynı commit için bütünleşik koşu 38536198380](https://github.com/zaferond/AA-Kaynak-Planlama-Sistemi/actions/runs/38536198380).

| Kontrol | Sonuç |
|---|---|
| Ubuntu `npm run verify` | **811/811**; fail/skipped/cancelled 0; biçim, domain, TypeScript/build başarılı |
| Windows sentetik paket | **405/405**; fail/skipped/cancelled 0; Windows başlatıcısı ve paket kabulü dahil |
| Native SQL Server | **40/40**; şema **35**, iki bağımsız havuz, MSSQL **12.7.2** / Tedious **20.3.8**, şifreli bağlantı ve temizlik doğrulandı |
| Chromium | **233 kontrol grubu**; 173 ortak ana fixture + 60 diğer/izole grup; normal gizli Risk derlemesi ve geçici açık Risk derlemesi dahil; paket başarılı |
| Kalite/dağıtım | Manifest, iki işletim sisteminde temiz paket kabulü, backend/frontend audit **0**; `Release acceptance` başarılı |

[Koşu/job/test toplamları ve log hash kaydı](ci-evidence/m6-release-0193506-receipt.json), [native sonuç JSON’u](ci-evidence/native-mssql-0193506.json), [CI içindeki dosya doğrulama sonucu](ci-evidence/native-mssql-0193506-verification.json). Native JSON SHA-256: `a4793edf7a815602e902f5a9758e1ef321084f76ffd995e2e70f985ec7c55c33`.

**600 kaynak girdisi** hem test edilen Git commit’iyle (Windows başlatıcısının CRLF checkout kuralı dahil), hem güncel çalışma dosyalarıyla karşılaştırıldı. JSON baytları artifact’ten aynen korundu; ZIP digest’i farklı girdiye aittir. Yerel ek doğrulama yalnız dosya/Git okur, DB veya `.env` açmaz. Windows ve Ubuntu testleri örtüşür; sayıları benzersiz test gibi toplanmaz. Tarayıcı grup sayısı, tek tek assert veya bütün işlevlerin kapsandığı iddiası değildir.

Kanıt/dokümantasyon commit’i, bu test edilen 600 kod/test/workflow girdisini değiştirmez. O commit yeni bir native koşunun başarı iddiası değildir; kanıtın kaynak SHA’sı açıkça yukarıdadır.

GitHub API ile `main` dalında branch protection bulunmadığı ve ruleset listesinin boş olduğu doğrulandı. Kullanıcı, 13 Ekim tarihinde **“Şimdilik CI kontrolü olarak kalsın”** dedi. Bu nedenle dal koruması değiştirilmedi. CI başarısızlığı yayın kabulünü kırar; main’e birleştirmeyi veya manuel dağıtımı teknik olarak engelleyen bir kural kurulduğu iddia edilmez. Kurumun yayın prosedürü bu kontrolü aramalıdır.

## Koşularda bulunan ve giderilen sorunlar

`96dd246` / [38445509483](https://github.com/zaferond/AA-Kaynak-Planlama-Sistemi/actions/runs/38445509483): Ubuntu 811/811, Windows 405/405, native 40/40 geçti; tam tarayıcı adımı gizli Risk sekmesini açmaya çalışarak başarısız oldu. `Release acceptance` de beklendiği gibi başarısız oldu. [İlk koşu kaydı](ci-evidence/m6-release-96dd246-receipt.json) ve native artifact korunur; bu koşuya tam kabul başarısı denmez.

`cb4924e` düzeltmesi yalnız CI komutunu mevcut `run-browser-checks-isolated.mjs` girişine yönlendirir. Normal derlemede Risk sekmesinin gizli kaldığını ayrı test eder; sonra yalnız geçici kaynak kopyasında `AA_RISK_UI_ENABLED=true` ile derleyip tam suite’i çalıştırır. Uygulama davranışı veya risk sekmesinin canlı görünürlüğü değiştirilmedi.

`cb4924e` / [38446106415](https://github.com/zaferond/AA-Kaynak-Planlama-Sistemi/actions/runs/38446106415): Ubuntu 811/811, Windows 405/405, native 40/40 geçti; bu kez tam tarayıcı akışı gerçek bir taslak kaybı yakaladı. Belirsiz gerçekleşen kaydın sunucuyla kontrolünde `useActualView` yeni snapshot beklerken çalışanları boşaltıyor, hücreleri kaldırıp yeniden oluşturuyordu. `%25` taslağı sunucudaki `%40` ile değişiyordu. [İkinci koşu kaydı](ci-evidence/m6-release-cb4924e-receipt.json) tam kabul başarısı değildir.

`6d9ea7b` düzeltmesi aynı dönem/kullanıcı/yetki kapsamındaki yenilemede son scoped görünümü tutar ve yeni veri/hata sırasında girişleri kapatır. Dönem veya yetki kapsamı değişince eski görünüm kullanılmaz; iptal edilmiş eski yanıt ve oturum korumaları korunur. Draft hücresi aynı DOM öğesi olarak tutulduğu için başlangıç revision'ı ve yerel metin kaybolmaz. Değişen veriyle retry hâlâ 409 üretir. Mevcut tarayıcı testi; geciktirilen scoped yanıt boyunca aynı hücrenin/metnin kalmasını ve geçici salt okunur durumu da doğrulayacak şekilde güçlendirildi. TypeScript ve yalnız sentetik geçici derlemedeki **8/8** transport/actual-team tarayıcı kontrolü başarılı; sayfa hatası 0.

`6d9ea7b` / [38447278448](https://github.com/zaferond/AA-Kaynak-Planlama-Sistemi/actions/runs/38447278448): taslak koruma ve oturum değişimi kontrolleri geçti; sonraki proje düzenleme testi 409 HTTP yanıtından hemen sonra, UI kayıt kilidi kalkmadan Escape göndererek takıldı. Uygulamanın kaydetme sırasında kapanışı engellemesi korundu. Test artık `Kaydet` düğmesinin yeniden kullanılabilir hale gelmesini bekliyor; revision, 409, yerel taslak ve uzak veri assert’leri değiştirilmedi. [Üçüncü koşu kaydı](ci-evidence/m6-release-6d9ea7b-receipt.json) tam kabul başarısı değildir. Düzeltme sonrası izole proje düzenleme **4/4** kontrolü geçti.

`30ddb88` ile hatalı scoped okumanın ardından “Tekrar Dene” sırasında seçili çalışma saati hücresinin korunması da sağlandı. 503 → retry → eski revision ile 409 senaryosu, kayıtlı saat ve yerel taslağın ayrı kalmasını doğrular. Aynı commit’in [38449725864](https://github.com/zaferond/AA-Kaynak-Planlama-Sistemi/actions/runs/38449725864) koşusunda 811/811, 405/405 ve 40/40 geçmesine rağmen sabit takım başlığının anlık boyama assert’i başarısızdı. [Kayıt](ci-evidence/m6-release-30ddb88-receipt.json). Kalıcı çizim kusuru ayrı sentetik testte yeniden üretilemedi; konum ve üstte boyanma koşulları artık aynı bekleme içinde aranır, süre sınırı veya koşullar gevşetilmez.

Yerel tam pakette eski hiyerarşi beklentisi de yenilendi: alt liderlik raporda derinlik 1 ile, kök liderlik derinlik 0 ile görünür; ara toplam genel toplama tekrar eklenmez. Sentetik 1 kaynak / 0,5 tahsiste kök, alt liderlik ve genel toplam ayrı ayrı 0,5 olmalıdır. M1 öncesi takvim testi yerine yöneticinin günlük takvim düğmesini/verisini/revision’larını alamadığı ve aylık özetlerin korunduğu kontrol edilir; uygulamanın gizlilik politikası genişletilmez.

`355d897` / [38450181919](https://github.com/zaferond/AA-Kaynak-Planlama-Sistemi/actions/runs/38450181919), 811/811, 405/405, 40/40 ve 190 tarayıcı kontrol grubundan sonra eski yetki formu beklentisinde durdu. [Kayıt](ci-evidence/m6-release-355d897-receipt.json). `95fc6bc`, Normal Kullanıcı için liderlik seçiminin gizli olduğunu, Yönetici seçilince göründüğünü ve AD hesabının çalışan adını dizinden aldığını test eder. Güncel yetki davranışı değiştirilmedi. Ayrı son bölümler koşusunda dışa aktarma, restore, yetki/AD, proje/bar ve üye listesi kontrolleri geçti; Mac kaydırma denemesi tek kez takıldı. Ayrı taze fixture’da aynı kaydırma ve freeze akışlarının **11/11** kontrol grubu geçti; bu tek yerel durmanın kesin kök nedeni doğrulanmadı. Yeni CI bütünleşik sonucu güncel kabul kaydında esas alınır.

`95fc6bc` / [38534624925](https://github.com/zaferond/AA-Kaynak-Planlama-Sistemi/actions/runs/38534624925), 811/811, 405/405 ve 40/40 geçti; 177 tarayıcı kontrol grubundan sonra kişisel takvimde kayıt sonrası aylık saat metninin erken okunmasında durdu. [Kayıt](ci-evidence/m6-release-95fc6bc-receipt.json). Güncel gerçekleşen görünüm ayrı scoped GET ile yenilendiği için formun kaydetme kilidinin kalkması, aylık metnin de yenilendiği anlamına gelmez. `0193506`, aynı **171,5 / 180,5 saat** ve **%51,11** sonuçlarını mevcut 10 saniyelik sınırda bekler; beklenen değerler, DB/doğrulama assert’leri ve süre sınırı değiştirilmedi. Ayrı taze fixture’da takvim **9/9** kontrol grubu geçti.

## Çalıştırma kopyasının kaynak eşitliği

14 Ekim’de çalışma alanının dış çalıştırma klasörü ile Git kaynak klasörü ayrıca karşılaştırıldı. Uygulama/derleme/workflow dosyaları eşitti; yalnız testlerde **3 eksik, 11 eski ve 9 yinelenen kopya** bulundu. Eski içerikler `output/m6-test-copy-before-sync-2026-10-14-bdb55ab0/` altında SHA-256’lı yerel kayıtla korundu; 14 canonical test dosyası eşitlendi ve 9 yinelenen dosya etkin test envanterinden bu arşive taşındı. Hiçbir çalışan DB veya yapılandırma dosyası bu işleme dahil edilmedi.

Ardından `verify-native-evidence.mjs`, hem Git klasöründe hem dış çalıştırma klasöründe aynı **600 kaynak girdisi** için başarılı oldu. İki kopyanın derleme/manifest kontrolleri de doğrulandı. Yerel eski-test arşivi Git’e eklenmez; devredilecek kaynak Git’teki doğrulanmış dosyalardır. README’deki önceden var olan belge farkı, bu kod/test envanterinin dışındadır ve üzerine yazılmadı.

## Kapsam sınırları

Geçici SQL Server 2022 Developer, SQL kimlik doğrulaması ve şifreli/self-signed test bağlantısı; sentetik LDAP adapter'ı ve sentetik veri. Kurum CA/hostname, gerçek AD/NTLM, en az yetkili kurum SQL hesabı, Windows servis/ACL, proxy, kurumsal backup/restore, atomik dağıtım ve gerçek yük/SLA kabulü bu koşularla doğrulanmaz. Hash eşitliği tüm işlevlerin native test edildiği anlamına gelmez. Üretim/çalışan DB'sine yazılmadı.
