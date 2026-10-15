import { useMemo } from "react";
import { planningEffectiveness } from "../../../../shared/resource-planning-reports";
import { fmt } from "../../format";
import MonthlyComparison from "./MonthlyComparison";

export default function PlanningEffectivenessChart({
  months,
  scope,
}: {
  months: { month: string; planned: number; actual: number }[];
  scope: string;
}) {
  const effectiveness = useMemo(() => planningEffectiveness(months), [months]);
  return (
    <section className="panel resource-report planning-effectiveness-report">
      <header className="resource-report-head">
        <div>
          <h2>Kaynak Planlama Süreç Etkinlik Grafiği</h2>
          <p>{scope}</p>
        </div>
        <span className="resource-report-chip">
          Dönem etkinliği:{" "}
          {effectiveness.percent == null
            ? "Hesaplanamaz"
            : "%" + fmt(effectiveness.percent)}
        </span>
      </header>
      <MonthlyComparison
        title="Kaynak Planlama Süreç Etkinlik Grafiği"
        months={months.map((point) => point.month)}
        series={[
          {
            name: "Etkinlik",
            values: effectiveness.months.map((point) => point.percent),
            color: "var(--report-effectiveness-color, #6d28d9)",
          },
        ]}
        unit="percent"
        reference={100}
      />
    </section>
  );
}
