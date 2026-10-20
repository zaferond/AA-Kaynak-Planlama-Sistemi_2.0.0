# İlerleme ve kaynak senaryo uyarıları

Uygulama React/TypeScript arayüzü ve Node.js sunucusuyla çalışır. Yerel kurulum SQLite (SQL.js), canlı kurulum SQL Server kullanır.

## Veri ve hesaplama

- `projects`: proje kimliği, sorumlusu, başlangıç/bitiş ayları.
- `allocations`: `takım|proje|YYYY-MM` anahtarıyla aylık kişi-ay kaynak dağılımı.
- `projectProgress`: proje × liderlik için onaylı kümülatif hedef planı sürümleri, taslaklar ve aylık kümülatif gerçekleşen yüzdeleri/açıklamaları.
- `progressLocks`: değişikliğe kapatılmış aylar.
- `warningConfigs`: adminin kaydettiği genel eşikler; kayıt yoksa varsayılanlar kullanılır.
- `warningAssessments`: sunucunun tüm liderlikleri birlikte değerlendirdiği güncel proje hesap özeti.
- `scenarioWarnings`: proje, kural ve ay bazında uyarılar ile durum geçmişi.

Senaryo değerlendirmesi son kilitli takvim ayına dayanır. Projenin tüm ilgili liderliklerinin onaylı hedefi ve o aya ait gerçekleşeni bulunmalıdır. Eksik veride senaryo üretilmez; “Veri eksik” gösterilir. Aylık görünüm veya liderlik filtresi, sunucudaki proje genelini kapsayan senaryo hesabını değiştirmez. Proje toplamında mevcut liderlik ağırlıkları/kaynak payları korunur; kaynak dağılımı tamamen kaldırılmışsa onay referansı hesap ağırlığı için kullanılabilir.

Sapma = kümülatif gerçekleşen − kümülatif planlanan. Varsayılan sınıflar:

| Sapma            | İlerleme durumu   |
| ---------------- | ----------------- |
| ≥ +5             | Planın İlerisinde |
| −5 ≤ sapma < +5  | Planda            |
| −15 ≤ sapma < −5 | Planın Gerisinde  |
| < −15            | Kritik Gecikme    |

Ardışık iki kilitli **takvim** ayı Planın Gerisinde ise durum Kritik Gecikme olur. Kilitsiz veya verisi eksik ara ay trendi keser. Eşikler ve ay sayısı admin ayarlarından değiştirilebilir.

Onay sırasında her liderlik için aşağıdaki referans sabitlenir:

`Yüzde / kişi-ay = (100 − başlangıç yüzdesi) / onay anındaki planlı kaynak toplamı`

Gelecek Planlı %, son kilitli aydan proje bitişine kadar planlanan kaynağın bu sabit oranla dönüştürülmesi ve liderliklerin proje toplamında birleştirilmesiyle bulunur. Kümülatif aylık hedefler toplanmaz. Sonradan kaynak miktarı değişirse bu oran sabit kalır ve karşılama yeniden hesaplanır.

`Kalan İş % = 100 − gerçekleşen`; `Karşılama = Gelecek Planlı % / Kalan İş %`.

Sonraki üç ayda hiç kaynak yoksa Planlanmamış önceliklidir. Diğer durumlarda karşılama <%90 Yetersiz, %90–%120 Yeterli, >%120 Fazla olur. Gerçekleşen %100 ise senaryo uyarısı üretilmez. Kaynak dönemi ve karşılama eşikleri ayarlanabilir.

Eski onaylarda kaynak geçmişi bulunmadığından, kullanıcı tarafından seçilen geçiş yöntemi uygulanır: geçiş anındaki kaynak dağılımı bir defa referans olarak kaydedilir. Bu kayıtlar hesap özetinde açıkça belirtilir. Kaynak/hedef referansı hesaplanamayan bir planda gelecekte kaynak varsa yeniden plan onayı gerekir; sıfıra bölme veya uydurma oran kullanılmaz.

## Ekranlar ve yaşam döngüsü

Proje İlerlemesi ekranında Hedef Plan / Gerçekleşen Plan Giriş, Proje İlerleme Raporu, Senaryo Uyarıları ve yalnız admin için Uyarı Ayarları sekmeleri bulunur. Yeni senaryo metinleri önceki karar metinlerinin yerini alır. Eksik giriş, kaynak kapasitesi, kritik konu ve diğer mevcut uyarılar ayrıntılarda korunur.

Senaryo kuralları tek kaynak olan [JSON kural tablosunda](../shared/scenario-warning-rules.json) tutulur. Matriste bulunmayan birleşimlerde yalnız ilerleme durumu gösterilir. Kritik Gecikme, 1. Uyarı metnini aynı adla değiştirir; S-04 yalnız Planın Gerisinde durumuna aittir.

Uyarı sırası Açık → Görüldü → Aksiyon Alındı şeklindedir. Aksiyon açıklaması zorunludur. Açıklama, işlem tarihi ve kullanıcı bilgisi sunucu tarafından kaydedilir. Senaryo veya ay değiştiğinde önceki uyarı Kapandı olur. Aynı proje × kural × ay yeniden eşleşirse geçmişi korunarak mevcut kayıt yeniden açılır; ikinci bir kayıt oluşturulmaz. Proje tamamlandığında aktif uyarı kapanır.

Uyarılar proje ve durumla filtrelenebilir; ay, proje, kod veya duruma göre sıralanabilir. Filtrelenen listenin tamamı Excel veya CSV olarak dışa aktarılır. Hesap ve geçmiş ayrıntıları istenince açılır. Kaynak aktarımı karşılaştırmaları S-07/S-08 projelerinden S-01/S-02/S-06 projelerine aynı liderlik kapsamında inceleme önerir; otomatik kaynak taşımaz.

Motor sunucu açılışında ve kaynak dağılımı, ay kilidi, hedef/gerçekleşen veya uyarı ayarı değişikliklerinin kaydedildiği işlemde çalışır. Hesap, uyarı geçmişi ve ilgili değişiklik aynı veritabanı işlemi içinde kaydedilir. Rol ve proje görünürlüğü sunucuda kontrol edilir.

## Doğrulama

13 kabul örneği, eşik sınırları, trend kesintileri, değiştirilebilir eşikler, birden fazla liderlik, sabit kaynak referansı, tekrar önleme, yaşam döngüsü, yetkiler, kalıcılık ve eski yedek uyumluluğu otomatik testlerle doğrulanmıştır. Excel/CSV çıktıları ve ilgili ekranlar tarayıcı testlerine dahildir. Yerel veritabanı SQL.js üzerinde test edilmiştir; harici canlı SQL Server bağlantısıyla çalışma testi yapılmamıştır. SQL Server için 44 numaralı geçiş dosyası eklenmiştir.

## Aynı localhost üzerinde normal ve test ortamı

Normal ortam `http://localhost:3000`, test ortamı `http://localhost:3001` adresiyle çalıştırılabilir. Test sürecinde `APP_ORIGIN=http://localhost:3001`, `PORT=3001`, ayrı bir `SQLJS_FILE` ve `SESSION_COOKIE_NAME=kp_test_session` kullanılır. Normal ortamın varsayılan çerezi `kp_session` olarak kalır; iki ortamın giriş ve çıkış işlemleri birbirinden bağımsızdır.
