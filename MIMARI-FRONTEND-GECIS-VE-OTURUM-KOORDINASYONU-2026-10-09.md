# Frontend sekme, taslak ve çıkış koordinasyonu — 9 Ekim 2026

## Kapsam ve başlangıç

Başlangıç commit'i **`93c0dcad5cc3fab76287f826b83145a2a1e71cda`**, çalışma ağacı temizdi. Önceki toplu veri komutları adımının ardından frontend geçiş koordinasyonu incelendi. Backend, API, oturum transportu, shared iş kuralları, SQL, migration, bağımlılık sürümleri ve görünüm tasarımı değiştirilmedi.

`App.tsx` içinde sekme/default sekme durumu, risk taslağı leave guard'ı, düzenleme sinyali ve sekme/çıkış callback'leri `useWorkspaceNavigation.ts` içine ayrıldı. React'ten, DOM'dan, storage ve backend'den bağımsız `workspace-navigation.ts` yalnız pending geçişlerin sırasını/yaşam süresini yönetir; dış etkileri enjekte edilen callback'ler üzerinden yürütür. App 950 → 910 satır oldu; kalan render/view koordinasyonu tamamen ayrılmış değildir.

## Kanıtlanan hata ve dar düzeltme

Geçici SQL.js / sentetik hesap / loopback HTTP / headless Chrome ortamında eski **93c0dca** derlemesi üzerinde yeni tarayıcı regresyonu çalıştırıldı. İlk `/api/auth/logout` yanıtı bekletildiğinde iki Çıkış tıklaması **iki HTTP isteği** üretti; `An exit in flight must be shared` assertion'ı **2 !== 1** ile başarısız oldu. Gerçek hesap/veri kullanılmadı. Etki: yinelenen çıkış transportu ilk isteği iptal ederek gereksiz hata/yarış üretebilir. Bu, yetkisiz erişim kanıtı değildir.

Düzeltme, taslak kontrolünden logout yanıtına kadar aynı bekleyen Promise'i paylaşır. Başarısız çıkıştan sonra kilit kalkar; açık taslak ve oturum korunarak kullanıcı açıkça tekrar deneyebilir. Çıkış başladığında eski bekleyen sekme isteği geçersizleşir; çıkış sürerken yeni sekme/backup/restore leave kontrolü izin vermez. Önceden gönderilmiş HTTP isteğinin sunucuda iptal edildiği iddia edilmez.

## Korunan sınırlar ve çağrı zincirleri

- Sekme: `Tabs.onValueChange → hook.changeTab → risk leave guard → useRiskDraft.save → onSave → batch → storage.writeBatch → CAS API → setTab`. Yalnız son geçiş isteği uygulanır. Onay reddi, doğrulama hatası, 409/503 veya belirsiz sonuç taslağı ve sekmeyi korur; risk kaydetme/confirm/tek POST paylaşımı kendi modülünde kalır.
- Çıkış: `WorkspaceHeader.onLogout → hook.signOut → leave guard → captureSessionGuard → storage.logout → login ekranı reload`. Taslak beklemesinden önce/sonra ve son yan etkiden hemen önce oturum kontrol edilir. Başarılı logout'un kendi session context'ini geçersiz kılması beklenir; bu nedenle başarılı yanıt sonrası yalnız workspace yaşam süresi kontrol edilir.
- Başka sekmede hesap değişimi: mevcut `session-events → main.App reset → yeni Portal key` akışı değişmedi. Eski workspace'in pending devamları cleanup/lifetime ve session context ile durdurulur; eski hata yeni oturuma taşınmaz. React effect cleanup/yeniden aktivasyonu eski isteği canlandırmaz.
- Varsayılan sekme anahtarı/metni ve role göre seçenekler korunur. Sekme izni hem tıklamada hem taslak kaydından sonra kontrol edilir; bu frontend görünürlüğüdür, sunucu yetkilendirmesinin yerine geçmez.
- Backup/restore `createWorkspaceDataActions` aynı guard'ı kullanır; kendi son session kontrolü, dosya temizliği, restore generation kontrolü ve transport davranışı değiştirilmedi.
- Arka plan yenilemesinin risk editing ref/state sinyali korunur. Polling/transport/recovery ve editor opening revision sahipliği bu adımda yeniden yazılmadı.

## Yerel doğrulama

Yalnız Git archive ile oluşturulmuş geçici çalışma klasörü kullanıldı. Mevcut, kilit dosyaları aynı olan geçici dependency kurulumu kullanıldı; uygulama `.env`'i ve çalışan veritabanı okunmadı. Browser fixture kendi SQL.js dosyası, sentetik kullanıcıları ve localhost geçici portu oluşturur. Artifacts/log/screenshot'lar yalnız geçici klasördedir.

| Komut / yöntem | Sonuç |
|---|---|
| Eski derleme + yeni repeated-exit browser regresyonu | Beklenen başarısızlık: 2 isteğin 1 olması bekleniyordu; uygulama hatası yeniden üretildi |
| `node --test --test-reporter=tap tests/workspace-navigation.test.mjs tests/storage-order.test.mjs tests/http-transport.test.mjs tests/domain-boundaries.test.mjs` | **63/63**, fail/skipped/cancelled 0; 14 yeni coordinator testi |
| `npm run check:domain` | 35 shared kaynak, recursive AST sınırı geçti |
| `npm run format:check` | Geçti |
| `npm run build` | TypeScript/Vite geçti; yalnız geçici site/.compiled/manifest yazıldı |
| `node scripts/check-deployment-package.mjs` | **396 kaynak / 7 güncel çıktı**, 404 tarihî çıktı geçici temiz pakete alınmadı |

