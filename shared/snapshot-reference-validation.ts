import { validateLeadershipUnits } from "./leadership-units.ts";
import { validateLeaderParents } from "./leadership-hierarchy.ts";
import type { Data } from "./model.ts";
import { invalidSnapshot as bad } from "./snapshot-validation-error.ts";
import { riskSystemNameKey } from "./risk-system-policy.ts";
import { validPlanningMonth } from "./planning-dates.ts";

export function validateSnapshotCatalogs(d: Data) {
  for (const list of [d.teams, d.projects, d.resources, d.riskSystems || []])
    if (new Set(list.map((x) => x.id)).size !== list.length)
      throw bad("Tekrarlanan kayıt kimliği.");
  const systemNames = (d.riskSystems || []).map((item) =>
    riskSystemNameKey(item.name),
  );
  if (new Set(systemNames).size !== systemNames.length)
    throw bad("Tekrarlanan sistem / alt sistem adı.");
  try {
    validateLeadershipUnits(d);
  } catch (error) {
    throw bad((error as Error).message);
  }
  const teamIds = new Set(d.teams.map((team) => team.id));
  const projectRanks = d.projects.flatMap((p) =>
    p.sortOrder === undefined ? [] : [p.sortOrder],
  );
  if (new Set(projectRanks).size !== projectRanks.length)
    throw bad("Projelerin sıralama değerleri farklı olmalıdır.");
  const projectsById = new Map(
    d.projects.map((project) => [project.id, project]),
  );
  return { teamIds, projectsById };
}

export function validateSnapshotRisks(
  d: Data,
  projectsById: ReadonlyMap<string, Data["projects"][number]>,
) {
  if (
    new Set((d.risks || []).map((item) => item.id)).size !==
    (d.risks || []).length
  )
    throw bad("Tekrarlanan risk kimliği.");
  const systemsById = new Map(
    (d.riskSystems || []).map((item) => [item.id, item]),
  );
  for (const item of d.risks || []) {
    if (item.systemId) {
      const system = systemsById.get(item.systemId);
      if (!system)
        throw bad(
          "Sistem / alt sistem bulunamadı. Güncel listeden tekrar seçim yapın.",
        );
      item.system = system.name;
    }
    if (!projectsById.has(item.projectId))
      throw bad("Risk projesi bulunamadı.");
    if ((item.residualLikelihood === null) !== (item.residualImpact === null))
      throw bad("Aksiyon sonrası olasılık ve etki birlikte girilmeli.");
    if (item.residualLikelihood !== null && !item.implementedAt)
      throw bad(
        "Aksiyon sonrası değerlendirme için devreye alınma tarihi girin.",
      );
  }
}

export function validateSnapshotIdentifiers(
  d: Data,
  leaderNames: ReadonlySet<string>,
) {
  for (const list of [d.teams, d.projects, d.resources])
    for (const item of list)
      if (!/^[a-zA-Z0-9_-]{1,120}$/.test(item.id))
        throw bad("Geçersiz kimlik.");
  for (const t of d.teams)
    if (t.lead && !leaderNames.has(t.lead)) throw bad("Geçersiz liderlik.");
  for (const name of Object.keys(d.leaderManagers || {}))
    if (!leaderNames.has(name)) throw bad("Geçersiz liderlik yöneticisi.");
  try {
    validateLeaderParents(d);
  } catch (error) {
    throw bad((error as Error).message);
  }
  for (const p of d.projects)
    for (const m of Object.keys(p.phases))
      if (!validPlanningMonth(m)) throw bad("Geçersiz proje ayı.");
}
