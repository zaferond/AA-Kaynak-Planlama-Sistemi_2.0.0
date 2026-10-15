import type { Data } from "./model.ts";
import { DEFAULT_MONTHLY_HOURS, personMonthHours } from "./actual-units.ts";

export type ActualMonthData = Pick<
  Data,
  "actualAllocations" | "actualWorkedHours" | "workCalendar" | "personCalendar"
>;
export const ACTUAL_FTE_TOLERANCE = 1e-9;
export const exceedsActualCapacity = (total: number, capacity: number) =>
  total > capacity + ACTUAL_FTE_TOLERANCE;

/** Build once per snapshot. Project filters never reduce a person's allocated total. */
export function createActualMonthIndex(data: ActualMonthData) {
  const projects = new Map<string, number>();
  for (const [key, value] of Object.entries(data.actualAllocations || {})) {
    const [resourceId, , month] = key.split("|");
    const personMonth = resourceId + "|" + month;
    projects.set(personMonth, (projects.get(personMonth) || 0) + value);
  }
  function calculate(resourceId: string, month: string) {
    const key = resourceId + "|" + month;
    const hours = personMonthHours(
      month,
      resourceId,
      data.actualWorkedHours?.[key],
      data.workCalendar,
      data.personCalendar,
    );
    const projectFte = projects.get(key) || 0;
    const trainingFte = hours.trainingHours / DEFAULT_MONTHLY_HOURS;
    return {
      ...hours,
      projectFte,
      trainingFte,
      totalFte: projectFte + trainingFte,
      capacityFte: hours.effectiveHours / DEFAULT_MONTHLY_HOURS,
    } as const;
  }
  const cache = new Map<string, ReturnType<typeof calculate>>();
  return {
    projectMonths() {
      return projects.keys();
    },
    get(resourceId: string, month: string) {
      const key = resourceId + "|" + month;
      let result = cache.get(key);
      if (!result) {
        result = calculate(resourceId, month);
        cache.set(key, result);
      }
      return result;
    },
  };
}

export type ActualMonthSummary = ReturnType<
  ReturnType<typeof createActualMonthIndex>["get"]
>;
