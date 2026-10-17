# Migration kaynakları

## CoE kaynak rolü — sürüm 36

36 numaralı migration, `assignment_role` kısıtına `coe` değerini ekler. SQL.js mevcut sürüm satırlarını tüm alanlarıyla yeni tabloya kopyalar, aynı dış anahtarları ve takım/ay indeksini korur; MSSQL yalnız ilgili CHECK kısıtını genişletir. İşlem mevcut migration transaction'ında uygulanır. CoE, takım ataması ve erişim bakımından Team Member ile aynıdır; yönetici rolü veya uygulama yetkisi vermez.

Güncellemeden önce veritabanı yedeği alınmalıdır. MSSQL kurulumu için IT, yedek sonrasında `npm run db:migrate` çalıştırır. Eski kodla geri dönüş, sürüm 35 yedeğini ve ona uygun uygulama paketini birlikte gerektirir; yeni şema eski koda zorla açılmamalıdır.

`migration-catalog.mjs` sürümleri, isteğe bağlı legacy v2 kaydını, SQL dosyalarının adlarını ve kaynak fingerprint'lerini tanımlar. `schema-migrations.mjs` bu SQL'leri ve kodla çalışan dönüşümleri Store'un tek transaction'ı içinde uygular. Tarihsel 24→23 sırası ve 5/6 GO ayrımı korunur.

Yeni sürüm eklerken katalog kaydı, iki provider'ın SQL dosyaları ve gerekiyorsa migration kodu birlikte güncellenir. Katalog/SQL dosyası eşitsizliği uygulama başlangıcını ve yedek araçlarını başarısız yapar. Yeni SQL.js DDL, yedeklerin beklenen sütun/kısıt sözleşmesini otomatik günceller.

Yedek doğrulamasında bütün zorunlu kayıtlar bulunmalıdır; kod migration'ları 3/12 dosya taramasından kaybolmaz. Doğrulama kaynak dosyaya Store.connect çağırmaz. `scripts/schema-contract.mjs` boş özel görüntüden şema sözleşmesini üretir; `scripts/snapshot-model.mjs` gerçek uygulama projeksiyonunu salt okunur görüntüde kullanır. Veri dönüşümleri doğrulama sırasında tekrar çalıştırılmaz.

`npm run verify` ve `npm run test:ui` sentetik verilerle çalışır. Bakım regresyonları `tests/data-maintenance.test.mjs` içindedir. MSSQL migration davranışı için ayrıca native test ortamı gerekir.


## 3 Ekim 2026 doğrulama ekleri

Başlangıç, uygulanmış her sürümü katalogla karşılaştırır. Bilinmeyen sürümde yükseltme veya katalog seed işlemi başlamaz. Transaction bitmeden zorunlu migration geçmişi yeniden doğrulanır. İsteğe bağlı v2 ve tarihsel 24→23 sırası korunur.

Kod kontrolünün eklenmesi tam kaynak fingerprint'ini değiştirir. DDL/veri dönüşümü aynı olan önceki schema-30 fingerprint'i `compatible-migration-fingerprints.json` içinde yalnız bilinen SQL.js/provider/sürüm üçlüsüyle izinlidir. Rastgele hash kabul edilmez. Kaynak fingerprint'inin uyumlu olması şema, model, migration geçmişi ve parola kaydı kontrollerini atlatmaz. Yeni uyumluluk girdisi ancak ilgili DDL/veri dönüşümleri incelenerek eklenmelidir.

Tam SQL.js yedeklerinde parola salt/hash kayıt biçimi ayrıca denetlenir. Bu kontrol doğru parolayı bilmeden salt ile hash'in birbirine ait olduğunu kanıtlayamaz. Eski tarihsiz çalışma dönemleri tam yedekte korunur; bu işlem yeni kaynağa boş tarih girme izni vermez.


## Store sınırı

`Store.connect` katalog/runner'ı transaction içinde çağırır. Kullanıcı/oturum SQL mapping'i `identity-repository.mjs`, planlama snapshot okuması `planning-reader.mjs`, diff yazması `planning-writer.mjs` içindedir. Repository'ler verilen bağlantıyı kullanır; Store'un transaction/yetki/revision/audit/generation sınırını devralmaz veya ayrı bir commit oluşturmaz. Bu ayrıştırma DDL/veri dönüşümünü değiştirmediği için yeni migration ve yeni uyumlu şema fingerprint'i eklenmez.

## 37 — Takım bazlı planlanan kaynak yetkisi

