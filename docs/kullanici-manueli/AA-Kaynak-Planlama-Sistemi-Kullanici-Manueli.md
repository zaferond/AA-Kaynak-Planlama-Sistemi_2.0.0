---
title: Askeri Araçlar Kaynak Yönetimi Sistemi
subtitle: Kullanıcı Manueli
project_name: AA Kaynak Planlama Sistemi
document_version: 1.1
date: 15.10.2026
application_version: 3.0.0
baseline_commit: 38b5f48abb83dc3c6827d98e13f5fa0eefd5ec6d
verification_scope: Kaynak kod, mevcut belgeler ve geçici ortamda sentetik arayüz kontrolleri
---

# 1. Başlangıç ve yetkiler

Bu kısa rehber, günlük işlemleri ve IT ekibinin temel kontrollerini açıklar. Ekran adları güncel kaynak kodla karşılaştırılmıştır. Kurumun uygulama adresini ve hesabınızı IT ekibinden öğrenin.

## Giriş ve çıkış

1. Uygulama adresini açın. **Kullanıcı Adı** ve **Şifre** alanlarını doldurun.
2. **Giriş Yap** düğmesine basın. AD hesabı kullanıyorsanız hesabınıza uygulama yetkisi de verilmiş olmalıdır.
3. Üst barda adınızı ve rolünüzü kontrol edin. İşiniz bitince **Çıkış** düğmesini kullanın.

## Hangi sekme ne işe yarar?

| Sekme | Kullanım amacı |
|---|---|
| AA Gerçekleşen Kaynak Dağılımı | Aylık proje süresi, kişisel izin ve eğitim girişi |
| AA Aylık Aktivite Raporu | Çalışanların aylık faaliyet toplamlarını görüntüleme |
| AA Planlanan Kaynak Dağılımı | Takım ve liderlik kaynaklarını projelere dağıtma |
| AA Mühendislik Liderliği Projeler | Proje, aşama, tarihli not ve kilometre taşı takibi |
| AA Kritik Proje Konuları | Rapora seçilen proje notlarını izleme |
| AA Kaynak Planlama Raporları | Kaynak karşılaştırmaları, grafikler ve Head Count |
| Organizasyon & Çalışan & Yetki | Çalışan, hesap, liderlik ve takım yönetimi |

## Roller

- **Normal Kullanıcı:** Kendi gerçekleşen dağılımını ve kişisel takvimini düzenler. Projeleri ve erişim kapsamındaki çalışan toplamlarını görüntüler.
- **Yönetici:** Tüm planlama takımlarını görür; yalnız verilen liderlik veya takım kapsamında plan değiştirir. Yetkili liderliklerindeki çalışanların gerçekleşen dağılımını da düzenleyebilir. Başkalarının kişisel takvimini yönetemez.
- **Admin:** Çalışanları, hesapları, organizasyonu, projeleri ve ortak çalışma takvimini yönetir; diğer ekranlarda tam yetkilidir.

> Çalışanın **Kaynak Rolü** ile uygulamadaki **Rol** ayrı alanlardır. Bir kişiyi Lider veya Product Owner seçmek, ona kendiliğinden Yönetici yetkisi vermez. AA Risk Yönetimi sekmesi varsayılan olarak gizlidir.

---page---
# 2. Gerçekleşen dağılım, izin ve eğitim

## Aylık süre girme

1. **AA Gerçekleşen Kaynak Dağılımı** sekmesini açın. Çalışanı, projeyi ve dönemi seçin. İlk görünür dönem **2 yıldır**.
2. **Kaynak Dağıtım Birimi** alanından **Yüzde (%)** veya **Saat** seçin.
3. İlgili ayın giriş hücresine tıklayın, değeri yazın ve Enter'a basın veya hücreden çıkın.
4. Hücre değerini ve aylık toplamı kontrol edin. Hata görünürse kayıt tamamlanmış sayılmaz.

