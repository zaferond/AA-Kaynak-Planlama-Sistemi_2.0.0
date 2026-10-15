import { entityCollections } from "../shared/entity-kinds.ts";
import { fail } from "./auth.mjs";

// Preconditions: the batch parser accepted project/resource kind and the
// orchestrator checked permissions, duplicates and revision. This module stages
// only its owned draft; Store retains final validation, SQL persistence and audit.
export function stageProjectResourceChange(d, { kind, id, value, operation }) {
  const c = entityCollections[kind];
  if (operation) {
    if (!d[c].some((x) => x.id === id)) fail(404, "Kayıt bulunamadı.");
    if (kind === "project") {
      for (const risk of d.risks || [])
        if (risk.projectId === id)
          d.revisions["risk:" + risk.id] =
            (d.revisions["risk:" + risk.id] || 0) + 1;
      d.risks = (d.risks || []).filter((risk) => risk.projectId !== id);
      for (const key of Object.keys(d.allocations))
        if (key.split("|")[1] === id) {
          delete d.allocations[key];
          d.revisions["allocation:" + key] =
            (d.revisions["allocation:" + key] || 0) + 1;
        }
      for (const key of Object.keys(d.actualAllocations || {}))
        if (key.split("|")[1] === id) {
          delete d.actualAllocations[key];
          d.revisions["actual:" + key] =
            (d.revisions["actual:" + key] || 0) + 1;
        }
      for (const key of Object.keys(d.actualPercentEntries || {}))
        if (key.split("|")[1] === id) delete d.actualPercentEntries[key];
      for (const key of Object.keys(d.legacyArchive?.allocations || {}))
        if (key.split("|")[1] === id) delete d.legacyArchive.allocations[key];
    }
    d[c] = d[c].filter((x) => x.id !== id);
    if (kind === "resource") {
      for (const key of Object.keys(d.actualAllocations || {}))
        if (key.split("|")[0] === id) {
          delete d.actualAllocations[key];
          delete d.actualPercentEntries?.[key];
          d.revisions["actual:" + key] =
            (d.revisions["actual:" + key] || 0) + 1;
        }
      for (const key of Object.keys(d.actualWorkedHours || {}))
        if (key.split("|")[0] === id) {
          delete d.actualWorkedHours[key];
          d.revisions["workedHours:" + key] =
            (d.revisions["workedHours:" + key] || 0) + 1;
        }
      for (const key of Object.keys(d.personCalendar || {}))
        if (key.split("|")[0] === id) {
          delete d.personCalendar[key];
          d.revisions["personDay:" + key] =
            (d.revisions["personDay:" + key] || 0) + 1;
        }
    }
  } else {
    if (!value || value.id !== id) fail(400, "Kimlik eşleşmiyor.");
    let nextValue = value;
    if (kind === "project" && value.sortOrder === undefined) {
      const previous = d.projects.find((p) => p.id === id);
      if (previous?.sortOrder !== undefined)
        nextValue = { ...value, sortOrder: previous.sortOrder };
      else if (!previous && d.projects.some((p) => p.sortOrder !== undefined))
        nextValue = {
          ...value,
          sortOrder:
            d.projects.reduce(
              (max, p) => Math.max(max, p.sortOrder ?? -1),
              -1,
            ) + 1,
        };
    }
    d[c] = [...d[c].filter((x) => x.id !== id), nextValue];
  }
}
