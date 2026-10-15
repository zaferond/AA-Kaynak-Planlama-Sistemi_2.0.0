# Tüm kayıtları kapsayan tablolar ve kaynak grafikleri — 7 Ekim 2026

## Yapılan değişiklikler

- Raporlar ekranından **Takım Bazlı Doluluk Haritası** ve **İşe Alım Senaryoları** kaldırıldı.
- **Gerçekleşen Kaynak ve Dağıtılan Kaynak** aylık karşılaştırması mevcut aktif kapasite yerine kaydedilmiş gerçekleşen dağılımları kullanır. Güncel statü tarihsel gerçekleşen verileri silmez.
- **Proje Bazlı Dağıtılan ve Gerçekleşen Kaynak** sütun grafiği eklendi. Her seri bağımsız seçilir. Liderlik/takım/dönem filtresi uygulanır. Aylık ortalama seçili dönemin toplamının seçili bütün ayların sayısına bölümüdür; sıfır kayıtlı aylar dahildir.
- İlk 10 proje, gerçekleşen seri açıkken gerçekleşene; sadece dağıtılan açıkken dağıtılana göre sıralanır. İki seri açıkken gerçekleşen eşitliğini dağıtılan değer çözer. Sadece planı bulunan projeler gerçekleşen sıralamasında pozitif gerçekleşenlerin ardından gelebilir.
- Çok küçük pozitif ortalamalar iki ondalıkta sıfır gibi görünmesin diye `<0,01` gösterilir. Hesapta yuvarlama uygulanmaz.
- Proje tablosunda **250 proje sınırı ve sayfalama kaldırıldı**. Planlanan dağılımın dinamik 20–100 kaynak satırı sayfalaması da kaldırıldı. Bütün filtre sonuçları tek kaydırma alanında erişilebilir.
- Planlanan kaynak satırı sayısı `proje sayısı × takım sayısı`dır. Proje/takım başlıkları, özetler ve isteğe bağlı gerçekleşen satırlar bu sayıdan ayrıdır. Veri ve detay eklendikçe içeriğin kaydırılabilir yüksekliği artar.

## Yükseklik ve oluşturulan satırlar

Ekrandaki panel pencere yüksekliğine göre sınırlıdır; ana sayfanın filtre özeti satırında sonlanması korunur. Tablonun **kaydırılabilir içerik yüksekliği** tüm kayıtlara göre hesaplanır. `useWindowedSections` sadece görünür alanın yakınındaki bölümleri oluşturur; diğer bölümlerin yüksekliğini boşluklarla korur. Başlangıç yüksekliği tahmin edilir, gerçek yükseklikler ResizeObserver ile ölçülür ve güncellenir. Bu nedenle farklı uzunlukta metin ve açık detaylar için toplam piksel yüksekliği kaydırılırken rafine edilir.

Proje detaylarının açık/kapalı durumu üst bileşende tutulur, kaydırma nedeniyle bileşen kaldırılıp yeniden oluşturulduğunda kaybolmaz. Kaynak hücresindeki odak, değişmiş değer, devam eden kayıt veya hata varsa ilgili bölüm kaldırılmaz. Sürüklenen bölüm de korunur. Kaynak girişinde Esc değeri ve hata durumunu temizler.

Seçim ve kopyalama modeli bütün filtre sonuçlarını kapsar. Raporlar ve Excel çıktıları ekranda oluşturulmuş satırlardan değil mevcut veri modelinden hazırlanır. Tarayıcının Ctrl+F veya doğrudan sayfa yazdırması bütün oluşturulmamış satırları kapsamaz; uygulamanın arama/filtreleri ve Excel çıktısı kullanılmalıdır.

## Sentetik performans ölçümü

Geçici SQL.js veritabanı, sentetik hesaplar ve projeler, yerel geçici HTTP sunucusu kullanıldı. Çalışan veritabanına, gerçek hesaplara ve `.env` dosyasına dokunulmadı. Karşılaştırma için eski yapının özel geçici kod kopyasında sadece sayfa boyutları değiştirildi; bu varyantlar çalışan uygulamaya aktarılmadı.

Ortam: macOS, headless Chrome, Node 24.21.0, 1800×1050 pencere, uygulama ölçeği %90. Projeler için 12 aylık dönem (haftalıkta 53 takvim sütunu), detaylar kapalı. Plan karşılaştırmasında bir sentetik takım seçildi. Yeni yapıda 1002 proje, eski sayfalama varyantlarında 250 veya 1000 görünür proje/kaynak satırı kullanıldı. Her durum üç kez ölçüldü; tabloda medyanlar gösterilir.

Süre, gerçek sekme mouse-down olayından tablo görünmesine ve iki animation frame sonrasına kadar geçen süreyi ölçer. Uçtan uca uygulama ilk yükleme/DB sorgu süresi değildir. HTML öğeleri tablo altındaki DOM sayısıdır. JS heap GC sonrasında Chrome metriğidir; toplam süreç belleği veya tepe bellek değildir.

