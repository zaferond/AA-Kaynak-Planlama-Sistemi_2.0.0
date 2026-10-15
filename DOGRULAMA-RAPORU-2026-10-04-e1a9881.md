# Güvenlik, mimari ve performans düzeltmelerinin yeniden doğrulanması

**Tarih:** 4 Ekim 2026 · **İncelenen kaynak:** `e1a98810b3f50ae8d1d35de11cdcb97520232809` · **Yöntem:** Salt okunur kaynak/Git/CI incelemesi ve geçici kopyada mevcut sentetik testler.

## 1. Yönetici özeti

Önceki B1–B6 bulgularının ve 3 Ekim raporundaki dokuz düzeltmenin temel davranışları güncel kaynakta izlenebiliyor. Bu incelemede B1–B6'yı yeniden açmayı gerektiren kanıt bulunmadı. İlgili mevcut testlerden **126/126** geçici kaynak kopyasında geçti. Bu sonuç tüm olası güvenlik açıklarının yokluğunu kanıtlamaz.

Güncel HEAD'in GitHub kalite koşusu başarılı: **426 genel test, 77 Windows sentetik test ve 69 Chromium kontrol grubu**. Önceki native MSSQL koşusu da **19/19** başarılı. Native koşu farklı commit'tedir; artifact'ın kapsadığı **48 kaynak dosyasının hash'i güncel HEAD ile aynı**. Bu eşleşme, sonradan değişmiş HTTP/proxy ve Windows başlatma kodunun native koşuda sınandığı anlamına gelmez.

Önemli kalan işler dağıtım ve kurum kabulidir: hangi kaynak/derleme kopyasının çalıştırıldığını doğrulamak; ayrı Windows ortamında servis/ACL ve kapanma–yeniden başlama davranışı; kurum SQL hesabı, CA/TLS/proxy; yedekten geri dönüş ve hedef yük kabulü. Bunlar bir uygulama açığı bulunduğu için açık değildir; gerekli gerçek ortam kanıtı elde edilmediği için açık tutulmuştur.

Yeni doğrulanmış konu **operasyon kılavuzlarının güncel HTTPS önkoşullarını tek yerde tam aktarmaması**dır (DÜŞÜK). İki kaynak kopyası arasında daha önce kaydedilen başlatıcı/belge farkına, frontend manifest/lock dosyasındaki sürüm aralığı farkı da eşlik ediyor; çözümlenmiş paket sürümlerinin farklı olduğu gösterilmedi. Çalışan sürecin güncel backend'i ve güncel arayüzü yüklemiş olduğu doğrulanmadı.

İlk uygulanabilir yazılım geliştirmesi olarak **kaynak ve derleme hash'lerini birlikte kaydeden, veritabanına bağlanmadan dağıtım tutarlılığını denetleyen bir komut** öneriyorum. Kurum kabulüne başlamadan hangi paketin doğrulandığını somutlaştırır. Bu rapor tamamlanana kadar kaynak, Git ve gerçek veri değiştirilmedi. Kullanıcının sonradan verdiği “rapordan sonra ilk geliştirmeye devam et” talebi, sonraki ayrı çalışma aşamasını yetkilendirir; bu raporun test edilmiş temelini değiştirmez.

## 2. İnceleme bağlamı ve otoritatif kopya

- Otoritatif Git deposu: `AA Kaynak Planlama Sistemi_1.0.0/AA Kaynak Planlama Sistemi`.
- Branch `main`; yerel HEAD ve yerel `origin/main` referansı `e1a98810b3f50ae8d1d35de11cdcb97520232809`. GitHub'ın aynı SHA için başarılı koşusu ayrıca doğrulandı; `fetch`, commit ve push yapılmadı.
- İnceleme başlangıcında ve rapor oluşturulmadan önce `git status --porcelain=v1` boştu.
- Üst klasör ayrı çalıştırılabilir kopyadır; kanıtlar sessizce birleştirilmedi. Güncel kod kanıtları Git deposuna aittir.
- Proje/üst dizin çalışma talimatları arandı; uygulanabilir `AGENTS.md` bulunmadı. Paket komutları, CI ve kullanılan test fixture'ları çalıştırılmadan önce incelendi.

### Okunan istenen belgeler

Aşağıdaki dokuz belgenin Git'teki içerikleri HEAD ile; üst klasör kopyaları da Git'teki belge içerikleriyle birebir eşleşiyor. Aynı belge içindeki farklı tarihlerde eklenmiş durum ifadeleri güncel kabul yerine tarihsel bağlam olarak değerlendirildi.

