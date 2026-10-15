import { withVersion, type Resource } from "./model.ts";
import { validPlanningDate } from "./planning-dates.ts";
import { assertResourceDates } from "./resource-policy.ts";

/** The latest recorded status identifies a vacancy, never a former vacancy now filled. */
export function activePostingVersion(resource: Resource) {
  const latest = [...resource.versions]
    .sort((a, b) => a.effective.localeCompare(b.effective))
    .at(-1);
  return latest?.status === "Aktif İlan" ? latest : undefined;
}

/** Update the vacancy period; earlier employee/status history is retained. */
export function withActivePostingPlanning(
  resource: Resource,
  included: boolean,
  today: string,
): Resource {
  const previous = activePostingVersion(resource);
  if (!previous) return resource;
  if (!validPlanningDate(today)) throw Error("Geçerli bir gün seçin.");
  const version = {
    ...previous,
    included,
    start: included ? today : "",
    // A future vacancy must also become effective now to contribute from today.
    effective:
      included && previous.effective > today.slice(0, 7)
        ? today.slice(0, 7)
        : previous.effective,
  };
  assertResourceDates(version);
  return withVersion(
    {
      ...resource,
      versions: resource.versions.filter(
        (v) => v.effective !== previous.effective,
      ),
    },
    version,
  );
}
