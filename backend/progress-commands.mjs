import { fail } from "./auth.mjs";
import { ownValue } from "../shared/records.ts";
import {
  projectProgressSchema,
  progressLockSchema,
} from "../shared/snapshot-schema.ts";
import {
  proposalProblems,
  resourcePlanStart,
  previousMonth,
  alignPlanStart,
  leaderResourceByMonth,
} from "../shared/project-progress.ts";
import { currentPlanningDate } from "../shared/resource-dates.ts";

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const content = (p) =>
  p && {
    openingMonth: p.openingMonth,
    openingPct: p.openingPct,
    targets: p.targets,
    reason: p.reason || "",
  };
// Allowed proposal status moves ("" = no proposal). An admin may also approve
// a draft directly; "approved" never stays: it becomes a baseline.
const transitions = {
  "": ["draft", "pending", "approved"],
  draft: ["draft", "pending", "approved"],
  pending: ["pending", "draft", "approved"],
};

/**
 * One project × leadership progress record. The batch orchestrator has
 * checked the role (admin or manager) and the revision; this handler decides
 * what each role may change. Baselines, names and times are server-owned.
 */
export function stageProgressChange(
  d,
  u,
  { id, value, operation },
  existing,
  canSeeProject,
  now = new Date(),
) {
  d.projectProgress ??= [];
  const admin = u.role === "admin";
  const leads = (leader) =>
    admin || (u.role === "manager" && (u.leaders || []).includes(leader));
  if (operation) {
    if (!existing) fail(404, "İlerleme kaydı bulunamadı.");
    if (!admin) fail(403, "İlerleme kaydını yalnız admin silebilir.");
    d.projectProgress = d.projectProgress.filter((item) => item.id !== id);
    return;
  }
  let next;
  try {
    next = projectProgressSchema.parse(value);
  } catch {
    fail(400, "İlerleme bilgileri geçersiz.");
  }
  if (next.id !== id) fail(400, "İlerleme kaydı kimliği eşleşmiyor.");
  const at = now.toISOString();
  const name = u.name || u.username || u._id;
  const project = d.projects.find((item) => item.id === next.projectId);
  if (!project) fail(404, "Proje bulunamadı.");
  if (!canSeeProject(next.projectId))
    fail(403, "Bu projeyi görüntüleme yetkiniz yok.");

  if (existing) {
    if (
      existing.projectId !== next.projectId ||
      existing.leader !== next.leader
    )
      fail(409, "İlerleme kaydının projesi ve liderliği değiştirilemez.");
    if (!same(existing.baselines, next.baselines))
      fail(409, "Onaylanmış temel plan değiştirilemez; yeni öneri gönderin.");
  } else {
    if (!(d.leaders || []).includes(next.leader))
      fail(404, "Liderlik bulunamadı.");
    if (next.baselines.length || Object.keys(next.actuals).length)
      fail(400, "Yeni ilerleme kaydı temel plan önerisiyle başlar.");
  }
  if (!leads(next.leader))
    fail(403, "Yalnız kendi liderliğinizin ilerlemesini girebilirsiniz.");
  if (!admin && !same(existing?.weight, next.weight))
    fail(403, "Ağırlığı yalnız admin değiştirebilir.");

  const baselines = [...(existing?.baselines || [])];
  // Proposal: edited while a draft, frozen while pending, approved by an admin.
  const before = existing?.proposal;
  const start = resourcePlanStart(
    project,
    leaderResourceByMonth(d.teams, d.allocations || {}, project.id).get(
      next.leader,
    ),
  );
  let proposal = next.proposal;
  if (proposal && !same(proposal, before)) {
    if (
      !start &&
      !(before?.status === "pending" && proposal.status === "draft")
    )
      fail(400, "Hedef planı için önce bu liderliğe kaynak dağılımı girin.");
    if (start) proposal = alignPlanStart(proposal, previousMonth(start));
  }
  if (proposal && !same(proposal, before)) {
    const from = before?.status || "";
    const to = proposal.status;
    if (!transitions[from].includes(to))
      fail(409, "Temel plan önerisi bu duruma geçirilemez.");
    if (from === "pending" && !same(content(proposal), content(before)))
      fail(409, "Onay bekleyen öneri değiştirilemez; önce geri çekin.");
    if (to === "approved" && !admin)
      fail(403, "Temel planı yalnız admin onaylar.");
    if (to !== "draft") {
      const problems = proposalProblems(proposal, project.end);
      if (problems.length) fail(400, problems[0]);
      if (baselines.length && !proposal.reason?.trim())
        fail(400, "Yeni temel plan için gerekçe yazın.");
    }
    const changedContent = !same(content(proposal), content(before));
    if (to === "approved") {
      baselines.push({
        version: (baselines.at(-1)?.version || 0) + 1,
        openingMonth: proposal.openingMonth,
        openingPct: proposal.openingPct,
        targets: proposal.targets,
        ...(proposal.reason?.trim() ? { reason: proposal.reason.trim() } : {}),
        approvedByName: name,
        approvedAt: at,
      });
      proposal = undefined;
    } else {
      proposal = {
        ...proposal,
        updatedByName: changedContent ? name : before?.updatedByName || name,
        updatedAt: changedContent ? at : before?.updatedAt || at,
      };
      if (to === "pending" && from !== "pending") {
        proposal.submittedByName = name;
        proposal.submittedAt = at;
      } else if (to === "pending") {
        proposal.submittedByName = before.submittedByName;
        proposal.submittedAt = before.submittedAt;
      } else {
        delete proposal.submittedByName;
        delete proposal.submittedAt;
      }
    }
  } else if (!proposal && before && before.status === "pending" && !admin)
    fail(409, "Onay bekleyen öneri silinemez; önce geri çekin.");

  // Actuals: only changed months are checked and stamped.
  const actuals = { ...(existing?.actuals || {}) };
  const months = new Set([
    ...Object.keys(actuals),
    ...Object.keys(next.actuals),
  ]);
  const current = currentPlanningDate(now).slice(0, 7);
  const locked = new Set((d.progressLocks || []).map((lock) => lock.id));
  for (const month of months) {
    const old = ownValue(actuals, month),
      entry = ownValue(next.actuals, month);
    if (old && entry && old.pct === entry.pct && old.note === entry.note.trim())
      continue;
    if (!old && !entry) continue;
    const first = baselines[0];
    if (!first) fail(409, "Gerçekleşen girmeden önce temel plan onaylanmalı.");
    if (month <= first.openingMonth)
      fail(400, "Takip başlamadan önceki aylara giriş yapılamaz.");
    if (month > current) fail(400, "Gelecek aylara gerçekleşen girilemez.");
    if (locked.has(month))
      fail(409, `${month} kilitli; değişiklik için admin kilidi açmalı.`);
    if (!entry) {
      delete actuals[month];
      continue;
    }
    if (!entry.note.trim())
      fail(400, "Gerçekleşen ile birlikte kısa bir açıklama yazın.");
    actuals[month] = {
      pct: entry.pct,
      note: entry.note.trim(),
      byName: name,
      at,
    };
  }

  const stamped = {
    id,
    projectId: next.projectId,
    leader: next.leader,
    ...(next.weight !== undefined ? { weight: next.weight } : {}),
    baselines,
    ...(proposal ? { proposal } : {}),
    actuals,
    createdBy: existing?.createdBy || u._id,
    createdByName: existing?.createdByName || name,
    createdAt: existing?.createdAt || at,
  };
  d.projectProgress = [
    ...d.projectProgress.filter((item) => item.id !== id),
    stamped,
  ];
}

