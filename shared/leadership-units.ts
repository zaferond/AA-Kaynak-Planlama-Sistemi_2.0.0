import type { Data } from "./model.ts";
import { ownValue } from "./records.ts";

type UnitDirectory = Pick<
  Data,
  "teams" | "leaders" | "leaderManagers" | "leadershipUnits" | "revisions"
>;
/** First-class leadership planning owners use the existing FK-backed unit IDs.
 * They are distinguished from real teams and carry ONLY directly assigned people.
 * Called on migration/catalog commands/legacy restore, never on ordinary reads.
 */
export function ensureLeadershipUnits(data: UnitDirectory) {
  data.leadershipUnits ??= {};
  const used = new Set(data.teams.map((team) => team.id));
  let sequence = 1;
  for (const leader of data.leaders || []) {
    let id: string | undefined = ownValue(data.leadershipUnits, leader);
    if (!id) {
      do {
        id = "zz_leadership_" + sequence++;
      } while (used.has(id));
      used.add(id);
      data.leadershipUnits = { ...data.leadershipUnits, [leader]: id };
      data.teams.push({
        id,
        name: leader,
        lead: leader,
        excelCapacity: 0,
        catalog: true,
        kind: "leadership",
        managerName: ownValue(data.leaderManagers, leader) || "",
      });
      data.revisions["team:" + id] = (data.revisions["team:" + id] || 0) + 1;
    } else {
      const unit = data.teams.find((team) => team.id === id);
      if (!unit) throw Error("Liderlik kaynak birimi bulunamadı.");
      const manager = ownValue(data.leaderManagers, leader) || "";
      if (
        unit.name !== leader ||
        unit.lead !== leader ||
        (unit.managerName || "") !== manager
      ) {
        unit.name = leader;
        unit.lead = leader;
        unit.managerName = manager;
        data.revisions["team:" + id] = (data.revisions["team:" + id] || 0) + 1;
      }
      unit.kind = "leadership";
    }
  }
}
export function validateLeadershipUnits(
  data: Pick<Data, "teams" | "leaders" | "leadershipUnits">,
) {
  const ids = new Set<string>();
  for (const [leader, id] of Object.entries(data.leadershipUnits || {})) {
    const unit = data.teams.find((team) => team.id === id);
    if (
      !data.leaders?.includes(leader) ||
      !unit ||
      unit.lead !== leader ||
      ids.has(id)
    )
      throw Error("Geçersiz liderlik kaynak birimi.");
    ids.add(id);
  }
  for (const team of data.teams) {
    if (ids.has(team.id)) team.kind = "leadership";
    else delete team.kind;
  }
}
