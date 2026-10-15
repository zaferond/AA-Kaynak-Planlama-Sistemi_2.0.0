import { CornerDownRight } from "lucide-react";
import { ownValue } from "../../../shared/records";
import {
  TimelineMonthHead,
  TimelineYearRow,
} from "../components/TimelineHeaders";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableFooter,
  TableRow,
} from "@/components/ui/table";
import { useMemo, type RefObject } from "react";
import { directoryResponsibilityIndex } from "../../../shared/resource-roles";
import { capacityStatus } from "../capacity-status";
import MemberBadge from "../components/MemberBadge";
import { fmt, monthLabel } from "../format";
import type { Metric } from "../metrics";
import type { Data, Team } from "../model";
import {
  expandLeadershipReportGroups,
  reportGroupManager,
  type ReportGroup,
} from "./resource-report-groups";
export type { ReportGroup } from "./resource-report-groups";
type Props = {
  groups: ReportGroup[];
  teamReport: boolean;
  data: Data | null;
  teams: Team[];
  months: string[];
  monthWidth: number;
  todayDate: string;
  currentMonth: string;
  currentTeamMembers: Record<string, string[]>;
  metric: (ids: string[], month: string) => Metric;
  tableRef: RefObject<HTMLTableElement | null>;
};
export default function RemainingResourceTable({
  groups,
  teamReport,
  data,
  teams,
  months,
  monthWidth,
  todayDate,
  currentMonth,
  currentTeamMembers,
  metric,
  tableRef,
}: Props) {
  const responsibility = useMemo(
    () =>
      data
        ? directoryResponsibilityIndex(data, todayDate)
        : { leaders: {}, teams: {} },
    [data, todayDate],
  );
  const memberBadge = (label: string, members: string[]) => (
    <MemberBadge label={label} members={members} currentMonth={currentMonth} />
  );
  const years = [...new Set(months.map((month) => month.slice(0, 4)))];
  function reportYearRow() {
    return (
      <TimelineYearRow
        years={months.map((month) => month.slice(0, 4))}
        labelColumns={2}
      />
    );
  }
  function reportMonthHead(month: string) {
    return <TimelineMonthHead key={month} month={month} years={years} />;
  }
  function reportRows(groups: ReportGroup[], teamReport = false) {
    // Aggregate the same filtered units once, independent of report grouping.
    const totalIds = [...new Set(groups.flatMap((group) => group.ids))].sort();
    const displayGroups = teamReport
      ? groups
      : expandLeadershipReportGroups(data || {}, teams, groups);
    return (
      <>
        <Table
          ref={tableRef}
          todayDate={todayDate}
          todayMonthsKey={months.join("|")}
          className={
            "remaining-report " + (teamReport ? "team-report" : "leader-report")
          }
          style={{ width: 350 + months.length * monthWidth, minWidth: "100%" }}
        >
          <colgroup>
            <col style={{ width: 110 }} />
            <col style={{ width: 240 }} />
            {months.map((m) => (
              <col key={m} style={{ width: monthWidth }} />
            ))}
          </colgroup>
          <TableHeader>
            {reportYearRow()}
            <TableRow>
              <TableHead>Yönetici</TableHead>
              <TableHead>{teamReport ? "Takım" : "Liderlik / Birim"}</TableHead>
              {months.map(reportMonthHead)}
            </TableRow>
          </TableHeader>
          <TableBody>
            {displayGroups.map((g) => (
              <TableRow
                data-report-leader={g.leader}
                data-report-depth={teamReport ? undefined : g.depth || 0}
                title={
                  g.parentLeader ? "Üst liderlik: " + g.parentLeader : undefined
                }
                key={
                  (teamReport ? "team:" : g.unitId ? "unit:" : "leader:") +
                  (teamReport ? g.ids[0] : g.unitId || g.leader || g.name)
                }
              >
                <TableCell>
                  {reportGroupManager(responsibility, teams, g, teamReport)}
                </TableCell>
                <TableCell>
                  <span
                    className="report-unit-title"
                    style={
                      g.depth
                        ? { paddingInlineStart: Math.min(g.depth, 8) * 14 }
                        : undefined
                    }
                  >
                    {!!g.depth && (
                      <CornerDownRight
                        size={13}
                        className="report-unit-branch"
                        aria-hidden="true"
                      />
                    )}
                    <span className="report-unit-name">{g.name}</span>
                    {memberBadge(
                      g.name,
                      g.ids
                        .flatMap((id) => ownValue(currentTeamMembers, id) || [])
                        .sort((a, b) => a.localeCompare(b, "tr")),
                    )}
                  </span>
                </TableCell>
                {months.map((m) => {
                  const c = metric(g.ids, m),
                    remaining = c.current - c.total;
                  return (
                    <TableCell
                      key={m}
                      className={capacityStatus(c.current, c.total).className}
                      title={
                        monthLabel(m) +
                        ": " +
                        fmt(remaining) +
                        " · " +
                        capacityStatus(c.current, c.total).label
                      }
                    >
                      {fmt(remaining)}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
          <TableFooter className="remaining-report-totals">
            <TableRow>
              <TableCell colSpan={2} className="remaining-total-label">
                <span className="remaining-total-heading">
                  <span className="remaining-total-icon" aria-hidden="true">
                    Σ
                  </span>
                  <strong>Toplam Eksik Kaynak</strong>
                </span>
              </TableCell>
              {months.map((month) => {
                const value = metric(totalIds, month);
                const remaining = value.current - value.total;
                const status = capacityStatus(value.current, value.total);
                return (
                  <TableCell
                    key={month}
                    data-total-month={month}
                    className={status.className}
                    title={`${monthLabel(month)}: mevcut ${fmt(value.current)} − dağıtılan ${fmt(value.total)} = ${fmt(remaining)} · ${status.label}`}
                  >
                    <strong className="remaining-total-value">
                      {fmt(remaining)}
                    </strong>
                  </TableCell>
                );
              })}
            </TableRow>
          </TableFooter>
        </Table>
        {!groups.length && (
          <p className="emptymsg">Bu filtrelere uygun birim yok.</p>
        )}
      </>
    );
  }

  return reportRows(groups, teamReport);
}
