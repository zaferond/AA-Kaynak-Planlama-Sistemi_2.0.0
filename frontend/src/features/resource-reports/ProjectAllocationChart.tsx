import { useMemo, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { fmt } from "../../format";
import {
  topResourceProjects,
  type ProjectResourceComparison,
} from "../../../../shared/resource-planning-reports";
import useChartWidth from "./useChartWidth";

const chartValue = (value: number) =>
  value > 0 && value < 0.005 ? "<0,01" : fmt(value);

function projectLabel(name: string) {
  const words = name.split(/\s+/);
  const lines = [""];
  for (const word of words) {
    const last = lines.length - 1;
    if (lines[last].length + word.length > 22 && lines[last]) lines.push(word);
    else lines[last] += (lines[last] ? " " : "") + word;
  }
  return lines
    .slice(0, 3)
    .map((line, i) =>
      line.length > 24 || (i === 2 && lines.length > 3)
        ? line.slice(0, 23) + "…"
        : line,
    );
}

export default function ProjectAllocationChart({
  rows,
  scope,
}: {
  rows: ProjectResourceComparison[];
  scope: string;
}) {
  const [showPlanned, setShowPlanned] = useState(true);
  const [showActual, setShowActual] = useState(true);
  const { ref, width } = useChartWidth();
  const ranked = useMemo(
    () => topResourceProjects(rows, showPlanned, showActual),
    [rows, showPlanned, showActual],
  );
  const series = [
    ...(showPlanned
      ? [
          {
            key: "plannedTotal" as const,
            name: "Dağıtılan Kaynak",
            color: "var(--report-planned-color, #1d4ed8)",
          },
        ]
      : []),
    ...(showActual
      ? [
          {
            key: "actualTotal" as const,
            name: "Gerçekleşen Kaynak",
            color: "var(--report-current-color, #087f6a)",
          },
        ]
      : []),
  ];
  const w = Math.max(width, 600, ranked.length * 110 + 90);
  const left = 64,
    right = w - 24,
    top = 30,
    baseline = 226;
  const ceiling =
    (Math.max(
      0,
      ...ranked.flatMap((row) => series.map((item) => row[item.key])),
    ) || 1) * 1.15;
  const slot = (right - left) / Math.max(1, ranked.length);
  const barWidth = Math.min(28, slot / 4);
  const center = (index: number) => left + slot * (index + 0.5);
  const y = (value: number) => baseline - (value / ceiling) * (baseline - top);
  return (
    <section className="panel resource-report project-allocation-report">
      <header className="resource-report-head">
        <div>
          <h2>
            Proje Bazlı Planlanan / Gerçekleşen Kaynak Karşılaştırma Grafiği
          </h2>
          <p>{scope}</p>
        </div>
        <span className="resource-report-chip">
          İlk 10 proje · dönem toplamı
        </span>
      </header>
      <div
        className="resource-project-options"
        role="group"
        aria-label="Proje grafiğinde gösterilecek kaynaklar"
      >
        <label>
          <Switch
            size="sm"
            checked={showPlanned}
            onCheckedChange={setShowPlanned}
          />{" "}
          <i style={{ background: "var(--report-planned-color, #1d4ed8)" }} />
          Dağıtılan Kaynak
        </label>
        <label>
          <Switch
            size="sm"
            checked={showActual}
            onCheckedChange={setShowActual}
          />{" "}
          <i style={{ background: "var(--report-current-color, #087f6a)" }} />
          Gerçekleşen Kaynak
        </label>
        <small>Birim: dönem toplamı (kişi-ay)</small>
      </div>
      <div
        ref={ref}
        className="resource-chart-scroll"
        tabIndex={0}
        role="region"
        aria-label="Proje bazlı kaynak sütun grafiği"
      >
        {ranked.length ? (
          <svg
            width={w}
            height={300}
            viewBox={`0 0 ${w} 300`}
            role="img"
            aria-label="Proje Bazlı Planlanan / Gerçekleşen Kaynak Karşılaştırma Grafiği"
          >
            <text x={left} y={14} className="resource-chart-axis">
              Toplam kaynak (kişi-ay)
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
                    {chartValue(value)}
                  </text>
                </g>
              );
            })}
            {ranked.map((row, i) => (
              <g
                key={row.project.id}
                className="resource-project-point"
                data-project={row.project.id}
                tabIndex={0}
                aria-label={
                  row.project.name +
                  " · " +
                  series
                    .map(
                      (item) =>
                        item.name +
                        ": " +
                        chartValue(row[item.key]) +
                        " kişi-ay",
                    )
                    .join(" · ")
                }
              >
                <title>
                  {row.project.name +
                    (row.project.responsibleName
                      ? " · Proje Sorumlusu: " + row.project.responsibleName
                      : "") +
                    " · " +
                    series
                      .map(
                        (item) =>
                          item.name +
                          ": " +
                          chartValue(row[item.key]) +
                          " kişi-ay",
                      )
                      .join(" · ")}
                </title>
                {series.map((item, j) => {
                  const value = row[item.key];
                  const x =
                    center(i) +
                    (j - (series.length - 1) / 2) * (barWidth + 5) -
                    barWidth / 2;
                  return (
                    <g key={item.key}>
                      <rect
                        data-series={item.key}
                        x={x}
                        y={y(value)}
                        width={barWidth}
                        height={baseline - y(value)}
                        fill={item.color}
                        rx={3}
                      />
                      <text
                        x={x + barWidth / 2}
                        y={y(value) - 6}
                        textAnchor="middle"
                        className="resource-chart-axis resource-bar-value"
                      >
                        {chartValue(value)}
                      </text>
                    </g>
                  );
                })}
                <text
                  x={center(i)}
                  y={248}
                  textAnchor="middle"
                  className="resource-chart-axis"
                >
                  {projectLabel(row.project.name).map((line, j) => (
                    <tspan key={j} x={center(i)} dy={j ? 14 : 0}>
                      {line}
                    </tspan>
                  ))}
                </text>
              </g>
            ))}
          </svg>
        ) : (
          <p className="emptymsg">
            {series.length
              ? "Seçili dönemde gösterilecek proje kaynağı yok."
              : "Grafikte gösterilecek en az bir kaynak türü seçin."}
          </p>
        )}
      </div>
      {!!ranked.length && (
        <details className="resource-chart-values">
          <summary>Proje değerlerini göster</summary>
          <div className="resource-chart-scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col">Proje</th>
                  {series.map((item) => (
                    <th key={item.key} scope="col">
                      {item.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ranked.map((row) => (
                  <tr key={row.project.id}>
                    <th scope="row">{row.project.name}</th>
                    {series.map((item) => (
                      <td key={item.key}>{chartValue(row[item.key])}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </section>
  );
}
