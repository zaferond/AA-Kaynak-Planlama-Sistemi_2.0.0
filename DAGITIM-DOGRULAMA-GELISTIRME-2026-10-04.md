# Dağıtım doğrulama geliştirmesi — 4 Ekim 2026

## Yetki ve başlangıç

Salt okunur yeniden doğrulama raporu `DOGRULAMA-RAPORU-2026-10-04-e1a9881.md` tamamlandıktan sonra kullanıcının “ilk önemli geliştirme önerin ile devam et” talebiyle ayrı uygulama aşamasına geçildi. Raporun incelenen temeli `e1a98810b3f50ae8d1d35de11cdcb97520232809` olarak korunmuştur. Sonraki kaynak değişiklikleri o eski CI koşusuyla test edilmiş gibi sunulmaz.

## Yapılan geliştirme

- `scripts/deployment-manifest.mjs`: kaynak/build girdileri ve derleme artifact'ları için sınırlı dosya envanteri ve SHA-256; başarılı build sonrası atomic manifest yayını; derleme sırasında değişen kaynak için ret; salt okunur karşılaştırma. Backend/shared/scripts, frontend src/components/lib/assets ve belirli build/başlatma/lock dosyaları kapsanır.
- `frontend/build.mjs`: kaynak hash'lerini derlemeden önce yakalar; başarılı sonuçtan sonra yeniden karşılaştırıp proje köküne manifest yazar.
- `scripts/verify-deployment.mjs` ve `npm run deploy:verify`: kaynak/artifact changed/missing/added ayrımı; uyumsuz veya eksik manifest için exit 1. Veritabanı, Store veya uygulama oturumu kullanılmaz.
- `.gitignore`: üretilmiş manifest ve staging dosyaları Git dışında tutulur.
- Ubuntu ve Windows kalite workflow'larına build sonrası verify eklendi; Windows test listesine yeni regresyon dosyası eklendi.
- `DAGITIM-DOGRULAMA-KILAVUZU.md` ve README kullanım, paket taşıma ve kanıt sınırlarını açıklar.

## Test ve doğrulama

Tüm çalıştırmalar geçici `implementation-source/` kopyasında, gerçek `.env`/DB/hesap ortamı aktarılmadan yapıldı. Önceki kilit dosyalarıyla eşleşen sentetik dependency kurulumları kullanıldı; gerçek uygulama dependency dizinine kurulum yapılmadı.

1. `node --test --test-reporter=tap tests/deployment-manifest.test.mjs tests/startup-tools.test.mjs`: **12/12 geçti** (7 yeni dağıtım testi + 5 mevcut başlatma testi). Metin/hash çıktılarına secret/DB eklenmemesi, salt okunur doğrulama, source/lock/UI component/artifact drift, eklenen/eksilen dosya, derleme sırasında kaynak değişimi, bozuk/path-traversal manifest, eksik build ve symlink directory reddi kapsandı.
2. `npm run build`: TypeScript ve gerçek Vite/site build **exit 0**. Geçici pakette manifest oluşturuldu.
3. `npm run deploy:verify`: **exit 0, ok=true**; **340 kaynak/build girdisi ve 7 artifact** eşleşti. Archive kopyasında Git olmadığı için commit etiketi null; doğrulama hash'lerle yapıldı.
4. Gerçek üretilmiş geçici JS artifact'ına sentetik değişiklik → aynı verify komutu **exit 1**; ilgili artifact changed olarak gösterildi. Komut manifesti veya değişmiş dosyayı onarmadı/değiştirmedi. Yalnız sahip olunan geçici artifact test sonrasında eski byte'larına döndürüldü.
5. Seçili dört MJS dosyasında Prettier check ve `git diff --check`: **exit 0**.

İlk yardımcı archive oluşturma denemesi yerel Python'un desteklemediği `tarfile.extractall(filter=...)` nedeniyle durdu. Güvenli path/type kontrolüyle geçici archive çıkarıldı. İlk build doğrulaması, geçici kopyada `frontend/components` ve `frontend/lib` dizinleri eksik olduğundan typecheck'te durdu; bu uygulamada eksik kaynak olduğu anlamına gelmez. Kaynak kopyası tamamlandı ve manifest kapsamına bu UI girdileri de eklendi; nihai build/verify başarıları yukarıdadır. Ara başarısızlıklar başarı sayılmadı.

## Mimari incelemenin ek kapsamı

Başlangıç raporundaki 194 dosyalık göreli runtime import incelemesine ek olarak UI `components/lib` ve `@/` alias import'ları kontrol edildi: **201 dosya, 432 edge**; shared → uygulama katmanı veya frontend ↔ backend bağımlılık ihlali ve birden fazla modüllü cycle saptanmadı. Altı JSON/CSS import'u kod graph'ı dışında tutuldu. Bu ek kontrol backend/shared/frontend runtime koduna aittir; dağıtım araçları runtime uygulamaya import edilmez. Sonuç `architecture-extended-imports.json` içinde saklandı.

## Sınırlar ve Git durumu

- Manifest imzalı değildir; kod ve manifesti birlikte değiştirebilen kişiye karşı güvenlik sınırı oluşturmaz. Kabul sırasında manifest hash'i güvenilen ayrı arşive alınmalıdır.
- Kurulu node_modules, derleyicinin doğruluğu, çalışan süreç sürümü, kurum Windows/ACL/SQL/TLS/proxy/restore/yük kabulü bu komutun kapsamına girmez.
- Gerçek uygulama yeniden başlatılmadı; gerçek DB veya kullanıcı hesabına dokunulmadı. Üst çalıştırılabilir kopya, önceki farkları ve kullanıcı değişikliklerini korumak için bu aşamada değiştirilmedi.
- HEAD aynı kaldı; değişiklikler Git çalışma ağacındadır. Yeni kod için uzaktaki CI çalıştırılmadı; workflow güncellendi fakat yeni CI başarısı iddia edilmiyor. Commit/push yapılmadı.
- N1 operasyon kılavuzu tutarlılığı konusu ve kurum kabul işleri ilk rapordaki sırada duruyor; bu geliştirme onların kabul edildiği anlamına gelmez.

## Kanıt konumu

`/var/folders/z9/yl1whp294pb8d7qxxxdz_3f80000gn/T/aa-dogrulama-2026-10-04-kmhtw5dv`

Nihai dosyalar: `deployment-complete-tests.log`, `deployment-complete-build.log`, `deployment-complete-verify.log`, `deployment-complete-result.json`, `deployment-drift-result.json`, `deployment-drift-verify.log`, `architecture-extended-imports.json`. Önceki/ara kayıtlar ayrı dosyalardır; üzerlerine yazılmadı. Dizin geçicidir.
