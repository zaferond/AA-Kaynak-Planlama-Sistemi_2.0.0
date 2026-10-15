# N2 — Bağımlılık güvenlik uyarıları

> **13.10.2026 güncellemesi:** Aşağıdaki sonuçlar tarihsel kayıttır. M4 çalışmasında Tedious 20.3.8'e geçildi, `sprintf-js` kaldırıldı ve backend/frontend audit sonuçları sıfır oldu. Güncel testler ve native MSSQL doğrulama sınırı için [M4 kaydına](M4-BAGIMLILIK-GUVENLIGI-2026-10-13.md) bakın.

Tarih: 8 Ekim 2026. Taban: `main`, `42cd1ea` ve önceki N1 çalışma ağacı değişiklikleri. İlgili bulgu: `MIMARI-GUVENLIK-PERFORMANS-INCELEME-2026-10-07.md`, **N2 / Orta**.

## Sonuç: Kısmen giderildi

| Kök uyarı | Önce | Sonra | Durum |
|---|---|---|---|
| GHSA-68fv-2mgg-jv7q — source-map-js | Frontend 1 Yüksek; 1.2.1 | 1.2.2; frontend audit toplam 0 | **Giderildi — kilit, kurulum ve sentetik davranış testi** |
| GHSA-hp3w-g68c-fv3c — sprintf-js | Backend 3 Orta paket bildirimi; tek kök neden | Aynı 3 bildirim; sprintf-js → tedious → mssql | **Açık — yayımlanmış yama yok; kullanım kontrolü eklendi** |

Audit sonucunun sıfır olması uygulamanın bütün olarak güvenli olduğunu kanıtlamaz. Backend için sıfır uyarı sonucu elde edilmedi ve uyarılar bastırılmadı.

## Dar kapsamlı değişiklik

- `frontend/package-lock.json`: yalnız `source-map-js` çözümü **1.2.1 → 1.2.2**; registry adresi ve integrity birlikte güncellendi. Üst seviye bağımlılık sürümleri ve backend kilidi değişmedi.
- `tests/dependency-security.test.mjs`: PostCSS'nin gerçekten çözümlediği source-map paketinde aşırı/iç içe/geçersiz offset reddi; normal CSS eşleme ve Türkçe metin korunması. Kötü niyetli haritalar büyük metinlere dönüştürülmüyor; yalnız constructor doğrulaması deneniyor.
- Tedious `lib` JavaScript dosyalarında sprintf kullanımını AST üzerinden kontrol eden test: mevcut **12 çağrı** sabit, incelenmiş `%s`, `%d`, `%02X`, `%04X`, `%08X` biçimlerini kullanıyor. Dinamik biçim, incelenmemiş precision, alias'a aktarma ve köşeli parantez erişimi için olumsuz fixture'lar var. Biçim belirteci gibi görünen sentetik değerlerin `%s` argümanı olarak metin kaldığı test edildi.
- Bu kontrol sprintf-js'yi yamalamaz; tüm olası runtime/dinamik modül yollarını kapsayan güvenlik kanıtı değildir. Bağımlılık yükseltmesinde kullanım şekli değişirse yeniden inceleme gerektirir. Standart `npm test` dosya desenine dahildir.

## Backend kararının kanıtı

8 Ekim registry sorgusunda `sprintf-js` son sürümü **1.1.3**, duyuruda düzeltilmiş sürüm **yok**. Sorgulanan güncel Tedious **20.3.3** hâlâ `sprintf-js ^1.1.3` kullanıyor. Güncel MSSQL **12.7.4** de Tedious zincirinde. Bu nedenle sırf en yeni sürüme geçmek kök uyarıyı kapatmıyor.

Npm audit, MSSQL'i **4.2.0** sürümüne indirmeyi öneriyor; bu majör düşürme uygulanmadı. Mevcut kilit ve testte kullanılan sürümler: MSSQL **12.7.2**, Tedious **20.0.0**, sprintf-js **1.1.3**. Kurulu backend test önbelleğinin bu sürümlerle eşleştiği kontrol edildi.

Mevcut doğrudan uygulama kaynaklarında sprintf kullanımı bulunmadı; incelenen Tedious çağrılarında saldırganın biçim metnini belirlediği bir yol doğrulanmadı. Bu, paketteki açığın giderildiği veya bütün uygulamanın istismar edilemez olduğu anlamına gelmez.