Yalnız içinde bulunulan ay ve geçmiş aylarda, proje dönemi içinde giriş yapılabilir. Proje süreleri ile eğitim toplamı net aylık kapasiteyi aşamaz. Saat görünümündeki **Kalan Aylık Çalışma Saati**, net aylık saatten proje ve eğitim saatleri çıkarılarak hesaplanır.

## Kişisel izin veya eğitim ekleme

1. Çalışan adının solundaki takvim simgesini açın.
2. **Tür** seçin; ayrılış/başlangıç ve dönüş tarihlerini girin.
3. **Günlük Saat** ve gerekiyorsa **Açıklama** yazın. **Kaydet** düğmesine basın.
4. Kayıtlı aralığı listede kontrol edin. Kalem simgesiyle düzenleyip **Güncelle** kullanın; çöp kutusu simgesiyle silin.

> **Dönüş günü hesaba katılmaz.** 12 Ekim ayrılış, 15 Ekim dönüş için 12, 13 ve 14 Ekim değerlendirilir. Hafta sonları ve tam gün tatilleri atlanır. İzin çalışma saatinden düşer; eğitim dağıtılan süreye eklenir.

Başlangıç tarihi değişince dönüş tarihi de güncellenir; kaydetmeden önce iki tarihi kontrol edin. Günlük saat 0,5-9 aralığındadır. Aynı gündeki izin ve eğitim toplamı 9 saati aşamaz.

## Ortak çalışma takvimi - yalnız Admin

1. Üstte **Görünüm** ile **Excel'e Aktar** arasındaki **Çalışma Takvimi** düğmesini açın.
2. Başlangıç, bitiş, tür ve süreyi doldurup **Ekle** seçin. Mevcut aralık için **Güncelle** kullanın.
3. **Çalışma Dışı Tarihler** listesini kontrol edin ve **Takvimi Kaydet** düğmesine basın.

Ortak takvimde başlangıç ve bitiş günleri dahildir. Resmî tatiller Admin tarafından tanımlanır. Kişisel giriş doğrudan kaydedilir; ortak takvimde ayrıca **Takvimi Kaydet** gerekir.

## AA Aylık Aktivite Raporu

Filtreleri ve **Gösterim** birimini seçin; **Uygulanan Filtreler** satırını kontrol edin. Bu ekran yalnız görüntüleme içindir. Düzeltmeyi gerçekleşen dağılımda veya takvimde yapın. Aktif çalışan, Gear Up, saat ücretli çalışan ve işten ayrılan kayıtları gösterilebilir; ilanlar gösterilmez.

Normal kullanıcı kendi takımının, Yönetici eşleşen çalışanın liderliğine bağlı takımların toplamlarını görür. Admin tüm kapsamı görür. Başka çalışanın satırını görmek, düzenleme yetkisi vermez.

---page---
# 3. Planlanan kaynak dağılımı

Bu ekran Admin ve Yönetici içindir. Girişler çalışan bazında değil, takım veya liderliğin doğrudan kaynağı için **kişi eşdeğeri** olarak yapılır. Örneğin 0,5 yarım kaynaktır; saat değildir.

## Kaynak planlama

1. **AA Planlanan Kaynak Dağılımı** sekmesini açın. Liderlik, takım, proje, başlangıç ayı ve görünür dönemi seçin.
2. **Filtrelenen Takımlar Özet Raporu** satırından uygulanan seçimleri kontrol edin.
3. **Proje → Takımlar** veya **Takım → Projeler** görünümünü seçin.
4. Yetkili olduğunuz ay hücresine değeri yazın ve Enter'a basın.
5. Kaydedilen değeri ve Aktif / Dağıtılan / Kalan kaynak toplamlarını kontrol edin. Gerekirse **Gerçekleşen Dağılım Göster** seçimini açın.

## Hızlı giriş ve kopyalama

