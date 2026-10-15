import { useMemo } from "react";
import type { WorkCalendar } from "../../actual-units";
import type { WorkCalendarDialogProps } from "./types";
import {
  sharedCalendarRanges,
  personalCalendarRanges,
} from "./calendar-ranges";

export function useWorkCalendarView({
  data,
  resource,
  year,
  calendar,
}: Pick<WorkCalendarDialogProps, "data" | "resource"> & {
  year: number;
  calendar: WorkCalendar;
}) {
  const entries = useMemo(
    () =>
      sharedCalendarRanges(calendar).filter((range) =>
        range.keys.some((date) => date.startsWith(String(year) + "-")),
      ),
    [calendar, year],
  );
  const personalEntries = useMemo(
    () =>
      resource
        ? personalCalendarRanges(
            resource.id,
            data.personCalendar || {},
            calendar,
          ).filter((range) =>
            range.keys.some((key) => key.split("|")[1].startsWith(year + "-")),
          )
        : [],
    [data.personCalendar, resource?.id, calendar, year],
  );
  return { entries, personalEntries };
}
export type WorkCalendarView = ReturnType<typeof useWorkCalendarView>;
