import { directoryResponsibilityIndex } from "../../../shared/resource-roles.ts";
import { ownValue } from "../../../shared/records.ts";
import type { Data, Team } from "../model.ts";
import type { PickerItem } from "../components/FilterPicker";

/** Names, hierarchy metadata and derived managers stay identical in all pickers. */
export function organizationPickerItems(
  data: Data,
  leaders: readonly PickerItem[],
  teams: readonly Team[],
  date: string,
) {
  const responsibility = directoryResponsibilityIndex(data, date);
  return {
    leaders: leaders.map((item) => ({
      ...item,
      description: ownValue(responsibility.leaders, item.id),
    })),
    teams: teams.map((team) => ({
      ...team,
      description:
        team.kind === "leadership"
          ? ownValue(responsibility.leaders, team.lead)
          : ownValue(responsibility.teams, team.id),
    })),
  };
}
