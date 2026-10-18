import { useState } from "react";
import type { Principal } from "../../access";
import type { Change } from "../../../../shared/commands";
import { monthLabel } from "../../format";
import ProgressCard, { baselineStatus, entryStatus } from "./ProgressCard";
import {
  progressGroups,
  progressLeaders,
  type ProgressItem,
} from "./progress-scope";
import type { ProgressContext } from "./progress-view";

type Status = "pending" | "waiting" | "draft" | "new" | "locked" | "entered";
const ORDER: Record<Status, number> = {
  pending: 0,
  waiting: 1,
  draft: 2,
  new: 3,
  locked: 4,
  entered: 5,
};
const LABELS: Record<Status, string> = {
  pending: "Plan onay bekliyor",
  waiting: "Giriş bekliyor",
  draft: "Plan taslağı",
  new: "Takibe alınmadı",
  locked: "Ay kilitli",
  entered: "Girildi",
};

/**
 * Plan ve Giriş: every project of the user's leaderships, grouped by
 * leadership. A card takes the target curve until it is approved, then the
 * month's actual on the same grid.
 */
export default function PlanAndEntry({
  ctx,
  user,
  month,
  currentMonth,
  saving,
  onSave,
}: {
  ctx: ProgressContext;
  user: Principal | null;
  month: string;
  currentMonth: string;
  saving: boolean;
  onSave: (changes: Change[]) => Promise<void>;
}) {
  const leaders = progressLeaders(ctx, user);
  const [leader, setLeader] = useState("");
  const [status, setStatus] = useState<"" | Status>("");
  const locked = (ctx.data.progressLocks || []).some((l) => l.id === month);
  const statusOf = (item: ProgressItem): Status => {
    const plan = baselineStatus(item.record);
    if (plan === "pending" || plan === "new") return plan;
    const entry = entryStatus(item.record, month, locked);
    if (entry === "waiting" || entry === "locked" || entry === "entered")
      return entry;
    return plan === "draft" ? "draft" : "entered";
  };
  const all = progressGroups(ctx, leader ? [leader] : leaders);
  const counts = all
    .flatMap(([, items]) => items)
    .reduce<Partial<Record<Status, number>>>((out, item) => {
      const s = statusOf(item);
      out[s] = (out[s] || 0) + 1;
      return out;
    }, {});
  const groups = all
    .map(([name, items]): [string, ProgressItem[]] => [
      name,
      items
        .filter((item) => !status || statusOf(item) === status)
        .sort(
          (a, b) =>
            ORDER[statusOf(a)] - ORDER[statusOf(b)] ||
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
        <label>
          Durum
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as "" | Status)}
          >
            <option value="">Tümü</option>
            {(Object.keys(ORDER) as Status[]).map((s) => (
              <option key={s} value={s}>
                {LABELS[s]} ({counts[s] || 0})
              </option>
            ))}
          </select>
        </label>
        {month ? (
          locked ? (
            <span className="progress-locked">
              {monthLabel(month)} kilitli; değişiklik için admin kilidi açmalı.
            </span>
          ) : (
            <span
              className="progress-entry-count"
              data-pending={counts.waiting ? "true" : undefined}
            >
              {monthLabel(month)} için giriş bekleyen: {counts.waiting || 0}
            </span>
          )
        ) : null}
      </div>
      {groups.length ? (
        groups.map(([name, items]) => (
          <section
            key={name}
            className="progress-leader-group"
            aria-label={name + " liderliği"}
          >
            <h3>
              {name}
              <small>{items.length} proje</small>
            </h3>
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
