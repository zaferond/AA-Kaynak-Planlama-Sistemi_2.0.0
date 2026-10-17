import { useEffect, useState } from "react";
import type { Principal } from "../../access";
import type { Project } from "../../model";
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
import BaselineGrid from "./BaselineGrid";
import {
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
const STATUS_LABELS: Record<BaselineStatus, string> = {
  pending: "Onay bekliyor",
  draft: "Taslak",
  approved: "Onaylı",
  new: "Takibe alınmadı",
};
const num = (value: string) =>
  value.trim() === "" ? Number.NaN : Number(value.replace(",", "."));
const text = (value: number) => String(value).replace(".", ",");
const asText = (targets: Record<string, number>) =>
  Object.fromEntries(Object.entries(targets).map(([m, v]) => [m, text(v)]));

/** One project × leadership: its month grid and actions. */
export default function BaselineCard({
  ctx,
  user,
  project,
  leader,
  record,
  currentMonth,
  saving,
  onSave,
}: {
  ctx: ProgressContext;
  user: Principal | null;
  project: Project;
  leader: string;
  record: ProjectProgress | undefined;
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
  const gridOpening =
    form?.openingMonth || baseline?.openingMonth || PROGRESS_OPENING_MONTH;

  return (
    <section className="progress-card" data-status={status} aria-label={label}>
      <header className="progress-card-head">
        <div className="progress-card-title">
          <strong>{project.name}</strong>
          <span>{leader}</span>
          <em className="progress-status" data-status={status}>
            {STATUS_LABELS[status]}
            {baseline &&
              status === "approved" &&
              ` · sürüm ${baseline.version}`}
          </em>
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
      <BaselineGrid
        project={project}
        label={label}
        openingMonth={gridOpening}
        openingPct={openingValid ? opening : null}
        currentMonth={currentMonth}
        planned={planned}
        suggested={suggested}
        approved={baseline && form ? baseline : undefined}
        targets={form ? form.targets : asText(baseline?.targets || {})}
        editable={editable}
        onTarget={(month, value) =>
          form &&
          setForm({ ...form, targets: { ...form.targets, [month]: value } })
        }
      />
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
                setForm({ ...form, targets: asText(suggested) })
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
