import {
  PLAN_LABELS,
  PLAN_STATUS_TITLE,
  ENTRY_STATUS_TITLE,
  PLAN_HELP,
  ENTRY_LABELS,
  ENTRY_HELP,
  type PlanStatus,
  type EntryStatus,
} from "./progress-status";

export default function ProgressProcessHelp() {
  return (
    <details className="progress-process-help">
      <summary>Durumlar ve süreç nasıl işler?</summary>
      <p>
        Hedefleri hazırlayın → Taslağı kaydedin → Proje ekibi onayına gönderin →
        Onaydan sonra her ay gerçekleşen yüzdeyi ve açıklamasını kaydedin.
      </p>
      <p>
        Yüzdeler, ilgili liderliğin bu projedeki işinin ay sonuna kadar
        tamamlanan toplam payıdır. Örneğin %45, o ay sonuna kadar toplam işin
        %45’inin tamamlandığı anlamına gelir.
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
            {(Object.keys(ENTRY_LABELS) as EntryStatus[]).map((status) => (
              <div key={status}>
                <dt>{ENTRY_LABELS[status]}</dt>
                <dd>{ENTRY_HELP[status]}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div>
          <strong>Ay kilidi</strong>
          <dl>
            <div>
              <dt>Değişikliğe açık</dt>
              <dd>
                Onaylı planın takip dönemindeki mevcut ve geçmiş aylara giriş
                yapılabilir, kayıtlar düzenlenebilir.
              </dd>
            </div>
            <div>
              <dt>Değişikliğe kapalı</dt>
              <dd>
                Giriş yapılmış olsa da olmasa da bu ay değiştirilemez. Kilidi
                yalnız sistem yöneticisi açabilir.
              </dd>
            </div>
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
