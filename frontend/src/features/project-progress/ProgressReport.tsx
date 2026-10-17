import { Fragment, useEffect, useMemo, useState } from "react";
import {
  ArrowDownToLine,
  ChevronDown,
  ChevronRight,
  Lock,
  LockOpen,
} from "lucide-react";
import type { Principal } from "../../access";
import type { Change } from "../../../../shared/commands";
import {
  currentBaseline,
  monthsAfter,
  type RiskSignal,
} from "../../../../shared/project-progress.ts";
import { monthLabel } from "../../format";
import ProgressChart, { type ChartPoint } from "./ProgressChart";
import { downloadProgressReport } from "./progress-export";
import {
  LEVEL_LABELS,
  pctLabel,
  perfLabel,
  projectRows,
  type ProgressContext,
  type ProjectRow,
} from "./progress-view";

const reasons = (signals: RiskSignal[]) =>
  signals.map((signal) => signal.reason).join(" · ");
/** The project's own reasons, then its leaderships' (each once). */
const projectReasons = (row: ProjectRow) =>
  [
    ...new Set([
      ...row.signals.map((signal) => signal.reason),
      ...row.leaders.flatMap((l) => l.signals.map((signal) => signal.reason)),
    ]),
  ]
    .slice(0, 3)
    .join(" · ");

