import { fold, type Team, type Data } from "./model.ts";
import { ownValue } from "./records.ts";

export const DIRECTORY_REVISION_KEY = "directory:shared";
export const directoryRevision = (data: Pick<Data, "revisions">) =>
  data.revisions[DIRECTORY_REVISION_KEY] || 0;

/** Only catalog values invalidate a leadership draft; source order is immaterial. */
export function directoryCatalogChanged(before: Data, after: Data) {
  const snapshot = (data: Data) =>
    JSON.stringify({
      leaders: [...(data.leaders || [])]
        .sort()
        .map((name) => [
          name,
          ownValue(data.leaderManagers, name) || "",
          ownValue(data.leaderParents, name) || "",
          ownValue(data.leadershipUnits, name) || "",
        ]),
      teams: [...data.teams]
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((team) => [
          team.id,
          team.name,
          team.lead,
          team.managerName || "",
          team.excelCapacity,
          !!team.catalog,
        ]),
    });
  return snapshot(before) !== snapshot(after);
}

const nameKey = (name: string) => fold(name.trim());

export function assertUniqueLeaderName(
  leaders: readonly string[],
  name: string,
  previousName?: string,
) {
  if (
    leaders.some(
      (leader) => leader !== previousName && nameKey(leader) === nameKey(name),
    )
  )
    throw Error("Bu isimde bir liderlik zaten var.");
}

export function assertUniqueTeamName(teams: readonly Team[], team: Team) {
  if (
    teams.some(
      (other) =>
        other.id !== team.id &&
        other.lead === team.lead &&
        nameKey(other.name) === nameKey(team.name),
    )
  )
    throw Error("Bu liderlik altında aynı isimde bir takım zaten var.");
}
