import type { Change } from "../../../shared/commands.ts";
import type { Data } from "../../../shared/model.ts";
import type { ActualUnit } from "../../../shared/actual-units.ts";
import {
  actualInputToFte,
  fteToActualInput,
  DEFAULT_MONTHLY_HOURS,
  MAX_RECORDED_MONTHLY_HOURS,
} from "../../../shared/actual-units.ts";
import {
  createActualMonthIndex,
  exceedsActualCapacity,
  type ActualMonthSummary,
} from "../../../shared/actual-months.ts";
import { validPlanningMonth } from "../../../shared/planning-dates.ts";

export type ActualEntry = { unit: ActualUnit; value: number };
type EntryResult =
  | { kind: "valid"; entry: ActualEntry }
  | { kind: "invalid"; message: string }
  | { kind: "limit" };

export function checkActualEntry(
  text: string,
  unit: ActualUnit,
  month: string,
  workedHours: number | undefined,
  otherAllocated: number,
): EntryResult {
  const raw = text.trim() === "" ? 0 : Number(text.trim().replace(",", "."));
  if (!Number.isFinite(raw) || raw < 0)
    return { kind: "invalid", message: "Sıfır veya pozitif bir sayı girin." };
  const amount = actualInputToFte(raw, unit, month, workedHours);
  const capacity = actualInputToFte(100, "percent", month, workedHours);
  if (
    (unit === "percent" && raw > 100) ||
    !Number.isFinite(amount) ||
    amount > 100 ||
    exceedsActualCapacity(otherAllocated + amount, capacity)
  )
    return { kind: "limit" };
  return { kind: "valid", entry: { unit, value: raw } };
}

export function parseWorkedHoursInput(
  text: string,
  maxHours = MAX_RECORDED_MONTHLY_HOURS,
): number | null {
  const hours =
    text.trim() === "" ? null : Number(text.trim().replace(",", "."));
  if (
    hours !== null &&
    (!Number.isFinite(hours) || hours < 0 || hours > maxHours)
  )
    throw Error(
      `0–${maxHours.toLocaleString("tr-TR", { maximumFractionDigits: 2 })} saat arasında bir değer girin.`,
    );
  return hours;
}

export function formatActualEntry(
  value: number,
  unit: ActualUnit,
  month: string,
  workedHours?: number,
  savedPercent?: number,
): string {
  const input =
    unit === "percent" && savedPercent !== undefined
      ? savedPercent
      : fteToActualInput(value, unit, month, workedHours);
  return input ? String(Math.round(input * 100) / 100).replace(".", ",") : "";
}

function assertResourceMonth(data: Data, resourceId: string, month: string) {
  if (!validPlanningMonth(month)) throw Error("Geçerli bir ay seçin.");
  if (!data.resources.some((resource) => resource.id === resourceId))
    throw Error(
      "Çalışan kaynak bulunamadı. Verileri yenileyip tekrar deneyin.",
    );
}

export function prepareActualAllocationChange(
  data: Data,
  resourceId: string,
  projectId: string,
  month: string,
  entry: ActualEntry,
  monthSummary?: ActualMonthSummary,
): Change<"actual"> {
  assertResourceMonth(data, resourceId, month);
  const project = data.projects.find((project) => project.id === projectId);
  if (!project)
    throw Error("Proje bulunamadı. Verileri yenileyip tekrar deneyin.");
  if (entry.value > 0 && (month < project.start || month > project.end))
    throw Error("Proje tarihleri dışında kaynak dağılımı girilemez.");
  const id = resourceId + "|" + projectId + "|" + month;
  // Peer calendars stay private; their authorized monthly summary owns capacity.
  const summary =
    monthSummary ?? createActualMonthIndex(data).get(resourceId, month);
  const checked = checkActualEntry(
    String(entry.value),
    entry.unit,
    month,
    summary.effectiveHours,
    summary.totalFte - (data.actualAllocations?.[id] || 0),
  );
  if (checked.kind === "invalid") throw Error(checked.message);
  if (checked.kind === "limit")
    throw Error(
      "Proje dağılımı ve eğitim toplamı kişinin çalışma süresinin %100'ünü aşıyor.",
    );
  return {
    kind: "actual",
    id,
    value: checked.entry,
    revision: data.revisions["actual:" + id] || 0,
  };
}

/** The UI edits net hours; the stored value includes marked holidays and leave. */
export function prepareWorkedHoursChange(
  data: Data,
  resourceId: string,
  month: string,
  hours: number | null,
  monthSummary?: ActualMonthSummary,
): Change<"workedHours"> {
  assertResourceMonth(data, resourceId, month);
  const summary =
    monthSummary ?? createActualMonthIndex(data).get(resourceId, month);
  const checkedHours = parseWorkedHoursInput(
    hours === null ? "" : String(hours),
    summary.maxEffectiveHours,
  );
  const nextHours = checkedHours ?? summary.autoHours;
  if (
    exceedsActualCapacity(summary.totalFte, nextHours / DEFAULT_MONTHLY_HOURS)
  )
    throw Error(
      "Mevcut proje dağılımları ve eğitim toplamı yeni çalışma saatinin %100'ünü aşıyor.",
    );
  const id = resourceId + "|" + month;
  return {
    kind: "workedHours",
    id,
    value:
      checkedHours === null ? null : checkedHours + summary.nonWorkingHours,
    revision: data.revisions["workedHours:" + id] || 0,
  };
}
