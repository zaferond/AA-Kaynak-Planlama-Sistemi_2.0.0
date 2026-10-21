import { Fragment, useEffect, useMemo, useState } from "react";
import type { Data } from "../../model.ts";
import type { Change } from "../../../../shared/commands.ts";
import type { ScenarioWarning } from "../../../../shared/scenario-warnings.ts";
import {
  WARNING_LIFECYCLE_LABELS,
  type WarningLifecycleState,
} from "../../../../shared/scenario-warning-policy.ts";
import { monthLabel } from "../../format";
import {
  WarningCalculationSummary,
  ScenarioWarningStatus,
} from "./ScenarioWarningStatus";
import { downloadScenarioWarnings } from "./scenario-warning-export";

const dateLabel = (at: string) => new Date(at).toLocaleString("tr-TR");
const PAGE_SIZE = 30;
export default function ScenarioWarningsPanel({
  data,
  saving,
  onSave,
}: {
  data: Data;
  saving: boolean;
  onSave: (changes: Change[]) => Promise<void>;
}) {
  const [project, setProject] = useState("");
  const [status, setStatus] = useState<WarningLifecycleState | "">("");
  const [sort, setSort] = useState("month-desc");
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState("");
  const [detail, setDetail] = useState("");
  const [explanation, setExplanation] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    setPage(0);
  }, [project, status, sort]);
  const projects = useMemo(
    () => new Map(data.projects.map((p) => [p.id, p])),
    [data.projects],
  );
  const rows = useMemo(
    () =>
      (data.scenarioWarnings || [])
        .filter(
          (w) =>
            projects.has(w.projectId) &&
            (!project || w.projectId === project) &&
            (!status || w.status === status),
        )
        .sort((a, b) => {
          const name = (w: ScenarioWarning) =>
            projects.get(w.projectId)?.name || w.projectId;
          const order =
            sort === "project"
              ? name(a).localeCompare(name(b), "tr")
              : sort === "status"
                ? WARNING_LIFECYCLE_LABELS[a.status].localeCompare(
                    WARNING_LIFECYCLE_LABELS[b.status],
                    "tr",
                  )
                : sort === "code"
                  ? (a.code || "").localeCompare(b.code || "")
                  : sort === "month-asc"
                    ? a.month.localeCompare(b.month)
                    : b.month.localeCompare(a.month);
          return (
            order ||
            name(a).localeCompare(name(b), "tr") ||
            a.id.localeCompare(b.id)
          );
        }),
    [data.scenarioWarnings, projects, project, status, sort],
  );
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  async function update(w: ScenarioWarning, next: "seen" | "acted") {
    setError("");
    if (next === "acted" && !explanation.trim()) {
      setError("Aksiyon açıklaması zorunludur.");
      return;
    }
    try {
      await onSave([
        {
          kind: "scenarioWarning",
          id: w.id,
          revision: data.revisions["scenarioWarning:" + w.id] || 0,
          value: {
            status: next,
            explanation: next === "acted" ? explanation.trim() : "",
          },
        },
      ]);
      setEditing("");
      setExplanation("");
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  function exportList(format: "csv" | "xlsx") {
    try {
      downloadScenarioWarnings(data, rows, format);
      setError("");
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  return (
    <section className="scenario-warnings-panel" aria-label="Senaryo Uyarıları">
      <p>
        Son kilitli aya göre ilerleme ve gelecek kaynak planı birlikte
        değerlendirilir. Durum sırası: Açık → Görüldü → Aksiyon Alındı. Senaryo
        veya ay değiştiğinde önceki uyarı kapanır; geçmişi korunur.
      </p>
      <div className="progress-filters">
        <label>
          Proje
          <select value={project} onChange={(e) => setProject(e.target.value)}>
            <option value="">Tümü</option>
            {data.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Durum
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as typeof status)}
          >
            <option value="">Tümü</option>
            {Object.entries(WARNING_LIFECYCLE_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Sıralama
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="month-desc">Ay: yeniden eskiye</option>
            <option value="month-asc">Ay: eskiden yeniye</option>
            <option value="project">Proje adı</option>
            <option value="code">Kod</option>
            <option value="status">Durum</option>
          </select>
        </label>
        <button
          className="button"
          disabled={!rows.length}
          onClick={() => exportList("xlsx")}
        >
          Excel’e Aktar
        </button>
        <button
          className="button"
          disabled={!rows.length}
          onClick={() => exportList("csv")}
        >
          CSV’ye Aktar
        </button>
        <span>{rows.length} uyarı</span>
      </div>
      {error && (
        <p className="progress-error" role="alert">
          {error}
        </p>
      )}
      {rows.length ? (
        <div className="scenario-table-scroll">
          <table
            className="progress-table scenario-warning-table"
            aria-label="Senaryo uyarı listesi"
          >
            <thead>
              <tr>
                <th>Proje</th>
                <th>Kod</th>
                <th>1. Uyarı</th>
                <th>2. Uyarı / Aksiyon</th>
                <th>Ay</th>
                <th>Durum</th>
                <th>İşlem / Ayrıntı</th>
              </tr>
            </thead>
            <tbody>
              {rows
                .slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE)
                .map((w) => (
                  <Fragment key={w.id}>
                    <tr data-warning-id={w.id}>
                      <td>{projects.get(w.projectId)?.name || w.projectId}</td>
                      <td>{w.code || "—"}</td>
                      <td>
                        <ScenarioWarningStatus
                          assessment={{ ...w.assessment, warning2: "" }}
                        />
                      </td>
                      <td>{w.warning2 || "—"}</td>
                      <td>{monthLabel(w.month)}</td>
                      <td>
                        <span
                          className="scenario-lifecycle"
                          data-status={w.status}
                        >
                          {WARNING_LIFECYCLE_LABELS[w.status]}
                        </span>
                      </td>
                      <td>
                        {w.status === "open" && (
                          <button
                            className="button"
                            disabled={saving}
                            onClick={() => void update(w, "seen")}
                          >
                            Görüldü İşaretle
                          </button>
                        )}
                        {w.status === "seen" && editing !== w.id && (
                          <button
                            className="button"
                            disabled={saving}
                            onClick={() => {
                              setEditing(w.id);
                              setExplanation("");
                            }}
                          >
                            Aksiyon Gir
                          </button>
                        )}
                        {editing === w.id && w.status === "seen" && (
                          <form
                            className="scenario-action-form"
                            onSubmit={(e) => {
                              e.preventDefault();
                              void update(w, "acted");
                            }}
                          >
                            <label>
                              Aksiyon açıklaması
                              <textarea
                                required
                                maxLength={3000}
                                value={explanation}
                                onChange={(e) => setExplanation(e.target.value)}
                              />
                            </label>
                            <div className="scenario-form-actions">
                              <button
                                className="button"
                                type="submit"
                                disabled={saving || !explanation.trim()}
                              >
                                Aksiyon Alındı
                              </button>
                              <button
                                className="button"
                                type="button"
                                disabled={saving}
                                onClick={() => {
                                  setEditing("");
                                  setExplanation("");
                                }}
                              >
                                Vazgeç
                              </button>
                            </div>
                          </form>
                        )}
                        <button
                          type="button"
                          className="textbutton scenario-warning-detail"
                          aria-expanded={detail === w.id}
                          onClick={() => setDetail(detail === w.id ? "" : w.id)}
                        >
                          Hesap ve geçmiş
                        </button>
                      </td>
                    </tr>
                    {detail === w.id && (
                      <tr className="scenario-expanded-row">
                        <td colSpan={7}>
                          <div className="scenario-expanded-details">
                            {" "}
                            <WarningCalculationSummary
                              assessment={w.assessment}
                            />
                            <ol className="scenario-event-history">
                              {w.history.map((event, index) => (
                                <li key={index}>
                                  <strong>
                                    {WARNING_LIFECYCLE_LABELS[event.status]}
                                  </strong>
                                  <span>
                                    {dateLabel(event.at)} · {event.byName}
                                  </span>
                                  {event.explanation && (
                                    <p>{event.explanation}</p>
                                  )}
                                </li>
                              ))}
                            </ol>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="emptymsg">Bu filtrelere uyan senaryo uyarısı yok.</p>
      )}
      {pageCount > 1 && (
        <div className="progress-report-pages">
          <button
            className="button"
            disabled={currentPage === 0}
            onClick={() => setPage(currentPage - 1)}
          >
            Önceki
          </button>
          <span>
            {currentPage + 1} / {pageCount}
          </span>
          <button
            className="button"
            disabled={currentPage >= pageCount - 1}
            onClick={() => setPage(currentPage + 1)}
          >
            Sonraki
          </button>
        </div>
      )}
    </section>
  );
}