| Belge | Satır | SHA-256 |
| --- | ---: | --- |
| MIMARI-GUVENLIK-YENIDEN-INCELEME-2026-10-02.md | 209 | `9307910dd6d9cc9c85e031bbd53c7a118d988a09000fee3d4552351c6e5fd820` |
| MIMARI-GUVENLIK-DUZELTMELER-2026-10-03.md | 319 | `ac25b455e5dbae5f84656f0005e37b22a09fb25f920b739a3db311fd584dd7e8` |
| MIMARI-IYILESTIRMELER-2026-10-01.md | 740 | `893a66a8e76e109d50f9e5ba93038fbae1295f4582624c3458535d44c2f64464` |
| PERFORMANS-OLCUMU-2026-10-01.md | 630 | `f6c793c8c5c6d1db979ec797eb13365558837811163a471d216a2fe5a9bdaf69` |
| MSSQL-CI-DOGRULAMA-2026-10-04.md | 72 | `f2a646eba3f0f31e06082418498bf0dcb9955742e699fd03dff230efd065752f` |
| WINDOWS-BASLATMA-DOGRULAMA-2026-10-04.md | 55 | `176b17f7a7b44e2ec5ff2369e91c55981c3195fa42541da410871a6f93a98407` |
| WINDOWS-BASLATMA-VE-SERVIS-KILAVUZU.md | 45 | `aa1d91bfe7b8066916c67e625ba9d81c2db04100c1aab8c632e0fa8c5ba51bcd` |
| MSSQL-TEST-KILAVUZU.md | 55 | `873fec2b1092df263bea8eff1377b2e35303a4884be812bd28ffcabe52d57c81` |
| IT-MSSQL-GECIS.md | 168 | `f04b038dd666b2436350df050faf965ed36994ca4800a9042c7669093d21c357` |

Ek bağlam: `PROXY-TLS-DOGRULAMA-2026-10-04.md`, `GIRIS-KORUMASI-VE-PROXY.md`, paket dosyaları, Windows başlatıcıları ve güncel workflow'lar. Belgelerdeki hesap örnekleri rapora alınmadı.

### Çalıştırılabilir kopyadaki doğrulanmış farklar

Git başlatıcısında [baslat-windows.cmd:22–25](/Users/beyzakap/Desktop/AA Kaynak Planlama Sistemi_1.0.0/AA Kaynak Planlama Sistemi/baslat-windows.cmd:22) build ve ardından start var. Üst kopyada build çağrısı ve hata kontrolü yok. Üst `ONCE-BUNU-OKUYUN.md`, frontend ci/build adımlarını içermiyor; sonraki açılış için yalnız start öneriyor. Bu farklar Windows raporunda zaten kaydedilmişti; yeni açık olarak sayılmadı.

Üst frontend `package.json` ve `package-lock.json` kök paket girdisinde `@types/react-dom` sürüm aralığı `^19.2.3`; Git'te `19.2.3`. Lock'un çözümlenmiş bağımlılık kayıtlarında farklı sürüm bulunmadı. Bu bir güvenlik açığı kanıtı değildir; kopyaları özdeş ilan etmeye engeldir. Tam üst klasörün tüm dosyaları için bir eşitlik sonucu iddia edilmiyor. Odaklı karşılaştırmada app/http-config/Store/MSSQL adapter/schema/setup/ensure-dependencies, App/storage/access ve kök lock birebir eşleşti. Kurulu modüller, `site/` ve çalışan Node sürecinin yüklediği sürüm bu karşılaştırmanın dışında kaldı.

## 3. Önceki bulguların güncel durumu

“Doğrulandı”, belirtilen düzeltme ve test kapsamına aittir; kurum üretim kabulü anlamına gelmez. Aşağıdaki testler yeni yazılmadı; ilgili yerel alt küme ve güncel CI sonuçları kullanıldı.

