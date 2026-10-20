import type { Data } from "../../model";
import type { WarningAssessment } from "../../../../shared/scenario-warnings.ts";
import { monthLabel } from "../../format";
import { ScenarioWarningStatus } from "./ScenarioWarningStatus";
export type ProgressBadgeInfo = WarningAssessment;
export function progressBadgeIndex(data: Data) {
  return new Map((data.warningAssessments || []).map((a) => [a.id, a]));
}
export default function ProgressBadge({
  badge,
  onOpen,
  compact = false,
}: {
  badge: ProgressBadgeInfo | undefined;
  onOpen: () => void;
  compact?: boolean;
}) {
  if (!badge) return null;
  const text = `${badge.month ? monthLabel(badge.month) + ": " : ""}${badge.warning1}${badge.warning2 ? " · " + badge.warning2 : ""}`;
  return (
    <button
      type="button"
      className="progress-badge-chip scenario-project-chip"
      data-progress={badge.progressState || badge.status}
      data-compact={compact || undefined}
      title={text}
      aria-label={text}
      onClick={(event) => {
        event.stopPropagation();
        onOpen();
      }}
    >
      {compact ? (
        <i aria-hidden="true" />
      ) : (
        <ScenarioWarningStatus assessment={badge} />
      )}
    </button>
  );
}
