import { DEFAULT_MONTHLY_HOURS } from "../../../../shared/actual-units.ts";
import {
  ACTUAL_FTE_TOLERANCE,
  type ActualMonthSummary,
} from "../../../../shared/actual-months.ts";

/** How much of a person's month is entered (projects + training) and how much
 * is left. One calculation for the "Kalan" field and the cell load bar. */
export function personMonthBalance(
  summary: Pick<
    ActualMonthSummary,
    "totalFte" | "capacityFte" | "effectiveHours"
  >,
) {
  const { totalFte, capacityFte, effectiveHours } = summary;
  const percent = capacityFte > 0 ? (totalFte / capacityFte) * 100 : 0;
  const unallocatedHours = effectiveHours - totalFte * DEFAULT_MONTHLY_HOURS;
  const remainingHours =
    Math.abs(unallocatedHours) < ACTUAL_FTE_TOLERANCE * DEFAULT_MONTHLY_HOURS
      ? 0
      : unallocatedHours;
  const remainingPercent =
    effectiveHours > 0 ? (remainingHours / effectiveHours) * 100 : 0;
  const state: "open" | "done" | "over" | "none" =
    effectiveHours <= 0
      ? "none"
      : remainingHours > 0
        ? "open"
        : remainingHours < 0
          ? "over"
          : "done";
  return { percent, remainingHours, remainingPercent, state };
}
