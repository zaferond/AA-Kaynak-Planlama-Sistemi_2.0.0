import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Project } from "./model";
import type { ReportTopic } from "./project-info-report";
import { topicWeeks } from "./project-info-status";
import { isoWeek, weeksInRange } from "./iso-week";
import TopicWeeks from "./ProjectInfoWeeks";

export type TopicEdit = {
  project: Project;
  infoName: string;
  topic: ReportTopic;
};
type Props = {
  edit: TopicEdit | null;
  today: string;
  busy: boolean;
  error: string;
  onSave: (change: { text: string; start: string; end: string }) => void;
  onClose: () => void;
};

const monthEnd = (month: string) =>
  new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0))
    .toISOString()
    .slice(0, 10);
const NO_SELECTION: ReadonlySet<string> = new Set();

/** Edits one critical detail topic: its text and its dates, with a live
 * preview of the weeks the new dates cover and the weeks they cancel. */
export default function ProjectInfoTopicDialog(props: Props) {
  return (
    <Dialog
      open={!!props.edit}
      onOpenChange={(open) => {
        if (!open && !props.busy) props.onClose();
      }}
    >
      {props.edit && (
        <TopicForm
          key={props.edit.topic.rangeIndex + "-" + props.edit.topic.noteIndex}
          {...props}
          edit={props.edit}
        />
      )}
    </Dialog>
  );
}

function TopicForm({
  edit,
  today,
  busy,
  error,
  onSave,
  onClose,
}: Props & { edit: TopicEdit }) {
  const { project, topic } = edit;
  const [text, setText] = useState(topic.text);
  const [start, setStart] = useState(topic.start);
  const [end, setEnd] = useState(topic.end);
  const min = project.start + "-01",
    max = monthEnd(project.end);
  const datesChanged = start !== topic.start || end !== topic.end;
  const problem = !text.trim()
    ? "Açıklama boş olamaz."
    : !start || !end
      ? "Başlangıç ve bitiş tarihi girin."
      : end < start
        ? "Bitiş tarihi başlangıçtan önce olamaz."
        : start < min || end > max
          ? "Tarihler proje süresi içinde olmalıdır."
          : "";
  // What the report will show after saving: a date change moves the old
  // weeks into the history, which lists them as cancelled.
  const preview = problem
    ? []
    : topicWeeks({
        ...topic,
        start,
        end,
        weekHistory: datesChanged
          ? [
              ...(topic.weekHistory || []),
              ...weeksInRange(topic.start, topic.end).map((week) => week.key),
            ]
          : topic.weekHistory,
      });
  const newlyCancelled = preview.filter(
    ({ week, state }) =>
      state === "cancelled" && !topic.weekHistory?.includes(week.key),
  ).length;
  return (
    <DialogContent
      className="editor project-info-topic-dialog"
      showCloseButton={!busy}
    >
      <DialogHeader>
        <DialogTitle>Kritik Detay Konuyu Düzenle</DialogTitle>
        <DialogDescription>
          {project.name} · {edit.infoName}
        </DialogDescription>
      </DialogHeader>
      <form
        className="project-info-topic-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (!problem) onSave({ text: text.trim(), start, end });
        }}
      >
        <label>
          Açıklama
          <textarea
            autoFocus
            rows={4}
            aria-label="Kritik detay konu açıklaması"
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
        </label>
        <div className="project-info-topic-dates">
          <label>
            Başlangıç Tarihi
            <input
              type="date"
              aria-label="Kritik detay konu başlangıç tarihi"
              min={min}
              max={max}
              value={start}
              onChange={(event) => {
                // The end follows the start; it can be moved afterwards.
                setStart(event.target.value);
                setEnd(event.target.value);
              }}
            />
          </label>
          <label>
            Bitiş Tarihi
            <input
              type="date"
              aria-label="Kritik detay konu bitiş tarihi"
              min={min}
              max={max}
              value={end}
              onChange={(event) => setEnd(event.target.value)}
            />
          </label>
        </div>
        <div className="project-info-topic-preview" aria-live="polite">
          <span className="project-info-topic-preview-label">Haftalar</span>
          {preview.length ? (
            <TopicWeeks
              weeks={preview}
              thisWeek={isoWeek(today)}
              selected={NO_SELECTION}
            />
          ) : (
            <span className="project-info-topic-preview-empty">—</span>
          )}
        </div>
        {newlyCancelled > 0 && (
          <p className="project-info-topic-note">
            Kaydettiğinizde eski tarihlerin {newlyCancelled} haftası raporda
            kırmızı olarak kalır.
          </p>
        )}
        {(problem || error) && (
          <p role="alert" className="project-info-topic-error">
            {problem || error}
          </p>
        )}
        <DialogFooter>
          <button
            type="button"
            className="button"
            disabled={busy}
            onClick={onClose}
          >
            Vazgeç
          </button>
          <button
            type="submit"
            className="button primary"
            disabled={busy || !!problem}
          >
            Kaydet
          </button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
