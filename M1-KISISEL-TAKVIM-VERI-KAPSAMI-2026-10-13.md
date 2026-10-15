# M1 - Kişisel takvim veri kapsamı

Tarih: 13.10.2026. Başlangıç kaynak commit'i: `ee4ebbd3d014454fadf7dbfaba40892028fea1f0`.

## Durum

**Giderildi - yerel kaynak, sentetik HTTP ve tarayıcı doğrulaması.** Kurumun gerçek AD/MSSQL ortamı bu çalışmada kullanılmadı. Diğer inceleme maddeleri bu değişikliğin kapsamına alınmadı.

## Değişiklik

- `shared/access.ts` içindeki `canReadPersonalCalendar`, günlük izin/eğitim ayrıntılarını yalnız Admin veya ilgili çalışana açar. Liderlik yetkisi bu günlük takvim kapsamını genişletmez.
- `scopeData`, hem `personCalendar` kayıtlarında hem `personDay` revision/tombstone anahtarlarında aynı politikayı kullanır. Böylece `/api/data`, `/api/actual-view` taban projeksiyonu ve yazma sonrası tam snapshot aynı sınırı korur.
- Önceki yöneticiye göre aralık kırpma kodu kaldırıldı: başka kişilerin günlük aralıkları artık hiç gönderilmez; kişinin kendi aralıkları ve transfer geçmişi korunur.
- Gerçekleşen görünümün aylık kapasite, eğitim ve izin toplamları tam sunucu verisinden hesaplanmaya devam eder. Günlük açıklama ve tarih listesi bu toplamlara eklenmez.
- `PersonAllocationPanel` takvim düğmesinde aynı erişim politikasını kullanır. Giriş komutları, başkalarının takvimini yeniden oluşturmaya çalışmadan yetkili aylık özet üzerinden kapasite sınırı ve manuel net saat dönüşümünü yapar. Sunucu doğrulaması/revision kontrolü korunur.
- Plan tahsisleri, gerçekleşen kayıtlar ve kişisel takvim verileri silinmedi; değişiklik yanıt projeksiyonu ve istemci hesap girdisindedir. Migration gerekmez.

## Kanıtlar

1. Yeni HTTP regresyon testi, HEAD'in eski `shared/access.ts` dosyasıyla geçici kaynak kopyasında çalıştırıldı: 6 kontrolden 3'ü başarısız; yönetici ve eşleşmemiş yönetici özel takvim kayıtlarını alabiliyordu. Test kopyası/DB temizlendi.
2. Düzeltme sonrasında `tests/record-access-http.test.mjs`: **56/56**. Normal, eşleşmemiş Normal, Yönetici, eşleşmemiş Yönetici ve Admin; `/data`, `/actual-view`, gerçekleşen güncelleme yanıtı ve yenileme kontrol edildi. Yetkisiz kişisel takvim yazması hâlâ 403; DB'deki takvim aynı kaldı. İzin/eğitim toplamları korundu.
3. Scope, actual team/hierarchy, actual komutları ve Excel testleri: **33/33**. Anonim/proje toplamları, kendi transfer kayıtları, peer aylık özetleri, yüzde/saat girişleri, eğitimle kapasite aşımı, manuel saat/reset ve Excel aylık toplamları doğrulandı.
4. `checkActualManagerHierarchy` sentetik tarayıcı senaryoları: **2/2**, sayfa hatası yok. Özel takvim içeren alt liderlik çalışanının aylık net saati 191'den 210'a değiştirilirken doğru saklanan değer 219 oldu; günlük takvim kayıtları API'de yoktu, görünür dağılımlar düzenlenebildi.
5. Tip kontrolü ve derleme; biçim kontrolü, 51 ortak dosyalı AST sınır kontrolü ve dağıtım kaynak/derleme doğrulaması başarılı.

Testler yalnız geçici SQL.js, sentetik hesap/veri ve rastgele loopback portlarında çalıştırıldı. Gerçek kullanıcıyla giriş, çalışan DB'sinde işlem veya migration yapılmadı. Tam test paketi bu tur koşulmadı; önceki rapordaki M2 test yükleme konusu ayrı kalır.

## Çalıştırılan komutlar

```sh
node --test tests/record-access-http.test.mjs
node --test tests/scope-index.test.mjs tests/actual-team-view.test.mjs tests/actual-hierarchy-permissions.test.mjs tests/actual-allocation-commands.test.mjs tests/xlsx-workbook.test.mjs
npm run build
npm run check:domain
npm run format:check
npm run deploy:verify
```

Tarayıcı kontrolü mevcut `scripts/browser-checks/fixture.mjs` ile ayrı geçici runner üzerinden `checkActualManagerHierarchy` çağrılarak yapıldı. Çalıştırma kopyasına yalnız öncesi HEAD ile byte bazında eşleşen değişen dosyalar aktarıldı ve bu kopya da yeniden derlendi. Çalışan sunucu yeniden başlatılmadı; backend politikasının servis tarafından yüklenmesi için sonraki sunucu başlatması/yeniden başlatması gerekir.