| Bulgu/başlık | Önceki durum | Güncel sonuç | Kanıt | Kalan risk |
| --- | --- | --- | --- | --- |
| **B1 risk taslağı/eski revision** | 2 Ekim açık; 3 Ekim düzeltildi | **doğrulandı** | `features/risk-table/useRiskDraft.ts:29–31,65–78,80–118`: açılış değeri + revision birlikte saklanıyor; save yakalanmış revision ile gidiyor. `App.tsx:657–670` revision'ı batch'e geçiriyor; `operations.mjs:165–169` 409. Chromium `risk-concurrency.mjs` güncel CI'da çalıştı. | Otomatik birleştirme yapılmıyor; çatışmada kullanıcı onayıyla yeniden yükleme gerekiyor. Gerçek ağ/saha davranışı ölçülmedi. |
| **B2 eksik migration/şema içeren yedek** | Açık → düzeltildi | **doğrulandı** | `migration-catalog.mjs:56–74` bilinen ve zorunlu sürümler; `maintenance-snapshot.mjs:68–116` integrity/FK/history/contract; `schema-contract.mjs:98–113` sütun/tip/default/key/FK/unique/CHECK. `data-maintenance` ve `migration-policy` yerel testleri geçti. | Bu tam yedek doğrulayıcısı SQL.js içindir; native kurum SQL yedeği ve restore operasyonu ayrıca kabul edilmelidir. |
| **B3 Excel uzun metin/hücre sınırı** | Açık → düzeltildi | **doğrulandı** | `xlsx-cells.ts:3–25,36–78`; `project-info-report-export.ts:44–69` kayıpsız devam satırları; XML `inlineStr`. Yerel `xlsx-cell-limits`, `xlsx-workbook`, `project-info-report` geçti. | Gerçek Excel uygulamasında açma/render/print bu tur yapılmadı; üç örnekle üretim kapasitesi çıkarılmaz. |
| **B4 kişinin liderlik dışına taşınan kendi kaydı** | Açık → düzeltildi | **doğrulandı** | `shared/access.ts:101–120` ownId istisnası, diğer kişiler için maskeleme; `operations.mjs:139–164` yalnız kendi actual yetkisi. `actual-visibility`, `record-access-http` geçti; UI `entity-editors.mjs:165` senaryosu güncel CI'da. | Tüm kişiler birbirinden tamamen ayrı tenant değildir: projeler/riskler ortak görüntülenir, anonim takım toplamları iş kuralıdır. |
| **B5 işbaşı tarihi zorunluluğu** | Açık → düzeltildi | **doğrulandı** | `shared/resource-policy.ts:4–58`; `server-domain.ts:305–318`; `editor-commands.ts:109,167`. Domain/editor/restore testleri geçti. | Tarihsiz eski çalışma dönemi yalnız tanımlı değişmeme koşuluyla korunur; bu istisna sınırsız yeni kayıt kabulü değildir. |
| **B6 başka sekmede oturum değişimi** | Açık → düzeltildi | **doğrulandı** | `storage.ts:31–100,168–220`, `session-events.ts`, `main.tsx:41–84`: epoch, identity, BC/storage bildirimi, Portal yeniden kurulması. Yerel `storage-order`; CI `session-consistency` geçti. | Sekmeler arası bildirim/focus/poll tarayıcı mekanizmalarına bağlı; çevrimdışı sekmenin anında yeniden doğrulandığı iddia edilmiyor. |
| **3 Ekim #1 diğer entity editor revision'ları** | Düzeltildi | **doğrulandı** | `editor-state.ts`, `editor-revisions.ts`; `usePortalEditor.ts:52–79,128–154,235–247,276–302`; `editor-commands.ts:35,69,90,118,122,149,172`. Yerel editor testleri ve CI entity-editor 409/delete senaryoları. | Uzun süre açık formlar çatışabilir; taslak korunur ve yeniden yükleme gerekir. B1 ile aynı aile, ayrı yeni bulgu sayılmadı. |
| **3 Ekim #2 geçici okuma hatasında taslak** | Düzeltildi | **doğrulandı** | `usePortalData.ts:20–36` transient/auth ayrımı; `main.tsx:33–38`; CI entity/risk/calendar 503 ve retry senaryoları. | Taslaklar oturum değişimi/sona ermesi halinde kasıtlı temizlenir; kalıcı çevrimdışı taslak deposu değildir. |
| **3 Ekim #3 bozuk parola kaydı bulunan yedek** | Düzeltildi | **doğrulandı** | `auth.mjs:12–19,41–55` hex format/uzunluk; `snapshot-model.mjs:38` tüm hesaplar; `maintenance-files.mjs:87,212` hem oluşturma hem verify. Yerel bakım testleri. | Format kontrolü parolanın kullanıcı tarafından bilindiğini veya kurum parola politikasını kanıtlamaz. |
| **3 Ekim #4 bilinmeyen migration / fingerprint** | Düzeltildi | **doğrulandı** | `schema-migrations.mjs:18–42`, `migration-catalog.mjs:56–109`; 0/31/999 reddi ve tarihsel whitelist testleri. | Native eski kurum veri tabanlarının her olası sürümü sınanmadı; migration öncesi yedek/geri dönüş gerekir. |
| **3 Ekim #5–7** | Excel/own-resource/date düzeltildi | **doğrulandı** | Sırasıyla B3/B4/B5 satırları; aynı kök nedenler tekrar sayılmadı. | Katman ve kurum kabul sınırları yukarıdakiyle aynı. |
| **3 Ekim #8 risk enum/root-admin tekrarı** | Ortak politika kuruldu | **doğrulandı** | `shared/risk-policy.ts`, `shared/access.ts:21`; backend schema ve risk UI/export import'ları. Yerel `risk-policy` geçti. | Görsel etiket/Excel yardım metni gibi bazı literal metinler mevcut; ayrı iş kuralı veya yetki atlama gösterilmedi. |
| **3 Ekim #9 browser kontrolleri CI dışında** | CI'ya taşındı | **doğrulandı** | `.github/workflows/quality.yml:3–4,22–27`; güncel push koşusunda 69 kontrol. | Chromium/Linux; tüm tarayıcı/işletim sistemi kombinasyonları değildir. Native ayrı schedule/dispatch, her PR zorunlu kapısı değil. |
| **App/Store sorumluluk ayrımı** | Hook/repository/service ayrıştırıldı | **doğrulandı** | App → data/editor/refresh/workspace hook'ları; Store → identity/planning-reader/planning-writer. AST: 194 dosya/401 bağımlılık; uygulama katmanı → shared, ters yönde bağımlılık saptanmadı. | AST göreli statik runtime import/export ve literal dynamic import kapsamındadır. İş sorumluluğunu yalnız grafikten çıkarmadım; ilgili çağrılar da okundu. |
| **Ortak Excel paketleme katmanı** | Altı writer ayrıştırıldı | **doğrulandı** | `xlsx-workbook.ts:35–113` paketleme; `xlsx-cells.ts`; `xlsx-zip.ts`; altı export modülü ortak workbook kullanıyor. | Raporun formül/stil/kolon bilgisi writer'larda kalır. Bu kontrollü farklılık tek başına kod tekrarı kusuru değildir. |
| **Tek final validation/changeset/snapshot/delta** | Optimize edildi | **doğrulandı** | `change-service.mjs`; `Store.mutate:158–279`: fresh actor + final validation + tek transaction; planning delta koşullu. Yerel `planning-snapshot` rollback/disk/response/revision/merge testleri geçti. | Yazma tam model okuma/validation ve global exclusive lock içeriyor; throughput sınırı hedef yükle ölçülmeli. |
| **Rol bazlı SQL okuma/revision kapsamı** | Optimize edildi | **doğrulandı** | `planning-reader.mjs:137–173`, `read-records.mjs`; yerel planning/revision scope testleri, native BIN2/wildcard/900–901 testleri. | Yalnız plan tahsisleri ve ilgili revision'lar daralır; actual/calendars/project/resource okumaları tamamen role göre SQL'de daralmış değildir. |
| **HTTP gzip/ilk yük** | Gzip/no-store optimize edildi | **kısmen doğrulandı** | `data-response.mjs` async gzip, negotiation/identity fallback; `Store.view` rol kapsamı; güncel CI data-response testleri. | İlk yük hâlâ snapshot/JSON üretir. WAN/browser/memory/GC ve kurum kapasitesi ölçülmedi. |
| **1 Ekim performans yüzdeleri** | Sentetik önce/sonra raporlandı | **kısmen doğrulandı** | Betiklerin fixture, karşılaştırma/assert ve profil seçenekleri güncel. Küçük güncel SQL.js smoke geçti; native artifact ayrı aşağıda. | Tarihsel tüm boyutlar/karşılaştırma çiftleri yeniden koşulmadı; eski yüzdeler bu tur bağımsız doğrulanmış veya üretim kazanımı sayılmadı. |
| **Native MSSQL “bekliyor” ifadeleri** | Eski belgelerde açık; 4 Ekim başarılı | **değişmiş** | Erişilen nihai native run, artifact ve 48/48 hash eşleşmesi; 19/19 başarı. | Kurum CA/hesap/gerçek veri/Windows kabulü hâlâ doğrulanamadı; yeni HTTP/başlatıcı kodu eski native run kapsamı dışında. |
| **Windows başlatıcı düzeltmeleri** | Sentetik cmd/npm/cwd/include-dev düzeltildi | **doğrulandı** | `baslat-windows.cmd:2–25`, `ensure-dependencies.mjs:8–12,35–63`; güncel Windows işi 77/77. | Npm/build/start stub'ları gerçek Windows servis süreci veya ilk gerçek kullanıcı TTY kurulumunu kanıtlamaz. |
| **Üst kopya / gerçek çalışan sürüm** | Başlatıcı/belge farkı kaydedildi | **kısmen doğrulandı** | Önceden kaydedilen no-build farkı hâlâ var; ayrıca frontend sürüm aralığı farkı görüldü. Odaklı kaynak karşılaştırması yukarıda. | Kurulu node_modules, site ve çalışan süreç sürümü doğrulanamadı; üretim sürümü eşitliği sonucuna varılmadı. |
| **Proxy/TLS son düzeltmeleri** | 4 Ekim kaynak tarafı tamamlandı | **doğrulandı** | `http-config.mjs:5–48`, `app.mjs:37–73`; yerel http-config/proxy-transport geçti, güncel Ubuntu CI gerçek sentetik TLS testi de içeriyor. | Güvenilen proxy'nin header overwrite/firewall ve kurum sertifika zinciri gerçek ortamda kabul edilmeli. |

