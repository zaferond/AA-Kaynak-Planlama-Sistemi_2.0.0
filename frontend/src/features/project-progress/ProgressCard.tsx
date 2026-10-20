import { useEffect, useRef, useState } from "react";
import type { Principal } from "../../access";
import type { Project } from "../../model";
import ProjectResponsible from "../../ProjectResponsible";
import type { Change } from "../../../../shared/commands";
import {
  PROGRESS_NOTE_MAX,
  currentBaseline,
  resourcePlanStart,
  alignPlanStart,
  monthsAfter,
  nextMonth,
  previousMonth,
  clearAfterComplete,
  recalculateTargetsAfterEdit,
  proposalProblems,
  suggestTargets,
  targetAt,
  type ProgressProposal,
  type ProjectProgress,
  type ProgressTargets,
} from "../../../../shared/project-progress.ts";
import { monthLabel } from "../../format";
import MonthGrid, { fullMonth, type GridRow } from "./MonthGrid";
import {
  pctLabel,
  canLead,
  newProgressId,
  progressChange,
  type ProgressContext,
} from "./progress-view";

import {
  baselineStatus,
  entryStatus,
  entryIsEditable,
  PLAN_LABELS,
  PLAN_STATUS_TITLE,
  ENTRY_STATUS_TITLE,
  PLAN_HELP,
  entryPresentation,
} from "./progress-status";

