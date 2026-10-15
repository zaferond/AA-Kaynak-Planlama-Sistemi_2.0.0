import { monthLabel } from "./format";
import { useMemo } from "react";
import type { Data } from "./model";
import { buildHeadcountTrend } from "./headcount-trend";

const numberFormat = new Intl.NumberFormat("tr-TR", {
  maximumFractionDigits: 2,
});
const fmt = (value: number) => numberFormat.format(value);

type Props = {
  data: Data;
  teamIds: string[];
  leads: string[];
  months: string[];
};

export default function HeadcountTrend({
  data,
  teamIds,
  leads,
  months,
}: Props) {
  const teamKey = teamIds.join("|"),
    leadKey = leads.join("|");
  const points = useMemo(
    () => buildHeadcountTrend(data, teamIds, leads, months),
    [data, teamKey, leadKey, months],
  );
  const lastActual = [...points].reverse().find((point) => !point.future);
  const lastProjected = [...points].reverse().find((point) => point.future);
  const maxValue =
    Math.max(
      1,
      ...points.map(
        (point) => point.actualAverage ?? point.projectedAverage ?? 0,
      ),
    ) * 1.15;
  const width = Math.max(780, points.length * 74),
    height = 252;
  const x = (index: number) =>
    56 + (index * (width - 82)) / Math.max(1, points.length - 1);
  const y = (value: number) => 194 - (value / maxValue) * 154;
  const actual = points.flatMap((point, index) =>
    point.actualAverage === null ? [] : [{ index, value: point.actualAverage }],
  );
  const projected = points.flatMap((point, index) =>
    point.projectedAverage === null
      ? []
      : [{ index, value: point.projectedAverage }],
  );
  if (projected.length && actual.length)
    projected.unshift(actual[actual.length - 1]);
  const path = (series: { index: number; value: number }[]) =>
    series
      .map(
        (point, index) =>
          (index ? "L" : "M") + x(point.index) + " " + y(point.value),
      )
      .join(" ");
  const firstFuture = points.findIndex((point) => point.future);
  const tickStep =
    points.length > 36
      ? 6
      : points.length > 18
        ? 3
        : points.length > 12
          ? 2
          : 1;
  return (
    <section className="panel trend headcount-trend">
      <div className="panelhead">
        <div>
          <h2>Aylık Ortalama Çalışan Sayısı ve Öngörü Grafiği</h2>
          <p>Aktif Çalışan, Gear Up ve Saat Ücretli · seçili takımlar</p>
        </div>
        <div className="headcount-metrics">
          {lastActual && (
            <div>
              <span>Gerçekleşen Ortalama</span>
              <strong>
                {fmt(lastActual.actualAverage!)} <small>kişi</small>
              </strong>
            </div>
          )}
          {lastProjected && (
            <div>
              <span>Dönem Sonu Öngörüsü</span>
              <strong>
                {fmt(lastProjected.projectedAverage!)} <small>kişi</small>
              </strong>
            </div>
          )}
        </div>
      </div>
      <div className="headcount-legend">
        <span>
          <i className="headcount-key actual" />
          Gerçekleşen Birikimli Ortalama
        </span>
        {lastProjected && (
          <span>
            <i className="headcount-key projected" />
            Aktif İlanlar Dahil Öngörü
          </span>
        )}
      </div>
      <div className="chartscroll">
        <svg
          role="img"
          aria-label="Aylara göre birikimli ortalama çalışan sayısı ve gelecek ayların aktif ilanlar dahil öngörüsü"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
        >
          <title>Aylık ortalama çalışan sayısı ve öngörü</title>
          {[0, 0.25, 0.5, 0.75, 1].map((fraction, index) => (
            <g key={index}>
              <line
                x1={56}
                x2={width - 26}
                y1={y(fraction * maxValue)}
                y2={y(fraction * maxValue)}
                stroke="var(--report-grid-color, #e4ebf2)"
              />
              <text
                x={47}
                y={y(fraction * maxValue) + 4}
                textAnchor="end"
                fontSize={11}
                fill="var(--report-label-color, #6d8092)"
              >
                {fmt(fraction * maxValue)}
              </text>
            </g>
          ))}
          {firstFuture > 0 && (
            <g>
              <line
                x1={x(firstFuture) - 25}
                x2={x(firstFuture) - 25}
                y1={35}
                y2={194}
                stroke="var(--report-forecast-color, #b45309)"
                strokeDasharray="4 5"
              />
              <text
                x={x(firstFuture) - 18}
                y={31}
                fontSize={11}
                fill="var(--report-forecast-color, #b45309)"
              >
                Öngörü
              </text>
            </g>
          )}
          {actual.length > 0 && (
            <path
              d={path(actual)}
              fill="none"
              stroke="var(--report-current-color, #087f6a)"
              strokeWidth={3.5}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )}
          {projected.length > 0 && (
            <path
              d={path(projected)}
              fill="none"
              stroke="var(--report-forecast-color, #b45309)"
              strokeWidth={3.5}
              strokeDasharray="7 5"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )}
          {points.map((point, index) => {
            const value = point.future
              ? point.projectedAverage
              : point.actualAverage;
            return (
              <g key={point.month}>
                <circle
                  cx={x(index)}
                  cy={y(value ?? 0)}
                  r={4.5}
                  fill={
                    point.future
                      ? "var(--report-forecast-color, #b45309)"
                      : "var(--report-current-color, #087f6a)"
                  }
                  stroke="#fff"
                  strokeWidth={1.5}
                >
                  <title>
                    {monthLabel(point.month)} · Aktif Çalışan:{" "}
                    {fmt(point.active)} · Gear Up: {fmt(point.gearUp)} · Saat
                    Ücretli: {fmt(point.hourly)}
                    {point.future
                      ? ` · Aktif İlan: ${fmt(point.postings)} · Öngörülen Aylık Sayı: ${fmt(point.projectedCount)} · Birikimli ortalama: ${fmt(point.projectedAverage ?? 0)}`
                      : ` · Aylık Sayı: ${fmt(point.actualCount)} · Birikimli ortalama: ${fmt(point.actualAverage ?? 0)}`}
                  </title>
                </circle>
                {(index % tickStep === 0 || index === points.length - 1) && (
                  <text
                    x={x(index)}
                    y={225}
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
    </section>
  );
}
