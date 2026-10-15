import { ensureLeadershipUnits } from "../shared/leadership-units.ts";
import { z } from "zod";
import { ownValue } from "../shared/records.ts";
import { fail, admin } from "./auth.mjs";
import { validate } from "./domain/index.mjs";
import { teamSchema } from "../shared/server-domain.ts";
import {
  assertUniqueLeaderName,
  assertUniqueTeamName,
  directoryRevision,
} from "../shared/directory-policy.ts";

// Every matching historical version changes, but each resource's revision is
// incremented only once per command. The caller owns authorization/transaction.
function updateResourceLeaders(d, matches, lead) {
  for (const resource of d.resources) {
    let changed = false;
    for (const version of resource.versions)
      if (matches(version)) {
        version.lead = lead;
        changed = true;
      }
    if (changed)
      d.revisions["resource:" + resource.id] =
        (d.revisions["resource:" + resource.id] || 0) + 1;
  }
}

// Draft-only handler; operations checks permission/revision first and advances
// the team revision afterwards. Store owns final validation/audit/persistence.
export function stageTeamChange(d, { id, value, operation }) {
  if (Object.values(d.leadershipUnits || {}).includes(id))
    fail(
      403,
      "Liderlik kaynak satırı Liderlikleri Yönet ekranından yönetilir.",
    );
  if (operation) {
    if (!d.teams.some((team) => team.id === id)) fail(404, "Kayıt bulunamadı.");
    if (d.teams.length <= 1) fail(409, "Son takım silinemez.");
    if (
      d.resources.some((r) => r.versions.some((v) => v.team === id)) ||
      Object.keys(d.allocations).some((key) => key.split("|")[0] === id)
    )
      fail(409, "Kullanılan takım silinemez.");
    d.teams = d.teams.filter((team) => team.id !== id);
  } else {
    if (!value || value.id !== id) fail(400, "Kimlik eşleşmiyor.");
    const next = teamSchema.parse(value);
    const previous = d.teams.find((team) => team.id === id);
    if (
      !previous ||
      previous.name !== next.name ||
      previous.lead !== next.lead
    ) {
      try {
        assertUniqueTeamName(d.teams, next);
      } catch (error) {
        fail(400, error.message);
      }
    }
    if (!previous) next.catalog = true;
    if (previous && previous.lead !== next.lead)
      updateResourceLeaders(d, (version) => version.team === id, next.lead);
    d.teams = [...d.teams.filter((team) => team.id !== id), next];
  }
}

// Uses the Store-owned connection; never starts a separate transaction or DB.
const leaderChangeSchema = z
  .object({
    action: z.enum(["create", "rename", "update", "delete"]),
    name: z.string().trim().min(1).max(200),
    newName: z.string().trim().min(1).max(200).optional(),
    managerName: z.string().trim().max(200).optional(),
    parentName: z.string().trim().max(200).optional(),
    generation: z.number().int().nonnegative().optional(),
    catalogRevision: z.number().int().nonnegative().optional(),
  })
  .refine(
    (change) =>
      change.catalogRevision !== undefined || change.generation !== undefined,
    "Sürüm bilgisi eksik.",
  );
