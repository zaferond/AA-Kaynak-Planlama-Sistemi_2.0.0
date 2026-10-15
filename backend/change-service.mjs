import { stageChanges, planningCommand } from "./operations.mjs";

export async function changeAndView(store, user, changes, response = {}) {
  // Select the owned planning command and optional delta. Staging checks permissions,
  // revisions and monthly limits; Store validates the final draft before writing.
  const planningOnly =
    Array.isArray(changes) &&
    changes.length > 0 &&
    changes.every((change) => change?.kind === "allocation");
  return store.mutate(
    user,
    planningOnly
      ? planningCommand(changes)
      : (data, active) => stageChanges(data, active, changes),
    {
      returnView: true,
      planningDelta:
        planningOnly &&
        response.responseMode === "planning-delta-v1" &&
        Number.isSafeInteger(response.baseGeneration) &&
        response.baseGeneration >= 0
          ? {
              baseGeneration: response.baseGeneration,
              ids: changes.map((change) => change.id),
            }
          : undefined,
    },
  );
}
