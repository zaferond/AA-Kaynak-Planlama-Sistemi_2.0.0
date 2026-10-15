import type { Project } from "../../model";
import { phaseChipStyle, phaseChipEmpty } from "../../phase-chip";
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
  return (
    <button
      className="month-work phase-chip"
      style={phaseChipStyle(p, m)}
      data-phase-empty={m < p.start || m > p.end || phaseChipEmpty(p, m)}
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