/** Project × leadership progress for one month, the riskiest first. */
export default function ProgressReport({
  ctx,
  user,
  month,
  currentMonth,
  saving,
  onSave,
  initialDetail = "",
}: {
  ctx: ProgressContext;
  user: Principal | null;
  month: string;
  currentMonth: string;
  saving: boolean;
  onSave: (changes: Change[]) => Promise<void>;
  /** Project opened from a badge on another screen. */
  initialDetail?: string;
}) {
  const { data } = ctx;
  const admin = user?.role === "admin";
  const [leader, setLeader] = useState("");
  const [projectId, setProjectId] = useState("");
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [detail, setDetail] = useState(initialDetail);
  useEffect(() => {
    if (initialDetail)
      document
        .getElementById("progress-detail")
        ?.scrollIntoView({ block: "start" });
  }, [initialDetail]);
  const [error, setError] = useState("");
  const records = data.projectProgress || [];
  const rows = useMemo(
    () => projectRows(ctx, month, { leader, projectId }),
    [ctx, month, leader, projectId],
  );
  const lock = (data.progressLocks || []).find((item) => item.id === month);
  // Projects without an approved baseline are not rated yet.
  const count = (level: ProjectRow["level"]) =>
    rows.filter((row) => row.target !== null && row.level === level).length;
  const missing = rows.reduce(
    (total, row) =>
      total +
      row.leaders.filter((l) => l.target !== null && l.actual === null).length,
    0,
  );
  const leaderNames = [...new Set(records.map((r) => r.leader))].sort((a, b) =>
    a.localeCompare(b, "tr"),
  );
  const projectsWithRecords = data.projects.filter((p) =>
    records.some((r) => r.projectId === p.id),
  );
  const detailRow = rows.find((row) => row.project.id === detail);

  async function toggleLock() {
    setError("");
    try {
      await onSave([
        {
          kind: "progressLock",
          id: month,
          value: lock ? null : { id: month, lockedByName: "", lockedAt: "" },
          revision: data.revisions["progressLock:" + month] || 0,
          ...(lock ? { operation: "delete" as const } : {}),
        },
      ]);
    } catch (cause) {
      setError((cause as Error).message);
    }
  }

  return (
    <div className="progress-report">
      <div className="progress-filters">
        <label>
          Liderlik
          <select value={leader} onChange={(e) => setLeader(e.target.value)}>
            <option value="">Tümü</option>
            {leaderNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Proje
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
          >
            <option value="">Tümü</option>
            {projectsWithRecords.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="button progress-lock-button"
          disabled={!rows.length}
          onClick={() => {
            try {
              downloadProgressReport(rows, month, monthLabel(month));
              setError("");
            } catch (cause) {
              setError((cause as Error).message);
            }
          }}
        >
          <ArrowDownToLine size={14} />
          Excel’e Aktar
        </button>
        {admin && (
          <button
            type="button"
            className="button progress-lock-button"
            disabled={saving}
            onClick={() => void toggleLock()}
          >
            {lock ? <LockOpen size={14} /> : <Lock size={14} />}
            {lock ? "Ayın Kilidini Aç" : "Ayı Kilitle"}
          </button>
        )}
        {lock && (
          <span className="progress-locked">
            {monthLabel(month)} kilitli · {lock.lockedByName}
          </span>
        )}
      </div>
      {error && (
        <p role="alert" className="progress-error">
          {error}
        </p>
      )}
      <div className="progress-cards" aria-label="Özet">
        <span data-level="red">
          <i aria-hidden="true" />
          {count("red")} kırmızı proje
        </span>
        <span data-level="amber">
          <i aria-hidden="true" />
          {count("amber")} sarı proje
        </span>
        <span data-level="green">
          <i aria-hidden="true" />
          {count("green")} yeşil proje
        </span>
        <span>Giriş eksik: {missing}</span>
      </div>
      {rows.length ? (
        <table
          className="progress-table progress-report-table"
          aria-label="Proje ilerleme raporu"
        >
          <thead>
            <tr>
              <th>Proje / Liderlik</th>
              <th className="num">Hedef %</th>
              <th className="num">Gerçekleşen %</th>
              <th className="num">Harcanan %</th>
              <th className="num">Perf.</th>
              <th>Risk ve nedeni</th>
              <th>Açıklama</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const expanded = open.has(row.project.id);
              return (
                <Fragment key={row.project.id}>
                  <tr
                    className="progress-project-row"
                    data-selected={detail === row.project.id || undefined}
                  >
                    <td>
                      <button
                        type="button"
                        className="progress-expand"
                        aria-expanded={expanded}
                        aria-label={
                          row.project.name +
                          (expanded
                            ? " liderliklerini gizle"
                            : " liderliklerini göster")
                        }
                        onClick={() =>
                          setOpen((all) => {
                            const next = new Set(all);
                            if (next.has(row.project.id))
                              next.delete(row.project.id);
                            else next.add(row.project.id);
                            return next;
                          })
                        }
                      >
                        {expanded ? (
                          <ChevronDown size={14} />
                        ) : (
                          <ChevronRight size={14} />
                        )}
                      </button>
                      <button
                        type="button"
                        className="textbutton"
                        onClick={() =>
                          setDetail(
                            detail === row.project.id ? "" : row.project.id,
                          )
                        }
                      >
                        {row.project.name}
                      </button>
                    </td>
                    <td className="num">{pctLabel(row.target)}</td>
                    <td className="num">{pctLabel(row.actual)}</td>
                    <td className="num">{pctLabel(row.spent)}</td>
                    <td className="num">
                      <strong>{perfLabel(row.performance)}</strong>
                    </td>
                    <td>
                      {row.target === null ? (
                        <span className="progress-muted">
                          Temel plan bekleniyor
                        </span>
                      ) : (
                        <span className="progress-level" data-level={row.level}>
                          {LEVEL_LABELS[row.level]}
                        </span>
                      )}
                      {row.target !== null && projectReasons(row) && (
                        <small>{projectReasons(row)}</small>
                      )}
                      {row.missing > 0 && (
                        <small>{row.missing} liderlik girmedi</small>
                      )}
                    </td>
                    <td />
                  </tr>
                  {expanded &&
                    row.leaders.map((l) => (
                      <tr key={l.record.id} className="progress-leader-row">
                        <td>↳ {l.record.leader}</td>
                        <td className="num">{pctLabel(l.target)}</td>
                        <td className="num">{pctLabel(l.actual)}</td>
                        <td className="num">{pctLabel(l.spent)}</td>
                        <td className="num">{perfLabel(l.performance)}</td>
                        <td>
                          <span className="progress-level" data-level={l.level}>
                            {LEVEL_LABELS[l.level]}
                          </span>
                          {l.signals.length > 0 && (
                            <small>{reasons(l.signals)}</small>
                          )}
                          {l.target === null && <small>Temel plan yok</small>}
                        </td>
                        <td className="progress-note">{l.note || "—"}</td>
                      </tr>
                    ))}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      ) : (
        <p className="emptymsg">Bu süzgeçlere uyan ilerleme kaydı yok.</p>
      )}
      {detailRow && (
        <ProjectDetail ctx={ctx} row={detailRow} currentMonth={currentMonth} />
      )}
    </div>
  );
}

function ProjectDetail({
  ctx,
  row,
  currentMonth,
}: {
  ctx: ProgressContext;
  row: ProjectRow;
  currentMonth: string;
}) {
  const openings = row.leaders
    .map((l) => currentBaseline(l.record)?.openingMonth)
    .filter((m): m is string => !!m)
    .sort();
  const first = openings[0];
  const points: ChartPoint[] = first
    ? [first, ...monthsAfter(first, row.project.end)].map((month) => {
        const r = projectRows(ctx, month, { projectId: row.project.id })[0];
        const past = month <= currentMonth;
        const target = r?.target ?? null;
        // At the opening every curve starts from the same opening value.
        if (month === first)
          return { month, target, actual: target, spent: target };
        return {
          month,
          target,
          actual: past ? (r?.actual ?? null) : null,
          spent: past ? (r?.spent ?? null) : null,
        };
      })
    : [];
  const history = row.leaders
    .flatMap((l) =>
      Object.entries(l.record.actuals).map(([month, entry]) => ({
        month,
        leader: l.record.leader,
        ...entry,
      })),
    )
    .sort(
      (a, b) =>
        b.month.localeCompare(a.month) ||
        a.leader.localeCompare(b.leader, "tr"),
    );
  return (
    <section
      id="progress-detail"
      className="progress-detail"
      aria-label={row.project.name + " ayrıntısı"}
    >
      <h3>{row.project.name}</h3>
      {points.length > 1 ? (
        <ProgressChart points={points} />
      ) : (
        <p className="emptymsg">Grafik için onaylı temel plan gerekir.</p>
      )}
      <h4>Açıklama geçmişi</h4>
      {history.length ? (
        <table className="progress-table compact">
          <thead>
            <tr>
              <th>Ay</th>
              <th>Liderlik</th>
              <th className="num">Gerçekleşen %</th>
              <th>Açıklama</th>
              <th>Giren</th>
            </tr>
          </thead>
          <tbody>
            {history.map((h) => (
              <tr key={h.month + h.leader}>
                <td>{monthLabel(h.month)}</td>
                <td>{h.leader}</td>
                <td className="num">{pctLabel(h.pct)}</td>
                <td>{h.note}</td>
                <td>{h.byName || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="emptymsg">Henüz gerçekleşen girişi yok.</p>
      )}
    </section>
  );
}