export async function applyLeaderChange(d, u, input, c, generation) {
  admin(u);
  const previousResources = structuredClone(d.resources);
  const change = leaderChangeSchema.parse(input);
  if (change.catalogRevision !== undefined) {
    if (change.catalogRevision !== directoryRevision(d))
      fail(
        409,
        "Liderlik veya takım listesi değişti. Taslağınız korundu; güncel listeyi yükleyip tekrar deneyin.",
      );
  } else if (change.generation !== generation) {
    // Older open clients keep their broader guard during rollout.
    fail(
      409,
      "Uygulama verileri değişti. Taslağınız korundu; sayfayı yenileyip tekrar deneyin.",
    );
  }
  if (change.action === "create") {
    try {
      assertUniqueLeaderName(d.leaders || [], change.name);
    } catch (error) {
      fail(400, error.message);
    }
    d.leaders = [...(d.leaders || []), change.name];
    if (change.managerName)
      d.leaderManagers = {
        ...d.leaderManagers,
        [change.name]: change.managerName,
      };
    if (change.parentName)
      d.leaderParents = {
        ...d.leaderParents,
        [change.name]: change.parentName,
      };
    ensureLeadershipUnits(d);
    Object.assign(d, validate(d, { previousResources }));
    return;
  }
  if (!d.leaders?.includes(change.name)) fail(404, "Liderlik bulunamadı.");
  const linkedUsers = (
    await c.query("SELECT * FROM kp_user_leaders WHERE leader_name=@p0", [
      change.name,
    ])
  ).rows;
  if (change.action === "rename" || change.action === "update") {
    const newName = change.newName || change.name;
    const oldManager = ownValue(d.leaderManagers, change.name) || "";
    const managerName = change.managerName ?? oldManager;
    const oldParent = ownValue(d.leaderParents, change.name) || "";
    const parentName = change.parentName ?? oldParent;
    const renamed = newName !== change.name;
    if (change.action === "rename" && !renamed)
      fail(400, "Farklı bir liderlik adı girin.");
    if (renamed) {
      try {
        assertUniqueLeaderName(d.leaders, newName, change.name);
      } catch (error) {
        fail(400, error.message);
      }
    }
    if (!renamed && managerName === oldManager && parentName === oldParent)
      fail(400, "Değiştirilecek liderlik bilgisi yok.");
    d.leaderParents ??= {};
    delete d.leaderParents[change.name];
    if (parentName)
      d.leaderParents = { ...d.leaderParents, [newName]: parentName };
    if (renamed)
      d.leaderParents = Object.fromEntries(
        Object.entries(d.leaderParents).map(([child, parent]) => [
          child,
          parent === change.name ? newName : parent,
        ]),
      );
    const unitId = ownValue(d.leadershipUnits, change.name);
    if (renamed && unitId) {
      delete d.leadershipUnits[change.name];
      d.leadershipUnits = { ...d.leadershipUnits, [newName]: unitId };
    }
    d.leaderManagers ??= {};
    delete d.leaderManagers[change.name];
    if (managerName)
      d.leaderManagers = { ...d.leaderManagers, [newName]: managerName };
    if (renamed) {
      await c.upsert("leaders", [{ name: newName, manager_name: managerName }]);
      d.leaders = d.leaders.map((name) =>
        name === change.name ? newName : name,
      );
      for (const team of d.teams)
        if (team.lead === change.name) {
          team.lead = newName;
          d.revisions["team:" + team.id] =
            (d.revisions["team:" + team.id] || 0) + 1;
        }
      updateResourceLeaders(
        d,
        (version) => version.lead === change.name,
        newName,
      );
      await c.upsert(
        "user_leaders",
        linkedUsers.map((row) => ({
          user_id: row.user_id,
          leader_name: newName,
        })),
      );
      await c.remove(
        "user_leaders",
        linkedUsers.map((row) => ({
          user_id: row.user_id,
          leader_name: change.name,
        })),
      );
    }
  } else {
    if (Object.values(d.leaderParents || {}).includes(change.name))
      fail(
        409,
        "Bu liderliğe bağlı alt liderlikler var. Önce üst liderlik bağlantılarını değiştirin.",
      );
    if (linkedUsers.length)
      fail(
        409,
        "Liderlik kullanıcı yetkilerinde kullanılıyor. Önce yetkileri güncelleyin.",
      );
    const teams = d.teams.filter((team) => team.lead === change.name),
      ids = new Set(teams.map((team) => team.id));
    if (d.teams.length <= teams.length)
      fail(409, "Son takım veya liderlik silinemez.");
    if (
      d.resources.some((resource) =>
        resource.versions.some(
          (version) => ids.has(version.team) || version.lead === change.name,
        ),
      ) ||
      Object.keys(d.allocations).some((key) => ids.has(key.split("|")[0]))
    )
      fail(
        409,
        "Bu liderliğe bağlı çalışan kaynak veya planlanan dağılım var. Önce bağlı kayıtları taşıyın ya da temizleyin.",
      );
    d.teams = d.teams.filter((team) => !ids.has(team.id));
    for (const team of teams)
      d.revisions["team:" + team.id] =
        (d.revisions["team:" + team.id] || 0) + 1;
    d.leaders = d.leaders.filter((name) => name !== change.name);
    if (d.leaderManagers) delete d.leaderManagers[change.name];
    if (d.leaderParents) delete d.leaderParents[change.name];
    if (d.leadershipUnits) delete d.leadershipUnits[change.name];
  }
  ensureLeadershipUnits(d);
  Object.assign(d, validate(d, { previousResources }));
}