| Yapmak istediğiniz işlem | Uygulama |
|---|---|
| Birden fazla hücre seçmek | Fareyi basılı tutup hücreler üzerinde sürükleyin. |
| Seçime başka hücre eklemek | Ctrl tuşunu basılı tutarak seçin. |
| Aynı değeri tüm seçime uygulamak | Sol üst hücreye değeri yazıp Ctrl+Enter kullanın. |
| Hücreleri kopyalamak / yapıştırmak | Ctrl+C / Ctrl+V veya sağ tık menüsünü kullanın. |
| Seçimi kaldırmak | Esc tuşuna basın veya tablo dışındaki boş alana tıklayın. Tamamlanan Enter girişi de seçimi temizler. |

Proje dönemi dışındaki veya yetkisiz hücrelere yazılamaz. Başka uygulamalardan yapıştırmanın sonucu tarayıcıya göre değişebilir; işlemden sonra değerleri kontrol edin.

## Toplamları okuma

| Değer | Anlamı |
|---|---|
| Aktif Kaynak | Statü, çalışma tarihleri ve plana dahil seçimine göre kullanılabilir kaynak |
| Dağıtılan Kaynak | Projelere planlanan toplam kaynak |
| Kalan Kaynak | Aktif Kaynak - Dağıtılan Kaynak; negatifse kaynak açığı vardır. |

Liderliğin kendi satırı yalnız doğrudan bağlı çalışanları içerir. Alt takımlar burada yeniden sayılmaz. Aşama kutuları sola hizalıdır; renk, proje aşamasını gösterir. Sayısal giriş hücreleriyle karıştırmayın.

> **Tüm Dağılımları Sıfırla** yalnız Admin içindir. Ekran filtresinden bağımsız olarak tüm aylardaki plan tahsislerini temizler. Uygulamadan tek adımlı geri alma yoktur.

---page---
# 4. Projeler ve kritik konular

Projeleri tüm roller görüntüleyebilir. Ekleme, düzenleme, taşıma ve silme Admin içindir.

## Proje ve aşama ekleme

1. **AA Mühendislik Liderliği Projeler** sekmesinde **Yeni Proje Ekle** seçin.
2. Proje adı, başlangıç ve bitiş ayını girin. İsteğe bağlı proje kodu ve sorumlu ekleyip **Kaydet** seçin.
3. Bir ayın aşama kutusuna çift tıklayın. **Aşamayı Düzenle** penceresinde metin ve renk seçip kaydedin.

Aşama renkleri Çelik Mavi, Petrol Yeşili, Mat Bronz, Kırmızı, Petrol Mavisi ve Sarı olarak sunulur. Kırmızı ve sarı soluk tonlardadır. Kutular ince siyah çerçevelidir; metinler sola yaslanır. Boş aşama **-** olarak görünür. Renk tek başına işin tamamlandığı anlamına gelmez.

Komşu ayları sürükleyerek seçip sağ tık menüsünden metin, renk veya ikisini birlikte kopyalayabilirsiniz. **Haftalık Görünüm** aylık aşamayı haftalara yansıtır; ayrı haftalık aşama oluşturmaz. **Proje Kodlarını Göster** açıksa proje Excel çıktısına kod sütunu eklenir.

## Başlık, not ve kilometre taşı

1. **Detayları Göster** seçimini açın ve ilgili projede **Başlık Ekle** seçin.
2. **Başlık** yazın. **Not Ekle** ile **Tarih Aralığı** veya **Milestone (Tek Tarih)** seçin.
3. Tarih aralığında **Detay Not Ekle** ile açıklama ve tarihleri girin. Üst tarihler, detayların en erken başlangıcı ve en geç bitişinden oluşur; formda doğrudan değiştirilemez.
4. Milestone için ad, tek tarih, renk ve Dolu / İçi Boş görünümünü seçin.
5. Gereken açıklamalarda **Rapora Ekle** veya **Tamamlandı** seçin. **Kaydet** sonrası takvimdeki barı veya baklavayı kontrol edin.

Barı veya baklavayı sürükleyerek tarihi değiştirin. Barın kenarlarını çekerek süreyi değiştirin; bağlı detay tarihlerini de kontrol edin. Milestone, bar tarihleriyle örtüşebilir. Diğer tarih çakışmalarında ekrandaki uyarıyı izleyin.