`kp_user_planning_teams` kullanıcı–takım eşleştirmelerini saklar. Mevcut kullanıcı, liderlik yetkisi, dağılım ve oturum kayıtları değişmez. Liderlik yetkileri mevcut alt liderlik/takım kapsamını korur; takım yetkileri yalnız planlanan dağılıma yazma yetkisi verir. Normal kullanıcı takım yetkisiyle planlama düzenleyemez. Yetki güncellemeleri mevcut revision, audit ve oturum iptali akışından geçer.

Yeni tabloda kullanıcı ve takım yabancı anahtarları bulunur. Kullanıcı silinince takım yetkileri silinir; yetkide kullanılan takım veya liderlik kaynak satırı kaldırılmadan önce yetki eşleştirmesi kaldırılmalıdır. Tam veritabanı yedeği yeni tabloyu içerir. JSON plan yedeği kullanıcı yetkilerini değiştirmez. Üretim MSSQL ortamında dağıtımdan önce IT tarafından `npm run db:migrate` çalıştırılmalıdır; eski pakete dönüş için migration öncesi tam yedek kullanılmalıdır.

## 38 — Proje görüntüleme yetkileri

`kp_projects.access_restricted` (varsayılan 0) ve `kp_project_access(project_id, kind, target)` eklenir. `kind` değerleri `role`, `leader`, `team`, `person`; proje silinince kuralları da silinir. Mevcut projelerin hepsi `access_restricted=0` ile gelir, yani geçişten sonra kimsenin gördüğü proje değişmez. Kural seçilmemiş "Yalnızca seçilenler" de kısıtsız sayılır ve kısıtlı olarak yazılmaz.

Kurallar alternatiftir; birine uyan kullanıcı projeyi görür. Adminler her projeyi görür. Liderlik kuralı alt liderlikleri ve takımlarını kapsar. Projede planlanan dağılımı olan takımlar ve gerçekleşen girişi olan kişiler projeyi kural olmadan da görür. Görünmeyen proje `scopeData`, gerçekleşen görünümü ve aktivite raporu proje filtresinde istemciye gönderilmez; o projeye admin dışı dağılım/gerçekleşen yazması 403 ile reddedilir. Takım kapasite toplamları korunur: gizli projelerin planlanan değerleri `hiddenAllocationTotals` (takım|ay), gerçekleşen takım toplamları adsız `~gizli` proje kimliğiyle gider. `target` sütunu yabancı anahtar değildir; silinen takım/kişi/liderliği gösteren kural hiçbir kullanıcıyla eşleşmez.

JSON plan yedeği proje kurallarını proje kaydının `access` alanında taşır. Üretim MSSQL ortamında dağıtımdan önce IT tarafından `npm run db:migrate` çalıştırılmalıdır; eski pakete dönüş için geçiş öncesi tam yedek kullanılmalıdır. Native MSSQL testleri bu değişiklik için ayrıca çalıştırılmalıdır.

## 39 — Normal-Proje rolü

`kp_users.project_editor` (varsayılan 0) eklenir. "Normal-Proje" rolü veritabanında `role='normal'` ve `project_editor=1` olarak saklanır; mevcut rol CHECK kısıtı ve kullanıcı tablosu değişmez. Bu hesaplar yalnız Mühendislik Liderliği Projeler ve Kritik Proje Konuları sekmelerini görür; orada admin ile aynı yetkilere sahiptir (proje ekleme/düzenleme/silme, aşama, başlık, not, kilometre taşı ve proje görüntüleme kuralları; kısıtlı projeler dahil tüm projeler). Kaynak dağılımı yetkileri normal kullanıcınınkiyle aynıdır. Mevcut hesaplar 0 ile gelir; davranış değişmez. Üretim MSSQL ortamında dağıtımdan önce `npm run db:migrate` çalıştırılmalıdır.

## 40 — Erteleme senaryoları

`kp_schedule_scenarios(id, payload)` eklenir. Her satır bir kayıtlı erteleme senaryosunun JSON içeriğidir: ad, kaydırılan projeler (proje, ay sayısı, başlangıç ayı), takvimin de kayıp kaymayacağı, durum (`draft`, `approved`, `applied`, `reverted`) ile hazırlayan/onaylayan/aktaran/geri alan bilgileri. Takvime aktarılan senaryo, geri alma için aktarma öncesi proje kayıtlarını ve planlanan değerleri de taşır. Revizyonlar mevcut `kp_revisions` tablosunda `@scenario:` ad alanıyla tutulur; yeni bir CHECK değeri gerekmez. Senaryolar projelere yabancı anahtarla bağlı değildir; silinen proje senaryo geçmişini silmez.

