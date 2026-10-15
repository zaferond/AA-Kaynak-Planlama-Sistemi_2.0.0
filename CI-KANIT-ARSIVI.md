# CI kanıt arşivi

## 14 Ekim 2026 — M1–M6 aynı kaynak için native/Windows kabulü

Test edilen kod **`01935066146382be29a615452e45d9bd831d9a6f`**. [M6 raporu](M6-NATIVE-CI-YAYIN-KABULU-2026-10-13.md).

| Kayıt | Sonuç | Koşu |
|---|---|---|
| Bütünleşik kalite ve kabul | **Başarılı:** Ubuntu 811/811, Windows 405/405, Chromium 233 kontrol grubu; biçim/domain/TypeScript/build/manifest/paket ve iki audit 0; `Release acceptance` başarılı | [38536198380](https://github.com/zaferond/AA-Kaynak-Planlama-Sistemi/actions/runs/38536198380) |
| Native MSSQL (aynı koşu/commit) | **40/40**, şema **35**, SQL Server 2022 Developer; MSSQL 12.7.2 / Tedious 20.3.8; iki havuz, güncel beş kabul kontrolü ve temizlik doğrulandı | [Koşu kaydı](ci-evidence/m6-release-0193506-receipt.json) |

[Native JSON](ci-evidence/native-mssql-0193506.json), [otomatik doğrulama](ci-evidence/native-mssql-0193506-verification.json). JSON SHA-256: `a4793edf7a815602e902f5a9758e1ef321084f76ffd995e2e70f985ec7c55c33`. **600** uygulama/derleme/test/workflow girdisi test edilen Git commit’iyle eşit; aynı dosyalar güncel kaynakla da doğrulandı. Hash eşitliği tüm işlevlerin native testi değildir. Ham loglar arşivlenmez; metadata ve hash’ler korunur. Artifact süresi 90 gün; seçilen JSON burada ayrıca tutulur.

Önceki altı başarısız bütünleşik koşu ayrı `m6-release-*-receipt.json` kayıtlarında saklanır; native/ünit başarıları tam yayın kabulü diye sunulmaz. Taslak kaybı ve test uyumsuzlukları M6 raporunda açıklanır. Kullanıcı kararıyla kabul kontrolü **yalnız CI’da** kalır; GitHub dal koruması/manuel yayın engeli kurulmadı. Kurum AD/NTLM/CA/proxy/servis/yedek/gerçek yük kabulü açık; N3 tam yazma snapshot/kilit maliyeti de sürer. Sonraki kanıt/dokümantasyon commit’i kodu değiştirmez ve yeni bir CI başarısı iddiası değildir.

## 9 Ekim 2026 — N3 mutasyon aşamaları ve takvim JSON eşitliği

Test edilen kaynak **`a5661f8d63cac67a5fd3ad0507eb4de9967d1a0b`**. [Aşama ölçümleri, transaction'a ait JSON eşitliği ve 38 yerel test](MIMARI-MUTASYON-ASAMALARI-2026-10-09.md).

| Kayıt | Sonuç | Koşu |
|---|---|---|
| Kalite | **Başarılı:** Ubuntu 613/613, Windows 263/263, Chromium 145; biçim/domain/TypeScript/build/manifest, iki işletim sisteminde temiz paket kabulü ve iki audit Yüksek eşiği | [37924961901](https://github.com/zaferond/AA-Kaynak-Planlama-Sistemi/actions/runs/37924961901) |

[Metadata, test toplamları ve log hash kaydı](ci-evidence/quality-a5661f8-receipt.json). Fail/skipped/cancelled 0; Windows ve genel süit örtüşür. Yeni 5 helper testi, 121 settings before/valid kombinasyonu, 4 yerine 2 takvim kodlaması, raw default normalizasyonu, bilinmeyen metadata ve SQL parametre eşdeğerliğini doğrular. Yeni planning testi validation/settings/response aşamalarında ayrı hata ile disk/veri/audit/generation rollback ve restart'ı sınar. Owned komut marker'ı ve tam son doğrulama korunur.

[İki veri boyutunda 7 örnekli önce/sonra karşılaştırması ve model digest eşitliği](ci-evidence/mutation-stages-2026-10-09.json): 10.000 takvim kaydında yanıt hazırlama medyanı 9,94 → 5,19 ms; ardışık yerel koşu, üretim SLA/kapasite veya doğrulama hızlanması iddiası değildir. N3 tam snapshot/validation/global kilit **kısmen giderildi** olarak kalır. N2 Orta bağımlılık, N6 canlı geçiş/eski varlık saklama ve kurum servis/CA/proxy/yedek/yük kabulü sürer. Bu kaynak için native koşu çalıştırılmadı. Ham loglar Git'e eklenmez. Sonraki kanıt/dokümantasyon commit'i ayrı tam CI başarısı iddiası değildir.

## 9 Ekim 2026 — N3 komut performansı ölçüm doğrulaması

Test edilen kaynak **`7c46c23bee294a410ee885c7a51d5f9ae9dc6c64`**. [Gerçek owned komut sınırı, karşılaştırmalı ölçümler ve 37 yerel test](MIMARI-KOMUT-PERFORMANS-OLCUMU-2026-10-09.md).

| Kayıt | Sonuç | Koşu |
|---|---|---|
| Kalite | **Başarılı:** Ubuntu 607/607, Windows 257/257, Chromium 145; biçim/domain/TypeScript/build/manifest, iki işletim sisteminde temiz paket kabulü ve iki audit Yüksek eşiği | [37918831327](https://github.com/zaferond/AA-Kaynak-Planlama-Sistemi/actions/runs/37918831327) |

[Metadata, test toplamları ve log hash kaydı](ci-evidence/quality-7c46c23-receipt.json). Fail/skipped/cancelled 0; Windows ve genel süit örtüşür. Yeni 5 test gerçek geçici SQL.js Store ile production/callback actual/allocation, marker, legacy double validation, forced full copy, sentetik ortam/.env dosyasının DB seçiminden ayrılması ve cleanup davranışlarını doğrular. [Yerel 7 örnekli iki boyut karşılaştırması ve model digest eşitliği](ci-evidence/store-command-2026-10-09.json) yeni uygulama hızlanması veya üretim kapasitesi kanıtı değildir.

Uygulama/backend/shared iş kuralları değiştirilmedi; dar draft zaten mevcut production davranışıdır. N3 tam snapshot/validation/global kilit **kısmen giderildi** olarak kalır. N2 Orta bağımlılık, N6 canlı geçiş/eski varlık saklama ve kurum servis/CA/proxy/yedek/yük kabulü sürer. Bu kaynak için native koşu çalıştırılmadı. Ham loglar Git'e eklenmez. Sonraki kanıt/dokümantasyon commit'i ayrı tam CI başarısı iddiası değildir.

## 9 Ekim 2026 — Arka plan yenileme yaşam döngüsü

Test edilen kod **`20c66088f321905e437c5b50c1f329f7c317709c`**. [Scheduler ayrımı, geciken sürüm yanıtı ve yerel 77 test / 22 tarayıcı kontrolü](MIMARI-ARKA-PLAN-YENILEME-2026-10-09.md).

| Kayıt | Sonuç | Koşu |
|---|---|---|
| Kalite | **Başarılı:** Ubuntu 602/602, Windows 252/252, Chromium 145; biçim/domain/TypeScript/build/manifest, iki işletim sisteminde temiz paket kabulü ve iki audit Yüksek eşiği | [37915006005](https://github.com/zaferond/AA-Kaynak-Planlama-Sistemi/actions/runs/37915006005) |

[Metadata, test toplamları ve log hash kaydı](ci-evidence/quality-20c6608-receipt.json). Fail/skipped/cancelled 0; Windows ile genel süit örtüşür. Yeni scheduler 14 unit test ve 2 browser kontrolüyle sınandı. Eski 5334d79 derlemesinde editordan önce başlayan sürüm kontrolü editor açıkken tam okuma başlattı (1 !== 0); yeni derleme deferred read ile geçti. Yeni kontrol notification burst sırasında paralel snapshot okumayı engelledi; tek takip okuması aradaki değişikliği korudu. Mevcut editor/revision, risk conflict, session/CSRF ve calendar draft kontrolleri korundu.

Native MSSQL bu kaynak için yeniden çalıştırılmadı; önceki native koşu bu commit'in kanıtı değildir. Backend Orta bağımlılık uyarısı, N3 snapshot/global lock, N6 canlı geçiş/eski varlık saklama ve kurum servis/CA/proxy/yedek/yük kabulü devam eder. Ham loglar Git'e eklenmez. Sonraki kanıt/dokümantasyon commit'i üretim kodunu değiştirmez ve yeni tam CI başarısı iddiası değildir.

## 9 Ekim 2026 — Frontend geçiş ve oturum koordinasyonu

Test edilen kod **`8e29bc2093f2310bd6bca694b5d998ece05d9e50`**. [Modül ayrımı, yeniden üretilen yinelenen çıkış hatası ve yerel 63 test / 27 kontrol ve fixture sonrası 13 tarayıcı kontrolü](MIMARI-FRONTEND-GECIS-VE-OTURUM-KOORDINASYONU-2026-10-09.md).

| Kayıt | Sonuç | Koşu |
|---|---|---|
| Kalite | **Başarılı:** Ubuntu 588/588, Windows 238/238, Chromium 143; biçim/domain/TypeScript/build/manifest, iki işletim sisteminde temiz paket kabulü ve iki audit Yüksek eşiği | [37910942963](https://github.com/zaferond/AA-Kaynak-Planlama-Sistemi/actions/runs/37910942963) |

[Metadata, test toplamları ve log hash kaydı](ci-evidence/quality-8e29bc2-receipt.json). Fail/skipped/cancelled 0; Windows ile genel süit örtüşür. Yeni coordinator 14 unit test ve 2 browser kontrolüyle sınandı: taslak beklemesi dahil yinelenen çıkış tek istektir; başarısız çıkış açıkça tekrar denenir; son sekme isteği kazanır; confirm reddi, save hatası ve oturum değişimi taslağı/erişim kapsamını korur. Eski 93c0dca derlemesinde yinelenen çıkış güvenli sentetik browser testi iki istekle başarısız oldu; yeni derleme geçti.

Native MSSQL bu kaynak için yeniden çalıştırılmadı; önceki native koşu bu commit'in kanıtı değildir. Backend Orta bağımlılık uyarısı, N3 snapshot/global lock, N6 canlı geçiş/eski varlık saklama ve kurum servis/CA/proxy/yedek/yük kabulü devam eder. Ham loglar Git'e eklenmez. Sonraki kanıt/dokümantasyon commit'i üretim kodunu değiştirmez ve yeni tam CI başarısı iddiası değildir.

## 9 Ekim 2026 — Toplu veri komutları

Test edilen kod **`056590ed43a214cfad5c50e44ae4354cf85b748c`**. [Modül ayrımı, korunan sözleşmeler ve yerel 61 test / 10 tarayıcı kontrolü](MIMARI-TOPLU-VERI-MODUL-AYRIMI-2026-10-09.md).

| Kayıt | Sonuç | Koşu |
|---|---|---|
| Kalite | **Başarılı:** Ubuntu 574/574, Windows 224/224, Chromium 141; biçim/domain/TypeScript/build/manifest, iki işletim sisteminde temiz paket kabulü ve iki audit Yüksek eşiği | [37907125530](https://github.com/zaferond/AA-Kaynak-Planlama-Sistemi/actions/runs/37907125530) |

[Metadata, test toplamları ve log hash kaydı](ci-evidence/quality-056590e-receipt.json). Fail/skipped/cancelled 0; Windows ile genel süit örtüşür. Yeni regresyon üç toplu komutta normal/manager retlerini; final settings/generation SQL yazısı gerçekten uygulandıktan sonra sentetik hatada tam veri/audit/generation/hesap rollback'ini; aynı girdilerle başarılı tekrar ve yeniden açılışı sınar. Sıfırlama yalnız planlanan dağılımı temizler; import tek yeni kaynak ve boş takımın liderlik eşleşmesini atomik kaydeder, tekrarları atlar; restore backup counter'larını kullanmaz, isteğe bağlı arşivi kaldırır ve eski taslakları reddeder.

Native MSSQL bu kaynak için yeniden çalıştırılmadı; önceki native koşu bu commit'in kanıtı değildir. Backend Orta bağımlılık uyarısı, N3 snapshot/global lock, N6 canlı geçiş/eski varlık saklama ve kurum servis/CA/proxy/yedek/yük kabulü devam eder. Ham loglar Git'e eklenmez. Sonraki kanıt/dokümantasyon commit'i üretim kodunu değiştirmez ve yeni tam CI başarısı iddiası değildir.

## 9 Ekim 2026 — Proje ve kaynak komutları

Test edilen kod **`736ba2cddf7871b5d59a6aa3a88e827a0d53afec`**. [Modül ayrımı, korunan sözleşmeler ve yerel 45 test / 9 tarayıcı kontrolü](MIMARI-PROJE-KAYNAK-MODUL-AYRIMI-2026-10-09.md).

| Kayıt | Sonuç | Koşu |
|---|---|---|
| Kalite | **Başarılı:** Ubuntu 570/570, Windows 220/220, Chromium 141; biçim/domain/TypeScript/build/manifest, iki işletim sisteminde temiz paket kabulü ve iki audit Yüksek eşiği | [37902728862](https://github.com/zaferond/AA-Kaynak-Planlama-Sistemi/actions/runs/37902728862) |

[Metadata, test toplamları ve log hash kaydı](ci-evidence/quality-736ba2c-receipt.json). Fail/skipped/cancelled 0; Windows ile genel süit örtüşür. Yeni regresyon proje/kaynak silme ardından eski child revision'ında rollback'i; parent SQL silmesi ve kaynak FK SET NULL gerçekten çalıştıktan sonra sentetik hatada veri/audit/generation/kullanıcı bağlantısının geri alınmasını; kapsam dışındaki kayıtların korunmasını; aynı revision'la HTTP tekrar denemesini; parent yeniden oluşturulduğunda eski risk/dağılım/saat/takvim taslaklarının reddini ve kullanıcı bağlantısının kendiliğinden geri gelmemesini; yeniden açılış kalıcılığını sınar.

Native MSSQL bu kaynak için yeniden çalıştırılmadı; önceki native koşu bu commit'in kanıtı değildir. Backend Orta bağımlılık uyarısı, N3 snapshot/global lock, N6 canlı geçiş/eski varlık saklama ve kurum servis/CA/proxy/yedek/yük kabulü devam eder. Ham loglar Git'e eklenmez. Sonraki kanıt/dokümantasyon commit'i üretim kodunu değiştirmez ve yeni tam CI başarısı iddiası değildir.

## 9 Ekim 2026 — Gerçekleşen dağılım ve takvim komutları

Test edilen kod **`5b1ba099db2a877487172bd8fb76e962c79abeed`**. [Modül ayrımı, korunan sözleşmeler ve yerel 57 test / 11 tarayıcı kontrolü](MIMARI-GERCEKLESEN-TAKVIM-MODUL-AYRIMI-2026-10-09.md).

| Kayıt | Sonuç | Koşu |
|---|---|---|
| Kalite | **Başarılı:** Ubuntu 567/567, Windows 217/217, Chromium 141; biçim/domain/TypeScript/build/manifest, iki işletim sisteminde temiz paket kabulü ve iki audit Yüksek eşiği | [37899268951](https://github.com/zaferond/AA-Kaynak-Planlama-Sistemi/actions/runs/37899268951) |

[Metadata, test toplamları ve log hash kaydı](ci-evidence/quality-5b1ba09-receipt.json). Fail/skipped/cancelled 0; Windows ile genel süit örtüşür. Yeni HTTP regresyonu dört komut türünü aynı batch'te sınar: geç stale revision ve final kapasite aşımında veri/audit/generation rollback'i; implicit yüzde revision'larının explicit kontrollerden sonra artması; etkilenen ay ve başka çalışan hesabı; manuel saatten tatil/izin kesintisi; iki komut sırasındaki mevcut yüzde→FTE anlamının korunması ve yeniden açılış kalıcılığı.

Native MSSQL bu kaynak için yeniden çalıştırılmadı; önceki native koşu bu commit'in kanıtı değildir. Backend Orta bağımlılık uyarısı, N3 snapshot/global lock, N6 canlı geçiş/eski varlık saklama ve kurum servis/CA/proxy/yedek/yük kabulü devam eder. Ham loglar Git'e eklenmez. Sonraki kanıt/dokümantasyon commit'i üretim kodunu değiştirmez ve yeni tam CI başarısı iddiası değildir.

## 8 Ekim 2026 — Liderlik ve takım komutları

Test edilen kod **`b15865410c470ac67a70a97f7c5005d6490fe5e8`**. [Modül ayrımı, korunan sözleşmeler ve yerel 43 test / 5 tarayıcı grubu](MIMARI-LIDERLIK-TAKIM-MODUL-AYRIMI-2026-10-08.md).

| Kayıt | Sonuç | Koşu |
|---|---|---|
| Kalite | **Başarılı:** Ubuntu 564/564, Windows 214/214, Chromium 141; biçim/domain/TypeScript/build/manifest, iki işletim sisteminde temiz paket kabulü ve iki audit Yüksek eşiği | [37826265331](https://github.com/zaferond/AA-Kaynak-Planlama-Sistemi/actions/runs/37826265331) |

[Metadata, test toplamları ve log hash kaydı](ci-evidence/quality-b158654-receipt.json). Fail/skipped/cancelled 0; Windows ile genel süit örtüşür. Regresyonlar çoklu geçmiş sürümlerde tek revision artışını, takım taşımasıyla aynı batch'teki eski çalışan revision'ında tam rollback'i ve kullanıcı bağlantıları SQL'e yazıldıktan sonra geç hata/aynı revision'la başarılı tekrar/yeniden açılış kalıcılığını sınar.

Native MSSQL bu kaynak için yeniden çalıştırılmadı; önceki native koşu bu commit'in kanıtı değildir. Backend Orta bağımlılık uyarısı, N3 snapshot/global lock, N6 canlı geçiş/eski varlık saklama ve kurum servis/CA/proxy/yedek/yük kabulü devam eder. Ham loglar Git'e eklenmez. Sonraki kanıt/dokümantasyon commit'i üretim kodunu değiştirmez ve yeni tam CI başarısı iddiası değildir.

## 8 Ekim 2026 — Risk işlemleri ve rapor kompozisyonu

Test edilen kod **`3437a456b1ce830af953b1832a981f2ca67b3935`**. [Modül ayrımı, korunan sözleşmeler ve yerel 40 test / 31 tarayıcı grubu](MIMARI-RISK-VE-RAPOR-MODULLERI-2026-10-08.md).

| Kayıt | Sonuç | Koşu |
|---|---|---|
| Kalite | **Başarılı:** Ubuntu 563/563, Windows 213/213, Chromium 141; biçim/domain/TypeScript/build/manifest, iki işletim sisteminde temiz paket kabulü ve iki audit Yüksek eşiği | [37823750933](https://github.com/zaferond/AA-Kaynak-Planlama-Sistemi/actions/runs/37823750933) |

[Metadata, test toplamları ve log hash kaydı](ci-evidence/quality-3437a45-receipt.json). Fail/skipped/cancelled 0; Windows ile genel süit örtüşür. Yeni HTTP regresyonu toplu risk/katalog işlem sırasını, eski revision ve yetkisiz ikinci komutta tam rollback'i, yaratıcı metadata korunmasını ve yeniden açılış kalıcılığını doğrular. Tarayıcı kontrolleri rapor ref/listener ayrımından sonra birlikte kaydırma ve sekme/dönem/yeniden yükleme davranışını da kapsar.

Native MSSQL bu kaynak için yeniden çalıştırılmadı; önceki native kanıt bu commit'in sonucu değildir. Backend Orta bağımlılık uyarısı, N3 snapshot/global lock, N6 canlı geçiş/eski varlık saklama ve kurum servis/CA/proxy/yedek/yük kabulü devam eder. Ham loglar Git'e eklenmez. Sonraki kanıt/dokümantasyon commit'i üretim kodunu değiştirmez ve yeni tam CI başarısı iddiası değildir.

## 8 Ekim 2026 — N6 temiz dağıtım paketi

Test edilen kod/iş akışı **`a26c7265c87b699fa8fb3d46ea77da802ef6282a`**. [Dar değişiklik, boyut ölçümü, testler ve açık operasyonel işler](N6-TEMIZ-DAGITIM-PAKETI-2026-10-08.md).

| Kayıt | Sonuç | Koşu |
|---|---|---|
| N6 kalite | **Başarılı:** Ubuntu 562/562, Windows 212/212, Chromium 141; iki işletim sisteminde gerçek build sonrası geçici temiz paket kabulü, biçim/domain/TypeScript/build/manifest ve iki audit Yüksek eşiği | [37821015932](https://github.com/zaferond/AA-Kaynak-Planlama-Sistemi/actions/runs/37821015932) |
| Önceki boş detay tarihi düzeltmesi; ayrı commit `652f40525d4bfdbc348cef040248a333b695e2e1` | **Başarılı:** Ubuntu 558/558, Windows 208/208, Chromium 141; biçim/domain/TypeScript/build/manifest/audit | [37819205387](https://github.com/zaferond/AA-Kaynak-Planlama-Sistemi/actions/runs/37819205387) |

[N6 kaydı](ci-evidence/quality-a26c726-receipt.json), [önceki düzeltmenin kaydı](ci-evidence/quality-652f405-receipt.json). Fail/skipped/cancelled 0; Windows ve genel süit örtüşür. Ham loglar Git'e eklenmez; kayıtlar güvenli metadata, test toplamları ve indirilen log hash'leridir. Bu kaynaklar için native MSSQL yeniden çalıştırılmadı. Backend Orta bağımlılık uyarısı, tam snapshot/global lock maliyeti ve kurum servis/CA/proxy/yedek/yük kabulü devam eder.

Temiz yeni paket tarihsel asset'leri taşımaz; mevcut çalışan `site/` dosyaları otomatik silinmez. Canlı sürüm geçişi ve saklama/temizlik kabulü bu CI kapsamının dışındadır. Sonraki dokümantasyon/kanıt commit'i yeni üretim kodu içermez ve yeni tam CI koşusu iddiası değildir.

## 8 Ekim 2026 — N3 MSSQL metadata toplu okuması

Test edilen kaynak **`f798747eb1e9c4b67220efd28ac19fa138a5e9ec`**. [Değişiklik, testler, ölçüm ve kalan sınırlar](N3-MSSQL-SNAPSHOT-TOPLU-OKUMA-2026-10-08.md).

| Kayıt | Sonuç | Koşu |
|---|---|---|
| Kalite | **Başarılı**: Ubuntu 538/538, Windows 189/189, Chromium 133; biçim/domain/TypeScript/build/manifest ve iki audit kapısı | [37781214895](https://github.com/zaferond/AA-Kaynak-Planlama-Sistemi/actions/runs/37781214895) |
| Native MSSQL | **Başarılı**: 22/22; aynı transaction'da ordinary/batch snapshot ve JSON eşitliği, SQL hata halinde yazmanın başlamaması; 640 işlem / 340 yazma, iki havuz, şema 31, temizlik | [37781315933](https://github.com/zaferond/AA-Kaynak-Planlama-Sistemi/actions/runs/37781315933) |

[Kalite kaydı](ci-evidence/quality-f798747-receipt.json), [native kaydı](ci-evidence/native-mssql-f798747-receipt.json), [native JSON](ci-evidence/native-mssql-f798747.json). JSON SHA-256: `d190e82894540c0af65e654314b5c333f943a54b936cc8b4e1c6f442fd7d1b32`. **470/470** kaynak hash'i test commit'iyle eşleşir; `.cmd` CRLF checkout baytlarıyla karşılaştırılır. JSON byte olarak korunur; ham loglar ve bağlantı/gerçek kullanıcı bilgileri arşivlenmez.

Native okumada 10 sabit metadata SELECT'i tek istek olur: snapshot okuması **15 → 6** SQL isteği. Satırlar, tam doğrulama, yetki, revision, audit ve global lock korunur. 40 güncel tabanlı delta yazmasının SQL çağrısı medyanı **13**, önceki aşamada 22'ydi; satır ve snapshot eşitliği ayrıca doğrulanır. Farklı runner süreleri kontrollü A/B veya üretim kapasitesi kanıtı değildir. Batch 45 saniyelik request bütçesini paylaşır; kurum hacminde buffer/timeout ayrıca kabul edilmelidir.

Başarılı toplamların fail/skipped/cancelled değeri 0; Windows genel suite ile örtüşür. Audit Yüksek eşiği backend Orta uyarıyı kapatmaz. N3 tam satır hacmi/doğrulama/global lock maliyeti devam eder. Sonraki arşiv/dokümantasyon commit'i yeni koşu iddiası değildir; önceki bütün kayıtlar korunur.

## 8 Ekim 2026 — N3 planlanan yazma taslağı ve delta

Üretim değişiklikleri **`ae28c2c261d3f3a846a14bd9bf3b05fb76547fb4`**. [Dar değişiklik, testler, ölçüm ve kalan sınırlar](N3-PLANLANAN-YAZMA-TASLAK-VE-DELTA-2026-10-08.md).

| Kayıt | Sonuç | Koşu |
|---|---|---|
| `ae28c2c` native | **Başarılı**, 21/21, 640 işlem / 340 yazma; 40/40 güncel tabanlı delta, bağımsız SQL eşitliği; şema 31, temizlik başarılı | [37776609079](https://github.com/zaferond/AA-Kaynak-Planlama-Sistemi/actions/runs/37776609079) |
| `ae28c2c` kalite | **Başarısız**: Ubuntu 530/530, Chromium 133 ve audit kapıları geçti; Windows 178/181, üç POSIX errno beklentisi Windows EPERM'i reddetti | [37776557819](https://github.com/zaferond/AA-Kaynak-Planlama-Sistemi/actions/runs/37776557819) |
| `4bec497` kalite, test düzeltmesi sonrası | **Başarılı**: Ubuntu 530/530, Windows 181/181, Chromium 133; biçim/domain/TypeScript/build/manifest ve iki audit kapısı | [37777354538](https://github.com/zaferond/AA-Kaynak-Planlama-Sistemi/actions/runs/37777354538) |

[Native sonuç](ci-evidence/native-mssql-ae28c2c.json), [native koşu kaydı](ci-evidence/native-mssql-ae28c2c-receipt.json), [başarısız kalite kaydı](ci-evidence/quality-ae28c2c-receipt.json). Native JSON SHA-256: `651b0db388725ebc20054d13de300e54f945b4d18cfbb8c892d01e39f24a0f3a`; **467/467 hash** kendi test edilen commit'ine eşit. JSON byte olarak korunur; ham loglar, bağlantı ve gerçek kullanıcı bilgileri arşivlenmez.

Test-only Windows düzeltmesi **`4bec497`**: yalnız fixture'ın tam kaynak/hedef yollarındaki rename ve işletim sistemine uygun errno kabul edilir. Üç testin rollback/audit/restart assert'leri korunur. [Karşılaştırma kaydı](ci-evidence/native-mssql-ae28c2c-4bec497-comparison.json), native kanıtındaki **380 uygulama/derleme/ölçüm girdisinin** değişmediğini ve 467 dosyada tek farkın native runner'da yürütülmeyen SQL.js test predicate'i olduğunu gösterir. Native koşunun commit'i değişmedi; [güncel kalite kaydı](ci-evidence/quality-4bec497-receipt.json) ayrıdır ve başarılıdır. Bu son koşuda fail/skipped/cancelled 0; Windows genel suite ile örtüşür. Audit Yüksek eşiği backend Orta uyarıların kapandığı anlamına gelmez. Sonraki arşiv/dokümantasyon commit'i ayrı bir native/kalite koşusu iddiası değildir. N3 tam SQL snapshot/doğrulama/global lock maliyeti hâlâ açık; farklı runner süreleri kontrollü A/B değildir.

## 8 Ekim 2026 — N3 ölçümü ve kişisel sorgu kapsamı

Kaynak başlangıcı **`f084a34174e85735c337ff946a1e48e4c19eb1c1`**, dar kişisel okuma düzeltmesi **`ce5c2f007e70b029b6132873d7f3e795c6c87ea5`**. Önceki kanıtların üzerine yazılmadı. [N3 değişiklikler, ölçüm ve kalan işler](N3-SNAPSHOT-KILIT-OLCUM-VE-OKUMA-KAPSAMI-2026-10-08.md).

| Kaynak / kayıt | Sonuç | Koşu |
|---|---|---|
| `f084a34` kalite | 519/519 Ubuntu, 153/153 Windows, 133 Chromium kontrolü ve tüm kapılar başarılı | [37767837466](https://github.com/zaferond/AA-Kaynak-Planlama-Sistemi/actions/runs/37767837466) |
| `f084a34` native | 21/21; 10.000 planlanan / 4.000 actual; ek 600 işlem / 300 değişiklik; iki havuz, şema 31, temizlik başarılı | [37768092380](https://github.com/zaferond/AA-Kaynak-Planlama-Sistemi/actions/runs/37768092380) |
| `ce5c2f0` native | Aynı senaryo/sayılar başarılı; normal yüzde sorgusu ilk senaryoda 4.000 yerine 50 satır döndürüyor | [37770061188](https://github.com/zaferond/AA-Kaynak-Planlama-Sistemi/actions/runs/37770061188) |
| `ce5c2f0` kalite, deneme 1 ve 2 | **Başarısız**; kaynak testi 524/524, Windows 153/153; risk onay browser kontrolünde response timeout; audit adımları atlandı | [37770060613](https://github.com/zaferond/AA-Kaynak-Planlama-Sistemi/actions/runs/37770060613) |
| `f3b6383` kalite, risk onay test harness düzeltmesi sonrası | **Başarılı**: 524/524 Ubuntu, 153/153 Windows, 133 Chromium kontrolü, biçim/domain/TypeScript/build/manifest ve iki audit kapısı | [37771685013](https://github.com/zaferond/AA-Kaynak-Planlama-Sistemi/actions/runs/37771685013) |
| `f3b6383` native | 21/21, aynı 600 işlem / 300 değişiklik; 466 hash eşit, şema 31 ve temizlik başarılı | [37771735208](https://github.com/zaferond/AA-Kaynak-Planlama-Sistemi/actions/runs/37771735208) |

- [Başlangıç kalite kaydı](ci-evidence/quality-f084a34-receipt.json), [başlangıç native kaydı](ci-evidence/native-mssql-f084a34-receipt.json), [başlangıç native JSON](ci-evidence/native-mssql-f084a34.json).
- [Dar okuma native kaydı](ci-evidence/native-mssql-ce5c2f0-receipt.json), [dar okuma native JSON](ci-evidence/native-mssql-ce5c2f0.json), [başarısız kalite deneme 1](ci-evidence/quality-ce5c2f0-attempt1-receipt.json), [başarısız kalite deneme 2](ci-evidence/quality-ce5c2f0-attempt2-receipt.json).
- Son test edilen paket **`f3b63835c05830c85847f1c3c0ef04f0b82e7d12`**: [kalite kaydı](ci-evidence/quality-f3b6383-receipt.json), [native kaydı](ci-evidence/native-mssql-f3b6383-receipt.json), [native JSON](ci-evidence/native-mssql-f3b6383.json). Native JSON SHA-256: `1c012af10bb2a72b016c01df56e7a23318131364d3305ccf2db6e21870c53b83`. 466 dosya ilgili commit ile eşit; başarısız önceki kalite denemeleri korunur. Test harness düzeltmesi olay döngüsünü ve promise hatalarını ele alır; üretim risk kaydetme kuralları değiştirilmedi. Sonraki arşiv/dokümantasyon commit'i yeni bir native test iddiası değildir.
- Native JSON SHA-256 sırasıyla `936c0bb6bb457c2d36c8152cf09f09fab94da88743a51d8a8cb20761c503d8fb` ve `9ad730e59ee58827fea1707d6104fca1236e398b42616c2aec1ec79213cd0588`. JSON baytları korunur; ZIP digest'i ayrı girdidir.
- Üç native sonuçta **466 dosyanın tamamı** ilgili Git commit'iyle eşleşti; `.cmd` CRLF checkout kuralı uygulandı. Kaynak kimliği tüm işlevlerin native test edildiği anlamına gelmez. Raporlar SQL/parametre/bağlantı değerlerini içermez; ham loglar depoya eklenmedi. Son başarılı test toplamlarında hata/atlama/iptal yok; Windows genel suite ile örtüşür.
- Profiller örnek p95/p99 ve örneklenen süreç belleğini içerir; fiziksel IO, saf DMV lock wait, istek başı bellek, HTTP/WAN veya üretim kapasitesi ölçümü değildir. Ayrı runner süreleri kontrollü A/B gibi yorumlanmaz. N3'ün global yazma snapshot/kilit maliyeti hâlâ açık; N2 backend Orta uyarısı da sürüyor.

## 8 Ekim 2026 — N4 / Y5 yenilemesi

Test edilen kaynak: **`731f5281f123f324628de7d0085508d2aaf54e48`**. Sonraki arşiv/dokümantasyon commit'i test edilen kaynakla aynı değildir; kaynak kimliği ayrıca hash'lerden kontrol edilir. Önceki kayıtların üzerine yazılmadı.

| Kayıt | Sonuç | Koşu |
|---|---|---|
| Ubuntu kalite | 509/509 kaynak testi, 133 başarılı Chromium kontrolü; biçim/domain/TypeScript/build/manifest ve iki audit kapısı başarılı | [37763521968](https://github.com/zaferond/AA-Kaynak-Planlama-Sistemi/actions/runs/37763521968) |
| Windows kalite | 143/143 sentetik test; TypeScript/build/manifest başarılı | Aynı kalite koşusu |
| Native MSSQL | 20/20, şema 31; SQL Server 16.0.4295.3 Developer, uyumluluk 160, iki havuz; temizlik doğrulandı | [37763546804](https://github.com/zaferond/AA-Kaynak-Planlama-Sistemi/actions/runs/37763546804) |

- [Kalite kaydı](ci-evidence/quality-731f528-receipt.json), [native kaydı](ci-evidence/native-mssql-731f528-receipt.json), [byte olarak korunan native sonuç](ci-evidence/native-mssql-731f528.json).
- Native JSON SHA-256: `cf14ea040122c8599702b4e7c4abbb4de32a21ab61192e3136506792ace4fb9b`. Artifact ZIP digest'i farklı bir girdiye aittir.
- Native raporun **463 dosyası** aynı commit ile eşleşti; `.cmd` başlatıcısında `.gitattributes` CRLF baytları kullanıldı. Bu liste tam uygulama/derleme girdileri, doğrudan test modülleri ve iki workflow'u içerir. Hash eşitliği tüm UI/işlevlerin native test edildiğini kanıtlamaz.
- Test toplamlarında hata/atlama/iptal yok. Windows genel testlerle örtüşür. Audit kapısı Yüksek eşiklidir: frontend uyarısı giderildi, backend'in `sprintf-js` kökünden gelen Orta uyarıları sürüyor.
- [N4 kapsam, test düzeltmeleri ve kurum sınırları](N4-NATIVE-WINDOWS-KANIT-YENILEME-2026-10-08.md). Asgari SQL yetkileri, kurum TLS/proxy/Windows servis/ACL, kurum kurtarma ve gerçek yük bu kayıtlarla kapanmaz.

**Ara koşu korunmuştur:** `56521c3` için native [37734302765](https://github.com/zaferond/AA-Kaynak-Planlama-Sistemi/actions/runs/37734302765) 20/20, Windows 143/143 ve Ubuntu kaynak testi 509/509 geçti. Fakat Ubuntu browser eski seçicinin iki tablo bulması nedeniyle durdu; kalite koşusu **başarısızdır**. [Başarısız kalite kaydı](ci-evidence/quality-56521c3-receipt.json), [native kaydı](ci-evidence/native-mssql-56521c3-receipt.json), [native sonuç](ci-evidence/native-mssql-56521c3.json). Bu koşunun atlanan audit adımları geçmiş gibi gösterilmedi. Sonraki `731f528` iki tablo seçicisini daraltarak tam kalite koşusunu geçirdi.

## 4 Ekim 2026 kayıtları

Bu arşiv belirli commit'lerin sentetik CI sonuçlarını saklar. Daha sonraki commit'ler, çalışan uygulama ve kurum ortamı için otomatik başarı iddiası oluşturmaz. Windows testleri genel testlerle kısmen örtüşür; sayıları bağımsız kapsam olarak toplamamak gerekir.

| Kayıt | Test edilen commit | Sonuç | Koşu |
|---|---|---|---|
| Ubuntu kalite | `9c5a378d0cba3d99f26c3669d0dcc3d062450092` | 433/433 test, 69 başarılı Chromium kontrolü; TypeScript/build/dağıtım doğrulama ve iki audit adımı başarılı | [37212096003](https://github.com/zaferond/AA-Kaynak-Planlama-Sistemi/actions/runs/37212096003) |
| Windows kalite | `9c5a378d0cba3d99f26c3669d0dcc3d062450092` | 84/84 sentetik test; TypeScript/build/dağıtım doğrulama başarılı | Aynı kalite koşusu |
| Windows test temizliği sonrası Ubuntu/Windows kalite | `fdce36ec0f440e3a5452ce2d315e79ef7c5274fa` | 433/433 genel ve 84/84 Windows testi, 69 başarılı Chromium kontrolü; TypeScript/build/dağıtım doğrulama/audit adımları başarılı | [37213183916](https://github.com/zaferond/AA-Kaynak-Planlama-Sistemi/actions/runs/37213183916) |
| SQL.js CLI/HTTP kurtarma ve migration hata kontrolleri sonrası Ubuntu/Windows kalite | `73eb7caf8a0b652a8da267d54c8d1c3c91b1934a` | 435/435 genel ve 86/86 Windows testi, 69 başarılı Chromium kontrolü; TypeScript/build/dağıtım doğrulama/audit adımları başarılı | [37217903934](https://github.com/zaferond/AA-Kaynak-Planlama-Sistemi/actions/runs/37217903934) |
| Native MSSQL | `63780fc4538829c16c7b14739f882a9851629f59` | 19/19 test; SQL Server 2022 Developer, şema 30, iki havuz, temizlik doğrulandı | [37186385433](https://github.com/zaferond/AA-Kaynak-Planlama-Sistemi/actions/runs/37186385433) |

Tablodaki başarılı koşuların test toplamlarında fail/skipped/cancelled sayısı sıfırdır. Ubuntu'nun backend/frontend audit adımları bu koşularda bilinen açık bildirmedi; bu sonuç güvenlik garantisi değildir. Aşağıdaki başarısız ara koşu ayrıca korunmuştur. Windows başlatıcı testindeki npm/build/start stub'ları gerçek kurum servisi veya DB başlatmaz. Chromium kontrolleri geçici SQL.js ve sentetik hesaplar kullanır.

## Saklanan dosyalar ve kaynak doğrulaması

- [Kalite CI kaydı](ci-evidence/quality-9c5a378-receipt.json): GitHub API'den alınan commit/koşu/iş/adım durumları, loglardan çıkarılan test toplamları ve indirilen logların SHA-256 değerleri. Ham loglar, geçici dosya yolları, bağlantı bilgileri veya hesap verileri arşivlenmez.
- [Windows temizliği düzeltmesi sonrası kalite kaydı](ci-evidence/quality-fdce36e-receipt.json): aynı metadata/test toplamları ve başarısız önceki koşuyla ilişkisi.
- [Kurtarma kabul kontrolü sonrası kalite kaydı](ci-evidence/quality-73eb7ca-receipt.json): aynı metadata/test toplamları; yeni sentetik SQL.js CLI/HTTP kurtarma ve migration hata testleri Ubuntu ve Windows koşularında başarılı. Yerel 28 hedefli testin sonucu da kapsam notuyla kayıtlıdır.
- [Native CI kaydı](ci-evidence/native-mssql-63780fc-receipt.json): aynı metadata ve test toplamları, artifact kimliği/süresi, sonuç JSON'unun SHA-256 değeri ve 48 kaynak dosyasının karşılaştırması.
- [Native sonuç JSON'u](ci-evidence/native-mssql-63780fc.json): CI artifact'indeki JSON **byte olarak korunmuştur**. Sentetik rol ölçümleri, Node/SQL sürümleri, şema ve kaynak hash'lerini içerir; gerçek kullanıcı verisi veya bağlantı bilgisi içermez.

Native JSON SHA-256:

```text
c4eca2bf19d8fa041f9f484589827a8bbcb98b61f28552b69e65410bcdfb9ac3
```

GitHub artifact'inin kaydedilen sona erme tarihi **11 Ekim 2026 07:39 UTC** olduğundan sonuç ayrıca Git deposunda tutulur. Artifact metadata'sındaki digest ZIP arşivine aittir; yukarıdaki JSON hash'i ile karıştırılmamalıdır. Log hash'leri kayıt parmak izidir; ham loglar yeniden elde edilemiyorsa tek başına test içeriğini kanıtlamaz.

4 Ekim'de native JSON'un kapsadığı **48 dosyanın tamamı**, kalite koşusunun `9c5a378` commit'indeki aynı dosyalarla eşleşti. Bu karşılaştırma yalnız listelenen dosyaları kapsar. Sonraki HTTP/proxy/başlatıcı/dağıtım değişiklikleri veya frontend'in tamamı eski native koşuda test edilmiş sayılmaz. Yeni native kapsamı için yeni bir koşu ve ayrı kayıt gerekir.

JSON dosyasının bütünlüğü PowerShell'de veri tabanına bağlanmadan kontrol edilebilir:

```powershell
(Get-FileHash -Algorithm SHA256 -LiteralPath .\ci-evidence\native-mssql-63780fc.json).Hash
```

Bu dosyalar imzalı bağımsız sertifika değildir. Depoyu değiştirebilen biri kayıtları da değiştirebilir; kurumun kabul kanıtları erişimi sınırlı ayrı bir konumda korunmalıdır. İlerideki kayıtlar eski koşunun üzerine yazılmadan yeni commit/koşu adıyla eklenir; loglar gizli bilgi/kişisel veri açısından gözden geçirilmeden arşivlenmez.

## Sonraki Windows CI temizliği bulgusu

Dokümantasyon/arşiv commit'i `d9619779019ad1a68dd47bcaeef13edc2a7013da` için [37212740025 koşusunda](https://github.com/zaferond/AA-Kaynak-Planlama-Sistemi/actions/runs/37212740025) Ubuntu başarılı, Windows başarısızdır. Windows'ta geçersiz `.env` senaryosunun geçici fixture'ı silinirken kopyalanmış `bin/node.exe` için `EBUSY` oluştu. Önceki başarılı kalite koşusunun üzerine yazılmadı; bu başarısız koşu başarılı kanıt olarak kullanılmaz.

`tests/startup-fixture.mjs` temizliği, yalnız sahip olunan geçici dizinde desteklenen geçici dosya sistemi hatalarını en fazla 5 defa, artan bekleme ile tekrar dener. Başlangıç gecikmesi 100 ms, toplam ek bekleme en çok 1.500 ms'dir; kalıcı hata yine testi başarısız yapar. Uygulama/başlatıcı davranışı, gerçek ayarlar, DB veya servis değiştirilmedi.

Düzeltme `fdce36e` commit'inde uygulanıp [37213183916 koşusunda](https://github.com/zaferond/AA-Kaynak-Planlama-Sistemi/actions/runs/37213183916) Ubuntu ve Windows başarılarıyla doğrulandı: 433/433 genel, 84/84 Windows ve 69 Chromium kontrolü. Yerelde gerçek ayarlar aktarılmayan geçici kopyada `node --test --test-reporter=tap tests/startup-tools.test.mjs` 5/5 geçti; seçili fixture'ın Prettier kontrolü de exit 0 döndü. Yerel Mac testi Windows sonucu yerine kullanılmadı. Bu başarı, olası tüm Windows dosya kilidi koşullarının ortadan kalktığının garantisi değildir.

## Bu kanıtlarla kapanmayan kurum kabul işleri

SQL.js için CLI'den kurtarma kopyasının gerçek HTTP giriş/yetki/güncelleme akışına kadar sentetik kontrol tamamlandı. Eski oturumların kaldırılması, yedek anının korunması, revision ve yeniden açılış kalıcılığı ile son migration DDL'sinden sonra hata/yeniden deneme, `73eb7ca` koşusunda iki işletim sisteminde de sınandı. [Kurtarma kontrolünün kapsam ve sonuçları](KURTARMA-KABUL-KONTROLLERI-2026-10-04.md). Bu başarı aşağıdaki kurum kabul işlerini kapatmaz.

1. Sentetik kopyada kurum yedek/restore/migration geri dönüşü, hesap/oturum temizliği, RPO/RTO ve geri kazanılan verinin doğrulanması.
2. Asgari yetkili SQL hesabı, kurum CA/hostname/NTLM, firewall, gerçek HTTPS proxy adresleri ve çoklu proxy zinciri.
3. Windows servis hesabı/NTFS ACL, gerçek ilk kurulum TTY/Explorer, SCM stop, crash/boot/restart davranışları.
4. Hedef veri hacmi ve kullanıcı eşzamanlılığında HTTP/tarayıcı/WAN p95, bellek/GC, SQL sorgu planı ve fiziksel IO.

Native container koşusunda test kimliği ve self-signed sertifikaya trust kullanılmıştır. Sentetik Store medyan/en uzun süre ölçümleri üretim kapasitesi veya p95 değildir. Açık sürecin güncel kodu yüklediği, disk paketinin `deploy:verify` kontrolünden ayrıca kabul edilir.

Bu kurum işlemleri yalnız ayrılmış test ortamı ve sentetik veriyle yürütülür. Çalışan/üretim ortamındaki hesap, DB, migration/restore, servis, sertifika veya ağ işlemi için ayrıca açık yetki ve kabul planı gerekir. Bu arşivleme sırasında bunların hiçbiri çalıştırılmadı.

## 8 Ekim — N5 taşıma ve belirsiz yazma kontrolü

Kaynak `f7d5a0eb011485f0408a4961f261e468af0a618c` için [37813756755 kalite koşusu](https://github.com/zaferond/AA-Kaynak-Planlama-Sistemi/actions/runs/37813756755) başarılı: Ubuntu **557/557**, Windows **208/208**, Chromium **138**. Fail/cancelled/skipped 0; format/domain/TypeScript/build/manifest ve Yüksek eşikli root/frontend audit kapıları geçti. [Koşu kaydı](ci-evidence/quality-f7d5a0e-receipt.json), job kimlikleri/toplamları ve özel geçici dizine indirilen logların hash'lerini içerir. Ham log, sır veya kişisel veri Git'e eklenmedi.

[N5 kapsamı ve sınırlamaları](N5-AG-SURE-SINIRI-VE-YAZMA-UZLASTIRMA-2026-10-08.md): süre aşımı/iptal POST'un tamamlanmadığını kanıtlamaz; manuel GET ve eski revision'lı CAS denemesi ile taslak korunur, otomatik replay yapılmaz. Yeni beş browser grubu yalnız sentetik SQL.js/HTTP verisi kullanır. Windows testleri genel testlerle örtüşür. Bu frontend değişikliğinde yeni native MSSQL/kurum kabul koşusu çalıştırılmadı; önceki kanıtlar kendi kaynak commit'lerini temsil eder. Sonraki belge/kanıt commit'i yeni test koşusu olarak sunulmaz.

## 8 Ekim — Üst açıklama tarihleri ve yukarı scroll geçişi

Kaynak `07b889a94b7dc2b9ef798a2b6d1f22a7d30d9070` için [37815612801 kalite koşusu](https://github.com/zaferond/AA-Kaynak-Planlama-Sistemi/actions/runs/37815612801) başarılı: Ubuntu **557/557**, Windows **208/208**, Chromium **140**; fail/cancelled/skipped 0. Format/domain/TypeScript/build/manifest ve iki Yüksek eşikli audit kapısı geçti. [Koşu kaydı](ci-evidence/quality-07b889a-receipt.json) commit/job kimlikleri, toplamlar ve özel geçici log hash'lerini içerir. Ham log/sır arşivlenmedi.

[Değişiklik ve kapsam](ARAYUZ-TARIHLER-VE-SCROLL-2026-10-08.md): üst aralığın salt okunur olması, alt tarihlerden hem genişleme hem daralma, HTTP kaydı/yeniden açılış ve milestone tarihinin ayrı düzenlenmesi; proje, planlanan ve gerçekleşen tablolarından ana sayfaya yukarı native wheel geçişi sınandı. N5'in 138 kontrolüne iki browser grubu eklendi. Backend/shared/migration değişmedi; native/kurum kabulü yenilenmiş sayılmaz. Sonraki belge/kanıt commit'i bu kod koşusuyla karıştırılmamalıdır.
