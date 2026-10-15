// Store.read builds these maps from numeric SQL columns. Their values cannot
// share mutable children; copying their own fields is enough to isolate edits.
export const numericSnapshotMaps = Object.freeze([
  "allocations",
  "actualAllocations",
  "actualWorkedHours",
  "actualPercentEntries",
  "revisions",
]);

function copyNumericMaps(data, keys) {
  const maps = {};
  for (const key of keys) {
    if (!Object.hasOwn(data, key)) continue;
    const map = data[key];
    // Preserve full structuredClone behaviour for unexpected/invalid inputs.
    // Validation still decides whether the resulting model may be committed.
    if (
      !map ||
      (Object.getPrototypeOf(map) !== Object.prototype &&
        Object.getPrototypeOf(map) !== null)
    )
      return null;
    const copy = {};
    for (const id in map) {
      if (!Object.hasOwn(map, id)) continue;
      const value = map[id];
      if (typeof value !== "number") return null;
      if (id === "__proto__")
        Object.defineProperty(copy, id, {
          value,
          enumerable: true,
          writable: true,
          configurable: true,
        });
      else copy[id] = value;
    }
    maps[key] = copy;
  }
  return maps;
}

export function cloneMutationSnapshot(data) {
  const maps = copyNumericMaps(data, numericSnapshotMaps);
  if (!maps) return structuredClone(data);
  const nested = { ...data };
  for (const key of Object.keys(maps)) delete nested[key];
  return { ...structuredClone(nested), ...maps };
}

// The owned planning command changes only these two numeric maps. Other fresh
// SQL snapshot values are shared read-only; full validation clones/normalizes
// them before persistence. Never use this draft for arbitrary mutation callbacks.
export function clonePlanningMutationDraft(data) {
  const maps = copyNumericMaps(data, ["allocations", "revisions"]);
  return maps ? { ...data, ...maps } : structuredClone(data);
}
