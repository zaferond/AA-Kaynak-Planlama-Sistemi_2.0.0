import { useRef, useState, type ReactNode } from "react";
import type { Project } from "../../model";
import { milestoneRanges } from "../../milestone-ranges";
import {
  phaseChipPalette,
  phaseChipStyle,
  phaseRunKey,
  phaseRunSpans,
} from "../../phase-chip";
import { positionPointerTooltip } from "../position-pointer-tooltip";
import { monthsAfter } from "../../../../shared/project-progress.ts";
import { pctLabel } from "./progress-view";

const MONTHS = [
  "Oca",
  "Şub",
  "Mar",
  "Nis",
  "May",
  "Haz",
  "Tem",
  "Ağu",
  "Eyl",
  "Eki",
  "Kas",
  "Ara",
];
const short = (month: string) =>
  MONTHS[Number(month.slice(5, 7)) - 1] + " " + month.slice(2, 4);
export const fullMonth = (month: string) =>
  MONTHS[Number(month.slice(5, 7)) - 1] + " " + month.slice(0, 4);
const day = (date: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(date)
    ? `${date.slice(8, 10)}.${date.slice(5, 7)}.${date.slice(0, 4)}`
    : date;
const accent = (color: string) =>
  phaseChipPalette.find((item) => item.id === color)?.accent || "#7b8794";

type Topic = {
  name: string;
  note: string;
  start: string;
  end: string;
  point: boolean;
  color: string;
};
export type GridRow = {
  label: string;
  /** Read-only rows sit on a grey ground; the row to fill stays white. */
  editable?: boolean;
  opening: ReactNode;
  cell: (month: string) => ReactNode;
};

/** Critical topics and milestones of the project that touch a month. */
function topicsIn(project: Project, month: string): Topic[] {
  return (project.milestones || []).flatMap((milestone) =>
    milestoneRanges(milestone)
      .filter(
        (range) =>
          range.start.slice(0, 7) <= month && range.end.slice(0, 7) >= month,
      )
      .map((range) => ({
        name: milestone.name,
        note: range.notes?.find((n) => n.text?.trim())?.text.trim() || "",
        start: range.start,
        end: range.end,
        point: range.displayKind === "milestone",
        color: range.color || "red",
      })),
  );
}

/**
 * Months laid out like the project timeline: phases, critical topics and the
 * leadership's planned resource first, then the rows of the screen using it
 * (targets on the baseline, actuals on the monthly entry).
 */
export default function MonthGrid({
  project,
  label,
  openingMonth,
  currentMonth,
  selectedMonth,
  planned,
  rows,
}: {
  project: Project;
  /** "<project> · <leadership>": names the table and its inputs. */
  label: string;
  openingMonth: string;
  currentMonth: string;
  /** The month being entered, outlined. */
  selectedMonth?: string;
  planned: Record<string, number> | undefined;
  rows: GridRow[];
}) {
  const months = monthsAfter(openingMonth, project.end);
  const keys = months.map((m) => phaseRunKey(project, m));
  const spans = phaseRunSpans(keys);
  const mark = (m: string) => ({
    "data-now": m === currentMonth ? "true" : undefined,
    "data-selected": m === selectedMonth ? "true" : undefined,
  });
  const tipRef = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<Topic[] | null>(null);
  const showTip = (topics: Topic[], x: number, y: number) => {
    setTip(topics);
    requestAnimationFrame(() => positionPointerTooltip(tipRef.current, x, y));
  };
  return (
    <div className="progress-grid-scroll">
      <table className="progress-grid" aria-label={label + " ay ay"}>
        <thead>
          <tr>
            <th scope="col">Ay</th>
            <th
              scope="col"
              className="opening"
              title="Açılış: takibin başladığı ayın sonu"
            >
              {short(openingMonth)}
              <small>açılış</small>
            </th>
            {months.map((m) => (
              <th key={m} scope="col" {...mark(m)}>
                {short(m)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="readonly">
            <th scope="row">Aşama</th>
            <td className="opening" />
            {months.map((m, i) => {
              if (keys[i] && keys[i - 1] === keys[i]) return null;
              return keys[i] ? (
                <td key={m} colSpan={spans[i]}>
                  <span
                    className="progress-phase"
                    style={phaseChipStyle(project, m, spans[i])}
                    title={project.phases[m]}
                  >
                    {project.phases[m]}
                  </span>
                </td>
              ) : (
                <td key={m} {...mark(m)} />
              );
            })}
          </tr>
          <tr className="readonly progress-grid-topics">
            <th scope="row">Kritik konular</th>
            <td className="opening" />
            {months.map((m) => {
              const topics = topicsIn(project, m);
              const bars = topics.filter((t) => !t.point);
              const points = topics.filter((t) => t.point);
              return (
                <td
                  key={m}
                  {...mark(m)}
                  data-has-topics={topics.length ? "true" : undefined}
                  tabIndex={topics.length ? 0 : undefined}
                  aria-label={
                    topics.length
                      ? `${fullMonth(m)}: ${topics.map((t) => t.name).join(", ")}`
                      : undefined
                  }
                  onMouseEnter={(e) =>
                    topics.length && showTip(topics, e.clientX, e.clientY)
                  }
                  onMouseMove={(e) =>
                    tip &&
                    positionPointerTooltip(tipRef.current, e.clientX, e.clientY)
                  }
                  onMouseLeave={() => setTip(null)}
                  onFocus={(e) => {
                    const box = e.currentTarget.getBoundingClientRect();
                    if (topics.length) showTip(topics, box.left, box.bottom);
                  }}
                  onBlur={() => setTip(null)}
                >
                  {bars.slice(0, 3).map((t, i) => (
                    <i
                      key={i}
                      className="progress-topic-bar"
                      style={{ background: accent(t.color) }}
                    />
                  ))}
                  {points.length > 0 && (
                    <b
                      style={{ color: accent(points[0].color) }}
                      aria-hidden="true"
                    >
                      ◆
                    </b>
                  )}
                </td>
              );
            })}
          </tr>
          <tr className="readonly">
            <th scope="row">Planlanan kaynak (kişi-ay)</th>
            <td className="opening">
              {planned?.[openingMonth] ? pctLabel(planned[openingMonth]) : "—"}
            </td>
            {months.map((m) => (
              <td key={m} {...mark(m)}>
                {planned?.[m] ? pctLabel(planned[m]) : "—"}
              </td>
            ))}
          </tr>
          {rows.map((row) => (
            <tr
              key={row.label}
              className={row.editable ? "editable" : "readonly"}
            >
              <th scope="row">{row.label}</th>
              <td className="opening">{row.opening}</td>
              {months.map((m) => (
                <td key={m} {...mark(m)}>
                  {row.cell(m)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {tip && (
        <div
          ref={tipRef}
          className="project-phase-tooltip progress-topic-tip"
          role="tooltip"
        >
          {tip.map((t, i) => (
            <div key={i}>
              <strong>
                {t.point ? "◆ " : "▬ "}
                {t.name}
              </strong>
              <span>
                {t.point || t.start === t.end
                  ? day(t.start)
                  : `${day(t.start)} – ${day(t.end)}`}
              </span>
              {t.note && t.note !== t.name && <small>{t.note}</small>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