| Görünüm | Eski 250 proje / 100 kaynak satırı | Eski 1000 satır | Yeni, bütün 1002 proje |
| --- | ---: | ---: | ---: |
| Projeler, aylık — açılış | 332 ms | 1213 ms | 65 ms |
| Projeler, haftalık — açılış | 1153 ms | 5990 ms | 126 ms |
| Planlanan, proje → takım — açılış | 270 ms | 3007 ms | 70 ms |
| Projeler, aylık — HTML öğesi | 14.044 | 56.044 | 1.167 |
| Projeler, haftalık — HTML öğesi | 44.970 | 179.220 | 3.803 |
| Planlanan, proje → takım — HTML öğesi | 10.444 | 104.044 | 1.087 |
| Projeler, aylık — JS heap | 20 MB | 54 MB | 10 MB |
| Projeler, haftalık — JS heap | 46 MB | 161 MB | 13 MB |
| Planlanan, proje → takım — JS heap | 15 MB | 66 MB | 11 MB |

Yeni takım → proje görünümü ayrıca ölçüldü: 1002 kaynak satırı kapsamında medyan açılış **78 ms**, başlangıçta oluşturulan DOM **1381 öğe**. Başlangıçta projelerde 20 gerçek proje satırı ve bir boşluk satırı; planın proje → takım görünümünde 10 proje grubu ve bir boşluk satırı oluşturuldu. Bunlar veri sınırı değildir, kaydırıldıkça değiştirilir.

30 adımda tablonun başından sonuna atlanan zorlayıcı kaydırma ölçümünde medyan p95 frame aralığı: aylık proje eski 1000 satırda 413 ms / yeni 52 ms; haftalık proje 988 ms / yeni 139 ms; proje → takım plan 351 ms / yeni 52 ms; yeni takım → proje 73 ms. Bunlar doğal bir fare kaydırmasının FPS garantisi değildir. Haftalık görünümde bütün yatay sütunlar halen oluşturulur; çok uzun dönemler için yatay sanallaştırma ayrı bir olası iyileştirmedir.

Eski ölçüm çıktısı: geçici `aa-table-benchmark-GTLDWJ/results.json`.
Yeni ölçüm çıktısı: geçici `aa-table-benchmark-WPYowg/results.json`.

Son projeye erişim her iki plan gruplamasında da proje adına göre doğrulanarak ikinci sentetik tekrar yapıldı; tarayıcı hatası yoktu. Medyanlar aylık proje 66 ms, haftalık proje 126 ms, proje → takım plan 76 ms, takım → proje plan 77 ms. Çıktı `aa-table-benchmark-Bx1vV5/results.json`.
Tekrar ölçmek için, bağımlılıkları kurulmuş test makinesinde:

```sh
npm run build
node scripts/benchmark-workspace.mjs
```

Bu script sadece geçici ortamda çalışır; sonuç dosyasının yolunu yazdırır. Bu Mac ortamında backend bağımlılıkları mevcut doğrulanmış cache loader ile çözümlendi; kaynak/üretim yapılandırması değiştirilmedi.

## İşlevsel doğrulama

- `node --test tests/workspace-view.test.mjs tests/resource-planning-reports.test.mjs tests/project-clipboard.test.mjs`: **22/22**.
- Hedefli tarayıcı koşusu, planlanan dağılım + proje tabloları + tema + timeline katmanları + viewport: **20/20 grup**. Ctrl/Cmd kopyala/yapıştır, sıfır değerler, Ctrl+Enter, Esc/dış tıklama, hata/retry, sabit proje başlıkları/sol sütun, proje sıralama, aylık/haftalık bar/baklava katmanları, son projeye erişim, açık detayın korunması, kaydedilmemiş hücrenin korunması ve dar ekran sınırı kontrol edildi.
- Kaynak raporları hedefli tarayıcı koşusu: **3/3 grup**. Filtreli aylık değerler, aylık proje ortalaması, ilk 10 sınırı, bağımsız seri seçimleri, 60 ay/dar ekran ve kaynak verilerinin değişmemesi kontrol edildi.
- TypeScript, frontend üretim build, format kontrolü ve shared domain bağımlılık kontrolü başarılı. Bu Mac'te root TypeScript çözümleme sorunu nedeniyle domain kontrolü frontend'in mevcut TypeScript paketiyle çalışan geçici loader üzerinden yapıldı.

## Sınırlar ve öneri

1000 projenin bütün hücrelerini aynı anda oluşturmak önerilmez. Yeni yapıda sabit sayfa sınırı gerekmiyor; ekranı dolduran bölümler oluşturulurken bütün kayıtların kaydırma yüksekliği korunuyor. Ölçüm, filtrelenmiş bir takım, 12 ay ve kapalı proje detayları içindir. Binlerce açık detay, yüzlerce takım, beş yıllık haftalık görünüm, kurum Windows cihazları, gerçek ağ/MSSQL ve eşzamanlı kullanıcı yükü bu ölçümle doğrulanmadı. Kurum ortamı yük kabulü için aynı sentetik ölçüm ayrıca uygulanabilir.

Bu değişiklik backend yetki, DB şeması veya oturum kurallarını değiştirmez. Git commit/push bu görevde yapılmadı.
