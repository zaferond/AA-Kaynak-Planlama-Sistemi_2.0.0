import { useMemo, useState } from "react";
import type { Data } from "../../model";
import type { Metric } from "../../metrics";
import { fmt, monthLabel } from "../../format";
import {
  resourceAllocationComparison,
  rankTeamShortages,
} from "../../../../shared/resource-planning-reports";
import MonthlyComparison from "./MonthlyComparison";
import ProjectAllocationChart from "./ProjectAllocationChart";
import PlanningEffectivenessChart from "./PlanningEffectivenessChart";

const actualColor = "var(--report-current-color, #087f6a)";
const demandColor = "var(--report-planned-color, #1d4ed8)";

export default function ResourcePlanningCharts({
  data,
  capacity,
  teamIds,
  months,
  actualTotals,
}: {
  data: Data;
  capacity: Record<string, Metric>;
  teamIds: string[];
  months: string[];
  actualTotals: Record<string, number>;
}) {
  const [showAll, setShowAll] = useState(false);
  const teams = useMemo(
    () => data.teams.filter((team) => teamIds.includes(team.id)),
    [data.teams, teamIds],
  );
  const comparison = useMemo(
    () => resourceAllocationComparison(data, actualTotals, teamIds, months),
    [data.projects, data.allocations, actualTotals, teamIds, months],
  );
  const ranked = useMemo(
    () => rankTeamShortages(capacity, teams, months),
    [capacity, teams, months],
  );
  const scope = `${teams.length} takım · ${months.length ? monthLabel(months[0]) + " – " + monthLabel(months.at(-1)!) : "Dönem seçilmedi"} · ${months.length} ay`;
  const visibleRanks = showAll ? ranked : ranked.slice(0, 10);
  return (
    <div className="resource-planning-charts">
      <section className="panel resource-report capacity-comparison">
        <header className="resource-report-head">
          <div>
            <h2>Planlanan Kaynak / Gerçekleşen Kaynak Karşılaştırma Grafiği</h2>
            <p>{scope}</p>
          </div>
          <span className="resource-report-chip">Tüm proje tahsisleri</span>
        </header>
        <MonthlyComparison
          title="Planlanan Kaynak / Gerçekleşen Kaynak Karşılaştırma Grafiği"
          months={months}
          series={[
            {
              name: "Gerçekleşen Kaynak",
              color: actualColor,
              values: comparison.months.map((point) => point.actual),
            },
            {
              name: "Dağıtılan Kaynak",
              color: demandColor,
              dashed: true,
              values: comparison.months.map((point) => point.planned),
            },
          ]}
        />
      </section>
      <ProjectAllocationChart rows={comparison.projects} scope={scope} />
      <PlanningEffectivenessChart months={comparison.months} scope={scope} />
      <section className="panel resource-report shortage-ranking">
        <header className="resource-report-head">
          <div>
            <h2>Takım Bazlı Kaynak İhtiyaç Grafiği</h2>
            <p>{scope}</p>
          </div>
          <span className="resource-report-chip">
            Aylık ortalama · kişi eşdeğeri
          </span>
        </header>
        {ranked.length ? (
          <ol className="resource-ranking">
            {visibleRanks.map((row, i) => (
              <li key={row.team.id}>
                <span className="resource-rank-number">{i + 1}</span>
                <div className="resource-rank-team">
                  <strong>{row.team.name}</strong>
                  <small>{row.team.lead}</small>
                </div>
                <div className="resource-rank-track">
                  <span
                    style={{
                      width: `${(row.averageShortage / ranked[0].averageShortage) * 100}%`,
                    }}
                  />
                </div>
                <strong className="resource-rank-value">
                  {fmt(row.averageShortage)} <small>kişi eşdeğeri</small>
                </strong>
              </li>
            ))}
          </ol>
        ) : (
          <p className="emptymsg">
            Seçili dönemde kaynak açığı bulunan takım yok.
          </p>
        )}
        {ranked.length > 10 && (
          <button
            className="button"
            type="button"
            onClick={() => setShowAll(!showAll)}
          >
            {showAll
              ? "İlk 10 takımı göster"
              : `Tümünü göster (${ranked.length} takım)`}
          </button>
        )}
      </section>
    </div>
  );
}