Yeni unit testleri geçiş tamamlanma sırası, son iptal edilmiş isteğin eski isteği canlandırmaması, izin değişimi, rejected guard, mikro görevler arasındaki oturum değişimi, tekrar çıkışın tek Promise/isteği, başarısız çıkışın tekrar denenmesi, unmount/yeniden activation ve başarılı logout sonrası beklenen reload'u kontrol eder. Genel Linux `tests/*.test.mjs` keşfine ve Windows sentetik süitine eklendi. Yeni browser regresyonları genel CI runner'a eklendi.

Yeni workspace-navigation (2), mevcut risk-save-confirmation (4), risk-concurrency (7), session-consistency (7) ve import-restore (7) kontrolleri aynı geçici fixture içinde yürütüldü: **27/27 tarayıcı kontrolü geçti**, pageerror yok. Yinelenen logout artık bir istek; sentetik 503 sonrası tekrar çıkış başarılı. Bekleyen tek risk POST'u son sekmeye geçer; save 503 veya confirm reddi logout göndermez ve taslağı korur. Test edilen derleme geçici `npm run build` çıktısıdır.

## İlk CI koşusu ve fixture temizliği

Kaynak **`5fca2a8b61e46bac5d597e8c7ffdf26774edebca`**, [kalite koşusu 37910297298](https://github.com/zaferond/AA-Kaynak-Planlama-Sistemi/actions/runs/37910297298): Windows **238/238** ve Ubuntu **588/588** test geçti. Genel tarayıcı süiti başarısız oldu: `scripts/browser-checks/risk.mjs:94` ilk riskin stratejisini `Kontrol` beklerken boş buldu. Yeni navigation kontrolünün oluşturduğu sentetik risk ortak fixture'da kalmıştı; sonraki risk kontrolü ilk kaydı kendi kaydı olarak kullanıyordu. İlk yerel 27 kontrol bu numaralandırma kontrolünü içermiyordu; bu eksiklik açıkça kaydedilir. [Başarısız koşunun güvenli metadata/test toplamları/log hash kanıtı](ci-evidence/quality-5fca2a8-receipt.json).

Düzeltme yalnız yeni browser kontrolünün `finally` bloğuna kendi oluşturduğu sentetik risk için mevcut CAS delete temizliği ekler. Gerçek ortam/veri kullanılmaz, başka testlerin kayıtları silinmez, revision tombstone'ları ve audit korunur. Açılış risk listesiyle temizlik sonrası liste eşitliği denetlenir. **Navigation (2) + mevcut risk kontrolleri (11) art arda 13/13 geçti**, pageerror yok. Uygulama JS davranışı bu fixture düzeltmesiyle değişmedi. Bu 13 kontrol ilk 27 ile örtüşür; toplam olarak toplanmaz.

## Sınırlar ve kalan işler

Bu çalışma uygulamanın tümü için güvenlik/stabilite veya gerçek kurum ortamında kabul kanıtı değildir. Native MSSQL bu kaynak için yeniden çalıştırılmadı. Backend Orta bağımlılık uyarısı, N3 full snapshot/global lock maliyeti, N6 canlı yayın/eski bundle saklama ve kurum Windows servis/ACL/CA/proxy/TLS/yedek/yük kabulü devam eder. Yeni bir SQL işlemi eklenmedi; bu adım için yeniden geniş native koşu yapılmadı.

Sıradaki dar frontend çalışma: `usePortalRefresh` arka plan yenilemesinin effect yaşam döngüsü, geciken callback'ler ve düzenleme sırasında okuma koordinasyonu. Önceden ayrılmış data/editor/filters/view/grid/menu modülleri yeniden ayrılmayacak.

## CI kanıtı ve aktarım kontrolü

Test edilen kaynak **`8e29bc2093f2310bd6bca694b5d998ece05d9e50`**. [Kalite koşusu 37910942963](https://github.com/zaferond/AA-Kaynak-Planlama-Sistemi/actions/runs/37910942963) başarılı: **Ubuntu 588/588**, **Windows 238/238**, **Chromium 143 kontrol**. Fail/skipped/cancelled 0; Windows ile genel süit örtüşür ve toplamlar toplanmaz. Biçim/domain/TypeScript/build/manifest, iki işletim sisteminde temiz paket kabulü ve iki audit Yüksek eşiği geçti. Audit eşiği mevcut backend Orta uyarısını kapatmaz.

[Güvenli metadata, test toplamları ve indirilen log hash kaydı](ci-evidence/quality-8e29bc2-receipt.json). Ham loglar veya bağlantı bilgileri Git'e eklenmez. Kanıt/dokümantasyon commit'i üretim kodunu değiştirmez; ayrı tam CI koşusu iddiası değildir.

Uygulama klasörüne aktarım kontrolü önceki manifest ve dosya hash'lerini, yerel değişikliklerin korunmasını ve doğrulanmış geçici derlemeyle **396 kaynak / 411 site çıktısı / 7 güncel çıktı** eşitliğini denetler. Doğrulanmış yeni JS ve index plain/gzip çıktıları seçilerek aktarılır; tarihî bundle'lar silinmez. Seçilen dosyalar geri alınabilir yedekle aktarılır, manifest en son yazılır. Yedek konumu: `.deployment-backups/2026-10-09-workspace-navigation-final`. Bu işlem servis yeniden başlatması veya çalışan veritabanına işlem içermez.