“Tekrar açıldı” olarak sınıflandırılacak önceki bulgu saptanmadı.

### Güvenlik sınırlarının çağrı zinciri kontrolü

| Alan | Kontrol edilen davranış ve kapsam |
| --- | --- |
| Kimlik doğrulama / oturum | `app.mjs:107–175` login schema, limiter, scrypt, random cookie, digest oturum kaydı, active/userVersion ve CSRF; `identity-repository.mjs:75–105` expire/revoke. `publicUser` parola/hash/version taşımaz. 12 saat / remember 30 gün süreleri politika tercihidir, ayrı açık diye sayılmadı. |
| Yetki / kullanıcı ayrımı | Endpoint admin kontrolleri + Store transaction içinde fresh actor + `operations` record-level kararları + `scopeData` çıktı maskesi izlendi. Normal kullanıcı başkasının person calendar/actual kaydına yazamaz; risk ekleme herkes için, sahiplik backend'de atanır. Manager/admin risk düzenleme kapsamı kullanıcının önceki talebine uygundur. |
| CSRF / transport / cache | Tam normalized origin + `X-Requested-With`, sonra oturum CSRF; HttpOnly/SameSite/Secure, HTTPS `req.secure`, explicit trust peer; API `no-store`. CSP `unsafe-inline` yalnız style içindir; metin React/Excel escape ile üretilir. |
| SQL | Adapter'da `.input` binding, upsert/delete için fixed catalog/identifier allowlist + JSON parametresi; kullanıcı ID/metni SQL'e yapıştırılmıyor. Migration sabit kaynak SQL'dir. `schema-contract` metadata adlarını quote ediyor; bu kod canlı sorgu endpoint'i değil. |
| Restore / snapshot | API admin + generation 409 + Store fresh actor/validation/tek transaction; restore revision/tombstone ilerletiyor. Tam SQL.js bakım yedeğinde schema/model/password doğrulama, özel staging/exclusive write/hash/verify/publish; recovery yalnız yeni kopyada oturumları kaldırıyor. Gerçek DB'de hiçbirini çalıştırmadım. |
| Limit / hata / audit | Login gövdesi 4 KB, auth sonrasında normal 2 MB/bulk 20 MB. MSSQL ortak deneme sayacı ayrı bucket lock kullanır; kesintide 503, memory fallback yok. 500/constraint yanıtları genel; request log'u method/path/error type içerir. Audit değişiklik alanları kaynakta izlendi; gerçek log/cache/yedek dosyaları içerik taramasına alınmadı. |
| Excel formül enjeksiyonu | Kullanıcı metinleri `inlineStr`/XML escape; risk formülleri writer'ın kendi hücre referanslarından üretilir. Başına `=,+,-,@` gelen metin formül olarak yazılmaz. Gerçek Excel engine/kurum makro ayarları sınanmadı. |

