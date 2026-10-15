import type { Data } from "./model.ts";
import { invalidSnapshot as bad } from "./snapshot-validation-error.ts";
import { parseAllocationKey } from "./allocation-key.ts";
import { validPlanningMonth } from "./planning-dates.ts";
import {
  actualInputToFte,
  createPersonMonthHoursIndex,
} from "./actual-units.ts";

export function validateSnapshotAllocations(
  d: Data,
  teamIds: ReadonlySet<string>,
  projectsById: ReadonlyMap<string, Data["projects"][number]>,
  resourcesById: ReadonlyMap<string, Data["resources"][number]>,
) {
  for (const k of Object.keys(d.allocations)) {
    const n = d.allocations[k];
    const parts = parseAllocationKey(k);
    if (!parts || !teamIds.has(parts[0])) throw bad("Geçersiz dağıtım kaydı.");
    const [, p, m] = parts;
    const pr = projectsById.get(p);
    if (!pr || (n > 0 && (m < pr.start || m > pr.end)))
      throw bad("Proje tarihleri dışında kaynak dağıtımı var.");
  }
  d.actualAllocations ??= {};
  for (const k of Object.keys(d.actualAllocations)) {
    const n = d.actualAllocations[k];
    const parts = parseAllocationKey(k);
    if (!parts) throw bad("Geçersiz gerçekleşen dağılım kaydı.");
    const [resourceId, projectId, month] = parts;
    const resource = resourcesById.get(resourceId),
      project = projectsById.get(projectId);
    if (
      !resource ||
      !project ||
      (n > 0 && (month < project.start || month > project.end))
    )
      throw bad("Geçersiz gerçekleşen dağılım kaydı.");
  }
  d.actualWorkedHours ??= {};
  for (const key of Object.keys(d.actualWorkedHours)) {
    const [resourceId, month, ...extra] = key.split("|");
    if (
      extra.length ||
      !resourcesById.has(resourceId) ||
      !validPlanningMonth(month)
    )
      throw bad("Geçersiz çalışılan saat kaydı.");
  }
  d.actualPercentEntries ??= {};
  const personHours = createPersonMonthHoursIndex(d);
  for (const key of Object.keys(d.actualPercentEntries)) {
    const percent = d.actualPercentEntries[key];
    const parts = parseAllocationKey(key);
    if (!parts) throw bad("Geçersiz yüzde dağılımı kaydı.");
    const [resourceId, projectId, month] = parts;
    if (
      !resourcesById.has(resourceId) ||
      !projectsById.has(projectId) ||
      d.actualAllocations[key] === undefined
    )
      throw bad("Geçersiz yüzde dağılımı kaydı.");
    const hours = personHours.get(resourceId, month).effectiveHours;
    const expected = actualInputToFte(percent, "percent", month, hours);
    if (Math.abs(expected - d.actualAllocations[key]) > 1e-8)
      throw bad("Yüzde dağılımı çalışılan saatlerle eşleşmiyor.");
  }
}
