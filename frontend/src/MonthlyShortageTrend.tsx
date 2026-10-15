import { monthLabel } from "./format";
import { useMemo } from "react";
import type { Metric } from "./metrics";
import {
  buildMonthlyShortageTrend,
  summarizeMonthlyShortage,
} from "./monthly-shortage-trend";

const numberFormat = new Intl.NumberFormat("tr-TR", {
  maximumFractionDigits: 2,
});
const fmt = (value: number) => numberFormat.format(value);

type Props = {
  capacity: Record<string, Metric>;
  teamIds: string[];
  months: string[];
  filterLabel: string;
};

export default function MonthlyShortageTrend({
  capacity,
  teamIds,
  months,
  filterLabel,
}: Props) {
  const teamKey = teamIds.join("|");
  const points = useMemo(
    () => buildMonthlyShortageTrend(capacity, teamIds, months),
    [capacity, teamKey, months],
  );
  const summary = summarizeMonthlyShortage(points);
  const top = Math.max(1, ...points.map((point) => point.total));
  const step = Math.pow(10, Math.floor(Math.log10(top / 4)));
  const tick = Math.ceil(top / (4 * step)) * step;
  const maxValue = tick * 4;
  const width = Math.max(780, points.length * 74 + 78),
    height = 274;
  const left = 58,
    right = width - 24,
    baseline = 214,
    chartHeight = 164;
  const barWidth = 20;
  const center = (index: number) =>
    left + ((index + 0.5) * (right - left)) / Math.max(1, points.length);
  const y = (value: number) => baseline - (value / maxValue) * chartHeight;
  const tickStep =
    points.length > 36
      ? 6
      : points.length > 18
        ? 3
        : points.length > 12
          ? 2
          : 1;
  return (
    <section className="panel trend monthly-shortage-trend">
      <div className="panelhead">
        <div>
          <h2>Aylık Eksik Kaynak Grafiği</h2>
          <p>
            {filterLabel} · {teamIds.length} takım
            {points.length > 0 && (
              <>
                {" "}
                · {monthLabel(points[0].month)} –{" "}
                {monthLabel(points[points.length - 1].month)} ·{" "}
                {summary.monthCount} ay
              </>
            )}
          </p>
        </div>
        <div className="shortage-summary">
          <span>Aylık Ortalama Eksik Kaynak</span>
          <strong>
            {fmt(summary.average)} <small>kişi eşdeğeri</small>
          </strong>
          <small>
            {fmt(summary.total)} kişi-ay / {summary.monthCount} ay
          </small>
        </div>
      </div>
      {teamIds.length && points.length ? (
        <div className="chartscroll">
          <svg
            role="img"
            aria-label="Aylık eksik kaynak sayısı"
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
          >
            <title>Aylık eksik kaynak sayısı</title>
            {[0, 1, 2, 3, 4].map((index) => (
              <g key={index}>
                <line
                  x1={left}
                  x2={right}
                  y1={y(index * tick)}
                  y2={y(index * tick)}
                  stroke="var(--report-grid-color, #e4ebf2)"
                />
                <text
                  x={left - 10}
                  y={y(index * tick) + 4}
                  textAnchor="end"
                  fontSize={11}
                  fill="var(--report-label-color, #6d8092)"
                >
                  {fmt(index * tick)}
                </text>
              </g>
            ))}
            {points.map((point, index) => {
              const x = center(index),
                label = monthLabel(point.month);
              return (
                <g key={point.month}>
                  <rect
                    x={x - barWidth / 2}
                    y={y(point.total)}
                    width={barWidth}
                    height={Math.max(0, baseline - y(point.total))}
                    rx={3}
                    fill="var(--report-shortage-color, #c2410c)"
                  >
                    <title>
                      {label} · Eksik kaynak: {fmt(point.total)} kişi eşdeğeri ·
                      Takım sayısı: {point.teamCount}
                    </title>
                  </rect>
                  {(index % tickStep === 0 || index === points.length - 1) && (
                    <text
                      x={x}
                      y={239}
                      textAnchor="middle"
                      fontSize={11}
                      fill="var(--report-label-color, #61758b)"
                    >
                      {monthLabel(point.month)}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
      ) : (
        <p className="emptymsg">
          Grafik için liderlik veya takım seçimine uygun takım bulunamadı.
        </p>
      )}
    </section>
  );
}