Taslakları admin ve yöneticiler kaydeder (yönetici yalnız kendi taslağını ve görebildiği projeleri). Onay, takvime aktarma ve geri alma yalnız admin yetkisindedir; aktarma ile geri alma proje ve planlanan değer değişiklikleriyle aynı işlemde yazılır ve Değişiklik Geçmişi'ne düşer. Geri alma, aktarmadan sonra ilgili projelerde değişiklik yapıldıysa reddedilir. Bir senaryo aktarıldığında aynı projeleri içeren diğer taslak/onaylı senaryoları sunucu `closed` durumuna alır (`closedByScenarioId`, `closedByName`, `closedAt`); bu senaryolar onaylanamaz ve aktarılamaz, böylece bir proje iki kez kaydırılmaz. Aktarma geri alınınca bu senaryolar yeniden taslak olur. Durum JSON içeriktedir; ek şema değişikliği gerekmez. Normal ve Normal-Proje kullanıcılarına senaryo gönderilmez; yöneticilere geri alma içeriği gönderilmez. Mevcut veride senaryo yoktur; davranış değişmez. JSON plan yedeği senaryoları taşır; senaryo içermeyen yedek geri yüklenince mevcut senaryolar da temizlenir. Üretim MSSQL ortamında dağıtımdan önce `npm run db:migrate` çalıştırılmalıdır.

## 41 — Oturum tablosu indeksleri

SQL.js'te 013 geçişi `kp_sessions` tablosunu yeniden oluştururken 001'deki `kp_sessions_user_idx` ve `kp_sessions_expiry_idx` indekslerini geri eklemiyordu; MSSQL'de 013 yalnız satırları sildiği için indeksler duruyordu. 41 iki indeksi SQL.js'te `IF NOT EXISTS` ile yeniden oluşturur. MSSQL'de yalnız eksikse oluşturur, mevcut veritabanlarında yalnız sürüm kaydı eklenir. Veri değişmez. Üretim MSSQL ortamında dağıtımdan önce `npm run db:migrate` çalıştırılmalıdır (38–40 ile aynı komut).

## 42 — İlk girişte şifre değiştirme

`kp_users.must_change_password` (varsayılan 0) eklenir. Sunucu ilk kurulumda `.env` içindeki `ADMIN_PASSWORD` ile ana yöneticiyi oluştururken ve `npm run admin:password` şifreyi `.env` üzerinden sıfırlarken bu alanı 1 yapar. Alan 1 iken hesap yalnız oturum bilgisini okuyabilir, çıkış yapabilir ve şifresini değiştirebilir (`POST /api/auth/password`); diğer bütün istekler 403 alır. Şifre değiştirilince alan 0 olur, hesabın diğer oturumları kapanır ve yeni bir oturum açılır. Mevcut hesaplar 0 ile gelir; davranış değişmez. AD hesaplarının şifresi uygulamada değiştirilmez. Üretim MSSQL ortamında dağıtımdan önce `npm run db:migrate` çalıştırılmalıdır (38–41 ile aynı komut).

## 43 — Proje ilerlemesi

`kp_project_progress(id, payload)` ve `kp_progress_locks(id, payload)` eklenir. Her ilerleme satırı bir proje × liderlik kaydının JSON içeriğidir: onaylanmış temel planlar (sürüm, açılış ayı ve yüzdesi, aylık kümülatif hedefler, onaylayan), varsa onay bekleyen ya da taslak öneri, aylık gerçekleşen yüzdeler ve açıklamaları (giren ve zaman sunucuda damgalanır), adminin isteğe bağlı elle verdiği ağırlık. Kilit satırı bir ayın (`YYYY-MM`) gerçekleşen girişine kapatıldığını gösterir. Revizyonlar `kp_revisions` tablosunda `@progress:` ve `@progressLock:` ad alanlarıyla tutulur; yeni CHECK değeri gerekmez. Proje silinince o projenin ilerleme kayıtları da aynı işlemde silinir; liderlik adı değişince kayıtlardaki ad güncellenir.

Kayıtları admin ve ilgili liderliğin yöneticisi yazar; temel plan onayı, ağırlık, kilit ve silme yalnız admin yetkisindedir. Normal ve Normal-Proje kullanıcılarına ilerleme kayıtları gönderilmez. Mevcut veride kayıt yoktur; davranış değişmez. Üretim MSSQL ortamında dağıtımdan önce `npm run db:migrate` çalıştırılmalıdır (38–42 ile aynı komut).
