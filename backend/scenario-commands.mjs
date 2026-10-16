import { fail } from "./auth.mjs";
import { scheduleScenarioSchema } from "../shared/snapshot-schema.ts";

// Allowed status moves; content edits only while a scenario is a draft.
const transitions = {
  draft: ["draft", "approved"],
  approved: ["approved", "draft", "applied"],
  applied: ["applied", "reverted"],
  reverted: ["reverted"],
};
const content = (s) =>
  JSON.stringify({
    name: s.name,
    includeTimeline: s.includeTimeline,
    shifts: s.shifts,
  });

// Draft-only handler. The batch orchestrator has checked the role and the
// current revision; Store validates, persists and audits the final draft.
// Who and when are always stamped here, never taken from the request.
export function stageScenarioChange(
  d,
  u,
  { id, value, operation },
  existing,
  canSeeProject,
) {
  d.scheduleScenarios ??= [];
  const admin = u.role === "admin";
  const own = existing && existing.createdBy === u._id;
  if (operation) {
    if (!existing) fail(404, "Senaryo bulunamadı.");
    if (!admin && !(own && existing.status === "draft"))
      fail(403, "Yalnız kendi taslak senaryonuzu silebilirsiniz.");
    if (existing.status === "applied")
      fail(409, "Takvime aktarılmış senaryo silinemez; önce geri alın.");
    d.scheduleScenarios = d.scheduleScenarios.filter((s) => s.id !== id);
    return;
  }
  let next;
  try {
    next = scheduleScenarioSchema.parse(value);
  } catch {
    fail(400, "Senaryo bilgileri geçersiz.");
  }
  if (next.id !== id) fail(400, "Senaryo kimliği eşleşmiyor.");
  for (const shift of next.shifts) {
    if (!d.projects.some((p) => p.id === shift.projectId))
      fail(404, "Senaryodaki proje bulunamadı.");
    if (!canSeeProject(shift.projectId))
      fail(403, "Bu projeyi görüntüleme yetkiniz yok.");
  }
  const now = new Date().toISOString();
  const name = u.name || u.username || u._id;
  const from = existing?.status || "draft";
  if (!existing && next.status !== "draft")
    fail(400, "Yeni senaryo taslak olarak kaydedilir.");
  if (!transitions[from].includes(next.status))
    fail(409, "Senaryo bu duruma geçirilemez.");
  if (next.status !== from && !admin)
    fail(403, "Senaryo onayı ve takvime aktarma yalnız admin yetkisindedir.");
  if (existing && !admin && !own)
    fail(403, "Yalnız kendi senaryonuzu düzenleyebilirsiniz.");
  if (existing && from !== "draft" && content(next) !== content(existing))
    fail(409, "Onaylanmış senaryonun içeriği değiştirilemez.");
  if (next.status === "applied" && from !== "applied" && !next.undo)
    fail(400, "Takvime aktarma geri alma bilgisi olmadan kaydedilemez.");

  const stamped = {
    ...next,
    createdBy: existing?.createdBy || u._id,
    createdByName: existing?.createdByName || name,
    createdAt: existing?.createdAt || now,
  };
  for (const field of [
    "approvedByName",
    "approvedAt",
    "appliedByName",
    "appliedAt",
    "revertedByName",
    "revertedAt",
  ])
    if (existing?.[field] !== undefined) stamped[field] = existing[field];
    else delete stamped[field];
  if (next.status === "draft") {
    delete stamped.approvedByName;
    delete stamped.approvedAt;
  }
  if (next.status === "approved" && from !== "approved") {
    stamped.approvedByName = name;
    stamped.approvedAt = now;
  }
  if (next.status === "applied" && from !== "applied") {
    stamped.appliedByName = name;
    stamped.appliedAt = now;
  } else if (existing?.undo) stamped.undo = existing.undo;
  else delete stamped.undo;
  if (next.status === "reverted" && from !== "reverted") {
    stamped.revertedByName = name;
    stamped.revertedAt = now;
  }
  d.scheduleScenarios = [
    ...d.scheduleScenarios.filter((s) => s.id !== id),
    stamped,
  ];
}