/** Automatic, audited alignment after resource changes; never mutates shared records. */
export function synchronizeProgressStarts(d) {
  if (!d.projectProgress?.length) return 0;
  const projects = new Map(d.projects.map((project) => [project.id, project]));
  const leaders = new Map(d.teams.map((team) => [team.id, team.lead]));
  const starts = new Map();
  for (const [key, amount] of Object.entries(d.allocations || {})) {
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const [team, projectId, month] = key.split("|");
    const project = projects.get(projectId);
    const leader = leaders.get(team);
    if (!project || !leader || month < project.start || month > project.end)
      continue;
    const group = projectId + "\u0000" + leader;
    if (!starts.has(group) || month < starts.get(group))
      starts.set(group, month);
  }
  let changed = 0;
  const records = d.projectProgress.map((record) => {
    const project = projects.get(record.projectId);
    if (!project) return record;
    const start = starts.get(project.id + "\u0000" + record.leader);
    if (!start) return record;
    const opening = previousMonth(start);
    const baselines = record.baselines.map((baseline) =>
      alignPlanStart(baseline, opening),
    );
    const proposal =
      record.proposal && alignPlanStart(record.proposal, opening);
    if (
      baselines.every((baseline, i) => baseline === record.baselines[i]) &&
      proposal === record.proposal
    )
      return record;
    changed++;
    const key = "progress:" + record.id;
    d.revisions[key] = (d.revisions[key] || 0) + 1;
    return { ...record, baselines, ...(proposal ? { proposal } : {}) };
  });
  if (changed) d.projectProgress = records;
  return changed;
}

/** Closing a month to actual entry (admin only, checked by the orchestrator). */
export function stageProgressLockChange(
  d,
  u,
  { id, value, operation },
  now = new Date(),
) {
  d.progressLocks ??= [];
  const existing = d.progressLocks.find((lock) => lock.id === id);
  if (operation) {
    if (!existing) fail(404, "Ay kilidi bulunamadı.");
    d.progressLocks = d.progressLocks.filter((lock) => lock.id !== id);
    return;
  }
  let next;
  try {
    next = progressLockSchema.parse({
      lockedByName: "",
      lockedAt: "",
      ...value,
    });
  } catch {
    fail(400, "Ay kilidi geçersiz.");
  }
  if (next.id !== id) fail(400, "Ay kilidi kimliği eşleşmiyor.");
  if (existing) return;
  d.progressLocks = [
    ...d.progressLocks,
    {
      id,
      lockedByName: u.name || u.username || u._id,
      lockedAt: now.toISOString(),
    },
  ].sort((a, b) => a.id.localeCompare(b.id));
}
