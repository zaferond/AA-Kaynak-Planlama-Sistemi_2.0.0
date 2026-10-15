import { planningUnitHierarchy } from "../../../../shared/leadership-planning";
import type { Data } from "../../model";
import { ownValue } from "../../../../shared/records";
import type { Team } from "../../model";
import MemberBadge from "../../components/MemberBadge";
import type { PlannedAllocationProps } from "./types";
type ActualRows = Pick<
  PlannedAllocationProps,
  "showAllActual" | "expandedActualTeams" | "onExpandedTeamsChange"
>;
export function actualRowsVisible(
  { showAllActual, expandedActualTeams }: ActualRows,
  teamId: string,
) {
  return showAllActual
    ? !expandedActualTeams.includes(teamId)
    : expandedActualTeams.includes(teamId);
}
export function PlannedActualToggle({
  team,
  ...state
}: ActualRows & { team: Team }) {
  const visible = actualRowsVisible(state, team.id);
  return (
    <button
      className="actual-expand"
      type="button"
      aria-label={
        team.name + " gerçekleşen dağılımı " + (visible ? "gizle" : "göster")
      }
      aria-expanded={visible}
      onClick={() =>
        state.onExpandedTeamsChange((old) =>
          old.includes(team.id)
            ? old.filter((id) => id !== team.id)
            : [...old, team.id],
        )
      }
    >
      {visible ? "−" : "+"}
    </button>
  );
}
export function PlannedTeamBadge({
  team,
  currentMonth,
  currentTeamMembers,
}: Pick<PlannedAllocationProps, "currentMonth" | "currentTeamMembers"> & {
  team: Team;
}) {
  return (
    <MemberBadge
      label={team.name}
      members={ownValue(currentTeamMembers, team.id) || []}
      currentMonth={currentMonth}
    />
  );
}

export function PlannedUnitName({ data, team }: { data: Data; team: Team }) {
  const { parent } = planningUnitHierarchy(data, team);
  return (
    <span
      title={
        parent && team.kind === "leadership"
          ? "Üst liderlik: " + parent
          : team.lead || "Liderlik eşleştirilmemiş"
      }
    >
      {team.name}
    </span>
  );
}
