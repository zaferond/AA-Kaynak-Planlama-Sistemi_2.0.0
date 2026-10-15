# Kısa kullanıcı manueli

**Sürüm 1.1 / 15.10.2026.** PDF, kapak ve içindekiler dahil 9 sayfadır. Günlük kullanım 1-6. bölümlerde; sorun giderme ve IT bilgileri 7. bölümdedir. Bu sürüm kısa işlem adımları ve tablolar kullanır; eski ekran görüntülerini içermez.

- `AA-Kaynak-Planlama-Sistemi-Kullanici-Manueli.md`: düzenlenebilir Türkçe kaynak.
- `AA-Kaynak-Planlama-Sistemi-Kullanici-Manueli.pdf`: paylaşılacak belge.
- `build_manual.py`: Markdown kaynaktan PDF üretir. Veritabanına veya uygulamaya bağlanmaz.
- `assets/`: önceki belge sürümünün sentetik görselleri; güncel PDF'de kullanılmaz.

## Yeniden üretme

1. Markdown metnini düzenleyin; düğme adlarını ve davranışları güncel kodla karşılaştırın.
2. Dosyanın üst bilgisinde sürüm, tarih, uygulama sürümü ve kaynak commit'i güncelleyin. Kapak ve üstbilgi bu bilgilerden otomatik üretilir.
3. Python 3.9+ ile ayrı ortam oluşturun: `python -m venv .venv`.
4. Ortamı etkinleştirip `python -m pip install -r requirements.txt` çalıştırın.
5. Bu klasörde `python build_manual.py` çalıştırın.
6. PDF'yi yeniden açın; Türkçe karakterleri, içindekileri, sayfa numaralarını ve tüm sayfaların görünümünü kontrol edin.

Türkçe destekli Arial (macOS/Windows) veya DejaVu Sans (Linux) gerekir. Özel font dizini `AA_MANUAL_FONT_DIR` ile seçilebilir. Beklenen dosyalar: Arial.ttf, Arial Bold.ttf, Arial Italic.ttf, Arial Bold Italic.ttf. Fontlar lisansları nedeniyle pakete eklenmez. `---page---` işaretleri PDF'de sayfa sonudur.

## Doğrulama kaydı

**İncelenen uygulama commit'i:** `38b5f48abb83dc3c6827d98e13f5fa0eefd5ec6d`. Bu commit, soluk aşama renklerini, sola hizalamayı ve özet tablonun boş/açık renkli köşe başlığını içerir.

| Alan | Karşılaştırılan kaynaklar |
|---|---|
| Ekranlar, roller, filtreler | `frontend/src/settings.ts`, `features/WorkspaceNavigation.tsx`, `WorkspaceFilters.tsx`, `shared/access.ts` |
| Gerçekleşen, izin/eğitim, aktivite | `PersonAllocationPanel.tsx`, `WorkCalendarDialog.tsx`, `features/work-calendar/`, `shared/actual-months.ts`, `shared/activity-report.ts` |
| Planlanan dağılım ve yetkiler | `features/planned-allocation/`, `features/access/planning-permission-tree.ts`, `shared/access.ts` |
| Projeler ve kritik konular | `ProjectTimelineRows.tsx`, `MilestoneDateEditor.tsx`, `ProjectInfoReport.tsx`, `features/editors/`, `phase-chip.ts` |
| Çalışan ve organizasyon | `features/editors/ResourceEditorFields.tsx`, `features/access/AccessPermissionFields.tsx`, `shared/resource-roles.ts` |
| Kaynak raporları ve ilan işlemi | `features/resource-reports/`, `features/workspace/ActivePostingPlanningToggle.tsx`, `active-posting-changes.ts` |
| IT işletimi | `package.json`, `README.md`, AD/dağıtım/Windows/yedekleme kılavuzları |

`frontend/src/` altındaki kısa dosya yolları yukarıda bu köke göredir. `shared/` ve proje kökündeki yollar ayrıca belirtilmiştir.

### Bu güncellemede çalıştırılan kontroller

- `npm run build`: tip kontrolü ve arayüz derlemesi başarılı.
- Değişen frontend dosyalarında Prettier ve `git diff --check`: başarılı.
- `node --test tests/editor-commands.test.mjs tests/team-planning-permissions.test.mjs tests/active-posting-planning.test.mjs tests/headcount-report.test.mjs`: **38/38 başarılı**. Veriler sentetiktir; Store kullanan testler geçici SQL.js dosyası açar.
- Geçici tarayıcı ortamında özet başlığının kaldırılması, açık zemin, kaynak satırlarının korunması, gerçekleşen varsayılanının 24 ay olması ve Yönetici/Normal Kullanıcı menü kapsamı doğrulandı. Gerçek hesapla giriş yapılmadı.
- Önceki arayüz çalışmasında aşama renkleri ve sola hizalama, üç sekmede ve planlamanın iki görünümünde ayrıntılı/kompakt/genel bakış modlarında kontrol edildi. Bu, genel performans veya güvenlik kabulü değildir.
- PDF, pypdf/PyMuPDF ile yeniden açıldı; 9 sayfa, 7 bağlantılı bölüm, sayfa sınırları ve Türkçe metin kontrol edildi. Bütün sayfalar görüntüye dönüştürülerek görsel olarak incelendi.

### Kaynaklarda bulunan farklar ve kurum teyidi

Eski belgelerde İK Notu, Bilgi Ekle, ayrı AD yetkilendirme düğmesi, 12 aylık gerçekleşen başlangıcı ve eski grafik adları bulunur. Manuel güncel arayüzü esas alır. Kişi Eşdeğeri formda gizlidir; CoE takım rolü vardır; plan yetkisi takım bazında da verilir. Eski teknik kılavuzlardaki tarihsel ekran adları güncel kullanım talimatı olarak alınmamalıdır.

Gerçek AD/MSSQL/Windows servisi, kurum adresi, HTTPS/proxy, tarayıcı kabulü, yük ve tam geri yükleme bu belge hazırlığında denenmedi. Destek sorumlusu, dağıtılacak paket, çalışma takvimi ve kurum kabulü IT/ürün sahibi tarafından teyit edilmelidir. Gizli ayar, parola ve gerçek çalışan bilgisi belgeye eklenmemelidir.
