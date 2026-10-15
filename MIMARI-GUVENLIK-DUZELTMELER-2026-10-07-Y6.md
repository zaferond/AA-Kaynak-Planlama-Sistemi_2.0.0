# 7 Ekim 2026 — Y6 dağıtım ve başlatma tutarlılığı

## Durum

Y6 yerel hedefli kontrollerle tamamlandı. Git kaynağından doğrulanmış yeni dağıtım klasörü oluşturulabiliyor; Mac/Windows başlatıcı sırası setup → kilitli kurulum → build → start olarak aynı. Doğrudan sunucu açılışı kaynak/site/manifest farkını veritabanı Store nesnesini oluşturmadan önce reddediyor.

HEAD `05b99e5556aaa7e472e99923f492fc37eab3487f`, main. Önceden bulunan geliştirmeler korunmuştur; bu tur commit/push yapılmadı. Önceki bağlam: [5 Ekim incelemesi](MIMARI-GUVENLIK-INCELEME-2026-10-05.md) Y6 ve [Y4 kaydı](MIMARI-GUVENLIK-DUZELTMELER-2026-10-07.md).

## Değişiklikler

- `scripts/deployment-package.mjs`: yalnız doğrulanmış manifest girdileri, normal dosya kontrolleri ve hash karşılaştırması ile paket üretimi; mevcut hedef, kaynak içine hedef ve eski kaynak reddi; hata durumunda yalnız kendi oluşturduğu yeni klasörü temizleme.
- `scripts/package-deployment.mjs`: açık `--output` sözleşmesi, yeni paket komutu. Ayarlar, DB, bağımlılıklar ve Git taşınmaz.
- `scripts/deployment-manifest.mjs`: doğrulanmış manifesti paketleyiciye aynı doğrulama sonucunda verme; güvenli dosya okuma yardımcı sözleşmesi.
- `backend/server.mjs`: HTTP ayar kontrolü sonrası, Store oluşmadan önce dağıtım doğrulaması. Doğrulama başarısızsa veritabanını açmadan çıkış.
- `baslat-mac.sh`: npm yoksa açık hata; canonical Windows başlatıcısı ile build ve kurulum sırası aynı.
- Başlangıç/dağıtım kılavuzları yeni paket ve servis koruması için güncellendi.

## Sentetik kanıt

| Komut/kontrol | Sonuç ve ortam |
|---|---|
| `node --test tests/deployment-manifest.test.mjs` | 9/9; yalnız geçici klasörler. Dosya/manifest farkları, yol/symlink reddi, ayar/DB/bağımlılık dışlama, mevcut hedefi koruma, kaynak içi hedef ve eski paket reddi. |
| `node --test tests/http-config.test.mjs` | 4/4; geçici sunucu giriş modülü ve Store erişim tripwire. Geçerli dağıtım doğru noktaya ulaşıyor; eksik manifest ve backend/site farkı DB oluşturulmadan reddediliyor. |
| `node --test tests/startup-tools.test.mjs` | 5/5; sentetik setup ve sahte npm ile kilitli kurulum/cache/fail-fast. Gerçek kurulum kanıtı aşağıda ayrıdır. |
| `python3 /tmp/aa-y6-clean-start.py` | Gerçek `/bin/bash baslat-mac.sh`, yeni paket, boş npm cache/config, gerçek `npm ci`, TS/build, rastgele loopback portunda yalnız sentetik SQL.js ve sentetik hesap. Soğuk açılış ve restart HTTP 200; HTML yeni build ile eşit. Restart config/DB baytları korunuyor. Eski kaynak sonrası doğrudan start reddediliyor, DB baytları korunuyor. |

Gerçek kabul çıktısı `aa-y6-clean-yxapvpym/result.json` geçici test klasöründe bulunur. Test gerçek uygulama `.env` veya veritabanını okumadı/değiştirmedi. Çocuk süreçler kapatıldı. İlk paket testindeki macOS `/var`–`/private/var` yolu beklentisi gerçek yolu karşılaştıracak şekilde düzeltildi; son paket koşusu 9/9 geçti.

## Sınırlar ve kalan sıra

Bu hash manifesti imza sistemi değildir. Paket/manifesti birlikte değiştirebilen kişiye karşı koruma sağlamaz; bağımlılık güvenilirliği kilitli kurulum/CI ve kurum kontrollerine bağlıdır. Güncel kod için gerçek Windows cmd/servis/ACL, Native MSSQL, kurum proxy/TLS, yedek kurtarma ve temsili yük **Y5** kapsamında doğrulanmayı bekliyor. Yerel başarı kurum ortamı kabulü değildir.

## Aynı turdaki kullanıcı arayüzü isteği

Plan ve proje panelleri ekran yüksekliğine göre boyutlandırıldı. Ana sayfa özet satırında sonlanır; tablo dikey kaydırması bağımsızdır ve wheel/key olayları engellenmez. Projelere ortak filtre çipleriyle “Filtrelenen Projeler Özet Görünümü” eklendi. Proje özeti yalnız gerçekten uygulanan filtreleri gösterir. Plan özeti her iki gruplamada da görünür. %90 ölçek, büyük/dar ekran, özet açma/kapatma, gruplama ve haftalık görünüm sentetik tarayıcı testlerine eklendi. Gerçek kullanıcı hesabıyla giriş yapılmadı.

Arayüz için hedefli tarayıcı koşusu 12/12 grup, TypeScript ve üretim build/manifest kontrolü başarılıdır. Testteki native wheel sonrası anlık screenshot için compositor yerleşmesi beklenir; görünen başlıkların geometrisi ve `elementFromPoint` ile etkileşim katmanı ayrıca doğrulanır.

Son kullanıcı isteğiyle proje kullanım ipucu satırı kaldırıldı ve tek sayfa 250 proje olarak ayarlandı. Sayfalama, seçim/kopyalama ve tablo görünür proje dilimi ortak sabiti kullanır. Son kontrol: 13 tarayıcı grubu ve 7 workspace birim testi başarılı.

## Kullanılan uygulama klasörüne aktarım

Doğrulanmış manifestin kaynak/build dosyaları üstteki çalışma klasörüne açık dosya listesiyle eşitlendi. Eski site çıktıları ve Finder metadata dosyası site dışındaki `.deployment-backups` altına geri alınabilir biçimde taşındı; eski kaynak kopyaları da aynı yere korundu. `.env`, veri dizini, bağımlılıklar ve içteki Git deposu aktarım listesine alınmadı. Üst klasörde `node scripts/verify-deployment.mjs` başarılı; kaynak ve artifact farkları boş.

Çalışan süreç yeniden başlatılmadı. Kimliksiz `GET http://localhost:3000/` ve statik JS/CSS okumaları 200; HTML ve asset hash'leri yeni dosyalarla eşit. IP adresiyle yapılan ilk kimliksiz GET 403 döndü; uygulamanın tanımlı localhost authority korumasına uygundur. Gerçek hesapla giriş, API testi veya gerçek DB yazma yapılmadı. Arayüz yenilemede yeni dosyaları alır; diskteki sunucu/başlatıcı değişiklikleri sonraki kontrollü açılışta yüklenir.