## 4. Yeni bulgular

| # | Önem | Dosya ve satırlar | Bulgu | Etki/önkoşul | Kanıt ve güven |
| --- | --- | --- | --- | --- | --- |
| N1 | **DÜŞÜK** | `IT-MSSQL-GECIS.md:27–41,83,155–159`; `backend/app.mjs:43–58`; `MSSQL-TEST-KILAVUZU.md:55` | Operasyon belgeleri güncel HTTPS transport koşulunu tek ve eksiksiz bir kurulum akışında vermiyor. HTTPS örneğinde trust proxy yok; son ek trust/X-Forwarded-For'u anlatıyor fakat gerekli `X-Forwarded-Proto: https` koşulu bu kılavuzda yok. Eski native “doğrulanmadı” ifadeleri yeni CI raporuyla tarih etiketi olmadan yan yana duruyor. | Operatör bu kılavuzu tek başına uygulayıp HTTPS proxy kurulumu yaptığında güncel guard 403 verir. Yetki atlama veya veri kaybı gösterilmedi; risk kurulum/kabulün yanlış tamamlandı sayılması veya gereksiz arıza aramasıdır. | Kaynak guard doğrudan incelendi; yerel proxy-transport testleri eksik/http/güvenilmeyen forwarding durumunu reddediyor. Kurum proxy'sinde yeniden üretim yapılmadı. **Yüksek güven.** Dar öneri: tek HTTPS önkoşul bölümü ve güncel proxy/CI kılavuzuna bağlantı; tarihsel ifadeleri tarih/kapsamla işaretlemek. B1–B6'dan ayrı belge tutarlılığı konusudur. |

Yeni KRİTİK/YÜKSEK/ORTA uygulama açığı kanıtlanmadı. Bu ifade tam bir saldırı testi veya üretim güvenliği sertifikası değildir. Üst kopyanın no-build farkı eski raporda bulunduğundan N1'e yeni uygulama açığı olarak eklenmedi. Frontend sürüm aralığı farkı da çözümlenmiş paket güvenlik farkı gösterilmediği için açık olarak sınıflandırılmadı.

## 5. Doğrulama günlüğü ve ölçümler

### Bu tur çalıştırılan yerel doğrulamalar

| Komut/işlem | Hedef ve etki | Sonuç |
| --- | --- | --- |
| `git status --porcelain=v1`, `git rev-parse HEAD`, `git branch --show-current`, `git ls-files`, commit dosyası/hash ve native commit → HEAD dosya listesi | Otoritatif Git; yalnız okuma | HEAD/branch/temiz ağaç doğrulandı. Sonraki HTTP/başlatma dosyaları eski native kapsamından ayrıldı. |
| Dokuz belge için byte/hash karşılaştırması; odaklı üst kopya diff ve manifest/lock JSON karşılaştırması | Yalnız seçili kaynak/belge dosyaları; `.env`/DB/log okunmadı | Belgeler aynı. Başlatıcı/belge ve frontend sürüm aralığı farkları yukarıda. |
| GitHub run/jobs/artifact/log summary GET'leri | Yalnız repo Actions API; token çıktıya/dosyaya yazılmadı; redirect'te auth taşınmadı | Güncel kalite/native sonuçları, tarih/SHA ve test sayıları doğrulandı. Workflow dispatch yapılmadı. Ham CI log'ları yeni çıktılara kaydedilmedi. |
| TypeScript AST import/export analizi | HEAD'den alınmış geçici kaynak kopyası; uygulama modülleri yürütülmedi | 194 dosya, 401 edge; backend→shared 16, frontend→shared 51; ters bağımlılık ve birden fazla modüllü cycle yok. 6 JSON/CSS import'u kod graph'ı dışında; nonliteral dynamic import bulunmadı. İlk analiz komutu yardımcı betik syntax hatasıyla hiç analiz yapmadan durdu; komut düzeltilince sonuç elde edildi. Bu uygulama hatası değildir. |
| Aşağıdaki mevcut test alt kümesi | Yeni Git archive kopyası, allowlist runtime env + `NODE_ENV=test`; gerçek `.env`, DB_/TEST_DB_ ve hesap ortamı aktarılmadı. Testlerin kendi geçici SQL.js dosyaları/sentetik kullanıcıları; HTTP yalnız rastgele yerel test portları. MSSQL environment testinde fake adapter/lease; gerçek SQL bağlantısı yok. | **126 test / 126 pass / 0 fail / 0 skip**, 10,12 sn, Node 24.21.0. |
| Aşağıdaki SQL.js benchmark smoke | Ayrı `os.tmpdir()` sentetik DB, explicit SQL.js provider; mevcut çıktı üzerine yazmayan yeni JSON yolu | Exit 0; snapshot, generation, revision, audit ve delta merge assertion'ları geçti. Tarihsel hız yüzdeleri yeniden ölçülmedi. |

Test komutu (çalışma dizini geçici `source/`):

