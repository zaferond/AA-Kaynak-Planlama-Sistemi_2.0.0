import { useEffect, useMemo, useState } from "react";
import type { Principal } from "../../access";
import type { Change } from "../../../../shared/commands";
import {
  PROGRESS_OPENING_MONTH,
  currentBaseline,
  monthsAfter,
  previousMonth,
  proposalProblems,
  suggestTargets,
  targetAt,
  type ProgressProposal,
  type ProjectProgress,
} from "../../../../shared/project-progress.ts";
import { monthLabel } from "../../format";
import {
  canLead,
  newProgressId,
  pctLabel,
  progressChange,
  type ProgressContext,
} from "./progress-view";

export type BaselineSelection = { projectId: string; leader: string } | null;
type Form = {
  openingMonth: string;
  openingPct: string;
  targets: Record<string, string>;
  reason: string;
};

const statusLabel = (record: ProjectProgress) =>
  record.proposal?.status === "pending"
    ? "Onay bekliyor"
    : record.proposal
      ? "Taslak"
      : record.baselines.length
        ? `Onaylı · sürüm ${record.baselines.length}`
        : "Boş";
const num = (value: string) => Number(value.replace(",", "."));
const text = (value: number) => String(value).replace(".", ",");

/** Leaders enter the cumulative target curve; an admin approves it. */
export default function BaselineEditor({
  ctx,
  user,
  currentMonth,
  saving,
  onSave,
  selection,
  setSelection,
}: {
  ctx: ProgressContext;
  user: Principal | null;
  currentMonth: string;
  saving: boolean;
  onSave: (changes: Change[]) => Promise<void>;
  selection: BaselineSelection;
  setSelection: (selection: BaselineSelection) => void;
}) {
  const { data } = ctx;
  const admin = user?.role === "admin";
  const projects = new Map(data.projects.map((p) => [p.id, p]));
  const records = (data.projectProgress || [])
    .filter((r) => canLead(user, r.leader) && projects.has(r.projectId))
    .sort(
      (a, b) =>
        Number(b.proposal?.status === "pending") -
          Number(a.proposal?.status === "pending") ||
        projects
          .get(a.projectId)!
          .name.localeCompare(projects.get(b.projectId)!.name, "tr") ||
        a.leader.localeCompare(b.leader, "tr"),
    );
  const record = selection
    ? records.find(
        (r) =>
          r.projectId === selection.projectId && r.leader === selection.leader,
      )
    : undefined;
  const project = selection ? projects.get(selection.projectId) : undefined;
  const baseline = record && currentBaseline(record);
  const [rebaseline, setRebaseline] = useState(false);
  const [form, setForm] = useState<Form | null>(null);
  const [message, setMessage] = useState<{ text: string; error?: boolean }>();
  const [newProject, setNewProject] = useState("");
  const [newLeader, setNewLeader] = useState("");
  const [weight, setWeight] = useState("");
  const revision = record ? data.revisions["progress:" + record.id] || 0 : 0;

  // A fresh form whenever another record (or a newer revision) is shown.
  // A save's own message stays; another record starts without one.
  useEffect(
    () => setMessage(undefined),
    [selection?.projectId, selection?.leader],
  );
  useEffect(() => {
    setRebaseline(false);
    setWeight(record?.weight === undefined ? "" : String(record.weight));
    if (!selection || !project) return setForm(null);
    const p = record?.proposal;
    if (p)
      return setForm({
        openingMonth: p.openingMonth,
        openingPct: text(p.openingPct),
        targets: Object.fromEntries(
          Object.entries(p.targets).map(([m, v]) => [m, text(v)]),
        ),
        reason: p.reason || "",
      });
    if (baseline) return setForm(null);
    const planned = ctx.planned(project.id).get(selection.leader);
    const targets = suggestTargets(
      PROGRESS_OPENING_MONTH,
      0,
      project.end,
      planned,
    );
    setForm({
      openingMonth: PROGRESS_OPENING_MONTH,
      openingPct: "0",
      targets: Object.fromEntries(
        Object.entries(targets).map(([m, v]) => [m, text(v)]),
      ),
      reason: "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection?.projectId, selection?.leader, revision]);

  function startRebaseline() {
    if (!record || !baseline || !project) return;
    const opening =
      previousMonth(currentMonth) > baseline.openingMonth
        ? previousMonth(currentMonth)
        : baseline.openingMonth;
    const openingPct =
      record.actuals[opening]?.pct ?? targetAt(baseline, opening) ?? 0;
    setForm({
      openingMonth: opening,
      openingPct: text(openingPct),
      targets: Object.fromEntries(
        monthsAfter(opening, project.end).map((m) => [
          m,
          text(Math.max(openingPct, targetAt(baseline, m) ?? 100)),
        ]),
      ),
      reason: "",
    });
    setRebaseline(true);
  }

  const months =
    form && project ? monthsAfter(form.openingMonth, project.end) : [];
  const planned =
    project && selection
      ? ctx.planned(project.id).get(selection.leader)
      : undefined;
  const proposal = useMemo(() => {
    if (!form) return null;
    const targets: Record<string, number> = {};
    for (const m of months)
      if (form.targets[m]?.trim()) targets[m] = num(form.targets[m]);
    return {
      openingMonth: form.openingMonth,
      openingPct: num(form.openingPct),
      targets,
      ...(form.reason.trim() ? { reason: form.reason.trim() } : {}),
    };
  }, [form, months.join()]);
  const problems =
    proposal && project
      ? [
          ...(!(proposal.openingPct >= 0 && proposal.openingPct <= 100)
            ? ["Açılış yüzdesi 0 ile 100 arasında olmalı."]
            : []),
          ...proposalProblems(proposal, project.end),
          ...(baseline && !proposal.reason
            ? ["Yeni temel plan için gerekçe yazın."]
            : []),
        ]
      : [];
  const pending = record?.proposal?.status === "pending";

  async function send(status: ProgressProposal["status"] | null, done: string) {
    if (!selection || !project) return;
    setMessage(undefined);
    const base: ProjectProgress = record || {
      id: newProgressId(),
      projectId: project.id,
      leader: selection.leader,
      baselines: [],
      actuals: {},
      createdBy: user?.id || "client",
      createdByName: user?.name || "",
      createdAt: new Date().toISOString(),
    };
    const { proposal: _, ...rest } = base;
    const value: ProjectProgress =
      status === null
        ? rest
        : status === "draft" && pending
          ? { ...base, proposal: { ...base.proposal!, status: "draft" } }
          : status === "approved" && pending
            ? { ...base, proposal: { ...base.proposal!, status: "approved" } }
            : { ...base, proposal: { ...proposal!, status } };
    try {
      await onSave([progressChange(data, value)]);
      setMessage({ text: done });
      setRebaseline(false);
    } catch (error) {
      setMessage({ text: (error as Error).message, error: true });
    }
  }
  async function remove() {
    if (
      !record ||
      !window.confirm("İlerleme kaydı ve tüm girişleri silinsin mi?")
    )
      return;
    try {
      await onSave([progressChange(data, record, "delete")]);
      setSelection(null);
    } catch (error) {
      setMessage({ text: (error as Error).message, error: true });
    }
  }
  async function saveWeight() {
    if (!record) return;
    const value = weight.trim() === "" ? undefined : num(weight);
    if (value !== undefined && !(value >= 0 && value <= 1000))
      return setMessage({
        text: "Ağırlık 0 ile 1000 arasında olmalı.",
        error: true,
      });
    const { weight: _, ...rest } = record;
    try {
      await onSave([
        progressChange(
          data,
          value === undefined ? rest : { ...rest, weight: value },
        ),
      ]);
      setMessage({ text: "Ağırlık kaydedildi." });
    } catch (error) {
      setMessage({ text: (error as Error).message, error: true });
    }
  }

  const leaderOptions = admin ? data.leaders || [] : user?.leaders || [];
  const openingOptions = baseline
    ? [
        baseline.openingMonth,
        ...monthsAfter(baseline.openingMonth, previousMonth(currentMonth)),
      ]
    : [
        PROGRESS_OPENING_MONTH,
        ...monthsAfter(PROGRESS_OPENING_MONTH, previousMonth(currentMonth)),
      ];
  const editable =
    !!form && !pending && (!baseline || rebaseline || !!record?.proposal);

  return (
    <div className="progress-baseline">
      <aside className="progress-baseline-list" aria-label="İlerleme kayıtları">
        <ul>
          {records.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                aria-current={r === record ? "true" : undefined}
                onClick={() =>
                  setSelection({ projectId: r.projectId, leader: r.leader })
                }
              >
                <strong>{projects.get(r.projectId)!.name}</strong>
                <small>{r.leader}</small>
                <span
                  className="progress-status"
                  data-status={
                    r.proposal?.status ||
                    (r.baselines.length ? "approved" : "empty")
                  }
                >
                  {statusLabel(r)}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <div className="progress-baseline-new">
          <span>Yeni kayıt</span>
          <select
            aria-label="Yeni kayıt projesi"
            value={newProject}
            onChange={(e) => setNewProject(e.target.value)}
          >
            <option value="">Proje seçin…</option>
            {data.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Yeni kayıt liderliği"
            value={newLeader}
            onChange={(e) => setNewLeader(e.target.value)}
          >
            <option value="">Liderlik seçin…</option>
            {leaderOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="button"
            disabled={!newProject || !newLeader}
            onClick={() =>
              setSelection({ projectId: newProject, leader: newLeader })
            }
          >
            Aç
          </button>
        </div>
      </aside>
      <section className="progress-baseline-editor" aria-label="Temel plan">
        {!selection || !project ? (
          <p className="emptymsg">
            Soldan bir kayıt seçin ya da yeni kayıt açın.
          </p>
        ) : (
          <>
            <header>
              <h3>
                {project.name} · {selection.leader}
              </h3>
              <small>
                Proje bitişi {monthLabel(project.end)} ·{" "}
                {record ? statusLabel(record) : "Yeni kayıt"}
                {record?.proposal?.submittedByName &&
                  ` · gönderen ${record.proposal.submittedByName}`}
              </small>
            </header>
            {baseline && !rebaseline && !record?.proposal && (
              <div className="progress-baseline-current">
                <p>
                  Onaylı temel plan (sürüm {baseline.version}) ·{" "}
                  {baseline.approvedByName} ·{" "}
                  {new Date(baseline.approvedAt).toLocaleDateString("tr-TR")}
                  {baseline.reason && ` · ${baseline.reason}`}
                </p>
                <table className="progress-table compact">
                  <thead>
                    <tr>
                      <th>Ay</th>
                      <th className="num">Hedef %</th>
                      {record!.baselines.length > 1 && (
                        <th className="num">İlk plan %</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>{monthLabel(baseline.openingMonth)} (açılış)</td>
                      <td className="num">{pctLabel(baseline.openingPct)}</td>
                      {record!.baselines.length > 1 && (
                        <td className="num">
                          {pctLabel(
                            targetAt(
                              record!.baselines[0],
                              baseline.openingMonth,
                            ),
                          )}
                        </td>
                      )}
                    </tr>
                    {Object.keys(baseline.targets)
                      .sort()
                      .map((m) => (
                        <tr key={m}>
                          <td>{monthLabel(m)}</td>
                          <td className="num">
                            {pctLabel(baseline.targets[m])}
                          </td>
                          {record!.baselines.length > 1 && (
                            <td className="num">
                              {pctLabel(targetAt(record!.baselines[0], m))}
                            </td>
                          )}
                        </tr>
                      ))}
                  </tbody>
                </table>
                {canLead(user, selection.leader) && (
                  <button
                    type="button"
                    className="button"
                    onClick={startRebaseline}
                  >
                    Yeni Temel Plan Öner
                  </button>
                )}
              </div>
            )}
            {form && (
              <div className="progress-baseline-form">
                <div className="progress-baseline-fields">
                  <label>
                    Açılış ayı
                    <select
                      value={form.openingMonth}
                      disabled={!editable}
                      onChange={(e) =>
                        setForm({ ...form, openingMonth: e.target.value })
                      }
                    >
                      {openingOptions.map((m) => (
                        <option key={m} value={m}>
                          {monthLabel(m)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Açılış değeri %
                    <input
                      inputMode="decimal"
                      value={form.openingPct}
                      disabled={!editable}
                      onChange={(e) =>
                        setForm({ ...form, openingPct: e.target.value })
                      }
                    />
                  </label>
                  {(baseline || form.reason) && (
                    <label className="wide">
                      Gerekçe
                      <input
                        value={form.reason}
                        maxLength={500}
                        disabled={!editable}
                        placeholder="Kapsam veya teslim tarihi değişikliği"
                        onChange={(e) =>
                          setForm({ ...form, reason: e.target.value })
                        }
                      />
                    </label>
                  )}
                  <button
                    type="button"
                    className="button"
                    disabled={!editable}
                    onClick={() => {
                      const opening = num(form.openingPct);
                      if (!(opening >= 0 && opening <= 100)) return;
                      const targets = suggestTargets(
                        form.openingMonth,
                        opening,
                        project.end,
                        planned,
                      );
                      setForm({
                        ...form,
                        targets: Object.fromEntries(
                          Object.entries(targets).map(([m, v]) => [m, text(v)]),
                        ),
                      });
                    }}
                  >
                    Öneriyi Doldur
                  </button>
                </div>
                <p className="progress-muted">
                  Açılış değeri, takibin başladığı ay sonundaki tamamlanma
                  yüzdesidir. Öneri, kalan işi liderliğin planlanan kaynak
                  eğrisine göre dağıtır.
                </p>
                <table
                  className="progress-table compact"
                  aria-label="Aylık hedefler"
                >
                  <thead>
                    <tr>
                      <th>Ay</th>
                      <th className="num">Planlanan kaynak (kişi-ay)</th>
                      <th>Hedef % (kümülatif)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {months.map((m) => (
                      <tr key={m}>
                        <td>{monthLabel(m)}</td>
                        <td className="num">{pctLabel(planned?.[m])}</td>
                        <td>
                          <input
                            aria-label={`${monthLabel(m)} hedef %`}
                            inputMode="decimal"
                            value={form.targets[m] ?? ""}
                            disabled={!editable}
                            onChange={(e) =>
                              setForm({
                                ...form,
                                targets: {
                                  ...form.targets,
                                  [m]: e.target.value,
                                },
                              })
                            }
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {editable && problems.length > 0 && (
                  <p className="progress-error" role="status">
                    Onaya göndermeden önce: {problems[0]}
                  </p>
                )}
                <div className="progress-actions">
                  {editable && (
                    <>
                      <button
                        type="button"
                        className="button"
                        disabled={saving}
                        onClick={() => void send("draft", "Taslak kaydedildi.")}
                      >
                        Taslak Olarak Kaydet
                      </button>
                      <button
                        type="button"
                        className="button primary"
                        disabled={saving || problems.length > 0}
                        onClick={() =>
                          void send("pending", "Onaya gönderildi.")
                        }
                      >
                        Onaya Gönder
                      </button>
                      {admin && (
                        <button
                          type="button"
                          className="button primary"
                          disabled={saving || problems.length > 0}
                          onClick={() =>
                            void send("approved", "Temel plan onaylandı.")
                          }
                        >
                          Onayla
                        </button>
                      )}
                      {rebaseline && (
                        <button
                          type="button"
                          className="button"
                          onClick={() => {
                            setRebaseline(false);
                            setForm(null);
                          }}
                        >
                          Vazgeç
                        </button>
                      )}
                    </>
                  )}
                  {pending && (
                    <>
                      <button
                        type="button"
                        className="button"
                        disabled={saving}
                        onClick={() =>
                          void send(
                            "draft",
                            admin
                              ? "Öneri taslağa döndürüldü."
                              : "Öneri geri çekildi.",
                          )
                        }
                      >
                        {admin ? "Reddet" : "Geri Çek"}
                      </button>
                      {admin && (
                        <button
                          type="button"
                          className="button primary"
                          disabled={saving}
                          onClick={() =>
                            void send("approved", "Temel plan onaylandı.")
                          }
                        >
                          Onayla
                        </button>
                      )}
                    </>
                  )}
                  {record?.proposal && !pending && baseline && (
                    <button
                      type="button"
                      className="button"
                      disabled={saving}
                      onClick={() => void send(null, "Öneri silindi.")}
                    >
                      Öneriyi Sil
                    </button>
                  )}
                </div>
              </div>
            )}
            {admin && record && (
              <div className="progress-admin">
                <label>
                  Ağırlık
                  <input
                    inputMode="decimal"
                    value={weight}
                    placeholder="Planlanan kaynak payı"
                    onChange={(e) => setWeight(e.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className="button"
                  disabled={saving}
                  onClick={() => void saveWeight()}
                >
                  Ağırlığı Kaydet
                </button>
                <button
                  type="button"
                  className="button danger"
                  disabled={saving}
                  onClick={() => void remove()}
                >
                  Kaydı Sil
                </button>
              </div>
            )}
            {message && (
              <p
                role={message.error ? "alert" : "status"}
                className={message.error ? "progress-error" : "progress-ok"}
              >
                {message.text}
              </p>
            )}
          </>
        )}
      </section>
    </div>
  );
}
