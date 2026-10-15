import { useMemo } from "react";
import type { Data, Team } from "../../model";
import type { Metric } from "../../metrics";
import { fmt, monthLabel } from "../../format";
import {
  planningEffectiveness,
  rankTeamShortages,
  resourceAllocationComparison,
} from "../../../../shared/resource-planning-reports";
import { buildMonthlyShortageTrend } from "../../../../shared/monthly-shortage-trend";

const sections = [
  ["rapor-liderlik-eksik", "Liderlik eksik"],
  ["rapor-takim-eksik", "Takım eksik"],
  ["rapor-aylik-eksik", "Aylık eksik"],
  ["rapor-planlanan-gerceklesen", "Planlanan / gerçekleşen"],
  ["rapor-proje", "Proje bazlı"],
  ["rapor-etkinlik", "Etkinlik"],
  ["rapor-takim-ihtiyac", "Takım ihtiyacı"],
  ["rapor-calisan", "Çalışan öngörüsü"],
] as const;

const SECTION_GAP = 16;
/** Bring a section heading just below the window top. The page is drawn with
 * CSS zoom, which some browsers ignore in scrollIntoView and overshoot; measure
 * the result and correct with the observed scroll-to-pixel ratio instead. */
function scrollToSection(id: string) {
  const target = document.getElementById(id);
  if (!target) return;
  const offset = () => target.getBoundingClientRect().top - SECTION_GAP;
  let ratio = 1;
  for (let step = 0; step < 4; step++) {
    const before = offset();
    if (Math.abs(before) < 2) break;
    const startY = window.scrollY;
    window.scrollTo(0, startY + before / ratio);
    const moved = before - offset();
    if (Math.abs(moved) < 1) break;
    ratio = moved / (window.scrollY - startY || 1);
  }
}

/** Headline figures for the selected scope, computed with the same functions
 * as the charts below, and links to each report section. */
export default function ReportSummary({
  data,
  teams,
  capacity,
  actualTotals,
  teamIds,
  months,
}: {
  data: Data;
  teams: Team[];
  capacity: Record<string, Metric>;
  actualTotals: Record<string, number>;
  teamIds: string[];
  months: string[];
}) {
  const shortage = useMemo(
    () => buildMonthlyShortageTrend(capacity, teamIds, months),
    [capacity, teamIds, months],
  );
  const average = shortage.length
    ? shortage.reduce((sum, point) => sum + point.total, 0) / shortage.length
    : 0;
  const peak = shortage.reduce<(typeof shortage)[number] | undefined>(
    (best, point) => (!best || point.total > best.total ? point : best),
    undefined,
  );
  const topTeam = useMemo(
    () => rankTeamShortages(capacity, teams, months)[0],
    [capacity, teams, months],
  );
  const effectiveness = useMemo(
    () =>
      planningEffectiveness(
        resourceAllocationComparison(data, actualTotals, teamIds, months)
          .months,
      ).percent,
    [data.projects, data.allocations, actualTotals, teamIds, months],
  );
  const cards = [
    {
      label: "Ortalama aylık eksik",
      value: fmt(average),
      unit: "kişi eşdeğeri",
      detail: months.length + " aylık dönem",
      tone: average > 0 ? "warn" : "ok",
    },
    {
      label: "En yüksek eksik",
      value: peak && peak.total > 0 ? fmt(peak.total) : "0",
      unit: "kişi eşdeğeri",
      detail: peak && peak.total > 0 ? monthLabel(peak.month) : "Eksik ay yok",
      tone: peak && peak.total > 0 ? "warn" : "ok",
    },
    {
      label: "En çok ihtiyaç duyan takım",
      value: topTeam ? fmt(topTeam.averageShortage) : "—",
      unit: topTeam ? "kişi eşdeğeri / ay" : "",
      detail: topTeam ? topTeam.team.name : "Kaynak açığı olan takım yok",
      tone: topTeam ? "warn" : "ok",
    },
    {
      label: "Dönem planlama etkinliği",
      value: effectiveness === null ? "—" : "%" + fmt(effectiveness),
      unit: "",
      detail: "Gerçekleşen / dağıtılan kaynak",
      tone: "neutral",
    },
  ];
  return (
    <section className="report-summary" aria-label="Rapor özeti">
      <div className="report-summary-cards">
        {cards.map((card) => (
          <div
            key={card.label}
            className={"report-summary-card tone-" + card.tone}
          >
            <span className="report-summary-label">{card.label}</span>
            <strong className="report-summary-value">
              {card.value}
              {card.unit && <small> {card.unit}</small>}
            </strong>
            <span className="report-summary-detail" title={card.detail}>
              {card.detail}
            </span>
          </div>
        ))}
      </div>
      <nav className="report-sections" aria-label="Rapor bölümleri">
        <span>Bölümler:</span>
        {sections.map(([id, label]) => (
          <button key={id} type="button" onClick={() => scrollToSection(id)}>
            {label}
          </button>
        ))}
      </nav>
    </section>
  );
}
