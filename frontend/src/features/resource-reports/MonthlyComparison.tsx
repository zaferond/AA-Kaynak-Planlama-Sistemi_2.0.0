import type { CSSProperties } from "react";
import useChartWidth from "./useChartWidth";
import { fmt, monthLabel } from "../../format";

type Series = {
  name: string;
  values: (number | null)[];
  color: string;
  dashed?: boolean;
};

/** Shared chart geometry keeps month labels legible on both long and narrow views. */
export default function MonthlyComparison({
  title,
  months,
  series,
  unit = "fte",
  reference,
}: {
  title: string;
  months: string[];
  series: Series[];
  unit?: "fte" | "percent";
  reference?: number;
}) {
  const { ref, width } = useChartWidth();
  const w = Math.max(width, 540, months.length * 78 + 60),
    h = 254;
  const left = 58,
    top = 28,
    bottom = 210,
    right = w - 28;
  const formatValue = (value: number | null | undefined) =>
    value == null
      ? "Hesaplanamaz"
      : unit === "percent"
        ? "%" + fmt(value)
        : fmt(value) + " kişi eşdeğeri";
  const max = Math.max(
    1,
    reference || 0,
    ...series.flatMap((item) =>
      item.values.filter((value): value is number => value != null),
    ),
  );
  const ceiling = max * 1.12;
  const x = (i: number) =>
    left + ((right - left) * (i + 0.5)) / Math.max(1, months.length);
  const y = (value: number) => bottom - (value / ceiling) * (bottom - top);
  return (
    <>
      <div className="resource-chart-legend">
        {series.map((item) => (
          <span key={item.name}>
            <i
              className={item.dashed ? "dashed" : undefined}
              style={{ "--series-color": item.color } as CSSProperties}
            />
            {item.name}
          </span>
        ))}
        <small>
          Birim: {unit === "percent" ? "yüzde (%)" : "kişi eşdeğeri (FTE)"}
        </small>
      </div>
      <div
        ref={ref}
        className="resource-chart-scroll"
        tabIndex={0}
        role="region"
        aria-label={title + " grafiği"}
      >
        <svg
          width={w}
          height={h}
          viewBox={`0 0 ${w} ${h}`}
          role="img"
          aria-label={title}
        >
          <text x={left} y={14} className="resource-chart-axis">
            {unit === "percent" ? "Etkinlik (%)" : "Kişi eşdeğeri"}
          </text>
          {[0, 1, 2, 3, 4].map((tick) => {
            const value = (ceiling * tick) / 4;
            return (
              <g key={tick}>
                <line
                  x1={left}
                  x2={right}
                  y1={y(value)}
                  y2={y(value)}
                  className="resource-chart-grid"
                />
                <text
                  x={left - 10}
                  y={y(value) + 4}
                  textAnchor="end"
                  className="resource-chart-axis"
                >
                  {unit === "percent" ? "%" + fmt(value) : fmt(value)}
                </text>
              </g>
            );
          })}
          {reference != null && (
            <g className="resource-chart-reference">
              <line
                x1={left}
                x2={right}
                y1={y(reference)}
                y2={y(reference)}
                stroke="var(--report-forecast-color, #b45309)"
                strokeDasharray="6 5"
              />
              <text
                x={right}
                y={y(reference) - 6}
                textAnchor="end"
                className="resource-chart-axis"
              >
                {formatValue(reference)} · plana eşit
              </text>
            </g>
          )}
          {series.map((item) => {
            let connected = false;
            const path = item.values
              .map((value, i) => {
                if (value == null) {
                  connected = false;
                  return "";
                }
                const command = `${connected ? "L" : "M"}${x(i)},${y(value)}`;
                connected = true;
                return command;
              })
              .join(" ");
            return (
              <path
                key={item.name}
                d={path}
                fill="none"
                stroke={item.color}
                strokeWidth={3.5}
                strokeDasharray={item.dashed ? "7 5" : undefined}
              />
            );
          })}
          {months.map((month, i) => {
            const label =
              monthLabel(month) +
              " · " +
              series
                .map((item) => item.name + ": " + formatValue(item.values[i]))
                .join(" · ");
            return (
              <g
                key={month}
                tabIndex={0}
                aria-label={label}
                className="resource-chart-point"
              >
                <title>{label}</title>
                <rect
                  x={x(i) - (right - left) / Math.max(1, months.length) / 2}
                  y={top}
                  width={(right - left) / Math.max(1, months.length)}
                  height={bottom - top}
                  fill="transparent"
                />
                {series
                  .filter((item) => item.values[i] != null)
                  .map((item) => (
                    <circle
                      key={item.name}
                      cx={x(i)}
                      cy={y(item.values[i]!)}
                      r={4.5}
                      fill="white"
                      stroke={item.color}
                      strokeWidth={2.5}
                    />
                  ))}
                <text
                  x={x(i)}
                  y={234}
                  textAnchor="middle"
                  className="resource-chart-axis"
                >
                  {monthLabel(month)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <details className="resource-chart-values">
        <summary>Aylık değerleri göster</summary>
        <div className="resource-chart-scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">Ay</th>
                {series.map((item) => (
                  <th scope="col" key={item.name}>
                    {item.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {months.map((month, i) => (
                <tr key={month}>
                  <th scope="row">{monthLabel(month)}</th>
                  {series.map((item) => (
                    <td key={item.name}>{formatValue(item.values[i])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}
