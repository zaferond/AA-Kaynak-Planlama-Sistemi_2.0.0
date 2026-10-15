# N1 — Silme doğrulaması ve gereksiz sürüm kayıtları

Tarih: 8 Ekim 2026. Taban: `main`, `42cd1ea`. İlgili bulgu: `MIMARI-GUVENLIK-PERFORMANS-INCELEME-2026-10-07.md`, **N1 / Orta**.

## Sonuç

**Giderildi — aşağıda belirtilen yerel kod ve sentetik SQL.js kapsamı.** Olmayan projelere ait 32 silme komutunun yeni revision satırları üretmesi artık engelleniyor. İlk geçersiz referans HTTP 404 ile reddediliyor; veriler, generation ve SQL revision tablosu değişmiyor. Hatalı bileşik anahtarlar/tarihler HTTP 400 ile reddediliyor.

## Değişiklikler

- `shared/allocation-key.ts`: planlanan, gerçekleşen ve yüzde tahsisleri için ortak anahtar ayrıştırma/doğrulaması. Son model doğrulaması ve silme komutları aynı sözleşmeyi kullanıyor.
- `backend/operations.mjs`: silme öncesinde takım/çalışan/proje referansları doğrulanıyor. Yetki ve revision kontrolü her zaman önce çalışıyor. Gerçekten boş hücrelerin silinmesi başarılı bir etkisiz işlem; yeni revision/tombstone oluşturmuyor. Sayısal sıfır mevcut kayıt olarak kabul ediliyor.
- Aynı koruma çalışma saati silme/otomatiğe dönüş (`null`) ve kişisel takvim silmeye uygulandı. Tarihler ortak 2000–2199 aralığına göre doğrulanıyor.
- Gerçek kayıt silindiğinde revision korunarak artırılıyor. Eski sürümle silme veya yeniden oluşturma 409; güncel sürümle yeniden oluşturma mümkün.
- `backend/store.mjs`: değişmeyen tahsis revision'ları küçük planlama yanıtından çıkarıldı. Böylece tekrarlanan silme sonrası istemcinin yanıtı birleştirememesi önlendi.

## Test ve doğrulama

Komutlar çalıştırılmadan önce fixture ve paket komutlarının etkileri incelendi. Ortam: macOS, Node 24.21.0, geçici SQL.js dosyaları, rastgele loopback portları ve sentetik hesaplar. `.env` yüklenmedi. Bağımlılıklar mevcut yerel önbellekten bir resolver ile çözüldü; paket kurulumu yapılmadı.

```text
node --import <geçici-loader> --test tests/record-access-http.test.mjs tests/planning-snapshot.test.mjs tests/actual-allocation-commands.test.mjs tests/calendar-commands.test.mjs tests/concurrency.test.mjs
```

**55/55 geçti; hata/atlama yok.** Yeni regresyonlar: özgün 32 komut, bozuk/eksik anahtar, geçersiz ay/gün, olmayan referans, başka kullanıcının kaydı, boş hücre/otomatik saat, sıfır kayıt, yüzde eşlik kaydı, tekrarlanan silme, eski revision, yeniden oluşturma, toplu işlem rollback ve doğrudan SQL revision kontrolü.

İlk test koşusunda yeni fixture'ın olmayan çalışana hesap bağlaması ve değişen no-op davranışıyla iki mevcut testte uyumsuzluk görüldü. Fixture düzeltildi; gerçek silme testine önce mevcut çalışma saati kaydı eklendi; delta yanıtındaki değişmemiş revision sorunu kodda giderildi. Yukarıdaki sonuç bu düzeltmelerin ardından tüm beş dosyanın yeniden çalıştırılmasına aittir.

- `node --import <geçici-loader> scripts/check-domain.mjs`: 35 shared modül, geçti.
- `node frontend/node_modules/typescript/bin/tsc --noEmit -p frontend/tsconfig.json`: geçti.
- Değişen altı kaynak/test dosyasında Prettier kontrolü: geçti.
- `node frontend/build.mjs` ve `node scripts/verify-deployment.mjs`: geçti.
- `git diff --check`: geçti.

## Sınırlar ve devreye alma

- Gerçek hesapla giriş, çalışan veritabanında test/temizlik/migration yapılmadı. Geçmişte oluşmuş revision satırları silinmedi; geçerli silme izlerinden güvenle ayrılmadan toplu temizlik yapılmamalı.
- Geçerli ama etkisiz silme başarılı bir işlem olarak mevcut Store akışından geçer; uygulamanın genel generation sayacı artabilir. Bu değişiklik snapshot/kilit maliyetini ortadan kaldırmaz; **N3** ayrı konudur.
- Native MSSQL/Windows üzerinde bu değişikliğin çalıştırıldığına dair yeni kanıt yok. SQL.js sonucu kurum kabulünün yerine geçmez.
- Dağıtım dosyaları güncellense bile açık Node süreci eski backend modüllerini kullanır. Düzeltme uygulamanın sonraki yeniden başlatılmasında etkinleşir; bu çalışma gerçek sunucuyu yeniden başlatmaz.
- Yeni commit/push yapılmadı. Sonraki öncelik **N2: bağımlılık uyarıları**.

## Sonraki doğrulama — 8 Ekim N4 çalışması

Yukarıdaki commit/native sınırlaması bu notun ilk yazıldığı aşamaya aittir. N1/N2 değişiklikleri `56521c3` ile gönderildi; son test edilen kaynak `731f528` için native MSSQL **20/20**, Windows **143/143**, genel testler **509/509** ve Chromium **133** kontrol başarılı. Native N1 silme/revision regresyonu da çalıştırıldı. [Güncel N4 kaydı ve kurum sınırları](N4-NATIVE-WINDOWS-KANIT-YENILEME-2026-10-08.md). Çalışan backend yeniden başlatılmadı.
