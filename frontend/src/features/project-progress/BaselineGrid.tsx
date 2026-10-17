import type { Project } from "../../model";
import { milestoneRanges } from "../../milestone-ranges";
import {
  phaseChipPalette,
  phaseChipStyle,
  phaseRunKey,
  phaseRunSpans,
} from "../../phase-chip";
import {
  monthsAfter,
  targetAt,
  type ProgressBaseline,
} from "../../../../shared/project-progress.ts";
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
const full = (month: string) =>
  MONTHS[Number(month.slice(5, 7)) - 1] + " " + month.slice(0, 4);
const num = (value: string) => Number(value.replace(",", "."));
const accent = (color: string) =>
  phaseChipPalette.find((item) => item.id === color)?.accent || "#7b8794";

type Topic = {
  name: string;
  start: string;
  end: string;
  point: boolean;
  color: string;
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
        start: range.start,
        end: range.end,
        point: range.displayKind === "milestone",
        color: range.color || "red",
      })),
  );
}

/**
 * The target curve laid out like the project timeline: phases, critical
 * topics and the leadership's planned resource above the month inputs, so a
 * leader sets each month's target against what happens in that month.
 */
export default function BaselineGrid({
  project,
  openingMonth,
  openingPct,
  currentMonth,
  planned,
  suggested,
  approved,
  targets,
  editable,
  onTarget,
}: {
  project: Project;
  openingMonth: string;
  openingPct: number;
  currentMonth: string;
  planned: Record<string, number> | undefined;
  suggested: Record<string, number> | undefined;
  approved: ProgressBaseline | undefined;
  targets: Record<string, string>;
  editable: boolean;
  onTarget: (month: string, value: string) => void;
}) {
  const months = monthsAfter(openingMonth, project.end);
  const keys = months.map((m) => phaseRunKey(project, m));
  const spans = phaseRunSpans(keys);
  const value = (m: string) =>
    targets[m]?.trim() ? num(targets[m]) : Number.NaN;
  const now = (m: string) => (m === currentMonth ? "true" : undefined);
  return (
    <div className="progress-grid-scroll">
      <table className="progress-grid" aria-label="Temel plan ay ay">
        <thead>
          <tr>
            <th scope="col">Ay</th>
            <th
              scope="col"
              className="opening"
              title="Açılış: takip başladığı ayın sonu"
            >
              {short(openingMonth)}
              <small>açılış</small>
            </th>
            {months.map((m) => (
              <th key={m} scope="col" data-now={now(m)}>
                {short(m)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="progress-grid-phases">
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
                <td key={m} data-now={now(m)} />
              );
            })}
          </tr>
          <tr className="progress-grid-topics">
            <th scope="row">Kritik konular</th>
            <td className="opening" />
            {months.map((m) => {
              const topics = topicsIn(project, m);
              const bars = topics.filter((t) => !t.point);
              const points = topics.filter((t) => t.point);
              return (
                <td
                  key={m}
                  data-now={now(m)}
                  title={topics
                    .map(
                      (t) =>
                        `${t.point ? "◆" : "▬"} ${t.name} (${t.start} – ${t.end})`,
                    )
                    .join("\n")}
                >
                  {bars.slice(0, 3).map((t, i) => (
                    <i
                      key={i}
                      className="progress-topic-bar"
                      style={{ background: accent(t.color) }}
                    />
                  ))}
                  {points.map((t, i) => (
                    <b
                      key={i}
                      style={{ color: accent(t.color) }}
                      aria-hidden="true"
                    >
                      ◆
                    </b>
                  ))}
                  {topics.length > 0 && (
                    <span className="sr-only">
                      {topics.map((t) => t.name).join(", ")}
                    </span>
                  )}
                </td>
              );
            })}
          </tr>
          <tr>
            <th scope="row">Planlanan kaynak (kişi-ay)</th>
            <td className="opening num">{pctLabel(planned?.[openingMonth])}</td>
            {months.map((m) => (
              <td key={m} className="num" data-now={now(m)}>
                {planned?.[m] ? pctLabel(planned[m]) : "—"}
              </td>
            ))}
          </tr>
          {approved && (
            <tr className="progress-grid-quiet">
              <th scope="row">Onaylı hedef %</th>
              <td className="opening num">
                {pctLabel(targetAt(approved, openingMonth))}
              </td>
              {months.map((m) => (
                <td key={m} className="num" data-now={now(m)}>
                  {pctLabel(targetAt(approved, m))}
                </td>
              ))}
            </tr>
          )}
          {suggested && editable && (
            <tr className="progress-grid-quiet">
              <th scope="row">Önerilen hedef %</th>
              <td className="opening num">{pctLabel(openingPct)}</td>
              {months.map((m) => (
                <td key={m} className="num" data-now={now(m)}>
                  {pctLabel(suggested[m])}
                </td>
              ))}
            </tr>
          )}
          <tr className="progress-grid-targets">
            <th scope="row">Hedef % (kümülatif)</th>
            <td className="opening num">
              <strong>{pctLabel(openingPct)}</strong>
            </td>
            {months.map((m) => (
              <td key={m} data-now={now(m)}>
                {editable ? (
                  <input
                    aria-label={`${full(m)} hedef %`}
                    inputMode="decimal"
                    value={targets[m] ?? ""}
                    onChange={(e) => onTarget(m, e.target.value)}
                  />
                ) : (
                  <span className="num">{targets[m] ?? "—"}</span>
                )}
              </td>
            ))}
          </tr>
          <tr className="progress-grid-delta">
            <th scope="row">Aylık artış</th>
            <td className="opening" />
            {months.map((m, i) => {
              const before = i ? value(months[i - 1]) : openingPct;
              const delta = value(m) - before;
              return (
                <td
                  key={m}
                  className="num"
                  data-now={now(m)}
                  data-negative={delta < 0 ? "true" : undefined}
                >
                  {Number.isFinite(delta)
                    ? (delta > 0 ? "+" : "") +
                      pctLabel(Math.round(delta * 10) / 10)
                    : "—"}
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
