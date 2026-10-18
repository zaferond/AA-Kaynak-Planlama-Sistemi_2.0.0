import { useEffect, useState } from "react";
import type { Principal } from "../../access";
import type { Project } from "../../model";
import type { Change } from "../../../../shared/commands";
import {
  PROGRESS_NOTE_MAX,
  PROGRESS_OPENING_MONTH,
  currentBaseline,
  leaderProgress,
  monthsAfter,
  previousMonth,
  clearAfterComplete,
  proposalProblems,
  suggestTargets,
  targetAt,
  type ProgressProposal,
  type ProjectProgress,
} from "../../../../shared/project-progress.ts";
import { monthLabel } from "../../format";
import MonthGrid, { fullMonth, type GridRow } from "./MonthGrid";
import {
  LEVEL_LABELS,
  leaderRow,
  pctLabel,
  canLead,
  newProgressId,
  progressChange,
  type ProgressContext,
} from "./progress-view";

type Form = {
  openingMonth: string;
  openingPct: string;
  targets: Record<string, string>;
  reason: string;
};
export type BaselineStatus = "pending" | "draft" | "approved" | "new";
export const baselineStatus = (record?: ProjectProgress): BaselineStatus =>
  record?.proposal?.status === "pending"
    ? "pending"
    : record?.proposal
      ? "draft"
      : record?.baselines.length
        ? "approved"
        : "new";
export type EntryStatus = "entered" | "waiting" | "locked" | "closed";
/** The chosen month's actual: entered, still to enter, locked, or not open yet. */
export function entryStatus(
  record: ProjectProgress | undefined,
  month: string,
  locked: boolean,
): EntryStatus | null {
  if (!record?.baselines.length) return null;
  if (!month || month <= record.baselines[0].openingMonth) return "closed";
  if (record.actuals[month]) return "entered";
  return locked ? "locked" : "waiting";
}
const STATUS_LABELS: Record<BaselineStatus | EntryStatus, string> = {
  pending: "Plan onay bekliyor",
  draft: "Plan taslağı",
  approved: "Onaylı",
  new: "Takibe alınmadı",
  entered: "Girildi",
  waiting: "Giriş bekliyor",
  locked: "Ay kilitli",
  closed: "Onaylı",
};
const decimal = (value: number) => String(value).replace(".", ",");
const num = (value: string) =>
  value.trim() === "" ? Number.NaN : Number(value.replace(",", "."));
const text = (value: number) => String(value).replace(".", ",");
const asText = (targets: Record<string, number>) =>
  Object.fromEntries(Object.entries(targets).map(([m, v]) => [m, text(v)]));

/**
 * One project × leadership. Until its baseline is approved the card takes the
 * target curve; afterwards the targets stay fixed and the chosen month's
 * actual % (with a note) is entered on the same grid. A new baseline can be
 * proposed alongside without stopping the monthly entry.
 */
