import type { IsoWeek } from "./iso-week";
import { shiftWeek, weekDates, weekLabel } from "./iso-week";
import type { TopicWeek, WeekState } from "./project-info-status";

/** Current ranges longer than this collapse to one "W01–W20" chip. */
const COLLAPSE_CURRENT_WEEKS = 9;

/** Consecutive weeks in the same state; only very long runs of current
 * weeks collapse. Cancelled weeks stay one red box each. */
function weekRuns(weeks: TopicWeek[]) {
  const runs: TopicWeek[][] = [];
  for (const item of weeks) {
    const last = runs.at(-1)?.at(-1);
    if (
      last &&
      last.state === item.state &&
      shiftWeek(last.week, 1).key === item.week.key
    )
      runs.at(-1)!.push(item);
    else runs.push([item]);
  }
  return runs.flatMap((run) =>
    run.length >= COLLAPSE_CURRENT_WEEKS && run[0].state === "current"
      ? [run]
      : run.map((w) => [w]),
  );
}

export default function TopicWeeks({
  weeks,
  thisWeek,
  selected,
  cancelledCaption = "İptal edilen:",
}: {
  weeks: TopicWeek[];
  thisWeek: IsoWeek;
  selected: ReadonlySet<string>;
  cancelledCaption?: string;
}) {
  if (!weeks.length) return null;
  const year = thisWeek.year;
  const current = weeks.filter((w) => w.state !== "cancelled");
  const cancelled = weeks.filter((w) => w.state === "cancelled");
  const notes: Record<WeekState, string> = {
    current: "",
    cancelled: " · tarih değişikliğiyle iptal edildi",
  };
  const chip = (run: TopicWeek[]) => {
    const first = run[0].week,
      last = run.at(-1)!.week,
      state = run[0].state;
    return (
      <span
        key={state + first.key}
        className="project-info-week"
        data-state={state}
        data-current={
          run.some(({ week }) => week.key === thisWeek.key) || undefined
        }
        data-selected={
          run.some(({ week }) => selected.has(week.key)) || undefined
        }
        title={
          (run.length > 1
            ? `${weekDates(first)} … ${weekDates(last)}`
            : weekDates(first)) + notes[state]
        }
      >
        {run.length > 1
          ? `${weekLabel(first, year)}–${weekLabel(last, year)} · ${run.length} hafta`
          : weekLabel(first, year)}
      </span>
    );
  };
  return (
    <>
      {current.length > 0 && (
        <span
          className="project-info-weeks"
          aria-label={
            "Haftalar: " +
            current
              .map((w) => weekLabel(w.week, year) + notes[w.state])
              .join(", ")
          }
        >
          {weekRuns(current).map(chip)}
        </span>
      )}
      {cancelled.length > 0 && (
        <span
          className="project-info-weeks project-info-weeks-cancelled"
          aria-label={
            "İptal edilen haftalar: " +
            cancelled.map((w) => weekLabel(w.week, year)).join(", ")
          }
        >
          <span className="project-info-weeks-caption" aria-hidden="true">
            {cancelledCaption}
          </span>
          {cancelled.map((week) => chip([week]))}
        </span>
      )}
    </>
  );
}
