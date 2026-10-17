import { useState } from "react";
import { monthLabel } from "../../format";
import { pctLabel } from "./progress-view";

export type ChartPoint = {
  month: string;
  target: number | null;
  actual: number | null;
  spent: number | null;
};
const SERIES = [
  { key: "target", label: "Hedef", dash: "6 4" },
  { key: "actual", label: "Gerçekleşen", dash: undefined },
  { key: "spent", label: "Harcanan kaynak", dash: undefined },
] as const;
const W = 720,
  H = 260,
  left = 40,
  right = 112,
  y0 = 16,
  bottom = 36;

/** Cumulative target, actual and spending on one 0–100 % axis. */
export default function ProgressChart({ points }: { points: ChartPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  if (points.length < 2) return null;
  const x = (i: number) =>
    left + (i / (points.length - 1)) * (W - left - right);
  const y = (v: number) => y0 + (1 - v / 100) * (H - y0 - bottom);
  const path = (key: (typeof SERIES)[number]["key"]) => {
    let d = "",
      open = false;
    points.forEach((p, i) => {
      const v = p[key];
      if (v === null) return void (open = false);
      d += (open ? "L" : "M") + x(i).toFixed(1) + " " + y(v).toFixed(1);
      open = true;
    });
    return d;
  };
  const last = (key: (typeof SERIES)[number]["key"]) => {
    for (let i = points.length - 1; i >= 0; i--)
      if (points[i][key] !== null) return { i, v: points[i][key]! };
    return null;
  };
  // End labels, nudged apart so they never overlap.
  const labels = SERIES.flatMap((s) => {
    const end = last(s.key);
    return end ? [{ ...s, ...end, ly: y(end.v) }] : [];
  }).sort((a, b) => a.ly - b.ly);
  for (let i = 1; i < labels.length; i++)
    if (labels[i].ly - labels[i - 1].ly < 14)
      labels[i].ly = labels[i - 1].ly + 14;
  const step = Math.max(1, Math.ceil(points.length / 8));
  const active = hover === null ? null : points[hover];
  return (
    <figure className="progress-chart">
      <div className="progress-chart-legend">
        {SERIES.map((s) => (
          <span key={s.key} data-series={s.key}>
            <i aria-hidden="true" />
            {s.label}
          </span>
        ))}
      </div>
      <div className="progress-chart-plot">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label="Aylık hedef, gerçekleşen ve harcanan kaynak eğrileri"
          onMouseLeave={() => setHover(null)}
          onMouseMove={(e) => {
            const box = e.currentTarget.getBoundingClientRect();
            const px = ((e.clientX - box.left) / box.width) * W;
            const i = Math.round(
              ((px - left) / (W - left - right)) * (points.length - 1),
            );
            setHover(Math.min(points.length - 1, Math.max(0, i)));
          }}
        >
          {[0, 25, 50, 75, 100].map((v) => (
            <g key={v} className="progress-chart-grid">
              <line x1={left} x2={W - right} y1={y(v)} y2={y(v)} />
              <text x={left - 8} y={y(v) + 4} textAnchor="end">
                %{v}
              </text>
            </g>
          ))}
          {points.map((p, i) =>
            i % step === 0 || i === points.length - 1 ? (
              <text
                key={p.month}
                className="progress-chart-tick"
                x={x(i)}
                y={H - bottom + 18}
                textAnchor="middle"
              >
                {monthLabel(p.month)}
              </text>
            ) : null,
          )}
          {hover !== null && (
            <line
              className="progress-chart-cross"
              x1={x(hover)}
              x2={x(hover)}
              y1={y0}
              y2={H - bottom}
            />
          )}
          {SERIES.map((s) => (
            <path
              key={s.key}
              data-series={s.key}
              d={path(s.key)}
              fill="none"
              strokeWidth="2"
              strokeDasharray={s.dash}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}
          {hover !== null &&
            SERIES.map((s) =>
              points[hover][s.key] === null ? null : (
                <circle
                  key={s.key}
                  data-series={s.key}
                  cx={x(hover)}
                  cy={y(points[hover][s.key]!)}
                  r="4"
                />
              ),
            )}
          {labels.map((l) => (
            <text
              key={l.key}
              className="progress-chart-end"
              x={x(l.i) + 8}
              y={l.ly + 4}
            >
              {l.label} %{pctLabel(l.v)}
            </text>
          ))}
        </svg>
        {active && (
          <div
            className="progress-chart-tip"
            style={{ left: `${(x(hover!) / W) * 100}%` }}
            role="status"
          >
            <strong>{monthLabel(active.month)}</strong>
            {SERIES.map((s) => (
              <span key={s.key} data-series={s.key}>
                <i aria-hidden="true" />
                {s.label}:{" "}
                {active[s.key] === null ? "—" : "%" + pctLabel(active[s.key])}
              </span>
            ))}
          </div>
        )}
      </div>
    </figure>
  );
}