Bir sonraki backend adımı: yayımlanmış upstream düzeltme/bağımlılık kaldırma sürümü geldiğinde dar güncelleme ve güncel Native MSSQL doğrulaması. Zorunlu kurum politikasının sıfır uyarı gerektirmesi durumunda ayrı ve denetlenebilir bir yama/fork kararı gerekir; bu çalışma yerel node_modules yaması veya uyarı muafiyeti üretmedi.

## Çalıştırılan kontroller

Komutlar önce incelendi. `.env`, gerçek kullanıcı hesabı ve çalışan veritabanı kullanılmadı. Npm için boş user/global config, ayrı geçici cache ve sınırlandırılmış ortam kullanıldı; dışarı yalnız açık paket metadatası gönderildi. Install lifecycle script'leri kapalıydı.

| Komut | Sonuç |
|---|---|
| İki kilidin geçici kopyasında `npm audit --package-lock-only --ignore-scripts --json` | Önce frontend 1 Yüksek, backend 3 Orta; sonra frontend 0, backend aynı 3 Orta. Backend audit exit 1 açık bulgular nedeniyle, tarama hatası değil. |
| `npm view <source-map-js/sprintf-js/tedious/mssql> version dist-tags dependencies --json` | Yayımlanmış sürümler ve zincir kontrol edildi. |
| Geçici frontend kopyasında `npm update source-map-js --package-lock-only --ignore-scripts --no-audit --no-fund` | Tek paket çözümü değişti; ardından kanonik kilide aktarıldı. |
| Frontend `npm ci --include=dev --ignore-scripts --no-audit --no-fund` | Yeni kilitten temiz kurulum başarılı. |
| `node --import <geçici-loader> --test tests/dependency-security.test.mjs tests/config.test.mjs tests/mssql-test-environment.test.mjs` | **16/16**, hata/atlama yok. DB bağlantısı yok; native test ortamı kontrolleri sentetik/fake adapter kullanıyor. |
| `node frontend/node_modules/typescript/bin/tsc --noEmit -p frontend/tsconfig.json` | Geçti. |
| Yeni test dosyasında Prettier; `git diff --check` | Geçti. |
| `node frontend/build.mjs`; `node scripts/verify-deployment.mjs` | Geçti. |

Geçici ham çıktılar `aa-n2-ebm_s5kk` dizininde saklandı; bunlar kalıcı CI arşivi sayılmaz. Yeni test dosyası depoda kalıcıdır. Native MSSQL bağlantısı, Windows ve GitHub CI bu tur çalıştırılmadı.

## Uygulama kopyasına aktarım

Uygulama klasörünün önceki manifest hash'leri doğrulandı; yeni kilit, test, bu not ve manifest yedek alınarak aktarıldı. Uygulama klasörünün frontend bağımlılıkları da script'ler kapalı temiz `npm ci` ile kuruldu; kurulu source-map-js **1.2.2**. Aktarım sonrası manifest doğrulaması geçti. Çalışan sunucu yeniden başlatılmadı; gerçek veritabanına erişilmedi.

## Kaynaklar

- [source-map-js güvenlik duyurusu](https://github.com/advisories/GHSA-68fv-2mgg-jv7q)
- [Upstream source-map-js düzeltmesi](https://github.com/7rulnik/source-map-js/commit/cf76580)
- [sprintf-js güvenlik duyurusu](https://github.com/advisories/GHSA-hp3w-g68c-fv3c)

Kaynaklarda yayımlanan durum 8 Ekim 2026 itibarıyla kontrol edilmiştir. Önceki N1 değişiklikleri korundu; bu tur commit/push yapılmadı.

## Sonraki doğrulama — 8 Ekim N4 çalışması

Bu notun ilk aşamasından sonra değişiklikler `56521c3` ile gönderildi. Son test edilen kaynak `731f528` için native MSSQL **20/20**, Windows **143/143**, genel **509/509** ve Chromium **133** kontrol başarılı. İki Yüksek eşikli audit kapısı geçti; backend'deki Orta `sprintf-js` uyarısı **hâlâ açık**. [Güncel N4 kanıtı](N4-NATIVE-WINDOWS-KANIT-YENILEME-2026-10-08.md). Önceki kısmi giderilme kararı değişmedi.
