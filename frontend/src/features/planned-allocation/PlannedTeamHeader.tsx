import { TableRow, TableCell } from "@/components/ui/table";
import { planningUnitHierarchy } from "../../../../shared/leadership-planning";
import { capacityStatus } from "../../capacity-status";
import { fmt, monthLabel } from "../../format";
import type { Team } from "../../model";
import type { PlannedAllocationProps } from "./types";
import {
  PlannedActualToggle,
  PlannedTeamBadge,
  PlannedUnitName,
} from "./PlannedTeamLabels";

type Props = Pick<
  PlannedAllocationProps,
  | "data"
  | "months"
  | "metric"
  | "currentMonth"
  | "currentTeamMembers"
  | "showAllActual"
  | "expandedActualTeams"
  | "onExpandedTeamsChange"
> & { team: Team; managerName: string };
const labels = ["Aktif Kaynak", "Dağıtılan Kaynak", "Kalan Kaynak"] as const;

export default function PlannedTeamHeader({
  team,
  managerName,
  ...props
}: Props) {
  return (
    <TableRow
      className="group project-freeze-row team-capacity-header"
      data-project-heading={`team:${team.id}`}
      data-planning-group={team.id}
      data-hierarchy-depth={planningUnitHierarchy(props.data, team).depth}
    >
      <TableCell className="team-capacity-label">
        <div className="team-group-label">
          <PlannedActualToggle team={team} {...props} />
          <div>
            <div className="team-heading">
              <strong>
                <PlannedUnitName data={props.data} team={team} />
              </strong>
              <PlannedTeamBadge team={team} {...props} />
            </div>
            <span>Yönetici: {managerName}</span>
          </div>
        </div>
      </TableCell>
      {props.months.map((month) => {
        const value = props.metric([team.id], month),
          status = capacityStatus(value.current, value.total);
        const values = [
          value.current,
          value.total,
          value.current - value.total,
        ];
        return (
          <TableCell
            key={month}
            className="team-capacity-month"
            data-team-capacity-month={month}
          >
            <div className="team-capacity-values">
              {values.map((number, index) => (
                <span
                  key={labels[index]}
                  data-team-capacity-kind={index}
                  data-capacity-symbol={["A", "D", "K"][index]}
                  aria-label={`${monthLabel(month)} · ${labels[index]}: ${fmt(number)}`}
                  className={`team-capacity-value team-capacity-kind-${index} ${index ? status.className : ""}`}
                  title={`${monthLabel(month)} · ${labels[index]}: ${fmt(number)}${index ? " · " + status.label : ""}`}
                >
                  <span className="team-capacity-number">{fmt(number)}</span>
                </span>
              ))}
            </div>
          </TableCell>
        );
      })}
    </TableRow>
  );
}