export default function ProgressCard({
  ctx,
  user,
  project,
  leader,
  record,
  month,
  currentMonth,
  saving,
  onSave,
}: {
  ctx: ProgressContext;
  user: Principal | null;
  project: Project;
  leader: string;
  record: ProjectProgress | undefined;
  /** The month whose actual is entered ("" before tracking starts). */
  month: string;
  currentMonth: string;
  saving: boolean;
  onSave: (changes: Change[]) => Promise<void>;
}) {
  const { data } = ctx;
  const admin = user?.role === "admin";
  const baseline = record && currentBaseline(record);
  const status = baselineStatus(record);
  const planned = ctx.planned(project.id).get(leader);
  const [rebaseline, setRebaseline] = useState(false);
  const [form, setForm] = useState<Form | null>(null);
  const [message, setMessage] = useState<{ text: string; error?: boolean }>();
  const [weight, setWeight] = useState("");
  const revision = record ? data.revisions["progress:" + record.id] || 0 : 0;
  // Monthly actual of the chosen month.
  const locked = (data.progressLocks || []).some((lock) => lock.id === month);
  const entry = entryStatus(record, month, locked);
  const saved = month ? record?.actuals[month] : undefined;
  const [pct, setPct] = useState("");
  const [note, setNote] = useState("");
  const [entryMessage, setEntryMessage] = useState<{
    text: string;
    error?: boolean;
  }>();
  useEffect(() => {
    setPct(saved ? decimal(saved.pct) : "");
    setNote(saved?.note || "");
    setEntryMessage(undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, revision]);

  // Fresh values whenever the saved record changes. Targets of a new plan
  // start empty: the leader fills them or applies the suggestion.
  useEffect(() => {
    setRebaseline(false);
    setWeight(record?.weight === undefined ? "" : text(record.weight));
    const p = record?.proposal;
    if (p)
      return setForm({
        openingMonth: p.openingMonth,
        openingPct: text(p.openingPct),
        targets: asText(p.targets),
        reason: p.reason || "",
      });
    if (baseline) return setForm(null);
    setForm({
      openingMonth: PROGRESS_OPENING_MONTH,
      openingPct: "",
      targets: {},
      reason: "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision]);

  function startRebaseline() {
    if (!record || !baseline) return;
    const opening =
      previousMonth(currentMonth) > baseline.openingMonth
        ? previousMonth(currentMonth)
        : baseline.openingMonth;
    const openingPct =
      record.actuals[opening]?.pct ?? targetAt(baseline, opening) ?? 0;
    setForm({
      openingMonth: opening,
      openingPct: text(openingPct),
      targets: {},
      reason: "",
    });
    setRebaseline(true);
    setMessage(undefined);
  }

  const opening = form ? num(form.openingPct) : (baseline?.openingPct ?? null);
  const openingValid =
    Number.isFinite(opening) && opening! >= 0 && opening! <= 100;
  const suggested =
    form && openingValid
      ? suggestTargets(form.openingMonth, opening!, project.end, planned)
      : undefined;
  const months = form ? monthsAfter(form.openingMonth, project.end) : [];
  const proposal = form && {
    openingMonth: form.openingMonth,
    openingPct: opening!,
    targets: Object.fromEntries(
      months
        .filter((m) => form.targets[m]?.trim())
        .map((m) => [m, num(form.targets[m])]),
    ),
    ...(form.reason.trim() ? { reason: form.reason.trim() } : {}),
  };
  const problems =
    proposal && form
      ? [
          ...(!openingValid ? ["Açılış değerini (0–100) girin."] : []),
          ...(months.some(
            (m) =>
              form.targets[m]?.trim() && !Number.isFinite(num(form.targets[m])),
          )
            ? ["Hedeflere yalnız sayı girin."]
            : []),
          ...proposalProblems(proposal, project.end),
          ...(baseline && !proposal.reason
            ? ["Yeni temel plan için gerekçe yazın."]
            : []),
        ]
      : [];
  const pending = status === "pending";
  const editable =
    !!form &&
    !pending &&
    canLead(user, leader) &&
    (!baseline || rebaseline || !!record?.proposal);
  const label = `${project.name} · ${leader}`;

  const actualFte = ctx.actual(project.id).get(leader);
  const canEnter =
    !!baseline &&
    canLead(user, leader) &&
    (entry === "waiting" || entry === "entered") &&
    month <= currentMonth;
  const entryChanged =
    pct !== (saved ? decimal(saved.pct) : "") || note !== (saved?.note || "");
  const value = num(pct);
  const entryProblem = !(value >= 0 && value <= 100)
    ? "0 ile 100 arasında bir yüzde girin."
    : Math.abs(Math.round(value * 10) - value * 10) > 1e-6
      ? "En fazla bir ondalık basamak girin."
      : !note.trim()
        ? "Kısa bir açıklama yazın."
        : "";
  async function submitEntry() {
    if (!record) return;
    if (entryProblem)
      return setEntryMessage({ text: entryProblem, error: true });
    setEntryMessage(undefined);
    try {
      await onSave([
        progressChange(data, {
          ...record,
          actuals: {
            ...record.actuals,
            [month]: { pct: value, note: note.trim() },
          },
        }),
      ]);
      setEntryMessage({ text: "Kaydedildi." });
    } catch (error) {
      setEntryMessage({ text: (error as Error).message, error: true });
    }
  }

  async function send(next: ProgressProposal["status"] | null, done: string) {
    setMessage(undefined);
    const base: ProjectProgress = record || {
      id: newProgressId(),
      projectId: project.id,
      leader,
      baselines: [],
      actuals: {},
      createdBy: user?.id || "client",
      createdByName: user?.name || "",
      createdAt: new Date().toISOString(),
    };
    const { proposal: _, ...rest } = base;
    const value: ProjectProgress =
      next === null
        ? rest
        : pending
          ? { ...base, proposal: { ...base.proposal!, status: next } }
          : { ...base, proposal: { ...proposal!, status: next } };
    try {
      await onSave([progressChange(data, value)]);
      setMessage({ text: done });
    } catch (error) {
      setMessage({ text: (error as Error).message, error: true });
    }
  }
  async function remove() {
    if (
      !record ||
      !window.confirm(label + " ilerleme kaydı ve tüm girişleri silinsin mi?")
    )
      return;
    try {
      await onSave([progressChange(data, record, "delete")]);
    } catch (error) {
      setMessage({ text: (error as Error).message, error: true });
    }
  }
  async function saveWeight() {
    if (!record) return;
    const value = num(weight);
    if (weight.trim() && !(value >= 0 && value <= 1000))
      return setMessage({
        text: "Ağırlık 0 ile 1000 arasında olmalı.",
        error: true,
      });
    const { weight: _, ...rest } = record;
    try {
      await onSave([
        progressChange(data, weight.trim() ? { ...rest, weight: value } : rest),
      ]);
      setMessage({ text: "Ağırlık kaydedildi." });
    } catch (error) {
      setMessage({ text: (error as Error).message, error: true });
    }
  }

  const openingOptions = [
    baseline?.openingMonth || PROGRESS_OPENING_MONTH,
    ...monthsAfter(
      baseline?.openingMonth || PROGRESS_OPENING_MONTH,
      previousMonth(currentMonth),
    ),
  ];
  // With an approved plan the grid starts at its opening, so a new plan's
  // later opening still shows the history before it.
  const gridOpening =
    baseline?.openingMonth || form?.openingMonth || PROGRESS_OPENING_MONTH;

  const openingCell = pctLabel(openingValid ? opening : null);
  const targets = form ? form.targets : {};
  // Months up to a new plan's opening carry no new target.
  const proposalCell = (m: string, input: () => React.ReactNode) =>
    !form || m < form.openingMonth ? (
      ""
    ) : m === form.openingMonth ? (
      <strong>{openingCell}</strong>
    ) : (
      input()
    );
  // The target an empty month takes: the last entered one (or the opening).
  const implied = (m: string) => {
    if (!form) return "";
    let value = openingValid ? text(opening!) : "";
    for (const month of months) {
      if (month >= m) break;
      if (targets[month]?.trim()) value = targets[month];
    }
    return value;
  };
  const past = (m: string) => m <= currentMonth;
  const row =
    record && baseline && month ? leaderRow(ctx, record, project, month) : null;
  const planRows: GridRow[] = form
    ? [
        ...(editable
          ? [
              {
                label: baseline ? "Önerilen yeni hedef %" : "Önerilen hedef %",
                opening: baseline ? "" : openingCell,
                cell: (m: string) =>
                  proposalCell(m, () =>
                    suggested ? pctLabel(suggested[m]) : "—",
                  ),
              },
            ]
          : []),
        {
          label: baseline ? "Yeni hedef %" : "Hedef % (kümülatif)",
          editable,
          opening: baseline ? "" : <strong>{openingCell}</strong>,
          cell: (m: string) =>
            proposalCell(m, () =>
              editable ? (
                <input
                  aria-label={`${label} · ${fullMonth(m)} hedef %`}
                  inputMode="decimal"
                  value={targets[m] ?? ""}
                  placeholder={implied(m)}
                  title={
                    targets[m]?.trim()
                      ? undefined
                      : "Boş ay önceki hedefin devamı sayılır"
                  }
                  onChange={(e) =>
                    setForm({
                      ...form,
                      targets: clearAfterComplete(
                        { ...form.targets, [m]: e.target.value },
                        m,
                      ),
                    })
                  }
                />
              ) : targets[m]?.trim() ? (
                <strong>{targets[m]}</strong>
              ) : (
                <span className="progress-implied">{implied(m)}</span>
              ),
            ),
        },
      ]
    : [];
  const gridRows: GridRow[] = baseline
    ? [
        {
          label: "Gerçekleşen kaynak (kişi-ay)",
          opening: actualFte?.[baseline.openingMonth]
            ? pctLabel(actualFte[baseline.openingMonth])
            : "—",
          cell: (m) =>
            past(m) && actualFte?.[m] ? pctLabel(actualFte[m]) : "—",
        },
        {
          label: form ? "Onaylı hedef %" : "Hedef % (kümülatif)",
          opening: pctLabel(baseline.openingPct),
          cell: (m) => pctLabel(targetAt(baseline, m)),
        },
        ...planRows,
        {
          label: "Gerçekleşen %",
          editable: canEnter,
          opening: <strong>{pctLabel(baseline.openingPct)}</strong>,
          cell: (m) =>
            m === month && canEnter ? (
              <input
                aria-label={`${label} · ${fullMonth(m)} gerçekleşen %`}
                inputMode="decimal"
                value={pct}
                disabled={saving}
                onChange={(e) => setPct(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void submitEntry();
                }}
              />
            ) : record!.actuals[m] ? (
              <strong title={record!.actuals[m].note}>
                {pctLabel(record!.actuals[m].pct)}
              </strong>
            ) : (
              "—"
            ),
        },
        {
          label: "Harcanan kaynak %",
          opening: pctLabel(baseline.openingPct),
          cell: (m) =>
            past(m)
              ? pctLabel(
                  leaderProgress(record!, m, planned, actualFte, project.end)
                    .spent,
                )
              : "—",
        },
      ]
    : planRows;

  return (
    <section className="progress-card" data-status={status} aria-label={label}>
      <header className="progress-card-head">
        <div className="progress-card-title">
          <strong>{project.name}</strong>
          <span>{leader}</span>
          {entry && entry !== "closed" && (
            <em className="progress-status" data-status={entry}>
              {STATUS_LABELS[entry]}
            </em>
          )}
          {(status !== "approved" || entry === "closed") && (
            <em className="progress-status" data-status={status}>
              {STATUS_LABELS[status]}
            </em>
          )}
        </div>
        {form && (
          <div className="progress-card-fields">
            <label>
              Açılış
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
              Açılış %
              <input
                aria-label={label + " · açılış %"}
                inputMode="decimal"
                placeholder="%"
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
                  onChange={(e) => setForm({ ...form, reason: e.target.value })}
                />
              </label>
            )}
          </div>
        )}
        <small className="progress-card-meta">
          {monthLabel(project.start)} – {monthLabel(project.end)}
          {record?.proposal?.submittedByName &&
            ` · gönderen ${record.proposal.submittedByName}`}
          {baseline &&
            ` · onay ${baseline.approvedByName}, ${new Date(baseline.approvedAt).toLocaleDateString("tr-TR")}`}
        </small>
      </header>
      <MonthGrid
        project={project}
        label={label}
        openingMonth={gridOpening}
        currentMonth={currentMonth}
        selectedMonth={baseline && month ? month : undefined}
        planned={planned}
        rows={gridRows}
      />
      {baseline && (
        <footer className="progress-card-actions progress-card-entry">
          {entry === "closed" ? (
            <span className="progress-card-hint">
              Aylık giriş takibin başladığı aydan sonra açılır.
            </span>
          ) : (
            <>
              <label className="progress-card-noteinput">
                Açıklama ({monthLabel(month)})
                <input
                  aria-label={`${label} · açıklama`}
                  maxLength={PROGRESS_NOTE_MAX}
                  value={note}
                  disabled={!canEnter || saving}
                  placeholder={canEnter ? "Bu ayın kısa açıklaması" : ""}
                  onChange={(e) => setNote(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void submitEntry();
                  }}
                />
              </label>
              {canEnter && (
                <button
                  type="button"
                  className="button primary"
                  disabled={saving || !entryChanged}
                  onClick={() => void submitEntry()}
                >
                  Gerçekleşeni Kaydet
                </button>
              )}
              {row && (
                <span className="progress-level" data-level={row.level}>
                  {LEVEL_LABELS[row.level]}
                </span>
              )}
              {row && row.signals.length > 0 && (
                <span className="progress-card-hint">
                  {row.signals.map((s) => s.reason).join(" · ")}
                </span>
              )}
              {entryMessage && (
                <span
                  role={entryMessage.error ? "alert" : "status"}
                  className={
                    entryMessage.error ? "progress-error" : "progress-ok"
                  }
                >
                  {entryMessage.text}
                </span>
              )}
            </>
          )}
        </footer>
      )}
      <footer className="progress-card-actions">
        {editable && (
          <>
            <button
              type="button"
              className="button"
              disabled={!suggested}
              title={suggested ? undefined : "Önce açılış değerini girin"}
              onClick={() =>
                form &&
                suggested &&
                setForm({
                  ...form,
                  // Months after the curve reaches 100 % stay empty.
                  targets: Object.entries(asText(suggested)).reduce(
                    (out, [m, v]) =>
                      Object.values(out).includes("100")
                        ? out
                        : { ...out, [m]: v },
                    {} as Record<string, string>,
                  ),
                })
              }
            >
              Önerileni Uygula
            </button>
            <button
              type="button"
              className="button"
              disabled={saving || !openingValid}
              onClick={() => void send("draft", "Taslak kaydedildi.")}
            >
              Taslak Kaydet
            </button>
            <button
              type="button"
              className="button primary"
              disabled={saving || problems.length > 0}
              onClick={() => void send("pending", "Onaya gönderildi.")}
            >
              Onaya Gönder
            </button>
            {admin && (
              <button
                type="button"
                className="button primary"
                disabled={saving || problems.length > 0}
                onClick={() => void send("approved", "Temel plan onaylandı.")}
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
            {canLead(user, leader) && (
              <button
                type="button"
                className="button"
                disabled={saving}
                onClick={() =>
                  void send(
                    "draft",
                    admin ? "Öneri taslağa döndürüldü." : "Öneri geri çekildi.",
                  )
                }
              >
                {admin ? "Reddet" : "Geri Çek"}
              </button>
            )}
            {admin && (
              <button
                type="button"
                className="button primary"
                disabled={saving}
                onClick={() => void send("approved", "Temel plan onaylandı.")}
              >
                Onayla
              </button>
            )}
          </>
        )}
        {baseline && !form && canLead(user, leader) && (
          <button type="button" className="button" onClick={startRebaseline}>
            Yeni Temel Plan Öner
          </button>
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
        {admin && record && (
          <span className="progress-card-admin">
            <label>
              Ağırlık
              <input
                aria-label={label + " · ağırlık"}
                inputMode="decimal"
                value={weight}
                placeholder="Plan payı"
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
          </span>
        )}
        {editable && problems.length > 0 && !message && (
          <span className="progress-card-hint">{problems[0]}</span>
        )}
        {message && (
          <span
            role={message.error ? "alert" : "status"}
            className={message.error ? "progress-error" : "progress-ok"}
          >
            {message.text}
          </span>
        )}
      </footer>
    </section>
  );
}
