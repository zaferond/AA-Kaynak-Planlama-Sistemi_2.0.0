import type { Data } from "../../model";
import { fullDateLabel, monthLabel } from "../../format";
import {
  SCENARIO_STATUS_LABELS,
  type SavedScenario,
} from "../../../../shared/schedule-shift.ts";

export type SavedScenarioAction =
  "compare" | "approve" | "withdraw" | "apply" | "revert" | "delete";

type Props = {
  data: Data;
  scenarios: SavedScenario[];
  isAdmin: boolean;
  userId: string;
  busy: boolean;
  onAction: (action: SavedScenarioAction, scenario: SavedScenario) => void;
};

const day = (iso?: string) => (iso ? fullDateLabel(iso.slice(0, 10)) : "");

/** Saved delay scenarios with their decision trail and the admin actions. */
export default function SavedScenarioList({
  data,
  scenarios,
  isAdmin,
  userId,
  busy,
  onAction,
}: Props) {
  if (!scenarios.length) return null;
  const projectName = (id: string) =>
    data.projects.find((p) => p.id === id)?.name || "Silinmiş proje";
  const sorted = [...scenarios].sort((a, b) =>
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
      <h3>Kayıtlı Senaryolar</h3>
      <ul>
        {sorted.map((s) => {
          const canDelete =
            s.status !== "applied" &&
            (isAdmin || (s.createdBy === userId && s.status === "draft"));
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
                </small>
              </div>
              <div className="saved-scenario-actions">
                {(s.status === "draft" || s.status === "approved") &&
                  button("Karşılaştır", "compare", s)}
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
      </ul>
    </section>
  );
}
