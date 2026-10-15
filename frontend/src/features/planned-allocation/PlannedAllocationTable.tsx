import { planningUnitManagerIndex } from "../../../../shared/resource-roles";
import { ownValue } from "../../../../shared/records";
import { useMemo } from "react";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { fmt, monthLabel } from "../../format";
import ProjectResponsible from "../../ProjectResponsible";
import PlannedTableHeaders from "./PlannedTableHeaders";
import PlannedTeamHeader from "./PlannedTeamHeader";
import PlannedPhaseButton from "./PlannedPhaseButton";
import PlannedAllocationRow, {
  type PlannedRowProps,
} from "./PlannedAllocationRow";
import { actualRowsVisible } from "./PlannedTeamLabels";
import { useWindowedSections } from "../workspace/useWindowedSections";
import type { WindowedSection } from "../workspace/useWindowedSections";
import type { PlannedAllocationProps } from "./types";
export default function PlannedAllocationTable(
  props: PlannedRowProps &
    Pick<
      PlannedAllocationProps,
      | "planTableRef"
      | "todayDate"
      | "labelWidth"
      | "monthWidth"
      | "groups"
      | "teams"
      | "projects"
      | "metric"
      | "projectIds"
      | "projectTotals"
    >,
) {
  const {
    planTableRef,
    view,
    todayDate,
    months,
    labelWidth,
    monthWidth,
    groups,
    teams,
    projects,
    projectTotals,
  } = props;
  const managerNames = useMemo(
    () =>
      props.data.planningUnitManagers ??
      planningUnitManagerIndex(props.data, todayDate),
    [props.data, todayDate],
  );
  const cellSet = useMemo(() => new Set(props.cells), [props.cells]);
  // Bound each render chunk by its editable cell count, without limiting records.
  const chunkSize = Math.max(
    4,
    Math.min(20, Math.floor(200 / Math.max(1, months.length))),
  );
  const sections: WindowedSection[] =
    view === "team"
      ? groups.flatMap((g) => {
          const t = teams[g.outer];
          return Array.from(
            { length: Math.max(1, Math.ceil(g.inners.length / chunkSize)) },
            (_, part) => {
              const chunk = g.inners.slice(
                part * chunkSize,
                (part + 1) * chunkSize,
              );
              const first = part === 0;
              const key = `${t.id}:${part}`;
              return {
                key,
                headingKey: `${t.id}:0`,
                height:
                  (first ? 64 : 0) +
                  chunk.length * (actualRowsVisible(props, t.id) ? 100 : 60),
                render: () => (
                  <TableBody
                    key={key}
                    data-window-key={key}
                    className="project-row-group"
                    data-project-group={`team:${t.id}`}
                  >
                    {first && (
                      <PlannedTeamHeader
                        team={t}
                        managerName={
                          ownValue(managerNames, t.id) || "Atanmamış"
                        }
                        {...props}
                      />
                    )}
                    {chunk.map((i) => (
                      <PlannedAllocationRow
                        key={t.id + projects[i].id}
                        team={t}
                        managerName={
                          ownValue(managerNames, t.id) || "Atanmamış"
                        }
                        project={projects[i]}
                        cellSet={cellSet}
                        {...props}
                      />
                    ))}
                  </TableBody>
                ),
              };
            },
          );
        })
      : groups.flatMap((g) => {
          const p = projects[g.outer];
          const parts = Math.max(1, Math.ceil(g.inners.length / chunkSize));
          return Array.from({ length: parts }, (_, part) => {
            const chunk = g.inners.slice(
              part * chunkSize,
              (part + 1) * chunkSize,
            );
            const first = part === 0,
              last = part === parts - 1;
            const key = first ? p.id : `${p.id}:${part}`;
            return {
              key,
              headingKey: p.id,
              height:
                (first ? 90 : 0) +
                (last ? 40 : 0) +
                chunk.reduce(
                  (sum, i) =>
                    sum + (actualRowsVisible(props, teams[i].id) ? 100 : 60),
                  0,
                ),
              render: () => (
                <TableBody
                  key={key}
                  data-window-key={key}
                  className="project-row-group"
                  data-project-group={p.id}
                >
                  {first && (
                    <TableRow
                      className="group project-phase-group project-freeze-row"
                      data-project-heading={p.id}
                    >
                      <TableCell className="project-group-name">
                        <strong>{p.name}</strong>
                        <ProjectResponsible project={p} />
                        <span>
                          {p.start} — {p.end}
                        </span>
                      </TableCell>
                      {months.map((m) => (
                        <TableCell key={m}>
                          <PlannedPhaseButton
                            project={p}
                            month={m}
                            {...props}
                          />
                        </TableCell>
                      ))}
                    </TableRow>
                  )}
                  {chunk.map((i) => (
                    <PlannedAllocationRow
                      key={teams[i].id + p.id}
                      team={teams[i]}
                      managerName={
                        ownValue(managerNames, teams[i].id) || "Atanmamış"
                      }
                      project={p}
                      cellSet={cellSet}
                      {...props}
                    />
                  ))}
                  {last && (
                    <TableRow className="summary s2">
                      <TableCell>Bu projeye tahsis · seçili takımlar</TableCell>
                      {months.map((m) => (
                        <TableCell
                          key={m}
                          title={
                            monthLabel(m) +
                            ": " +
                            fmt(projectTotals[p.id + "|" + m] || 0)
                          }
                        >
                          {fmt(projectTotals[p.id + "|" + m] || 0)}
                        </TableCell>
                      ))}
                    </TableRow>
                  )}
                </TableBody>
              ),
            };
          });
        });
  const windowedRows = useWindowedSections(
    planTableRef,
    sections,
    months.length + 1,
    `${view}|${props.density}|${months.join("|")}|${props.showAllActual}|${props.expandedActualTeams.join("|")}|${teams.map((t) => t.id).join("|")}|${projects.map((p) => p.id).join("|")}`,
  );
  return (
    <Table
      ref={planTableRef}
      stickyProjectRows
      todayDate={todayDate}
      todayMonthsKey={months.join("|")}
      className={
        "matrix planning-grid allocation-grid" +
        (view === "project" ? " project-team-view" : "")
      }
      style={{
        width: labelWidth + months.length * monthWidth,
        minWidth: "100%",
      }}
    >
      <PlannedTableHeaders
        months={months}
        labelWidth={labelWidth}
        monthWidth={monthWidth}
        label={view === "team" ? "Takım / Proje" : "Proje / Takım"}
      />
      {windowedRows}
    </Table>
  );
}