## AA Kritik Proje Konuları

Bu sekmede rapora seçilen açıklamalar gösterilir. Admin, **Başlık Düzenle** veya detayın **Düzenle** işlemiyle içeriği değiştirir; değişiklik proje ekranına da yansır. **Tamamlandı**, metni yeşil ve üstü çizili yapar; **Geri Al** işareti kaldırır. **Rapordan Çıkar** yalnız rapor seçimini kapatır, notu silmez.

**Excel'e Aktar** ile gruplu açıklama ve tarihleri indirin. Proje tablosunun çıktısı için **Proje Raporunu İndir** kullanın.

> **Projeyi Sil**, projenin planlanan ve gerçekleşen dağılımlarını, aşamalarını ve bağlı konularını da kaldırır. Silmeden önce IT ile yedek durumunu kontrol edin.

---page---
# 5. Organizasyon, çalışan ve hesaplar

Bu bölüm yalnız Admin içindir. **Organizasyon & Çalışan & Yetki** sekmesinde iki alt görünüm bulunur: **Çalışan & Yetki Tanımlama** ve **Organizasyon Yapısı**.

## Çalışan veya ilan ekleme

1. **Kaynak Ekle / Yetki Tanımla** seçin. Önce **Statü** alanını belirleyin.
2. Çalışan için ad ve **Kaynak Rolü** girin. Lider seçerseniz liderlik seçin. Product Owner, Team Member veya CoE için takım seçin; liderlik takımdan otomatik gelir.
3. Gerekli tarihleri ve **Kaynak Planlamasına Dahil** seçimini kontrol edin. İsteğe bağlı **Açıklama** ekleyin.
4. **Kaydet** sonrası kaydı tabloda kontrol edin. Düzeltmek için satırdaki **Düzenle** işlemini kullanın.

| Statü | Form davranışı |
|---|---|
| Aktif Çalışan / Gear Up / SAAT Ücretli Ofis Ç. | İşbaşı tarihi zorunludur; bu yılın 1 Ocak günü önerilir. |
| Aktif İlan | Ad ve kaynak rolü gösterilmez. Tahmini İşbaşı Tarihi boş, dahil seçimi kapalı başlar. Dahil etmek için tarih gerekir. |
| Pasif İlan | Ad, kaynak rolü, işbaşı tarihi ve dahil seçimi gösterilmez; aktif kapasiteye eklenmez. |
| İşten Ayrıldı | İşbaşı ve ayrılış tarihleri gerekir. Statü değişikliği eski gerçekleşen kayıtlarını silmez. |

İkinci Lider veya Product Owner atamasında çakışma uyarısını kontrol edin. Hızlı filtrelemede ad, liderlik veya takım arayın. Toplu değişiklik için satırları seçip **Seçilenleri Toplu Düzenle** kullanın.

## AD hesabı ve yetki

1. Formdaki **Hesap ve Yetkiler** bölümünde **Active Directory** seçin. **Rol** alanını belirleyin.
2. **Kullanıcı Ara** alanına bilgi yazıp **Ara / Yenile** seçin. Doğru kişiyi **+** ile seçin.
3. AD'den gelen ad, kullanıcı adı ve e-postayı kontrol edin. Bu kimlik bilgileri elle değiştirilemez; AD şifresi bu formda girilmez.
4. Yönetici için **Planlanan Kaynak Dağılımı Yetkisi** ağacından liderlik veya takım seçin. Üst liderlik seçimi alt birimleri de kapsar. **Tümünü Seç** bütün listeyi seçer.
5. **Kaydet** sonrası hesap ve yetki kapsamını kontrol edin. **Uygulama Yetkisini Kaldır**, çalışanı ve AD hesabını silmeden uygulama erişimini kapatır.

Yalnız takım bazlı plan yetkisi, o takımın çalışanlarına gerçekleşen giriş yetkisi vermez. Gerçekleşen girişte yöneticinin liderlik yetkisi kullanılır.

