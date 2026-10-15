import type { Project } from "../../model";
import {
  phaseChipStyle,
  phaseChipEmpty,
  phaseRunKey,
  phaseRunParts,
  shiftMonth,
} from "../../phase-chip";
import { phaseInitial } from "../../timeline-periods";
import { monthLabel } from "../../format";
import type { PlannedAllocationProps } from "./types";
function phaseText(p: Project, m: string) {
  return m < p.start || m > p.end
    ? "Proje dönemi dışında"
    : p.phases[m] || "Çalışma bilgisi girilmemiş";
}
export default function PlannedPhaseButton({
  project: p,
  month: m,
  density,
  onPhaseClick,
  onPhaseContextMenu,
}: Pick<
  PlannedAllocationProps,
  "density" | "onPhaseClick" | "onPhaseContextMenu"
> & { project: Project; month: string }) {
  const text = phaseText(p, m);
  const inProject = (month: string) => month >= p.start && month <= p.end;
  const keyAt = (delta: number) => {
    const month = shiftMonth(m, delta);
    return phaseRunKey(p, month, inProject(month));
  };
  const run = phaseRunParts([-1, 0, 1].map(keyAt))[1];
  // Visible label width for a run start: count following months of the same phase.
  let span = 1;
  if (run === "start") while (span < 120 && keyAt(span) === keyAt(0)) span++;
  return (
    <button
      className="month-work phase-chip"
      style={phaseChipStyle(p, m, span)}
      data-phase-empty={m < p.start || m > p.end || phaseChipEmpty(p, m)}
      data-phase-run={run}
      title={p.name + " / " + monthLabel(m) + "\n" + text}
      aria-label={p.name + " / " + monthLabel(m) + " planlanan çalışma"}
      onContextMenu={(e) => onPhaseContextMenu(e, p, m)}
      onClick={() => onPhaseClick(p, m)}
      disabled={m < p.start || m > p.end}
    >
      <span className="phasepreview">
        {density === "overview"
          ? phaseInitial(p.phases[m]?.trim() || "") || "-"
          : p.phases[m]?.trim() || "-"}
      </span>
    </button>
  );
}
