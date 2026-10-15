import { z } from "zod";
import { HOURS_PER_WORKDAY } from "./actual-units.ts";
import { validPlanningDate } from "./planning-dates.ts";
import type { CalendarRange } from "./actual-units.ts";

export function rangeContainsDate(
  range: CalendarRange | undefined,
  date: string,
  exclusive = false,
) {
  return (
    !range ||
    (date >= range.from && (exclusive ? date < range.to : date <= range.to))
  );
}

export const PERSONAL_HOURS_STEP = 0.5;
const hours = z
  .number()
  .finite()
  .min(PERSONAL_HOURS_STEP)
  .max(HOURS_PER_WORKDAY)
  .multipleOf(PERSONAL_HOURS_STEP);
const date = z.string().refine(validPlanningDate, "Geçersiz aralık tarihi.");
const rangeFields = { from: date, to: date };
const duration = (range: { from: string; to: string }) =>
  (Date.parse(range.to + "T12:00:00Z") -
    Date.parse(range.from + "T12:00:00Z")) /
  86400000;
const calendarRangeSchema = z
  .object(rangeFields)
  .strict()
  .refine(
    (range) => range.to >= range.from && duration(range) < 62,
    "Çalışma dışı tarih aralığı geçersiz.",
  );
const personalRangeSchema = z
  .object({ ...rangeFields, hours })
  .strict()
  .refine(
    (range) => range.to > range.from && duration(range) <= 366,
    "İzin/eğitim aralığı geçersiz.",
  );
export const calendarDaySchema = z
  .object({
    type: z.enum(["official", "religious", "company"]),
    label: z.string().trim().min(1).max(100),
    fraction: z.union([z.literal(0.5), z.literal(1)]),
    range: calendarRangeSchema.optional(),
  })
  .strict();
export const personDaySchema = z
  .object({
    type: z.enum(["leave", "training"]),
    hours,
    label: z.string().trim().max(100),
    range: personalRangeSchema.optional(),
  })
  .strict();
