import { Plus, Trash2, Pencil } from "lucide-react";
import {
  MIN_PLANNING_DATE,
  MAX_PLANNING_DATE,
} from "../../../../shared/planning-dates";
import { PERSONAL_HOURS_STEP } from "../../calendar-rules";
import { HOURS_PER_WORKDAY } from "../../actual-units";
import type { PersonalCalendarForm } from "./types";
import type { WorkCalendarEditor } from "./useWorkCalendarEditor";
import type { WorkCalendarView } from "./useWorkCalendarView";
import { formatCalendarRange } from "./format";

export default function PersonalCalendarSection({
  form,
  update,
  setPersonalStart,
  preview,
  entries: personalEntries,
  canEdit,
  busy,
  savePersonal,
  removePersonal,
  editing,
  editPersonal,
  cancelEdit,
}: {
  form: PersonalCalendarForm;
  update: WorkCalendarEditor["updatePersonal"];
  setPersonalStart: WorkCalendarEditor["setPersonalStart"];
  preview: WorkCalendarEditor["personalPreview"];
  entries: WorkCalendarView["personalEntries"];
  canEdit: boolean;
  busy: boolean;
  savePersonal: () => Promise<void>;
  removePersonal: WorkCalendarEditor["removePersonal"];
  editing: boolean;
  editPersonal: WorkCalendarEditor["editPersonal"];
  cancelEdit: WorkCalendarEditor["cancelPersonalEdit"];
}) {
  const {
    from: personalFrom,
    to: personalTo,
    type: personalType,
    hours: personalHours,
    label: personalLabel,
  } = form;
  return (
    <section className="work-calendar-personal">
      <h3>
        {editing ? "İzin / Eğitim Aralığını Düzenle" : "Yeni İzin / Eğitim"}
      </h3>
      {canEdit && (
        <div className="work-calendar-fields work-calendar-personal-fields">
          <label>
            {personalType === "leave"
              ? "İzin Ayrılış Tarihi"
              : "Eğitim Başlangıç Tarihi"}
            <input
              disabled={busy}
              type="date"
              min={MIN_PLANNING_DATE}
              max={MAX_PLANNING_DATE}
              value={personalFrom}
              onChange={(event) => setPersonalStart(event.target.value)}
            />
          </label>
          <label>
            {personalType === "leave"
              ? "İzin Dönüş Tarihi"
              : "Eğitim Dönüş Tarihi"}
            <input
              disabled={busy}
              type="date"
              min={personalFrom || MIN_PLANNING_DATE}
              max={MAX_PLANNING_DATE}
              value={personalTo}
              onChange={(event) => update("to", event.target.value)}
            />
          </label>
          <label>
            Tür
            <select
              disabled={busy}
              value={personalType}
              onChange={(event) =>
                update("type", event.target.value as "leave" | "training")
              }
            >
              <option value="leave">İzin</option>
              <option value="training">Eğitim</option>
            </select>
          </label>
          <label>
            Günlük Saat
            <input
              disabled={busy}
              type="number"
              min={PERSONAL_HOURS_STEP}
              max={HOURS_PER_WORKDAY}
              step={PERSONAL_HOURS_STEP}
              value={personalHours}
              onChange={(event) => update("hours", event.target.value)}
            />
          </label>
          <label className="work-calendar-label">
            Açıklama
            <input
              disabled={busy}
              maxLength={100}
              value={personalLabel}
              onChange={(event) => update("label", event.target.value)}
              placeholder="İsteğe bağlı"
            />
          </label>
          <div className="work-calendar-form-actions">
            <button
              type="button"
              className="button primary"
              disabled={busy}
              onClick={() => void savePersonal()}
            >
              {editing ? <Pencil size={14} /> : <Plus size={14} />}
              {editing ? "Güncelle" : "Kaydet"}
            </button>
            {editing && (
              <button
                type="button"
                className="button work-calendar-cancel-edit"
                disabled={busy}
                onClick={cancelEdit}
              >
                Vazgeç
              </button>
            )}
          </div>
        </div>
      )}
      {canEdit && preview && (
        <p
          className={
            preview.error
              ? "work-calendar-error work-calendar-range-preview"
              : "work-calendar-range-preview"
          }
        >
          {preview.error ||
            `${preview.days} çalışma günü · ${preview.hours.toLocaleString("tr-TR")} saat · Dönüş günü hariç`}
        </p>
      )}
      <div className="work-calendar-list">
        <h3>Kayıtlı İzin ve Eğitimler</h3>
        {personalEntries.length ? (
          <ul>
            {personalEntries.map((range) => {
              const item = range.entry;
              const name = `${range.from} – ${range.to} ${item.type === "leave" ? "izin" : "eğitim"} aralığını`;
              return (
                <li key={range.keys[0]} className="work-calendar-range-row">
                  <span className="work-calendar-range-dates">
                    {formatCalendarRange(range.from, range.to)}
                    <small>Ayrılış / başlangıç → dönüş (hariç)</small>
                  </span>
                  <span>
                    <strong>{item.type === "leave" ? "İzin" : "Eğitim"}</strong>
                    {item.label ? " · " + item.label : ""}
                    <small>
                      {range.days} çalışma günü ·{" "}
                      {range.totalHours.toLocaleString("tr-TR")} saat
                    </small>
                  </span>
                  {canEdit && (
                    <div className="work-calendar-range-actions">
                      <button
                        type="button"
                        disabled={busy}
                        aria-label={name + " düzenle"}
                        onClick={() => editPersonal(range)}
                      >
                        <Pencil size={13} /> Düzenle
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        className="danger"
                        aria-label={name + " sil"}
                        title="Aralığın tamamını sil"
                        onClick={() => void removePersonal(range)}
                      >
                        <Trash2 size={14} />
                        Sil
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p>Bu yıl için izin veya eğitim kaydı yok.</p>
        )}
      </div>
    </section>
  );
}
