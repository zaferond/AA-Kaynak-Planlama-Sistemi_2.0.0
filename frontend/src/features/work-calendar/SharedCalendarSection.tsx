import { Plus, Trash2, Pencil } from "lucide-react";
import {
  MIN_PLANNING_DATE,
  MAX_PLANNING_DATE,
} from "../../../../shared/planning-dates";
import type { CalendarDay } from "../../actual-units";
import { CALENDAR_DAY_TYPES as types } from "../calendar-commands";
import type { SharedCalendarForm } from "./types";
import type { WorkCalendarEditor } from "./useWorkCalendarEditor";
import type { WorkCalendarView } from "./useWorkCalendarView";
import { formatCalendarRange } from "./format";

export default function SharedCalendarSection({
  form,
  update,
  entries,
  canEdit,
  busy,
  setSharedStart,
  addDates,
  removeDate,
  editing,
  editShared,
  cancelEdit,
}: {
  form: SharedCalendarForm;
  update: WorkCalendarEditor["updateShared"];
  entries: WorkCalendarView["entries"];
  canEdit: boolean;
  busy: boolean;
  setSharedStart: (from: string) => void;
  addDates: () => void;
  removeDate: WorkCalendarEditor["removeDate"];
  editing: boolean;
  editShared: WorkCalendarEditor["editShared"];
  cancelEdit: WorkCalendarEditor["cancelSharedEdit"];
}) {
  const { from, to, type, fraction, label } = form;
  return (
    <>
      {canEdit && (
        <div className="work-calendar-form">
          <div className="work-calendar-form-title">
            {editing
              ? "Çalışma dışı tarih aralığını düzenle"
              : "Çalışma dışı tarih ekle"}
          </div>
          <div className="work-calendar-fields work-calendar-shared-fields">
            <label>
              Başlangıç
              <input
                disabled={busy}
                type="date"
                min={MIN_PLANNING_DATE}
                max={MAX_PLANNING_DATE}
                value={from}
                onChange={(event) => {
                  setSharedStart(event.target.value);
                }}
              />
            </label>
            <label>
              Bitiş
              <input
                disabled={busy}
                type="date"
                min={from || MIN_PLANNING_DATE}
                max={MAX_PLANNING_DATE}
                value={to}
                onChange={(event) => update("to", event.target.value)}
              />
            </label>
            <label>
              Tür
              <select
                disabled={busy}
                aria-label="Tür"
                value={type}
                onChange={(event) =>
                  update("type", event.target.value as CalendarDay["type"])
                }
              >
                {types.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Süre
              <select
                disabled={busy}
                aria-label="Süre"
                value={fraction}
                onChange={(event) =>
                  update("fraction", Number(event.target.value) as 0.5 | 1)
                }
              >
                <option value={1}>Tam gün</option>
                <option value={0.5}>Yarım gün</option>
              </select>
            </label>
            <label className="work-calendar-label">
              Açıklama
              <input
                disabled={busy}
                value={label}
                maxLength={100}
                placeholder={types.find((item) => item.id === type)?.label}
                onChange={(event) => update("label", event.target.value)}
              />
            </label>
            <div className="work-calendar-form-actions">
              <button
                type="button"
                className="button primary"
                disabled={busy}
                onClick={addDates}
              >
                {editing ? <Pencil size={14} /> : <Plus size={14} />}
                {editing ? "Güncelle" : "Ekle"}
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
        </div>
      )}
      <div className="work-calendar-list">
        <h3>Çalışma Dışı Tarihler</h3>
        {entries.length ? (
          <ul>
            {entries.map((range) => {
              const item = range.entry;
              const name = `${range.from} – ${range.to} çalışma dışı tarih aralığını`;
              return (
                <li key={range.keys[0]} className="work-calendar-range-row">
                  <span className="work-calendar-range-dates">
                    {formatCalendarRange(range.from, range.to)}
                    <small>Başlangıç → bitiş (dahil)</small>
                  </span>
                  <span>
                    {item.label}
                    <small>
                      {types.find((type) => type.id === item.type)?.label} ·{" "}
                      {item.fraction === 0.5 ? "Yarım gün" : "Tam gün"}
                      {" · "}
                      {range.keys.length} takvim günü
                    </small>
                  </span>
                  {canEdit && (
                    <div className="work-calendar-range-actions">
                      <button
                        type="button"
                        disabled={busy}
                        aria-label={name + " düzenle"}
                        onClick={() => editShared(range)}
                      >
                        <Pencil size={13} /> Düzenle
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        className="danger"
                        aria-label={name + " sil"}
                        title="Aralığın tamamını sil"
                        onClick={() => removeDate(range)}
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
          <p>Bu yıl için çalışma dışı tarih eklenmedi.</p>
        )}
      </div>
    </>
  );
}
