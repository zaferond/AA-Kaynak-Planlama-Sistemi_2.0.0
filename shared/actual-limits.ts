import type { Data } from "./model.ts";
import {
  createActualMonthIndex,
  exceedsActualCapacity,
} from "./actual-months.ts";

type LimitData = Pick<
  Data,
  | "resources"
  | "actualAllocations"
  | "actualWorkedHours"
  | "workCalendar"
  | "personCalendar"
>;

/** Check final write totals; historical reads and unrelated edits stay independent. */
export function assertActualMonthlyLimits(
  data: LimitData,
  selectedMonths?: Iterable<string>,
): void {
  const selected =
    selectedMonths === undefined ? undefined : new Set(selectedMonths);
  if (selected?.size === 0) return;
  const index = createActualMonthIndex(data);
  const months = selected ?? new Set(index.projectMonths());
  if (selectedMonths === undefined)
    for (const key of Object.keys(data.personCalendar || {})) {
      const [resourceId, date] = key.split("|");
      months.add(resourceId + "|" + date.slice(0, 7));
    }
  const resources = new Map(
    data.resources.map((resource) => [resource.id, resource]),
  );
  for (const key of months) {
    const [resourceId, month] = key.split("|");
    const resource = resources.get(resourceId);
    if (!resource) continue;
    const { totalFte, capacityFte } = index.get(resourceId, month);
    if (exceedsActualCapacity(totalFte, capacityFte))
      throw Object.assign(
        Error(
          resource.name +
            " · " +
            month +
            ": Proje dağılımı ve eğitim toplamı kişinin çalışma süresinin %100'ünü aşıyor. Lütfen dağılımı veya çalışma saatini kontrol edin.",
        ),
        { status: 400 },
      );
  }
}
