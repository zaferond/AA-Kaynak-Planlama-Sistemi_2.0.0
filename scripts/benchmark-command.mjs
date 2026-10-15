import { performance } from "node:perf_hooks";
import {
  applyChanges,
  planningCommand,
  stageChanges,
} from "../backend/operations.mjs";

// Keep the production planning command itself: wrapping it in a timer would
// lose its ownership marker and make Store measure the general draft again.
export function benchmarkCommand(
  changes,
  { mode = "production", validation = "single", observe } = {},
) {
  if (!["production", "callback"].includes(mode))
    throw Error("Expected --command=production or callback.");
  if (!["single", "double"].includes(validation))
    throw Error("Expected --validation=single or double.");
  if (mode === "production" && validation !== "single")
    throw Error("Double validation requires --command=callback.");
  if (
    mode === "production" &&
    Array.isArray(changes) &&
    changes.length > 0 &&
    changes.every((change) => change?.kind === "allocation")
  )
    return { command: planningCommand(changes), measuresDomain: false };
  const apply = validation === "single" ? stageChanges : applyChanges;
  return {
    measuresDomain: true,
    command(data, active) {
      const start = performance.now();
      try {
        return apply(data, active, changes);
      } finally {
        observe?.(performance.now() - start);
      }
    },
  };
}
