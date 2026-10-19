import { useId, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { Principal } from "../../access";
import type { Change } from "../../../../shared/commands";
import { monthLabel } from "../../format";
import ProgressCard from "./ProgressCard";
import ProgressProcessHelp from "./ProgressProcessHelp";
import {
  baselineStatus,
  entryStatus,
  PLAN_LABELS,
  PLAN_STATUS_TITLE,
  ENTRY_STATUS_TITLE,
  ENTRY_LABELS,
  type PlanStatus,
  type EntryStatus,
} from "./progress-status";
import {
  progressGroups,
  progressLeaders,
  type ProgressItem,
} from "./progress-scope";
import type { ProgressContext } from "./progress-view";

const PLAN_ORDER: Record<PlanStatus, number> = {
  pending: 0,
  draft: 2,
  new: 3,
  approved: 4,
};

/**
 * Plan ve Giriş: every project of the user's leaderships, grouped by
 * leadership. A card takes the target curve until it is approved, then the
 * month's actual on the same grid.
 */
export default function PlanAndEntry({
  ctx,
  responsibleFilter,
  user,
  month,
  currentMonth,
  saving,
  onSave,
}: {
  ctx: ProgressContext;
  responsibleFilter: ReactNode;
  user: Principal | null;
  month: string;
  currentMonth: string;
  saving: boolean;
  onSave: (changes: Change[]) => Promise<void>;
}) {
  const leaders = progressLeaders(ctx, user);
  const [leader, setLeader] = useState("");
  const [planFilter, setPlanFilter] = useState<"" | PlanStatus>("");
  const [entryFilter, setEntryFilter] = useState<"" | EntryStatus>("");
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const groupId = useId();
  const locked = (ctx.data.progressLocks || []).some((l) => l.id === month);
  const entryOf = (item: ProgressItem) =>
    entryStatus(item.record, month, currentMonth);
  const planOf = (item: ProgressItem) => baselineStatus(item.record);
  const all = progressGroups(ctx, leader ? [leader] : leaders);
  const items = all.flatMap(([, groupItems]) => groupItems);
  const planCount = (status: PlanStatus) =>
    items.filter(
      (item) =>
        planOf(item) === status &&
        (!entryFilter || entryOf(item) === entryFilter),
    ).length;
  const entryCount = (status: EntryStatus) =>
    items.filter(
      (item) =>
        entryOf(item) === status &&
        (!planFilter || planOf(item) === planFilter),
    ).length;
  const priority = (item: ProgressItem) => {
    const plan = planOf(item);
    if (plan === "pending") return 0;
    if (entryOf(item) === "waiting") return 1;
    return PLAN_ORDER[plan];
  };
  const groups = all
    .map(([name, items]): [string, ProgressItem[]] => [
      name,
      items
        .filter(
          (item) =>
            (!planFilter || planOf(item) === planFilter) &&
            (!entryFilter || entryOf(item) === entryFilter),
        )
        .sort(
          (a, b) =>
            priority(a) - priority(b) ||
            a.project.name.localeCompare(b.project.name, "tr"),
        ),
    ])
    .filter(([, items]) => items.length > 0);

  return (
    <div className="progress-baseline">
      <div className="progress-baseline-bar">
        <label>
          Liderlik
          <select value={leader} onChange={(e) => setLeader(e.target.value)}>
            <option value="">Tümü</option>
            {leaders.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        {responsibleFilter}
        <label>
          {PLAN_STATUS_TITLE}
          <select
            value={planFilter}
            onChange={(e) => setPlanFilter(e.target.value as "" | PlanStatus)}
          >
            <option value="">Tümü</option>
            {(Object.keys(PLAN_ORDER) as PlanStatus[]).map((status) => (
              <option key={status} value={status}>
                {PLAN_LABELS[status]} ({planCount(status)})
              </option>
            ))}
          </select>
        </label>
        <label>
          {ENTRY_STATUS_TITLE}
          <select
            value={entryFilter}
            onChange={(e) => setEntryFilter(e.target.value as "" | EntryStatus)}
          >
            <option value="">Tümü</option>
            {(Object.keys(ENTRY_LABELS) as EntryStatus[]).map((status) => (
              <option key={status} value={status}>
                {ENTRY_LABELS[status]} ({entryCount(status)})
              </option>
            ))}
          </select>
        </label>
        {groups.length > 0 && (
          <div className="progress-group-actions">
            <button
              type="button"
              className="button"
              disabled={!groups.some(([name]) => collapsed.has(name))}
              onClick={() =>
                setCollapsed((previous) => {
                  const next = new Set(previous);
                  groups.forEach(([name]) => next.delete(name));
                  return next;
                })
              }
            >
              Tümünü Aç
            </button>
            <button
              type="button"
              className="button"
              disabled={groups.every(([name]) => collapsed.has(name))}
              onClick={() =>
                setCollapsed(
                  (previous) =>
                    new Set([...previous, ...groups.map(([name]) => name)]),
                )
              }
            >
              Tümünü Kapat
            </button>
          </div>
        )}
      </div>
      <div className="progress-entry-summary">
        {month ? (
          <>
            <span
              className={locked ? "progress-locked" : "progress-entry-count"}
            >
              Ay kilidi ({monthLabel(month)}):{" "}
              {locked ? "Değişikliğe kapalı" : "Değişikliğe açık"}
            </span>
            <span className="progress-entry-count">
              Gerçekleşeni girilmeyen: {entryCount("waiting")}
            </span>
          </>
        ) : (
          <span className="progress-entry-count">
            Gerçekleşen girişi için henüz takip ayı yok.
          </span>
        )}
      </div>
      <ProgressProcessHelp />
      {groups.length ? (
        groups.map(([name, items]) => (
          <section
            key={name}
            className="progress-leader-group"
            aria-label={name + " liderliği"}
          >
            <h3>
              <button
                type="button"
                className="progress-group-toggle"
                aria-label={name + " projeleri"}
                aria-expanded={!collapsed.has(name)}
                aria-controls={groupId + "-" + encodeURIComponent(name)}
                title={
                  name +
                  (collapsed.has(name)
                    ? " projelerini aç"
                    : " projelerini kapat")
                }
                onClick={() =>
                  setCollapsed((previous) => {
                    const next = new Set(previous);
                    if (next.has(name)) next.delete(name);
                    else next.add(name);
                    return next;
                  })
                }
              >
                {collapsed.has(name) ? (
                  <ChevronRight size={16} />
                ) : (
                  <ChevronDown size={16} />
                )}
                {name}
                <small>{items.length} proje</small>
              </button>
            </h3>
            <div
              id={groupId + "-" + encodeURIComponent(name)}
              className="progress-group-projects"
              hidden={collapsed.has(name)}
            >
              {items.map((item) => (
                <ProgressCard
                  key={item.project.id}
                  ctx={ctx}
                  user={user}
                  project={item.project}
                  leader={name}
                  record={item.record}
                  month={month}
                  currentMonth={currentMonth}
                  saving={saving}
                  onSave={onSave}
                />
              ))}
            </div>
          </section>
        ))
      ) : (
        <p className="emptymsg">
          {leaders.length
            ? "Bu süzgece uyan proje yok."
            : "Kaynak Planlama Yetkisi'nde size liderlik atanmamış; admin yetki verdiğinde projeleriniz burada görünür."}
        </p>
      )}
    </div>
  );
}
