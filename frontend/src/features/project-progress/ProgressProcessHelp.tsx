import {
  PLAN_LABELS,
  PLAN_STATUS_TITLE,
  ENTRY_STATUS_TITLE,
  PLAN_HELP,
  entryPresentation,
  type PlanStatus,
} from "./progress-status";

const entryStates = (
  [
    ["closed", false],
    ["waiting", false],
    ["entered", false],
    ["entered", true],
    ["waiting", true],
  ] as const
).map(([status, locked]) => entryPresentation(status, locked)!);

export default function ProgressProcessHelp() {
  return (
    <details className="progress-process-help">
      <summary>Durumlar ve süreç nasıl işler?</summary>
      <p>
        Hedefleri hazırlayın → Taslağı kaydedin → Proje ekibi onayına gönderin →
        Onaydan sonra her ay gerçekleşen yüzdeyi ve açıklamasını kaydedin.
      </p>
      <p>
        “Yönetici Girişi Bekleniyor” → “Taslak” → “Proje Ekibi Onayında” →
        “Proje Ekibi Onayladı” sırası hedef planına aittir. Gerçekleşen plan
        durumu, hedef plan onaylandıktan sonra gösterilir. Seçili ay takip
        dönemindeyse ve henüz kayıt yoksa “Yönetici Girişi Bekleniyor” görünür.
        Gelecek aylara ve takip öncesindeki aylara giriş açılamaz.
      </p>
      <p>
        Yüzdeler, ilgili liderliğin bu projedeki işinin ay sonuna kadar
        tamamlanan toplam payıdır. Örneğin %45, o ay sonuna kadar toplam işin
        %45’inin tamamlandığı anlamına gelir.
      </p>
      <p>
        “Tamamlandı”, seçili ayın gerçekleşen girişinin kaydedildiğini belirtir.
        Kaydettikten sonra gerçekleşen oranı salt okunur gösterilir, açıklama
        alanı gizlenir. Kayıtlı açıklama korunur. Ay değişikliğe açıkken
        “Gerçekleşen Oran Revize Et” düğmesiyle ikisini de düzenleyip
        “Gerçekleşeni Kaydet” ile yeniden kaydedebilirsiniz. “Gerçekleşen
        Revizyonunu İptal Et” son kaydedilen değerleri geri getirir. Ay
        kilitlendiğinde revizyon yapılamaz.
      </p>
      <div className="progress-process-columns">
        <div>
          <strong>{PLAN_STATUS_TITLE}</strong>
          <dl>
            {(Object.keys(PLAN_LABELS) as PlanStatus[]).map((status) => (
              <div key={status}>
                <dt>{PLAN_LABELS[status]}</dt>
                <dd>{PLAN_HELP[status]}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div>
          <strong>{ENTRY_STATUS_TITLE}</strong>
          <dl>
            {entryStates.map((state) => (
              <div key={state.label}>
                <dt>{state.label}</dt>
                <dd>{state.help}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
      <p>
        “Düzeltme İçin Geri Gönder” planı yeniden düzenlenebilir taslağa
        döndürür. Onaylı plan değişecekse gerekçeli bir revizyon hazırlanır;
        revizyon onaylanana kadar önceki plan geçerli kalır. {PLAN_STATUS_TITLE}{" "}
        filtresi, varsa revizyonun durumunu gösterir. Onay işlemini sistem
        yöneticisi yetkisine sahip kullanıcılar yapar.
      </p>
    </details>
  );
}
