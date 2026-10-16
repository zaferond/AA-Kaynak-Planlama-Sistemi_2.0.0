import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { Data } from "../../model";
import { fullDateLabel, monthLabel } from "../../format";
import {
  SCENARIO_STATUS_LABELS,
  type SavedScenario,
  type ScenarioStatus,
} from "../../../../shared/schedule-shift.ts";

export type SavedScenarioAction =
  "compare" | "approve" | "withdraw" | "apply" | "revert" | "delete";

type Props = {
  data: Data;
  scenarios: SavedScenario[];
  /** Scenarios already open as cards in the comparison. */
  openIds: string[];
  isAdmin: boolean;
  userId: string;
  busy: boolean;
  onAction: (action: SavedScenarioAction, scenario: SavedScenario) => void;
  onDeleteClosed: () => void;
};

const day = (iso?: string) => (iso ? fullDateLabel(iso.slice(0, 10)) : "");
/** Decision order: what needs attention first, history last. */
const ORDER: ScenarioStatus[] = [
  "draft",
  "approved",
  "applied",
  "reverted",
  "closed",
];
const HISTORY: ScenarioStatus[] = ["reverted", "closed"];

/** Saved delay scenarios, right under the cards: status summary, the
 * decision trail and the admin actions. History is hidden until asked for. */
export default function SavedScenarioList({
  data,
  scenarios,
  openIds,
  isAdmin,
  userId,
  busy,
  onAction,
  onDeleteClosed,
}: Props) {
  const [open, setOpen] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  if (!scenarios.length) return null;
  const projectName = (id: string) =>
    data.projects.find((p) => p.id === id)?.name || "Silinmiş proje";
  const counts = ORDER.map((status) => ({
    status,
    n: scenarios.filter((s) => s.status === status).length,
  })).filter((c) => c.n);
  const history = scenarios.filter((s) => HISTORY.includes(s.status));
  const rows = [...scenarios]
    .filter((s) => showHistory || !HISTORY.includes(s.status))
    .sort(
      (a, b) =>
        ORDER.indexOf(a.status) - ORDER.indexOf(b.status) ||
        b.createdAt.localeCompare(a.createdAt),
    );
  const button = (
    label: string,
    action: SavedScenarioAction,
    scenario: SavedScenario,
    tone = "",
  ) => (
    <button
      type="button"
      className={"button " + tone}
      disabled={busy}
      onClick={() => onAction(action, scenario)}
    >
      {label}
    </button>
  );
  return (
    <section className="saved-scenarios" aria-label="Kayıtlı senaryolar">
      <div className="saved-scenarios-head">
        <button
          type="button"
          className="saved-scenarios-toggle"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? (
            <ChevronDown size={16} aria-hidden="true" />
          ) : (
            <ChevronRight size={16} aria-hidden="true" />
          )}
          <h3>Kayıtlı Senaryolar ({scenarios.length})</h3>
        </button>
        <span className="saved-scenarios-summary">
          {counts.map(({ status, n }) => (
            <span key={status} data-scenario-status={status}>
              {n} {SCENARIO_STATUS_LABELS[status].toLocaleLowerCase("tr")}
            </span>
          ))}
        </span>
        {open && history.length > 0 && (
          <label className="saved-scenarios-history">
            <input
              type="checkbox"
              checked={showHistory}
              onChange={(e) => setShowHistory(e.target.checked)}
            />
            Geçmişi göster ({history.length})
          </label>
        )}
        {open && isAdmin && scenarios.some((s) => s.status === "closed") && (
          <button
            type="button"
            className="textbutton"
            disabled={busy}
            onClick={onDeleteClosed}
          >
            Kapatılanları Sil
          </button>
        )}
      </div>
      {open && (
        <ul>
          {rows.map((s) => {
            const canDelete =
              s.status !== "applied" &&
              (isAdmin ||
                (s.createdBy === userId &&
                  (s.status === "draft" || s.status === "closed")));
            const inComparison = openIds.includes(s.id);
            return (
              <li key={s.id} data-scenario-status={s.status}>
                <div className="saved-scenario-main">
                  <strong>{s.name}</strong>
                  <span className="saved-scenario-status">
                    {SCENARIO_STATUS_LABELS[s.status]}
                  </span>
                  <span className="saved-scenario-shifts">
                    {s.shifts
                      .map(
                        (shift) =>
                          `${projectName(shift.projectId)} ${shift.months > 0 ? "+" : ""}${shift.months} ay (${monthLabel(shift.fromMonth)} itibarıyla)`,
                      )
                      .join(" · ")}
                  </span>
                  <small>
                    Hazırlayan: {s.createdByName} · {day(s.createdAt)}
                    {s.approvedByName &&
                      ` · Onaylayan: ${s.approvedByName} · ${day(s.approvedAt)}`}
                    {s.appliedByName &&
                      ` · Aktaran: ${s.appliedByName} · ${day(s.appliedAt)}`}
                    {s.revertedByName &&
                      ` · Geri alan: ${s.revertedByName} · ${day(s.revertedAt)}`}
                    {s.status === "closed" &&
                      ` · Yerine “${s.closedByName}” aktarıldı · ${day(s.closedAt)}`}
                  </small>
                </div>
                <div className="saved-scenario-actions">
                  {(s.status === "draft" || s.status === "approved") &&
                    (inComparison ? (
                      <span className="saved-scenario-open">
                        Karşılaştırmada
                      </span>
                    ) : (
                      button("Karşılaştır", "compare", s)
                    ))}
                  {isAdmin &&
                    s.status === "draft" &&
                    button("Onayla", "approve", s, "primary")}
                  {isAdmin &&
                    s.status === "approved" &&
                    button("Onayı Geri Çek", "withdraw", s)}
                  {isAdmin &&
                    s.status === "approved" &&
                    button("Takvime Aktar", "apply", s, "primary")}
                  {isAdmin &&
                    s.status === "applied" &&
                    button("Geri Al", "revert", s, "deletebutton")}
                  {canDelete && button("Sil", "delete", s, "textbutton")}
                </div>
              </li>
            );
          })}
          {!rows.length && (
            <li className="saved-scenarios-empty">
              Açık senaryo yok. Kapatılan ve geri alınanlar için “Geçmişi
              göster”i işaretleyin.
            </li>
          )}
        </ul>
      )}
    </section>
  );
}