## Organizasyon ve silme

**Liderlikleri Yönet / Takımları Yönet** ile birimleri ve bağlantılarını düzenleyin. Yönetici adı, Lider veya Product Owner atamasından gelir. Bağlı kayıtlar silmeyi engelleyebilir.

**Çalışanı Sil**, gerçekleşen dağılımlarını da kaldırır. Geçmişi korumak için **İşten Ayrıldı** kullanın. İzin/eğitim raporu bu ekranın altındadır.

---page---
# 6. Kaynak raporları ve dışa aktarma

**AA Kaynak Planlama Raporları** altında **Kaynak Raporları / Head Count** seçin. Seçimlerinizi sabit kalan **Uygulanan Filtreler** satırından kontrol edin.

## Kaynak Raporları

| Rapor / grafik | Nasıl okunur? |
|---|---|
| Liderlik Bazında Eksik Raporu | Üst ve alt liderliklerin kalan kaynağı. Alt satırlar üst toplamın kırılımıdır; tekrar toplanmaz. |
| Takım Bazında Eksik Kaynak Raporu | Takımların kalan kaynağı. Toplam Eksik Kaynak, artı ve eksi değerleri birlikte içeren net toplamdır. |
| Aylık Eksik Kaynak Grafiği | Her ay için en az sıfır olmak üzere Dağıtılan - Aktif Kaynak. Sağdaki ortalama seçilen tüm aylara göre hesaplanır. |
| Planlanan Kaynak / Gerçekleşen Kaynak Karşılaştırma Grafiği | Aylık plan ile gerçekleşen kaynakları karşılaştırır. |
| Proje Bazlı Planlanan / Gerçekleşen Kaynak Karşılaştırma Grafiği | Seçili dönemdeki toplamlar ve en fazla 10 proje. Seriler ayrı açılıp kapatılabilir. |
| Kaynak Planlama Süreç Etkinlik Grafiği | Gerçekleşen / Planlanan × 100. Plan sıfırsa oran hesaplanmaz. |
| Takım Bazlı Kaynak İhtiyaç Grafiği | Takımın aylık pozitif açıklarının seçilen tüm aylara bölünmüş ortalaması. |
| Aylık Ortalama Çalışan Sayısı ve Öngörü Grafiği | Seçili başlangıçtan itibaren biriken aylık ortalama; tarihli aktif ilanlar öngörüye eklenir. |

**Aktif İlanları Dahil Et** kayıtları değiştirir: Admin açınca tüm aktif ilanlar bugün işbaşıyla plana girer; kapatınca tarihleri ve dahil seçimi temizlenir. Rapor filtresi bu işlemi sınırlamaz.

## Head Count

- **AA Mühendislik Liderliği Head Count Raporu:** Aktif Çalışan + Gear Up + Saat Ücretli Çalışan.
- **İnsan Kültür Dönüşüm Verilerine Göre Head Count:** Aktif Çalışan, Aktif İlan ve Pasif İlan ayrı gösterilir. **Aktif İlan Dahil Head Count**, Aktif Çalışan + Aktif İlan toplamıdır.

Bu raporlar bugünün durumunu kişi/adet olarak sayar; plana dahil seçimine bağlı değildir. Alt liderlikler genel toplamda yeniden sayılmaz.

## Excel ve veri yükleme

Filtre ve dönemi kontrol edip dağılım ekranlarında **Excel'e Aktar**, projelerde **Proje Raporunu İndir**, kaynak raporlarında **Kaynak Raporu İndir** kullanın. Aylık aktivite ekranında ayrı Excel düğmesi yoktur. İndirilen dosyanın dönemini ve toplamlarını kontrol edin.

Admin, **Excel İçe Aktar** ile şablondan kaynak ekler; önce önizlemeyi kontrol eder. Bu işlem hesap veya yetki oluşturmaz.

