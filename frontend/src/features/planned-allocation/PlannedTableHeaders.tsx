import { TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  TimelineMonthHead,
  TimelineYearRow,
} from "../../components/TimelineHeaders";
import type { PlannedAllocationProps } from "./types";
export default function PlannedTableHeaders({
  months,
  labelWidth,
  monthWidth,
  label,
}: Pick<PlannedAllocationProps, "months" | "labelWidth" | "monthWidth"> & {
  label: string;
}) {
  const years = months.map((month) => month.slice(0, 4));
  const uniqueYears = [...new Set(years)];
  return (
    <>
      <colgroup>
        <col style={{ width: labelWidth }} />
        {months.map((month) => (
          <col key={month} style={{ width: monthWidth }} />
        ))}
      </colgroup>
      <TableHeader>
        <TimelineYearRow years={years} />
        <TableRow>
          <TableHead>{label}</TableHead>
          {months.map((month) => (
            <TimelineMonthHead key={month} month={month} years={uniqueYears} />
          ))}
        </TableRow>
      </TableHeader>
    </>
  );
}
