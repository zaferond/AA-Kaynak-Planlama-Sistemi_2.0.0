import {
  activePostingVersion,
  withActivePostingPlanning,
} from "../../../../shared/active-posting-planning.ts";
import type { Change } from "../../../../shared/commands.ts";
import type { Data } from "../../model.ts";

/** One revision-aware batch across all vacancies, independent of report filters. */
export function activePostingPlanningChanges(
  data: Data,
  included: boolean,
  today: string,
): Change<"resource">[] {
  return data.resources.flatMap((resource) => {
    const version = activePostingVersion(resource);
    if (
      !version ||
      (version.included === included &&
        version.start === (included ? today : "") &&
        (!included || version.effective <= today.slice(0, 7)))
    )
      return [];
    return [
      {
        kind: "resource",
        id: resource.id,
        revision: data.revisions["resource:" + resource.id] || 0,
        value: withActivePostingPlanning(resource, included, today),
      },
    ];
  });
}
