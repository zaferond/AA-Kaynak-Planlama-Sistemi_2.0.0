import {
  MIN_PLANNING_YEAR,
  MAX_PLANNING_YEAR,
} from "../../shared/planning-dates";
import { CalendarDays } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useWorkCalendarEditor } from "./features/work-calendar/useWorkCalendarEditor";
import { useWorkCalendarView } from "./features/work-calendar/useWorkCalendarView";
import SharedCalendarSection from "./features/work-calendar/SharedCalendarSection";
import PersonalCalendarSection from "./features/work-calendar/PersonalCalendarSection";
import type { WorkCalendarDialogProps } from "./features/work-calendar/types";

export default function WorkCalendarDialog(props: WorkCalendarDialogProps) {
  const { open, onOpenChange, data, mode, resource, canEdit, canEditPersonal } =
    props;
  const editor = useWorkCalendarEditor(props);
  const { year, setYear, draft, dirty, busy, error, save, requestOpenChange } =
    editor;
  const { entries, personalEntries } = useWorkCalendarView({
    data,
    resource,
    year,
    calendar: draft,
  });
  return (
    <Dialog open={open} onOpenChange={requestOpenChange}>
      <DialogContent
        className={`work-calendar-dialog work-calendar-dialog-${mode}`}
        aria-describedby={undefined}
      >
        <DialogHeader>
          <DialogTitle>
            <CalendarDays size={18} />{" "}
            {mode === "shared"
              ? "Çalışma Takvimi"
              : resource?.name + " · İzin ve Eğitim Takvimi"}
          </DialogTitle>
        </DialogHeader>
        <div className="work-calendar-body">
          <div className="work-calendar-year">
            <button
              type="button"
              disabled={busy || year <= MIN_PLANNING_YEAR}
              onClick={() => setYear(year - 1)}
            >
              ‹
            </button>
            <strong>{year}</strong>
            <button
              type="button"
              disabled={busy || year >= MAX_PLANNING_YEAR}
              onClick={() => setYear(year + 1)}
            >
              ›
            </button>
            <span>
              {mode === "shared" ? entries.length : personalEntries.length}{" "}
              kayıt
            </span>
          </div>
          {mode === "personal" && resource && (
            <PersonalCalendarSection
              form={editor.personalForm}
              update={editor.updatePersonal}
              setPersonalStart={editor.setPersonalStart}
              preview={editor.personalPreview}
              entries={personalEntries}
              canEdit={canEditPersonal}
              busy={busy}
              savePersonal={editor.savePersonal}
              removePersonal={editor.removePersonal}
              editing={!!editor.editingPersonal}
              editPersonal={editor.editPersonal}
              cancelEdit={editor.cancelPersonalEdit}
            />
          )}
          {mode === "shared" && (
            <SharedCalendarSection
              form={editor.sharedForm}
              update={editor.updateShared}
              entries={entries}
              canEdit={canEdit}
              busy={busy}
              setSharedStart={editor.setSharedStart}
              addDates={editor.addDates}
              removeDate={editor.removeDate}
              editing={!!editor.editingShared}
              editShared={editor.editShared}
              cancelEdit={editor.cancelSharedEdit}
            />
          )}
        </div>
        {error && (
          <p role="alert" className="work-calendar-error">
            {error}
          </p>
        )}
        <div className="work-calendar-actions">
          <button
            type="button"
            className="button"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Kapat
          </button>
          {mode === "shared" && canEdit && (
            <button
              type="button"
              className="button primary"
              disabled={busy || !dirty || !!editor.editingShared}
              onClick={() => void save()}
            >
              {busy ? "Kaydediliyor…" : "Takvimi Kaydet"}
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
