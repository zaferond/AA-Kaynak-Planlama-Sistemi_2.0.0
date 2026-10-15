import { useRef } from "react";
import type { Data, Team } from "../../model";
import type { Metric } from "../../metrics";
import HeadcountTrend from "../../HeadcountTrend";
import MonthlyShortageTrend from "../../MonthlyShortageTrend";
import RemainingResourceTable, {
  type ReportGroup,
} from "../RemainingResourceTable";
import ResourcePlanningCharts from "../resource-reports/ResourcePlanningCharts";
import { useSynchronizedTableScroll } from "./useSynchronizedTableScroll";

type Props = {
  data: Data;
  teams: Team[];
  months: string[];
  monthWidth: number;
  todayDate: string;
  currentMonth: string;
  currentTeamMembers: Record<string, string[]>;
  metric: (ids: string[], month: string) => Metric;
  leaderReportGroups: ReportGroup[];
  teamReportGroups: ReportGroup[];
  capacity: Record<string, Metric>;
  actualTotals: Record<string, number>;
  teamIds: string[];
  selectedTeamIds: string[];
  leads: string[];
};

// Report composition and table DOM lifecycle belong here. Scope, capacity and
// export calculations continue to use the shared workspace selectors/actions.
export default function WorkspaceReports({
  data,
  teams,
  months,
  monthWidth,
  todayDate,
  currentMonth,
  currentTeamMembers,
  metric,
  leaderReportGroups,
  teamReportGroups,
  capacity,
  actualTotals,
  teamIds,
  selectedTeamIds,
  leads,
}: Props) {
  const leaderReportTableRef = useRef<HTMLTableElement>(null);
  const teamReportTableRef = useRef<HTMLTableElement>(null);
  useSynchronizedTableScroll({
    enabled: true,
    primaryRef: leaderReportTableRef,
    secondaryRef: teamReportTableRef,
    layoutKey: months.join("|") + ":" + monthWidth,
  });
  const tableProps = {
    data,
    teams,
    months,
    monthWidth,
    todayDate,
    currentMonth,
    currentTeamMembers,
    metric,
  };
  return (
    <>
      <section className="panel">
        <div className="panelhead">
          <div>
            <h2>Liderlik Bazında Eksik Raporu</h2>
          </div>
        </div>
        <RemainingResourceTable
          {...tableProps}
          groups={leaderReportGroups}
          teamReport={false}
          tableRef={leaderReportTableRef}
        />
      </section>
      <section className="panel report">
        <div className="panelhead">
          <div>
            <h2>Takım Bazında Eksik Kaynak Raporu</h2>
          </div>
        </div>
        <RemainingResourceTable
          {...tableProps}
          groups={teamReportGroups}
          teamReport
          tableRef={teamReportTableRef}
        />
      </section>
      <MonthlyShortageTrend
        capacity={capacity}
        teamIds={teamIds}
        months={months}
        filterLabel={
          "Liderlik: " +
          (leads.length === 1
            ? leads[0]
            : leads.length
              ? leads.length + " seçili"
              : "Tümü") +
          " · Takım: " +
          (selectedTeamIds.length === 1
            ? teams[0]?.name || "Seçili takım"
            : selectedTeamIds.length
              ? selectedTeamIds.length + " seçili"
              : "Tümü")
        }
      />
      <ResourcePlanningCharts
        actualTotals={actualTotals}
        data={data}
        capacity={capacity}
        teamIds={teamIds}
        months={months}
      />
      <HeadcountTrend
        data={data}
        teamIds={teamIds}
        leads={leads}
        months={months}
      />
    </>
  );
}
