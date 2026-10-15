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