```sh
node --test --test-reporter=tap \
  tests/editor-commands.test.mjs tests/migration-policy.test.mjs \
  tests/data-maintenance.test.mjs tests/resource-policy.test.mjs \
  tests/actual-visibility.test.mjs tests/record-access-http.test.mjs \
  tests/storage-order.test.mjs tests/restore.test.mjs \
  tests/xlsx-cell-limits.test.mjs tests/xlsx-workbook.test.mjs \
  tests/project-info-report.test.mjs tests/risk-policy.test.mjs \
  tests/planning-snapshot.test.mjs tests/planning-read-scope.test.mjs \
  tests/revision-read-scope.test.mjs tests/mssql-test-environment.test.mjs \
  tests/http-config.test.mjs tests/proxy-transport.test.mjs
```

Benchmark komutu, mevcut betik ve yeni owned çıktı yolu:

```sh
node scripts/benchmark-store.mjs --sizes=1000 --samples=3 \
  --resources=20 --actuals=200 --percentages=100 --calendar-days=20 \
  --audit-events=100 --response=delta --validation=single \
  --snapshot-copy=numeric --output=<bu-incelemeye-ait-yeni-dizin>/sqljs-smoke.json
```

Fixture/safety kontrolü: `benchmark-store.mjs:13–57,270–296,382–385,559–567` explicit geçici SQL.js, profil limitleri, final view/revision/generation/audit eşitliği, exclusive output; `benchmark-load.mjs` scoped view/gzip/body doğruluğunu assertion ile kontrol ediyor; `benchmark-fixture.mjs` kayıt sayısını doğruluyor. Load/actual-month benchmark'ları bu tur yeniden çalıştırılmadı.

Yerel smoke: 1.000 plan tahsisi, 20 kaynak, 200 actual, 100 yüzde girişi, 20 kişi-takvim günü, 100 başlangıç audit'i, üç örnek. Median pipeline **16,67 ms**, read **4,10 ms**, file commit **5,26 ms**, persist **1,13 ms**; DB **507.904 byte**, delta yanıtları **276–277 byte**. Her örnekte bir snapshot read; final model eşitliği geçti. Üç örnek için betiğin ürettiği percentile alanı üretim p95'i olarak raporlanmadı. Bu küçük profil başka tarih/sistem/veri boyutuyla hız karşılaştırması değildir.

### Erişilen CI kanıtı

