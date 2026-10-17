import { useState } from "react";
import type { Principal } from "../../access";
import type { Change } from "../../../../shared/commands";
import {
  PROGRESS_NOTE_MAX,
  type ProjectProgress,
} from "../../../../shared/project-progress.ts";
import {
  LEVEL_LABELS,
  canLead,
  leaderRow,
  pctLabel,
  progressChange,
  type ProgressContext,
} from "./progress-view";

type Draft = { pct: string; note: string };
const decimal = (value: number) => String(value).replace(".", ",");

/** Leaders enter the month's cumulative actual % with a short note. */
export default function MonthlyEntry({
  ctx,
  user,
  month,
  saving,
  onSave,
  onStartBaseline,
}: {
  ctx: ProgressContext;
  user: Principal | null;
  month: string;
  saving: boolean;
  onSave: (changes: Change[]) => Promise<void>;
  onStartBaseline: (projectId: string, leader: string) => void;
}) {
  const { data } = ctx;
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const admin = user?.role === "admin";
  const locked = (data.progressLocks || []).some((lock) => lock.id === month);
  const projects = new Map(data.projects.map((p) => [p.id, p]));
  const records = (data.projectProgress || [])
    .filter(
      (record) =>
        canLead(user, record.leader) && projects.has(record.projectId),
    )
    .sort(
      (a, b) =>
        projects
          .get(a.projectId)!
          .name.localeCompare(projects.get(b.projectId)!.name, "tr") ||
        a.leader.localeCompare(b.leader, "tr"),
    );
  // Projects a leader works on (planned resource) without a progress record.
  const untracked = (user?.role === "manager" ? user.leaders : []).flatMap(
    (leader) =>
      data.projects
        .filter(
          (project) =>
            ctx.planned(project.id).has(leader) &&
            !records.some(
              (r) => r.projectId === project.id && r.leader === leader,
            ),
        )
        .map((project) => ({ project, leader })),
  );
  const pending = records.filter(
    (record) => record.baselines.length && !record.actuals[month],
  ).length;

  const draftOf = (record: ProjectProgress): Draft =>
    drafts[record.id] || {
      pct: record.actuals[month] ? decimal(record.actuals[month].pct) : "",
      note: record.actuals[month]?.note || "",
    };
  async function submit(record: ProjectProgress) {
    const draft = draftOf(record);
    const pct = Number(draft.pct.replace(",", "."));
    const problem =
      draft.pct.trim() === "" || !Number.isFinite(pct) || pct < 0 || pct > 100
        ? "0 ile 100 arasında bir yüzde girin."
        : Math.abs(Math.round(pct * 10) - pct * 10) > 1e-6
          ? "En fazla bir ondalık basamak girin."
          : !draft.note.trim()
            ? "Kısa bir açıklama yazın."
            : "";
    setErrors((all) => ({ ...all, [record.id]: problem }));
    if (problem) return;
    setBusy(record.id);
    try {
      await onSave([
        progressChange(data, {
          ...record,
          actuals: {
            ...record.actuals,
            [month]: { pct, note: draft.note.trim() },
          },
        }),
      ]);
      setDrafts(({ [record.id]: _, ...rest }) => rest);
    } catch (error) {
      setErrors((all) => ({ ...all, [record.id]: (error as Error).message }));
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="progress-entry">
      <div className="progress-entry-status">
        {locked ? (
          <span className="progress-locked">
            Bu ay kilitli; değişiklik için admin kilidi açmalı.
          </span>
        ) : (
          <span data-pending={pending ? "true" : undefined}>
            Giriş bekleyen: {pending} kayıt
          </span>
        )}
      </div>
      {records.length ? (
        <table className="progress-table" aria-label="Aylık ilerleme girişi">
          <thead>
            <tr>
              <th>Proje{admin ? " / Liderlik" : ""}</th>
              <th className="num">Hedef %</th>
              <th className="num">Geçen ay</th>
              <th>Gerçekleşen %</th>
              <th>Açıklama</th>
              <th className="num">Harcanan</th>
              <th>Durum</th>
              <th aria-label="İşlem" />
            </tr>
          </thead>
          <tbody>
            {records.map((record) => {
              const project = projects.get(record.projectId)!;
              const row = leaderRow(ctx, record, project, month);
              const draft = draftOf(record);
              const ready = record.baselines.length > 0;
              const changed =
                !!drafts[record.id] &&
                (draft.pct !==
                  (record.actuals[month]
                    ? decimal(record.actuals[month].pct)
                    : "") ||
                  draft.note !== (record.actuals[month]?.note || ""));
              const set = (patch: Partial<Draft>) =>
                setDrafts((all) => ({
                  ...all,
                  [record.id]: { ...draftOf(record), ...patch },
                }));
              return (
                <tr key={record.id}>
                  <td>
                    <strong>{project.name}</strong>
                    {admin && <small>{record.leader}</small>}
                  </td>
                  {ready ? (
                    <>
                      <td className="num">{pctLabel(row.target)}</td>
                      <td className="num">{pctLabel(row.previousActual)}</td>
                      <td>
                        <input
                          aria-label={`${project.name} / ${record.leader} / Gerçekleşen %`}
                          inputMode="decimal"
                          value={draft.pct}
                          disabled={locked || saving}
                          onChange={(e) => set({ pct: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void submit(record);
                          }}
                        />
                      </td>
                      <td>
                        <input
                          aria-label={`${project.name} / ${record.leader} / Açıklama`}
                          maxLength={PROGRESS_NOTE_MAX}
                          value={draft.note}
                          disabled={locked || saving}
                          onChange={(e) => set({ note: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void submit(record);
                          }}
                        />
                        {errors[record.id] && (
                          <small role="alert" className="progress-error">
                            {errors[record.id]}
                          </small>
                        )}
                      </td>
                      <td className="num">{pctLabel(row.spent)}</td>
                      <td>
                        <span className="progress-level" data-level={row.level}>
                          {LEVEL_LABELS[row.level]}
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="button primary"
                          disabled={
                            !changed || locked || saving || busy === record.id
                          }
                          onClick={() => void submit(record)}
                        >
                          {busy === record.id ? "Kaydediliyor…" : "Kaydet"}
                        </button>
                      </td>
                    </>
                  ) : (
                    <td colSpan={7} className="progress-muted">
                      {record.proposal?.status === "pending"
                        ? "Temel plan onay bekliyor; onaydan sonra giriş açılır."
                        : "Önce temel planı girip onaya gönderin."}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <p className="emptymsg">
          Henüz ilerleme kaydı yok. Temel Plan görünümünden bir proje için hedef
          eğrisi girerek başlayın.
        </p>
      )}
      {untracked.length > 0 && (
        <section
          className="progress-untracked"
          aria-label="Takibe eklenmemiş projeler"
        >
          <h3>Liderliğinizin kaynak planladığı, takibe eklenmemiş projeler</h3>
          <ul>
            {untracked.map(({ project, leader }) => (
              <li key={project.id + leader}>
                <span>
                  {project.name}
                  {user && user.leaders.length > 1 ? ` · ${leader}` : ""}
                </span>
                <button
                  type="button"
                  className="button"
                  onClick={() => onStartBaseline(project.id, leader)}
                >
                  Temel Plan Oluştur
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
