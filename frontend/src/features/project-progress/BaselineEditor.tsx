import { useEffect, useState } from "react";
import type { Principal } from "../../access";
import type { Change } from "../../../../shared/commands";
import BaselineCard, {
  baselineStatus,
  type BaselineStatus,
} from "./BaselineCard";
import { canLead, type ProgressContext } from "./progress-view";

export type BaselineSelection = { projectId: string; leader: string } | null;
type Pair = { projectId: string; leader: string };
const ORDER: Record<BaselineStatus, number> = {
  pending: 0,
  draft: 1,
  new: 2,
  approved: 3,
};

/**
 * Every project × leadership the user may plan, open at once: saved records,
 * projects where the leadership has planned resource but no record yet, and
 * pairs added by hand. Proposals waiting for approval come first.
 */
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
  const ownLeaders = admin ? data.leaders || [] : user?.leaders || [];
  const [leader, setLeader] = useState("");
  const [status, setStatus] = useState<"" | BaselineStatus>("");
  const [added, setAdded] = useState<Pair[]>([]);
  const [newProject, setNewProject] = useState("");
  const [newLeader, setNewLeader] = useState("");
  const projects = new Map(data.projects.map((p) => [p.id, p]));

  // A project opened from the monthly entry ("Temel Plan Oluştur") or added here.
  useEffect(() => {
    if (!selection) return;
    setAdded((all) =>
      all.some(
        (p) =>
          p.projectId === selection.projectId && p.leader === selection.leader,
      )
        ? all
        : [...all, selection],
    );
    const name =
      projects.get(selection.projectId)?.name + " · " + selection.leader;
    requestAnimationFrame(() =>
      document
        .querySelector(`section[aria-label="${CSS.escape(name)}"]`)
        ?.scrollIntoView({ block: "start" }),
    );
    setSelection(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection]);

  const records = (data.projectProgress || []).filter(
    (r) => canLead(user, r.leader) && projects.has(r.projectId),
  );
  const key = (p: Pair) => p.projectId + "\u0000" + p.leader;
  const pairs = new Map<string, Pair>();
  for (const r of records) pairs.set(key(r), r);
  // Leaders see where their leadership has planned resource; an admin picks
  // a leadership first, otherwise the list would hold every combination.
  const candidateLeaders = admin ? (leader ? [leader] : []) : ownLeaders;
  for (const name of candidateLeaders)
    for (const project of data.projects)
      if (ctx.planned(project.id).has(name))
        pairs.set(key({ projectId: project.id, leader: name }), {
          projectId: project.id,
          leader: name,
        });
  for (const p of added) if (projects.has(p.projectId)) pairs.set(key(p), p);
  const recordOf = (p: Pair) =>
    records.find((r) => r.projectId === p.projectId && r.leader === p.leader);
  const cards = [...pairs.values()]
    .map((p) => ({
      ...p,
      record: recordOf(p),
      status: baselineStatus(recordOf(p)),
    }))
    .filter(
      (c) =>
        (!leader || c.leader === leader) && (!status || c.status === status),
    )
    .sort(
      (a, b) =>
        ORDER[a.status] - ORDER[b.status] ||
        projects
          .get(a.projectId)!
          .name.localeCompare(projects.get(b.projectId)!.name, "tr") ||
        a.leader.localeCompare(b.leader, "tr"),
    );
  const pendingCount = records.filter(
    (r) => r.proposal?.status === "pending",
  ).length;

  return (
    <div className="progress-baseline">
      <div className="progress-baseline-bar">
        <label>
          Liderlik
          <select value={leader} onChange={(e) => setLeader(e.target.value)}>
            <option value="">{admin ? "Tüm kayıtlar" : "Tümü"}</option>
            {ownLeaders.map((name) => (
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
            onChange={(e) => setStatus(e.target.value as "" | BaselineStatus)}
          >
            <option value="">Tümü</option>
            <option value="pending">Onay bekliyor ({pendingCount})</option>
            <option value="draft">Taslak</option>
            <option value="new">Takibe alınmadı</option>
            <option value="approved">Onaylı</option>
          </select>
        </label>
        <span className="progress-baseline-new">
          <select
            aria-label="Yeni kayıt projesi"
            value={newProject}
            onChange={(e) => setNewProject(e.target.value)}
          >
            <option value="">Proje ekle…</option>
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
            <option value="">Liderlik…</option>
            {ownLeaders.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="button"
            disabled={!newProject || !newLeader}
            onClick={() => {
              setSelection({ projectId: newProject, leader: newLeader });
              setNewProject("");
            }}
          >
            Ekle
          </button>
        </span>
      </div>
      {cards.length ? (
        cards.map((c) => (
          <BaselineCard
            key={key(c)}
            ctx={ctx}
            user={user}
            project={projects.get(c.projectId)!}
            leader={c.leader}
            record={c.record}
            currentMonth={currentMonth}
            saving={saving}
            onSave={onSave}
          />
        ))
      ) : (
        <p className="emptymsg">
          {admin && !leader
            ? "Henüz ilerleme kaydı yok. Bir liderlik seçerek kaynak planlanmış projelerini görün ya da üstten proje ekleyin."
            : "Bu süzgece uyan proje yok."}
        </p>
      )}
    </div>
  );
}