| Koşu | Tarih (UTC) / SHA | Doğrulanan sonuç ve sınır |
| --- | --- | --- |
| [Güncel kalite 37196243704](https://github.com/zaferond/AA-Kaynak-Planlama-Sistemi/actions/runs/37196243704) | 2026-10-04 10:42:37 → 10:45:27; `e1a98810b3f50ae8d1d35de11cdcb97520232809` | Ubuntu verify/browser/audit ve Windows synthetic success. Log summary: 426/426 genel, 77/77 Windows, 69 browser grubu. Root/frontend npm audit çıktısında 0 bilinen vulnerability; bu veri yalnız o koşu ve kilitli dependency setine aittir. |
| [Nihai native 37186385433](https://github.com/zaferond/AA-Kaynak-Planlama-Sistemi/actions/runs/37186385433) | 2026-10-04 07:38:09 → 07:39:04; `63780fc4538829c16c7b14739f882a9851629f59` | 19/19 pass; schema 30; Node 24.21.0, SQL Server Developer 16.0.4295.3, compatibility 160; cleanupVerified true. |
| [Native artifact 11296584539](https://github.com/zaferond/AA-Kaynak-Planlama-Sistemi/actions/runs/37186385433/artifacts/11296584539) | `native-mssql-report`, erişim sırasında expired=false | JSON SHA-256 `c4eca2bf19d8fa041f9f484589827a8bbcb98b61f28552b69e65410bcdfb9ac3`; 48/48 included source hash HEAD ile eşleşiyor. |

Ara başarısız native koşular nihai kabul sayılmadı. Önceki raporun bağladığı hatalar nihai 63780fc koşusundan önce düzeltilmiş; bu tur o ara hataların tekrarını çalıştırmadım. Yeni HTTP/başlatıcı değişiklikleri kalite koşusundan kanıtlanır, eski native run'dan değil.

### Native artifact'tan gerçekten ölçülen değerler

1.000 plan tahsisi, üç örnek ve iki bağımsız havuz:

| Rol | Store.view median ms | max ms | Dönen plan satırı | Dönen revision satırı | JSON byte |
| --- | ---: | ---: | ---: | ---: | ---: |
| Admin | 31,62 | 56,24 | 1.000 | 1.200 | 116.719 |
| Manager | 26,48 | 51,94 | 186 | 386 | 20.279 |
| Normal | 24,63 | 25,42 | 186 | 200 | 10.551 |

24 paralel yazmanın toplam süresi **1.738,88 ms**. `mssql-native-suite.mjs:221–249,361–396,539–679` kaynak kontrolünde aynı-revision yarışında tek commit, projection hatasında rollback, reference view eşitliği ve 24 yazma sonrası generation/revision/audit kontrolleri görüldü. Artifact'ın 19/19 koşusuyla ilişkilidir; ayrı yeni native çalıştırma yapılmadı.

Satır sayıları adapter'ın döndürdüğü satırlardır; fiziksel SQL IO değildir. Süreler Store pipeline ve global uygulama kilidini kapsar; HTTP/browser/WAN ölçümü değildir. CI'daki `sa`, self-signed trust ve geçici container kurumun asgari izinli hesabı veya CA zincirini kanıtlamaz. Native rapor HTTP app/server ve tüm frontend dosyalarını hash kapsamına almıyor. Artifact workflow'da 7 gün tutuluyor; kurumsal kabul dosyasının kalıcı arşivi ayrıca planlanmalı.

### Güncel maliyetler ve mimari sınırlar

- `Store.mutate:158–177` her yazmada tam model okuyor ve final validation yapıyor. Native adapter `87–129` shared/exclusive global application lock kullanıyor. Ölçülen 24 yazma toplamından kurum hedef kapasitesi çıkarılmaz; kilidi kanıt olmadan kaldırmak önerilmez.
- `planning-reader:151–173` actual/hours/percent/revision verilerinin bir kısmını tam okuyor; rol scope son projection'da uygulanıyor. İlk snapshot büyüklüğü hâlâ veri hacmine bağlıdır.
- `data-response` JSON string üretip sonra async gzip uygular; encoding/memory maliyeti sıfırlanmış değildir.
- Yerel smoke'da disk commit median 5,26 ms ölçüldü; SQL.js tam disk görüntüsü commit'i gerçek MSSQL IO maliyeti olarak yorumlanmaz.
- Audit listelemede COUNT+OFFSET var; tüm audit'i UI'ya taşıma kaldırılmış. Çok büyük offset/disk geçmişi için hedef yük ve retention operasyonu hâlâ ölçülmeli; mevcut koddan arıza/hızlanma yüzdesi çıkarılmadı.
- 9 saat/gün, 180 saat/FTE, risk matrisi ve tarih sınırları tanımlı ortak politikadır. Çelişen iki aktif hesaplama kuralı kanıtlanmadığı için sırf literal içeriyor diye açık yazılmadı.

**Kanıt dizini:** `/var/folders/z9/yl1whp294pb8d7qxxxdz_3f80000gn/T/aa-dogrulama-2026-10-04-kmhtw5dv`. İçerik: `context.json`, `focused-tests-result.json`, `focused-tests.log`, `architecture-imports.json`, `ci-run-*.json`, `ci-evidence-summary.json`, `ci-test-counts.json`, `native-mssql-report.zip`, `sqljs-smoke.json`, `sqljs-smoke-command.json`. Kaynak archive gerçek veri, `.env` ve kişisel belgeleri içermiyor; root/frontend dependency lock'ları kontrol edilmiş önceki sentetik dependency kurulumuna symlink kullanıyor, yeni npm kurulumu yapılmadı. Bu dizin geçicidir; OS tarafından silinebilir. Kalıcı rapor yolu: `/Users/beyzakap/Desktop/AA Kaynak Planlama Sistemi_1.0.0/DOGRULAMA-RAPORU-2026-10-04-e1a9881.md`.

## 6. Gerçek ortamda kalan kabul işleri

| Kabul işi | Güvenli önkoşul | Sorumlu rol | Gerekli kanıt |
| --- | --- | --- | --- |
| Dağıtılan kaynak/arayüz/süreç sürümü | Seçilmiş tek paket; kaynak ve artifact hash'leri; yalnız test ortamında kontrollü restart | Yazılım sahibi + IT operasyon | Paket manifest'i, verify sonucu; restart sonrası aynı paket/sürüm kaydı. Kaynakların diskte eşleşmesi çalışan process'i tek başına doğrulamaz. |
| Windows servis/NTFS ACL/Explorer | Ayrı Windows test host'u, sentetik DB, IT onaylı servis hesabı ve en az izin | Windows sistem yöneticisi | DACL çıktısı kişisel değerler maskeli; gerçek ilk kurulum/TTY, SCM stop/start, Ctrl+C, crash ve boot kabul kayıtları. `.cmd` SCM servisi değildir. |
| Kurum SQL hesabı / migration | Ayrı boş/sentetik `_test` DB; TEST_DB ayarları; hesap/DDL/DML izin ayrımı; lease/cleanup güvenliği | DBA + güvenlik/IT | SQL login veya kuruma uygun doğrulanmış NTLM; runtime yetki matrisi; migration öncesi yedek, geçiş ve başarısızlık geri dönüş tutanağı. |
| Kurum TLS / proxy | Ayrı test hostname/CA; IT proxy adresi/firewall ve header overwrite; production benzeri config | Ağ/platform + güvenlik | Güvenilen peer + Host + XFP https kabulü; direkt port/forged forwarding reddi; geçerli/bozuk CA/hostname testleri. NTLM/Kerberos/gMSA otomatik varsayılmaz. |
| Yedek ve geri dönüş | Ayrı recovery hedefi, onaylı RPO/RTO, şifreli/erişimi sınırlı kurum yedek deposu | DBA/operasyon + iş sahibi | Tam yedek + manifest/hash; ayrı hedefte restore sonrası satır/model/revision/oturum doğrulama, ölçülen geri dönüş süresi. JSON UI yedeği tam DB yedeği değildir. |
| 5 yıl audit saklama | Kurum saklama politikası, zamanlama/kapasite, doğrulanmış arşiv ve uygulanabilir geri dönüş | Veri/uyum sahibi + DBA | Cutoff/preview, arşiv verify, yetki ve rotasyon tutanağı. Otomatik silmenin gerçekten planlanıp çalıştığı bu tur doğrulanmadı. |
| Hedef yük / işletim izleme | Temsili sentetik hacim ve eşzamanlılık, kabul hedefleri, ayrı SQL/HTTP test stack | Performans/IT + iş sahibi | HTTP percentile/errors/lock wait; SQL IO/plan; bellek/GC; browser etkileşimi ve recovery sonuçları. |

Bu işlemler için kurum hedefi ve yetki sağlanmadı; gerçek ortamda hiçbir işlem yapılmadı. Lokal native komutu ayrıca çalıştırılmadı: boş/sentetik ayrı TEST_DB hedefi bu tur bağımsız kanıtlanmadı ve mevcut CI/artifact ilgili native dosyalar için yeterli yeniden doğrulama sağladı.

## 7. Önceliklendirilmiş sonraki işler

| Sıra | İş | Kabul kriteri | Önerilen doğrulanabilir kanıt |
| --- | --- | --- | --- |
| **1 — uygulanabilir ilk geliştirme** | **Dağıtımda kaynak/derleme tutarlılığı**: build sonunda sınırlı ve sır içermeyen hash manifest'i; yalnız okuyan verify komutu; kılavuzda doğru paket seçimi | Backend/shared/frontend/build girdisi veya derleme artifact'ı değişirse verify başarısız; eksik manifest/asset anlaşılır hata; `.env`, DB, kullanıcı içerikleri okunmaz. Gerçek runtime sürümünü kanıtlamadığı açık yazılır. | Geçici sentetik paketlerle drift/eksik manifest/path güvenliği testleri; temiz build → verify; CI Windows/Linux. Mevcut üst kopya farklılıkları sessizce ezilmez. |
| **2 — veri/iş sürekliliği** | Kurum yedek/restore ve migration geri dönüş tatbikatı | Onaylı RPO/RTO; ayrı recovery hedefi; bütünlük/revision/oturum sonuçları; canlı kaynak değişmez | DBA tutanağı, hash/manifest, restore süresi ve hedef doğrulaması. Gerçek veri kullanımı ayrı onay gerektirir. |
| **3 — üretime giriş şartı** | Asgari izinli SQL hesabı + kurum CA/proxy ve Windows servis/ACL kabulü | TLS doğrulama açık; forged header/direct port reddi; hesap yetkileri doğru; stop/crash/boot veri bütünlüğü | Ayrı kurum test ortamında 6. bölümün kabul kayıtları; mevcut native container başarısıyla kapatılmaz. |
| **4 — dar belge düzeltmesi** | N1 kılavuz tutarlılığı + CI kanıt arşivi | HTTPS önkoşulları tam; eski durumlar tarihlenmiş; nihai run/SHA/hash tek kayıt; kalıcı artifact saklama sorumlusu | Doküman diff/link kontrolü, release/kabul dosyasında artifact hash'leri. |
| **5 — hedeflerle ölçüm** | Temsili HTTP/SQL/browser yük profili; maliyet ölçüldükten sonra snapshot/JSON/audit/lock optimizasyonu | İş sahibi hacim/eşzamanlılık/p95/error hedefi belirler; önce baseline sonra tek değişkenli karşılaştırma; scope/revision/rollback değişmez | Test stack raporu ve önce/sonra hash'leri. Global lock şimdilik korunur. |

İlk sıradaki yazılım geliştirmesi yerel ve sentetik ortamda yapılabilir. 2–3. sıralar kurumsal kabul gerektirir; ortam olmadan tamamlandı denmemelidir. Kullanıcının son mesajı ilk geliştirmeye rapor sonrasında geçilmesini yetkilendirdi.

## 8. Ölçülmeyen alanlar, kapsam dışı ve gereken onaylar

- **Ölçülmedi:** üretim p95/p99, gerçek çok kullanıcılı kapasite, WAN/HTTP end-to-end, browser performansı, bellek/GC, fiziksel MSSQL IO/sorgu planı, uzun süreli soak/HA/failover.
- **Doğrulanamadı:** gerçek Windows servis hesabı/DACL/Explorer TTY, boot/crash/SCM yaşam döngüsü, kurum SQL/NTLM/CA/TLS/proxy/firewall, yedek takvimi/erişim/şifreleme ve restore tatbikatı; çalışan Node ve site sürümü.
- **Bu tur kapsam dışı:** gerçek hesapla giriş; DB içeriği/log/.env/gizli ayar taraması; real migration/restore/retention; hizmet/ACL/sertifika/proxy değişikliği; saldırı/fuzz testi; tüm dependency kaynak kodu denetimi; tüm tarayıcılar; Excel masaüstünde rendering. Hiçbir yeni uygulama testi veya kod düzeltmesi bu rapor aşamasında eklenmedi.
- **Takipte gereken bilgiler/onaylar:** IT'nin ayrı sentetik Windows/SQL/proxy hedefi ve yetkisi; DBA migration/restore tatbikatı planı; iş sahibinin RPO/RTO/yük hedefleri; gerçek veri gerekli olacaksa ayrıca kullanıcı/veri sahibinin onayı. Mevcut gerçek hedef üzerinde işlem veya test kaydı yapılmayacak.

Rapor sonucunda üretim kabulü ile kod düzeltmesi ayrılmalıdır. Son kullanıcı talebi doğrultusunda ilk yerel geliştirme ayrı aşamada yapılabilir; kurum kabul işlemleri için ortam/rol önkoşulları ayrıca sağlanmalıdır.
