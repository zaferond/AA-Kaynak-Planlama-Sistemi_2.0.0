import { planningUnitHierarchy } from "../../../../shared/leadership-planning";
import { Fragment } from "react";
import { TableRow, TableCell } from "@/components/ui/table";
import type { Team, Project } from "../../model";
import { fmt, monthLabel } from "../../format";
import Cell from "../../components/AllocationCell";
import ProjectResponsible from "../../ProjectResponsible";
import PlannedPhaseButton from "./PlannedPhaseButton";
import {
  actualRowsVisible,
  PlannedActualToggle,
  PlannedTeamBadge,
  PlannedUnitName,
} from "./PlannedTeamLabels";
import type { PlannedAllocationProps } from "./types";
export type PlannedRowProps = Pick<
  PlannedAllocationProps,
  | "data"
  | "months"
  | "view"
  | "density"
  | "currentMonth"
  | "actualTotals"
  | "showAllActual"
  | "expandedActualTeams"
  | "onExpandedTeamsChange"
  | "currentTeamMembers"
  | "cells"
  | "grid"
  | "onSaveAllocation"
  | "onPhaseClick"
  | "onPhaseContextMenu"
>;
function PlannedActualRow({
  team: t,
  project: p,
  months,
  data,
  actualTotals,
}: Pick<PlannedAllocationProps, "months" | "data" | "actualTotals"> & {
  team: Team;
  project: Project;
}) {
  return (
    <TableRow key={"actual-" + t.id + "-" + p.id} className="actual-row">
      <TableCell className="rowname">Gerçekleşen Kaynak Dağılımı</TableCell>
      {months.map((m) => {
        const k = t.id + "|" + p.id + "|" + m,
          actual = actualTotals[k] || 0,
          planned = data?.allocations[k] || 0;
        return (
          <TableCell
            key={m}
            className={
              [
                actual > 0 ? "has-entry" : "",
                actual > planned + 0.000001 ? "actual-exceeds-plan" : "",
              ]
                .filter(Boolean)
                .join(" ") || undefined
            }
            title={
              monthLabel(m) +
              " gerçekleşen: " +
              fmt(actual) +
              " / öngörülen: " +
              fmt(planned)
            }
          >
            {fmt(actual)}
          </TableCell>
        );
      })}
    </TableRow>
  );
}
export default function PlannedAllocationRow({
  team: t,
  project: p,
  cellSet,
  managerName,
  ...props
}: PlannedRowProps & {
  team: Team;
  project: Project;
  cellSet: ReadonlySet<string>;
  managerName: string;
}) {
  const { view, months, data, cells, grid, onSaveAllocation } = props;
  const {
    planCellWritable,
    startPlanDrag,
    openPlanMenu,
    firstSelectedPlanCell,
    fillSelectedPlanCells,
    completePlanEntry,
  } = grid;
  return (
    <Fragment key={t.id + p.id}>
      <TableRow
        className={
          t.kind === "leadership" && !planningUnitHierarchy(data, t).parent
            ? "leadership-planning-row"
            : undefined
        }
        data-planning-owner={t.id}
        data-hierarchy-depth={planningUnitHierarchy(data, t).depth}
      >
        <TableCell className="rowname">
          {view === "project" && <PlannedActualToggle team={t} {...props} />}
          {view === "team" && <span className="indent">↳</span>}
          {view === "team" ? (
            <span className="project-row-label">
              <span>{p.name}</span>
              <ProjectResponsible project={p} />
            </span>
          ) : (
            <span className="team-row-block">
              <span className="team-row-title">
                <PlannedUnitName data={data} team={t} />
                <PlannedTeamBadge team={t} {...props} />
              </span>
              <span className="team-manager">Yönetici: {managerName}</span>
            </span>
          )}
        </TableCell>
        {months.map((m) => {
          const k = t.id + "|" + p.id + "|" + m,
            disabled = m < p.start || m > p.end,
            editable = planCellWritable(k);
          return (
            <TableCell
              key={m}
              data-plan-cell={k}
              onPointerDown={(e) => startPlanDrag(e, k)}
              onContextMenu={(e) => openPlanMenu(e, k)}
              className={
                (view === "team" ? "allocation-with-work " : "") +
                ((data?.allocations[k] || 0) > 0 ? "has-entry " : "") +
                (cellSet.has(k) ? "selectedcell" : "")
              }
            >
              {view === "team" && (
                <PlannedPhaseButton project={p} month={m} {...props} />
              )}
              <Cell
                value={data?.allocations[k] || 0}
                label={t.name + " / " + p.name + " / " + monthLabel(m)}
                disabled={disabled || !editable}
                save={(v) => onSaveAllocation(k, v)}
                onCommit={completePlanEntry}
                onFillSelection={
                  cells.length > 1 && firstSelectedPlanCell === k
                    ? fillSelectedPlanCells
                    : undefined
                }
              />
            </TableCell>
          );
        })}
      </TableRow>
      {actualRowsVisible(props, t.id) && (
        <PlannedActualRow team={t} project={p} {...props} />
      )}
    </Fragment>
  );
}
