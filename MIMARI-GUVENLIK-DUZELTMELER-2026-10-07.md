# 7 Ekim 2026 — Y4 liderlik kataloğu eşzamanlılık düzeltmesi

## Sonuç

Y4 yerel hedefli kontrollerle tamamlandı. Liderlik formu açıkken başka bir proje, risk veya planlanan tahsis güncellendiğinde kayıt artık gereksiz 409 almıyor. Liderlik/takım kataloğu gerçekten değiştiğinde açılış sürümü korunuyor, eski taslak reddediliyor ve kullanıcı güncel listeyi açıkça yükleyebiliyor.

Temel HEAD `05b99e5556aaa7e472e99923f492fc37eab3487f`, `main`; değişiklikler önceden var olan geliştirmelerle birlikte çalışma ağacında. Commit/push yapılmadı. Başlangıç bağlamı [5 Ekim raporu](MIMARI-GUVENLIK-INCELEME-2026-10-05.md), Y4 maddesi.

## Değişiklik

- `shared/directory-policy.ts`: `directory:shared` revision anahtarı ve katalog değişimi karşılaştırması. Liderlik adları/yöneticileri ve takım alanları kapsanır; liste sırası değişimi, proje, risk ve tahsisler kapsanmaz.
- `backend/store.mjs`: son doğrulamadan sonra, mevcut yazma transaction'ında katalog değişirse sayaç bir kez ilerletilir. İçe aktarım ve zincirleme takım değişiklikleri de bu noktadan geçer.
- `backend/operations.mjs`: yeni `catalogRevision` açılış değeri atomik kontrol edilir. Eski istemcilerin generation kontrolü korunur; eski kontrolün mesajı uygulama verisinin değiştiğini doğru belirtir. Güncel katalog çakışması “Liderlik veya takım listesi değişti” diye açıklanır.
- `backend/planning-writer.mjs`, `backend/read-records.mjs`: mevcut revision tablosunda ayrılmış `allocation/@directory:shared` kaydı gidiş-dönüş çevrilir. Tablo/şema/migration değişmedi; ilk normal katalog düzenlemesinde sayaç oluşur. API'ye doğrudan yeni bir değişiklik türü açılmadı.
- `restore`: içerik aynı olsa bile mevcut katalog revision'ı artırılır. Yedekten gönderilen büyük/eski sayaca güvenilmez; eski taslak geri yüklemeden sonra güncel hale gelemez.
- `useDirectoryEditor.ts`, `storage.ts`: açılış katalog revision'ı hem kaydet hem sil için taşınır; taslak otomatik güncel revision ile yeniden gönderilmez. Eski sunucuyla güvenli geçiş için açılış generation alanı da gönderilir.
- Mevcut admin yetkisi, bağlı kayıtların silinememesi, takım/resource revision zinciri, kullanıcı liderlik eşlemeleri ve audit korunur.

## Doğrulamalar

Komutlar öncesinde fixture/etki incelendi. Node 24.21.0; testlerin kendi oluşturduğu geçici SQL.js dosyaları, sentetik hesaplar ve rastgele loopback HTTP portları kullanıldı. Gerçek kullanıcıyla giriş, gerçek veritabanında test/restore/migration yapılmadı. Çocuk süreç ortamı PATH/TMPDIR/TEMP/TMP/LANG ile sınırlandı. Kurulu dependency cache yükleyicisi kullanıldı; domain kapısı için frontend'deki mevcut TypeScript paketini bulan geçici bir modül yükleyicisi kullanıldı.

| Kontrol | Sonuç |
|---|---|
| `node --test tests/record-access-http.test.mjs` | 7/7 geçti. İlgisiz proje/risk/tahsis, rol reddi, eksik/geçersiz sayaç, katalog çakışması, iki eşzamanlı admin, sil/yeniden ekle, eski istemci, rollback, aynı katalogla JSON restore ve yeniden açılış dahil. |
| `node --test tests/revision-read-scope.test.mjs tests/restore.test.mjs tests/store-persistence.test.mjs tests/planning-snapshot.test.mjs` | 39/39 geçti. Yeni revision için streaming/normal okuma ve SQL.js/MSSQL sorgu biçimi mock'u, kapsam, persistence, rollback, restore ve delta uyumluluğu. MSSQL mock'u native sunucu testi değildir. |
| `checkDirectoryManagement` sentetik tarayıcı koşusu | 5/5 grup geçti, page error yok. İlgisiz proje sonrası kayıt 200; uzak liderlik değişikliği sonrası 409; taslağın ve uzak verinin korunması; açık reload ile kayıt; mevcut seçim/scroll ve silme kontrolleri. |
| TypeScript `--noEmit -p frontend/tsconfig.json` | Geçti. |
| `node scripts/check-domain.mjs` | 34 shared dosyasında AST bağımlılık kapısı geçti. |
| `node frontend/build.mjs` ve `node scripts/verify-deployment.mjs` | Üretim derlemesi ve kaynak/çıktı eşleşmesi geçti. |
| Hedefli Prettier ve `git diff --check` | Geçti. |

Tarayıcı kanıt dizini: `aa-browser-checks-EqONOk`, işletim sisteminin geçici klasöründe. Kalıcı CI kanıtı değildir.

HTTP regresyon dosyası Windows kalite işine de eklendi. **GitHub CI, Windows ve Native MSSQL bu tur çalıştırılmadı.** Tam test/tarayıcı süiti veya gerçek yük testi koşulmadı; sonuçlar yukarıdaki kapsamla sınırlıdır.

## Uygulama klasörü

Y4'e ait backend/shared/frontend dosyaları ve doğrulanmış HTML/aktif JS-CSS dosyaları üstteki uygulama klasörüne de eşitlendi. Aktarım öncesinde iki kopyanın bu dosyalardaki farklarının yalnız Y4 değişikliği olduğu kontrol edildi. Uygulama bu tur başlatılmadı; yeni backend sonraki açılışta yüklenir. Gerçek veritabanı açılmadı veya değiştirilmedi. Bu sınırlı eşitleme Y6'daki dağıtım/başlatma kökü sorununu kapatmaz.

## Kalan sıra

1. **Y6 — yerel kontroller tamamlandı:** [dağıtım/başlatma düzeltmesi ve sentetik kabul kaydı](MIMARI-GUVENLIK-DUZELTMELER-2026-10-07-Y6.md).
2. **Y5 — Ortam kabul kanıtları:** güncel kodla Native MSSQL/Windows CI; kurum test ortamında proxy/TLS, yedekten kurtarma ve temsili yük. Önceki CI kanıtı yeni kod için otomatik geçerli sayılmaz.

Bu sonuç uygulamanın tüm güvenlik veya işletim koşullarının doğrulandığı anlamına gelmez.
