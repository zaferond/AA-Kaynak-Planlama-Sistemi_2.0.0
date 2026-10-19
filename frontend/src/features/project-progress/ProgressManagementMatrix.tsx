import { Fragment, useMemo } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  TimelineMonthHead,
  TimelineYearRow,
} from "../../components/TimelineHeaders";
import ProjectResponsible from "../../ProjectResponsible";
import { phaseChipStyle, phaseRunKey, phaseRunSpans } from "../../phase-chip";
import { monthLabel } from "../../format";
import { pctLabel, type ProgressContext } from "./progress-view";
import {
  managementPoint,
  STATE_LABELS,
  STATE_HELP,
  type ManagedProject,
  type ManagementAssessment,
  type ReportPoint,
} from "./progress-management";

export const gapLabel = (gap: number | null) =>
  gap === null ? "—" : (gap > 0 ? "+" : "") + pctLabel(gap);

export default function ProgressManagementMatrix({
  ctx,
  projects,
  months,
  month,
  expanded,
  setExpanded,
  detail,
  onDetail,
}: {
  ctx: ProgressContext;
  projects: ManagedProject[];
  months: string[];
  month: string;
  expanded: Set<string>;
  setExpanded: (value: Set<string>) => void;
  detail: string;
  onDetail: (id: string) => void;
}) {
  const values = useMemo(
    () =>
      new Map(
        projects.map((project) => [
          project.row.project.id,
          {
            project: months.map((m) =>
              managementPoint(ctx, project.row.project, project.row.leaders, m),
            ),
            leaders: new Map(
              project.leaders.map((l) => [
                l.row.record.id,
                months.map((m) =>
                  managementPoint(ctx, project.row.project, [l.row], m),
                ),
              ]),
            ),
          },
        ]),
      ),
    [ctx, projects, months],
  );
  const metrics = [
    { key: "target", label: "Planlanan %" },
    { key: "actual", label: "Gerçekleşen %" },
    { key: "gap", label: "Fark (puan)" },
  ] as const;
  const cells = (points: ReportPoint[], key: "target" | "actual" | "gap") =>
    months.map((m, index) => {
      const point = points[index];
      return (
        <td
          key={m}
          data-selected={m === month || undefined}
          data-tone={
            key === "gap" && point.gap !== null
              ? point.gap < 0
                ? "behind"
                : point.gap > 0
                  ? "ahead"
                  : "equal"
              : undefined
          }
          title={`${monthLabel(m)} · ${STATE_LABELS[point.state]}${point.gap === null ? "" : ` · fark ${gapLabel(point.gap)} puan`}`}
        >
          {key === "gap" ? gapLabel(point.gap) : pctLabel(point[key])}
        </td>
      );
    });
  return (
    <div
      className="progress-matrix-scroll"
      role="region"
      aria-label="Aylık ilerleme tablosu"
      tabIndex={0}
    >
      <table
        className="progress-table progress-report-table progress-monthly-matrix"
        aria-label="Proje ilerleme raporu"
        style={{ width: 540 + months.length * 86, minWidth: "100%" }}
      >
        <colgroup>
          <col style={{ width: 180 }} />
          <col style={{ width: 240 }} />
          <col style={{ width: 120 }} />
          {months.map((m) => (
            <col key={m} />
          ))}
        </colgroup>
        <thead>
          <TimelineYearRow
            years={months.map((m) => m.slice(0, 4))}
            labelColumns={3}
          />
          <tr>
            <th scope="col" className="progress-matrix-assessment">
              Değerlendirme durumu
              <small>{monthLabel(month)}</small>
            </th>
            <th scope="col" className="progress-matrix-name">
              Proje / Liderlik
            </th>
            <th scope="col">Gösterge</th>
            {months.map((m) => (
              <TimelineMonthHead
                key={m}
                month={m}
                years={[...new Set(months.map((v) => v.slice(0, 4)))]}
              />
            ))}
          </tr>
        </thead>
        <tbody>
          {projects.map((project) => {
            const { row } = project;
            const points = values.get(row.project.id)!;
            const isExpanded = expanded.has(row.project.id);
            const phaseKeys = months.map((m) =>
              phaseRunKey(
                row.project,
                m,
                m >= row.project.start && m <= row.project.end,
              ),
            );
            const phaseSpans = phaseRunSpans(phaseKeys);
            return (
              <Fragment key={row.project.id}>
                {[{ key: "phase", label: "Aşama" } as const, ...metrics].map(
                  ({ key, label }, index) => (
                    <tr
                      key={key}
                      className={
                        index === 0
                          ? "progress-project-row"
                          : "progress-project-metric"
                      }
                      data-project={row.project.id}
                      data-metric={key}
                      data-selected={detail === row.project.id || undefined}
                    >
                      {index === 0 && (
                        <td rowSpan={4} className="progress-matrix-assessment">
                          <AssessmentStatus value={project.assessment} />
                        </td>
                      )}
                      {index === 0 && (
                        <td rowSpan={4} className="progress-matrix-name">
                          <button
                            type="button"
                            className="progress-expand"
                            aria-expanded={isExpanded}
                            aria-label={
                              row.project.name +
                              (isExpanded
                                ? " liderliklerini gizle"
                                : " liderliklerini göster")
                            }
                            onClick={() => {
                              const next = new Set(expanded);
                              if (isExpanded) next.delete(row.project.id);
                              else next.add(row.project.id);
                              setExpanded(next);
                            }}
                          >
                            {isExpanded ? (
                              <ChevronDown size={14} />
                            ) : (
                              <ChevronRight size={14} />
                            )}
                          </button>
                          <button
                            type="button"
                            className="textbutton"
                            onClick={() =>
                              onDetail(
                                detail === row.project.id ? "" : row.project.id,
                              )
                            }
                          >
                            {row.project.name}
                          </button>
                          <ProjectResponsible project={row.project} />
                          <small>
                            {row.leaders.length} liderlik · Bitiş:{" "}
                            {monthLabel(row.project.end)}
                          </small>
                        </td>
                      )}
                      <th scope="row" className="progress-matrix-metric">
                        {label}
                      </th>
                      {key === "phase"
                        ? months.map((m, i) => {
                            if (
                              phaseKeys[i] &&
                              phaseKeys[i - 1] === phaseKeys[i]
                            )
                              return null;
                            return (
                              <td
                                key={m}
                                colSpan={phaseKeys[i] ? phaseSpans[i] : 1}
                                className="progress-matrix-phase"
                                data-month={m}
                              >
                                {phaseKeys[i] ? (
                                  <span
                                    className="progress-phase"
                                    style={phaseChipStyle(
                                      row.project,
                                      m,
                                      phaseSpans[i],
                                    )}
                                    title={row.project.phases[m]}
                                  >
                                    {row.project.phases[m]}
                                  </span>
                                ) : (
                                  "—"
                                )}
                              </td>
                            );
                          })
                        : cells(points.project, key)}
                    </tr>
                  ),
                )}
                {isExpanded &&
                  project.leaders.map((l) => (
                    <Fragment key={l.row.record.id}>
                      {metrics.map(({ key, label }, index) => (
                        <tr
                          key={key}
                          className="progress-leader-row"
                          data-leader={l.row.record.leader}
                          data-metric={key}
                        >
                          {index === 0 && (
                            <td
                              rowSpan={3}
                              className="progress-matrix-assessment"
                            >
                              <AssessmentStatus value={l.assessment} />
                            </td>
                          )}
                          {index === 0 && (
                            <td rowSpan={3} className="progress-matrix-name">
                              <strong>↳ {l.row.record.leader}</strong>
                              {l.row.note && (
                                <small className="progress-note">
                                  {l.row.note}
                                </small>
                              )}
                            </td>
                          )}
                          <th scope="row" className="progress-matrix-metric">
                            {label}
                          </th>
                          {cells(points.leaders.get(l.row.record.id)!, key)}
                        </tr>
                      ))}
                    </Fragment>
                  ))}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function AssessmentStatus({ value }: { value: ManagementAssessment }) {
  const { point, risk } = value;
  return (
    <div
      className="progress-assessment"
      title={[...value.reasons, value.action].join(" · ")}
    >
      <strong data-state={point.state}>{STATE_LABELS[point.state]}</strong>
      <small className="progress-assessment-meaning">
        {point.gap !== null
          ? point.gap < 0
            ? `Hedefin ${pctLabel(Math.abs(point.gap))} puan gerisinde.`
            : point.gap > 0
              ? `Hedefin ${pctLabel(point.gap)} puan önünde.`
              : "Gerçekleşen ilerleme, hedefle eşit."
          : point.state === "missing"
            ? `${point.entered}/${point.total} liderlik giriş yaptı. Eksik girişler tamamlanmalı.`
            : STATE_HELP[point.state]}
      </small>
      {risk && risk !== "green" && (
        <>
          <span className="progress-level" data-level={risk}>
            {risk === "red" ? "Yüksek risk" : "Risk izlenmeli"}
          </span>
          <details className="progress-assessment-reasons">
            <summary>Riskin nedeni ve öneri</summary>
            <ul>
              {value.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
            <p>{value.action}</p>
          </details>
        </>
      )}
    </div>
  );
}
