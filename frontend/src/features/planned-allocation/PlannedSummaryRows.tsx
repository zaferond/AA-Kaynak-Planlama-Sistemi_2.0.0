import { TableRow, TableCell } from "@/components/ui/table";
import { capacityStatus } from "../../capacity-status";
import { fmt, monthLabel } from "../../format";
import type { PlannedAllocationProps } from "./types";
export default function PlannedSummaryRows({
  teams: ts,
  months: mths,
  metric,
  projects,
  projectIds,
  projectTotals,
  selectedReport = false,
}: Pick<
  PlannedAllocationProps,
  "teams" | "months" | "metric" | "projects" | "projectIds" | "projectTotals"
> & { selectedReport?: boolean }) {
  const teamIds = ts.map((t) => t.id);
  const rows: [number, string][] = [
    [0, "Aktif Kaynak"],
    [2, "Dağıtılan Kaynak"],
    [3, "Kalan Kaynak"],
  ];
  return rows.map(([kind, title]) => (
    <TableRow key={title} className={"summary s" + kind}>
      <TableCell>{title}</TableCell>
      {mths.map((m) => {
        const c = metric(teamIds, m);
        const allocated =
          selectedReport && projectIds.length
            ? projects.reduce(
                (total, p) => total + (projectTotals[p.id + "|" + m] || 0),
                0,
              )
            : c.total;
        const value =
          kind === 0
            ? c.current
            : kind === 2
              ? allocated
              : c.current - allocated;
        return (
          <TableCell
            key={m}
            className={
              kind >= 2 ? capacityStatus(c.current, allocated).className : ""
            }
            title={
              monthLabel(m) +
              " · " +
              title +
              ": " +
              fmt(value) +
              (kind >= 2
                ? " · " + capacityStatus(c.current, allocated).label
                : "")
            }
          >
            {fmt(value)}
          </TableCell>
        );
      })}
    </TableRow>
  ));
}