type Form = {
  openingMonth: string;
  openingPct: string;
  targets: Record<string, string>;
  reason: string;
  adjustedSuggestion?: ProgressTargets;
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
  const resourceStart = resourcePlanStart(project, planned);
  const resourceOpening = resourceStart
    ? previousMonth(resourceStart)
    : undefined;
  const [rebaseline, setRebaseline] = useState(false);
  const [form, setForm] = useState<Form | null>(null);
  const [message, setMessage] = useState<{ text: string; error?: boolean }>();
  const revision = record ? data.revisions["progress:" + record.id] || 0 : 0;
  // Monthly actual of the chosen month.
  const locked = (data.progressLocks || []).some((lock) => lock.id === month);
  const entry = entryStatus(record, month, currentMonth);
  const entryState = entryPresentation(entry, locked);
  const saved = month ? record?.actuals[month] : undefined;
  const [pct, setPct] = useState("");
  const [note, setNote] = useState("");
  const [entryRevisionMonth, setEntryRevisionMonth] = useState<string | null>(
    null,
  );
  const actualInput = useRef<HTMLInputElement>(null);
  const [entryMessage, setEntryMessage] = useState<{
    text: string;
    error?: boolean;
  }>();
  useEffect(() => {
    setPct(saved ? decimal(saved.pct) : "");
    setNote(saved?.note || "");
    setEntryMessage(undefined);
    setEntryRevisionMonth(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, revision, locked]);

  // Fresh values whenever the saved record changes. Targets of a new plan
  // start empty: the leader fills them or applies the suggestion.
  useEffect(() => {
    setRebaseline(false);
    const savedProposal = record?.proposal;
    const p =
      savedProposal && resourceOpening
        ? alignPlanStart(savedProposal, resourceOpening)
        : savedProposal;
    if (p)
      return setForm({
        openingMonth: p.openingMonth,
        openingPct: text(p.openingPct),
        targets: asText(p.targets),
        reason: p.reason || "",
      });
    if (baseline) return setForm(null);
    if (!resourceOpening) return setForm(null);
    setForm({
      openingMonth: resourceOpening,
      openingPct: "",
      targets: {},
      reason: "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision, !!resourceStart]);

  useEffect(() => {
    if (!resourceOpening) return;
    setForm((current) => {
      if (!current || current.openingMonth === resourceOpening) return current;
      const numericTargets = Object.fromEntries(
        Object.entries(current.targets)
          .filter(([, value]) => value.trim() && Number.isFinite(num(value)))
          .map(([month, value]) => [month, num(value)]),
      );
      const aligned = alignPlanStart(
        {
          openingMonth: current.openingMonth,
          openingPct: num(current.openingPct),
          targets: numericTargets,
        },
        resourceOpening,
      );
      return {
        ...current,
        openingMonth: resourceOpening,
        openingPct: current.openingPct.trim() ? text(aligned.openingPct) : "",
        targets: Object.fromEntries(
          Object.entries(current.targets).filter(
            ([month]) => month > resourceOpening,
          ),
        ),
        adjustedSuggestion: undefined,
      };
    });
  }, [resourceOpening]);

  function startRebaseline() {
    if (!record || !baseline || !resourceOpening) return;
    const aligned = alignPlanStart(baseline, resourceOpening);
    setForm({
      openingMonth: resourceOpening,
      openingPct: text(aligned.openingPct),
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
      ? (form.adjustedSuggestion ??
        suggestTargets(form.openingMonth, opening!, project.end, planned))
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
          ...(!openingValid ? ["Başlangıç değerini (0–100) girin."] : []),
          ...(months.some(
            (m) =>
              form.targets[m]?.trim() && !Number.isFinite(num(form.targets[m])),
          )
            ? ["Hedeflere yalnız sayı girin."]
            : []),
          ...proposalProblems(proposal, project.end),
          ...(baseline && !proposal.reason
            ? ["Hedef planı revizyonu için gerekçe yazın."]
            : []),
        ]
      : [];
  const pending = status === "pending";
  const editable =
    !!form &&
    !!resourceStart &&
    !pending &&
    canLead(user, leader) &&
    (!baseline || rebaseline || !!record?.proposal);
  const label = `${project.name} · ${leader}`;

  const actualFte = ctx.actual(project.id).get(leader);
  const canEnter =
    !!baseline && canLead(user, leader) && entryIsEditable(entry, locked);
  const revisingEntry = entryRevisionMonth === month;
  const canEditEntry = canEnter && (!saved || revisingEntry);
  useEffect(() => {
    if (revisingEntry) actualInput.current?.focus();
  }, [revisingEntry]);
  function startEntryRevision() {
    if (!saved || !canEnter || saving) return;
    setPct(decimal(saved.pct));
    setNote(saved.note);
    setEntryMessage(undefined);
    setEntryRevisionMonth(month);
  }
  function cancelEntryRevision() {
    setPct(saved ? decimal(saved.pct) : "");
    setNote(saved?.note || "");
    setEntryRevisionMonth(null);
    setEntryMessage(undefined);
  }
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
    if (!record || !canEditEntry || saving || !entryChanged) return;
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
      setEntryRevisionMonth(null);
      setEntryMessage({
        text: saved
          ? "Gerçekleşen oran ve açıklama güncellendi."
          : "Kaydedildi.",
      });
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
  const targets = form ? form.targets : {};
  function editTarget(month: string, input: string) {
    setForm((current) => {
      if (!current) return current;
      const numericTargets = Object.fromEntries(
        Object.entries(current.targets)
          .filter(
            ([m, value]) =>
              m > current.openingMonth &&
              value.trim() &&
              Number.isFinite(num(value)),
          )
          .map(([m, value]) => [m, num(value)]),
      );
      const recalculated = recalculateTargetsAfterEdit(
        numericTargets,
        month,
        num(input),
        project.end,
        planned,
      );
      const next = { ...current.targets, [month]: input };
      const updated = recalculated
        ? {
            ...Object.fromEntries(
              Object.entries(next).filter(([m]) => m <= month),
            ),
            ...asText(
              Object.fromEntries(
                Object.entries(recalculated).filter(([m]) => m > month),
              ),
            ),
          }
        : next;
      // Keep months after completion empty, including an earlier new finish.
      const firstComplete = Object.keys(updated)
        .sort()
        .find((m) => m > current.openingMonth && num(updated[m]) === 100);
      return {
        ...current,
        targets: clearAfterComplete(updated, firstComplete || month),
        ...(recalculated ? { adjustedSuggestion: recalculated } : {}),
      };
    });
  }
  // Months up to a new plan's opening carry no new target.
  const proposalCell = (m: string, input: () => React.ReactNode) =>
    !form || m <= form.openingMonth ? "—" : input();
  const past = (m: string) => m <= currentMonth;
  const planRows: GridRow[] = form
    ? [
        ...(editable
          ? [
              {
                label: baseline ? "Önerilen yeni hedef %" : "Önerilen hedef %",
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
          cell: (m: string) =>
            proposalCell(m, () =>
              editable ? (
                <input
                  aria-label={`${label} · ${fullMonth(m)} hedef %`}
                  inputMode="decimal"
                  value={targets[m] ?? ""}
                  title={
                    targets[m]?.trim()
                      ? undefined
                      : "Boş ay önceki hedefin devamı sayılır"
                  }
                  onChange={(e) => editTarget(m, e.target.value)}
                />
              ) : targets[m]?.trim() ? (
                <strong>{targets[m]}</strong>
              ) : (
                "—"
              ),
            ),
        },
      ]
    : [];
  const gridRows: GridRow[] = baseline
    ? [
        {
          label: "Gerçekleşen kaynak (kişi-ay)",
          cell: (m) =>
            past(m) && actualFte?.[m] ? pctLabel(actualFte[m]) : "—",
        },
        {
          label: form ? "Onaylı hedef %" : "Hedef % (kümülatif)",
          cell: (m) =>
            m > baseline.openingMonth ? pctLabel(targetAt(baseline, m)) : "—",
        },
        ...planRows,
        {
          label: "Gerçekleşen %",
          editable: canEditEntry,
          cell: (m) =>
            m === month && canEditEntry ? (
              <input
                ref={actualInput}
                aria-label={`${label} · ${fullMonth(m)} gerçekleşen %`}
                inputMode="decimal"
                value={pct}
                disabled={saving}
                onChange={(e) => {
                  setPct(e.target.value);
                  setEntryMessage(undefined);
                }}
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
      ]
    : planRows;

  return (
    <section className="progress-card" data-status={status} aria-label={label}>
      <header className="progress-card-head">
        <div className="progress-card-title">
          <strong>{project.name}</strong>
          <span>{leader}</span>
          <ProjectResponsible project={project} />
        </div>
        <div className="progress-card-statuses" aria-label="İlerleme durumları">
          <ProgressStatusCard
            label={PLAN_STATUS_TITLE}
            value={PLAN_LABELS[baseline ? "approved" : status]}
            status={baseline ? "approved" : status}
            help={PLAN_HELP[baseline ? "approved" : status]}
          />
          {baseline && record?.proposal && (
            <ProgressStatusCard
              label="Revizyon Giriş Durumu"
              value={PLAN_LABELS[status]}
              status={status}
              help={PLAN_HELP[status]}
            />
          )}
          {entryState && (
            <ProgressStatusCard
              label={
                ENTRY_STATUS_TITLE + (month ? ` (${monthLabel(month)})` : "")
              }
              value={entryState.label}
              status={entryState.status}
              help={entryState.help}
            />
          )}
        </div>
        {resourceStart && (
          <span className="progress-card-hint">
            Başlangıç: {monthLabel(resourceStart)} · ilk kaynak planlanan ay
          </span>
        )}
        {baseline && !form && (
          <span className="progress-card-hint">
            Başlangıç %: {pctLabel(baseline.openingPct)}
          </span>
        )}
        {form && resourceStart && (
          <div className="progress-card-fields">
            <label>
              Başlangıç %
              <input
                aria-label={label + " · başlangıç %"}
                title="Başlangıç ayı başında tamamlanmış olan yüzde"
                inputMode="decimal"
                placeholder="%"
                value={form.openingPct}
                disabled={!editable}
                onChange={(e) =>
                  setForm({
                    ...form,
                    openingPct: e.target.value,
                    adjustedSuggestion: undefined,
                  })
                }
              />
            </label>
            {(baseline || form.reason) && (
              <label className="wide">
                Gerekçe
                <input
                  aria-label={label + " · revizyon gerekçesi"}
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
      {!resourceStart && (
        <p className="progress-card-hint">
          Kaynak planlaması bekleniyor. Başlangıç, bu liderliğin projeye ilk
          kaynak ayırdığı aydan otomatik belirlenecek.
        </p>
      )}
      <MonthGrid
        project={project}
        label={label}
        currentMonth={currentMonth}
        selectedMonth={baseline && month ? month : undefined}
        planned={planned}
        rows={gridRows}
      />
      {baseline && (entry === "closed" || canEditEntry || entryMessage) && (
        <footer className="progress-card-actions progress-card-entry">
          {entry === "closed" ? (
            <span className="progress-card-hint">
              Gerçekleşen girişi henüz açık değil. Plan başlangıcı:{" "}
              {monthLabel(nextMonth(record!.baselines[0].openingMonth))}.
            </span>
          ) : (
            <>
              {canEditEntry && (
                <label className="progress-card-noteinput">
                  Açıklama ({monthLabel(month)})
                  <input
                    aria-label={`${label} · açıklama`}
                    maxLength={PROGRESS_NOTE_MAX}
                    value={note}
                    disabled={saving}
                    placeholder="Bu ayın kısa açıklaması"
                    onChange={(e) => {
                      setNote(e.target.value);
                      setEntryMessage(undefined);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void submitEntry();
                    }}
                  />
                </label>
              )}
              {canEditEntry && (
                <button
                  type="button"
                  className="button primary"
                  disabled={saving || !entryChanged}
                  onClick={() => void submitEntry()}
                >
                  Gerçekleşeni Kaydet
                </button>
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
              title={suggested ? undefined : "Önce başlangıç yüzdesini girin"}
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
              onClick={() =>
                void send("draft", "Hedef planı taslağı kaydedildi.")
              }
            >
              Taslağı Kaydet
            </button>
            <button
              type="button"
              className="button primary"
              disabled={saving || problems.length > 0}
              onClick={() =>
                void send(
                  "pending",
                  "Hedef planı proje ekibi onayına gönderildi.",
                )
              }
            >
              Hedef Planını Onaya Gönder
            </button>
            {admin && (
              <button
                type="button"
                className="button primary"
                disabled={saving || problems.length > 0}
                onClick={() => void send("approved", "Hedef planı onaylandı.")}
              >
                Hedef Planı Onayla
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
                    admin
                      ? "Hedef planı düzeltme için geri gönderildi."
                      : "Onay talebi geri çekildi; hedef planı taslağa döndü.",
                  )
                }
              >
                {admin ? "Düzeltme İçin Geri Gönder" : "Onay Talebini Geri Çek"}
              </button>
            )}
            {admin && (
              <button
                type="button"
                className="button primary"
                disabled={saving || !resourceStart}
                onClick={() => void send("approved", "Hedef planı onaylandı.")}
              >
                Hedef Planı Onayla
              </button>
            )}
          </>
        )}
        {baseline && !form && canLead(user, leader) && (
          <button
            type="button"
            className="button"
            disabled={!resourceStart}
            onClick={startRebaseline}
          >
            Hedef Planını Revize Et
          </button>
        )}
        {canEnter &&
          saved &&
          (revisingEntry ? (
            <button
              type="button"
              className="button"
              disabled={saving}
              onClick={cancelEntryRevision}
            >
              Gerçekleşen Revizyonunu İptal Et
            </button>
          ) : (
            <button
              type="button"
              className="button"
              disabled={saving}
              onClick={startEntryRevision}
              title={`${monthLabel(month)} gerçekleşen oranını ve açıklamasını revize et`}
            >
              Gerçekleşen Oran Revize Et
            </button>
          ))}
        {record?.proposal && !pending && baseline && (
          <button
            type="button"
            className="button"
            disabled={saving}
            onClick={() => void send(null, "Revizyon taslağı silindi.")}
          >
            Revizyon Taslağını Sil
          </button>
        )}
        {admin && record && (
          <button
            type="button"
            className="button danger progress-card-delete"
            disabled={saving}
            onClick={() => void remove()}
          >
            Kaydı Sil
          </button>
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

function ProgressStatusCard({
  label,
  value,
  status,
  help,
}: {
  label: string;
  value: string;
  status: string;
  help?: string;
}) {
  return (
    <div className="progress-status-card" title={help}>
      <strong className="progress-status-card-label">{label}:</strong>{" "}
      <span className="progress-status" data-status={status}>
        {value}
      </span>
    </div>
  );
}
