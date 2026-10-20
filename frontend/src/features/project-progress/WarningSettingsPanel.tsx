import { useState } from "react";
import type { Data } from "../../model";
import type { Change } from "../../../../shared/commands.ts";
import {
  DEFAULT_WARNING_SETTINGS,
  warningSettingsSchema,
  SCENARIO_WARNING_RULES,
  WARNING_PROGRESS_LABELS,
  WARNING_RESOURCE_LABELS,
  type WarningSettings,
} from "../../../../shared/scenario-warning-policy.ts";
import { warningSettings } from "../../../../shared/scenario-warnings.ts";

const fields: { key: keyof WarningSettings; label: string; step: string }[] = [
  {
    key: "aheadThreshold",
    label: "Planın İlerisinde: en az sapma (puan)",
    step: "0.1",
  },
  {
    key: "behindThreshold",
    label: "Planın Gerisinde: sapma bu değerden küçük (puan)",
    step: "0.1",
  },
  {
    key: "criticalThreshold",
    label: "Kritik Gecikme: sapma bu değerden küçük (puan)",
    step: "0.1",
  },
  {
    key: "resourceHorizonMonths",
    label: "Kaynak planı kontrol dönemi (ay)",
    step: "1",
  },
  {
    key: "coverageMinimum",
    label: "Yeterli kaynak: en az karşılama (%)",
    step: "0.1",
  },
  {
    key: "coverageMaximum",
    label: "Yeterli kaynak: en fazla karşılama (%)",
    step: "0.1",
  },
  {
    key: "trendMonths",
    label: "Kritik Gecikme için ardışık kilitli ay sayısı",
    step: "1",
  },
];
const strings = (settings: Readonly<WarningSettings>) =>
  Object.fromEntries(
    fields.map(({ key }) => [key, String(settings[key])]),
  ) as Record<keyof WarningSettings, string>;

export default function WarningSettingsPanel({
  data,
  saving,
  onSave,
}: {
  data: Data;
  saving: boolean;
  onSave: (changes: Change[]) => Promise<void>;
}) {
  const [values, setValues] = useState(() => strings(warningSettings(data)));
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  async function save() {
    setError("");
    setSaved(false);
    const parsed = warningSettingsSchema.safeParse(
      Object.fromEntries(
        fields.map(({ key }) => [
          key,
          values[key].trim() ? Number(values[key].replace(",", ".")) : NaN,
        ]),
      ),
    );
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message || "Geçerli eşikler girin.");
      return;
    }
    try {
      await onSave([
        {
          kind: "warningConfig",
          id: "global",
          revision: data.revisions["warningConfig:global"] || 0,
          value: {
            id: "global",
            settings: parsed.data,
            updatedAt: "",
            updatedById: "",
            updatedByName: "",
          },
        },
      ]);
      setSaved(true);
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  return (
    <section className="scenario-settings" aria-label="Uyarı Ayarları">
      <h3>Uyarı Ayarları</h3>
      <p>
        Eşikler tüm projeler için geçerlidir. Kaydedildiğinde senaryo uyarıları
        yeniden değerlendirilir.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <div className="scenario-settings-grid">
          {fields.map(({ key, label, step }) => (
            <label key={key}>
              {label}
              <input
                type="number"
                step={step}
                required
                value={values[key]}
                onChange={(event) => {
                  setValues({ ...values, [key]: event.target.value });
                  setSaved(false);
                }}
              />
            </label>
          ))}
        </div>
        {error && (
          <p className="progress-error" role="alert">
            {error}
          </p>
        )}
        {saved && (
          <p role="status">
            Uyarı ayarları kaydedildi; değerlendirmeler güncellendi.
          </p>
        )}
        <div className="scenario-form-actions">
          <button className="button primary" disabled={saving} type="submit">
            Ayarları Kaydet
          </button>
          <button
            className="button"
            disabled={saving}
            type="button"
            onClick={() => {
              setValues(strings(DEFAULT_WARNING_SETTINGS));
              setSaved(false);
            }}
          >
            Varsayılanları Getir
          </button>
        </div>
      </form>
      <details className="progress-process-help">
        <summary>Senaryo kural tablosu</summary>
        <table className="progress-table compact">
          <thead>
            <tr>
              <th>Kod</th>
              <th>İlerleme</th>
              <th>Kaynak</th>
              <th>1. Uyarı</th>
              <th>2. Uyarı / Aksiyon</th>
            </tr>
          </thead>
          <tbody>
            {SCENARIO_WARNING_RULES.map((r) => (
              <tr key={r.kod}>
                <td>{r.kod}</td>
                <td>
                  {r.ilerleme
                    .map((s) => WARNING_PROGRESS_LABELS[s])
                    .join(" / ")}
                </td>
                <td>{WARNING_RESOURCE_LABELS[r.kaynak]}</td>
                <td>{r.uyari1}</td>
                <td>{r.uyari2}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>
          Kritik Gecikme durumunda 1. Uyarı aynı adla gösterilir. Matriste
          karşılığı olmayan birleşimlerde yalnız ilerleme durumu gösterilir.
          Tamamlanan projelerde uyarı üretilmez.
        </p>
      </details>
    </section>
  );
}
