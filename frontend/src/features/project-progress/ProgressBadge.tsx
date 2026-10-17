import type { Data } from "../../model";
import { monthLabel } from "../../format";
import { currentPlanningMonth } from "../../resource-dates";
import {
  LEVEL_LABELS,
  defaultEntryMonth,
  pctLabel,
  progressContext,
  projectRows,
  type ProjectRow,
} from "./progress-view";

export type ProgressBadgeInfo = Pick<
  ProjectRow,
  "level" | "target" | "actual"
> & { month: string };

/** Rated projects at the last closed month, for badges on other screens. */
export function progressBadgeIndex(data: Data) {
  const month = defaultEntryMonth(currentPlanningMonth().slice(0, 7));
  const out = new Map<string, ProgressBadgeInfo>();
  if (!month || !data.projectProgress?.length) return out;
  for (const row of projectRows(progressContext(data), month))
    if (row.target !== null)
      out.set(row.project.id, {
        level: row.level,
        target: row.target,
        actual: row.actual,
        month,
      });
  return out;
}

/** A small dot with the actual %; opens the project in the progress report. */
export default function ProgressBadge({
  badge,
  onOpen,
  compact = false,
}: {
  badge: ProgressBadgeInfo | undefined;
  onOpen: () => void;
  /** Only the dot, for narrow columns; the figures stay in the tooltip. */
  compact?: boolean;
}) {
  if (!badge) return null;
  const text =
    `Proje ilerlemesi (${monthLabel(badge.month)}): ` +
    `gerçekleşen %${pctLabel(badge.actual)}, hedef %${pctLabel(badge.target)} · ` +
    LEVEL_LABELS[badge.level];
  return (
    <button
      type="button"
      className="progress-badge-chip"
      data-level={badge.level}
      data-compact={compact || undefined}
      title={text}
      aria-label={text}
      onClick={(event) => {
        event.stopPropagation();
        onOpen();
      }}
    >
      <i aria-hidden="true" />
      {!compact && "%" + pctLabel(badge.actual)}
    </button>
  );
}