**Veri Yedeği İndir:** Şifrelenmemiş JSON planlama yedeği; hesap, oturum ve işlem geçmişi yoktur. **Yedek Yükle:** Mevcut planlama verisini değiştirir, birleştirmez. Tam yedeği IT yönetir.

---page---
# 7. Sorun giderme ve IT notları

## Önce kullanıcı olarak kontrol edin

| Durum | Yapılacak işlem |
|---|---|
| Sekme, çalışan veya takım görünmüyor | Rolü, çalışan eşleştirmesini, statüyü ve filtreleri kontrol ettirin. |
| Hücreye giriş yapılamıyor | Yetki kapsamını, proje dönemini ve gelecek ay kısıtını kontrol edin. |
| Dağılım sınırı uyarısı geliyor | Tüm proje saatleri, eğitim, izin ve net aylık saati birlikte kontrol edin. |
| Kayıt başka biri tarafından değiştirildi | Yazdığınız metni koruyun; güncel kaydı alıp karşılaştırarak yeniden düzenleyin. |
| Bağlantı kesildi veya sonuç belirsiz | Aynı işlemi hemen tekrarlamayın; sunucudaki son durumu kontrol edin. |
| Giriş yapılamıyor / sunucu meşgul | Tekrarlayan denemeleri durdurun. Ekran adı, saat ve kişisel verisiz hata mesajını IT'ye iletin. |

## IT için başlatma ve dağıtım

**Gereksinim:** Node.js 24 veya üzeri. Kurumsal kullanımda MSSQL, HTTPS ve AD için LDAPS gerekir. Aşağıdaki komutlar uygulama kökünde çalıştırılır.

1. Yerel ilk kurulum: Windows'ta `./baslat-windows.cmd`, Mac'te `bash baslat-mac.sh`. Başlatıcı Windows servisi kurmaz.
2. Dağıtım hazırlığı: `npm ci --include=dev`, ardından `npm --prefix frontend ci --include=dev`.
3. Derleme: `npm run build`. Dosya eşleşme kontrolü: `npm run deploy:verify`; veritabanına bağlanmaz.
4. Ayarlar hazırken `npm start` sunucuyu açar ve veritabanına bağlanır. Aynı ortamda ikinci kopya başlatmayın.

AD şifresi dizine doğrulatılır, uygulamada tutulmaz. Bağlantı sırlarını Git'e eklemeyin. Şema geçişi ve geri yüklemeyi önce ayrı test ortamında doğrulayın.

## Kurumda teyit edilecekler

- Yayın adresi, destek sorumlusu, servis hesabı, tarayıcı ve çalışma takvimi.
- Gerçek AD/MSSQL bağlantıları, sertifikalar, grup kapsamı ve yetkilendirme.
- Servis yeniden başlatma, eşzamanlı kullanım, tam yedek ve geri yükleme.

## Güncellik ve kısa sözlük

Bu rehber 15.10.2026 kaynaklarına göre güncellendi. Eski belgelerdeki İK Notu, Bilgi Ekle ve AD Kullanıcısına Yetki Tanımla adları yerine güncel ekranda **Açıklama**, **Başlık Ekle** ve **Kaynak Ekle / Yetki Tanımla** kullanılır. Kişi Eşdeğeri formda gizlidir; gerçekleşen görünüm 24 ayla başlar. Çalışma takviminde aylık saat tablosu yoktur.

**AD:** kurum kullanıcı dizini. **Head Count:** kişi/adet sayısı. **Milestone:** tek tarihli kilometre taşı. **Kişi eşdeğeri:** planlama kapasitesi. Filtre, yetki vermez.

IT ayrıntıları proje kökündeki `ACTIVE-DIRECTORY-LDAP.md`, `DAGITIM-DOGRULAMA-KILAVUZU.md`, `WINDOWS-BASLATMA-VE-SERVIS-KILAVUZU.md` ve `VERI-SAKLAMA-VE-YEDEKLEME.md` belgelerindedir. Tarihsel alan adlarını güncel ekranla karşılaştırın.
