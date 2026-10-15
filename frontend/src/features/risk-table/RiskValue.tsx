import type { ReactNode } from "react";
import type { Risk } from "../../model";
import { riskStrategyKeys as strategyKeys } from "../../../../shared/risk-policy.ts";
import { riskAssessment } from "../../risk-score";
import type { RiskColumn } from "./columns";
const dateFormat = new Intl.DateTimeFormat("tr-TR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
function date(value: string) {
  return value ? (
    <time dateTime={value}>
      {dateFormat.format(new Date(value + "T12:00:00"))}
    </time>
  ) : (
    <span className="risk-dash">—</span>
  );
}
function text(value: string) {
  return value ? (
    <span className="risk-wrap">{value}</span>
  ) : (
    <span className="risk-dash">—</span>
  );
}
function levelCell(
  value: ReturnType<typeof riskAssessment>,
  scoreOnly = false,
) {
  return value ? (
    <span className={"risk-grid-level risk-grid-" + value.className}>
      {scoreOnly ? value.score : value.level}
    </span>
  ) : (
    <span className="risk-dash">—</span>
  );
}
export default function RiskValue({
  risk,
  column,
  index,
}: {
  risk: Risk;
  column: RiskColumn;
  index: number;
}): ReactNode {
  const initial = riskAssessment(risk.likelihood, risk.impact);
  const residual = riskAssessment(risk.residualLikelihood, risk.residualImpact);
  switch (column.key) {
    case "description":
      return (
        <div className="risk-definition">
          <span className="risk-row-number">
            {String(index + 1).padStart(2, "0")}
          </span>
          <div>
            <strong>{risk.description}</strong>
            <small>Kaydeden: {risk.createdByName}</small>
          </div>
        </div>
      );
    case "reportedBy":
      return text(risk.reportedBy);
    case "category":
      return risk.category;
    case "reportedAt":
      return date(risk.reportedAt);
    case "system":
      return text(risk.system);
    case "cause":
      return text(risk.cause);
    case "actionPlan":
      return text(risk.actionPlan);
    case "targetAt":
      return date(risk.targetAt);
    case "status":
      return (
        <span
          className={"risk-status risk-status-" + risk.status.toLowerCase()}
        >
          {risk.status}
        </span>
      );
    case "owner":
      return text(risk.owner);
    case "likelihood":
      return risk.likelihood;
    case "impact":
      return risk.impact;
    case "score":
      return levelCell(initial, true);
    case "level":
      return levelCell(initial);
    case "implementedAt":
      return date(risk.implementedAt);
    case "actionResult":
      return text(risk.actionResult);
    case "residualLikelihood":
      return risk.residualLikelihood ?? <span className="risk-dash">—</span>;
    case "residualImpact":
      return risk.residualImpact ?? <span className="risk-dash">—</span>;
    case "residualScore":
      return levelCell(residual, true);
    case "residualLevel":
      return levelCell(residual);
    default: {
      const selected =
        "editor" in column &&
        column.editor === "strategy" &&
        risk.strategy === strategyKeys[column.key];
      return (
        <span className={selected ? "risk-strategy-check" : "risk-dash"}>
          {selected ? "✓" : "—"}
        </span>
      );
    }
  }
}
