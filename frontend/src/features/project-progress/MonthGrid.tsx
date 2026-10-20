import type { ReactNode } from "react";
import type { Project } from "../../model";
import { phaseChipStyle, phaseRunKey, phaseRunSpans } from "../../phase-chip";
import ProgressTopicCells from "./ProgressTopicCells";
import { progressDisplayMonths } from "../../../../shared/project-progress.ts";
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
export type GridRow = {
  label: string;
  /** Read-only rows sit on a grey ground; the row to fill stays white. */
  editable?: boolean;
  cell: (month: string) => ReactNode;
};

/**
 * Months laid out like the project timeline: phases, critical topics and the
 * leadership's planned resource first, then the rows of the screen using it
 * (targets on the baseline, actuals on the monthly entry).
 */
export default function MonthGrid({
  project,
  label,
  currentMonth,
  selectedMonth,
  planned,
  rows,
}: {
  project: Project;
  /** "<project> · <leadership>": names the table and its inputs. */
  label: string;
  currentMonth: string;
  /** The month being entered, outlined. */
  selectedMonth?: string;
  planned: Record<string, number> | undefined;
  rows: GridRow[];
}) {
  const months = progressDisplayMonths(currentMonth, project.end);
  const keys = months.map((m) => phaseRunKey(project, m));
  const spans = phaseRunSpans(keys);
  const mark = (m: string) => ({
    "data-now": m === currentMonth ? "true" : undefined,
    "data-selected": m === selectedMonth ? "true" : undefined,
  });
  return (
    <div className="progress-grid-scroll">
      <table className="progress-grid" aria-label={label + " ay ay"}>
        <thead>
          <tr>
            <th scope="col">Ay</th>
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
            <ProgressTopicCells
              project={project}
              months={months}
              currentMonth={currentMonth}
              selectedMonth={selectedMonth}
            />
          </tr>
          <tr className="readonly">
            <th scope="row">Planlanan kaynak (kişi-ay)</th>
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
              {months.map((m) => (
                <td key={m} {...mark(m)}>
                  {row.cell(m)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
