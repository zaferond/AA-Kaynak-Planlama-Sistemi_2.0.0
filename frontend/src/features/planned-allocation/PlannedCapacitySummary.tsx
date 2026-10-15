import { ChevronDown, Layers3 } from "lucide-react";
import { Table, TableBody } from "@/components/ui/table";
import PlannedTableHeaders from "./PlannedTableHeaders";
import PlannedSummaryRows from "./PlannedSummaryRows";
import { FilterSummaryChips } from "../workspace/WorkspaceFilterSummary";
import type { PlannedAllocationProps } from "./types";
export default function PlannedCapacitySummary(
  props: Pick<
    PlannedAllocationProps,
    | "showCapacity"
    | "onCapacityChange"
    | "capacityFilters"
    | "capacityTableRef"
    | "todayDate"
    | "months"
    | "labelWidth"
    | "monthWidth"
    | "teams"
    | "metric"
    | "projects"
    | "projectIds"
    | "projectTotals"
  >,
) {
  const {
    showCapacity,
    onCapacityChange,
    capacityFilters,
    capacityTableRef,
    todayDate,
    months,
    labelWidth,
    monthWidth,
  } = props;
  return (
    <details
      className="capacitystrip"
      open={showCapacity}
      onToggle={(e) => onCapacityChange(e.currentTarget.open)}
    >
      <summary>
        <span className="capacitystrip-icon" aria-hidden="true">
          <Layers3 size={18} />
        </span>
        <span className="capacitystrip-copy">
          <strong>Filtrelenen Takımlar Özet Raporu</strong>
          <span aria-label="Özet kaynak raporunda uygulanan filtreler">
            <FilterSummaryChips filters={capacityFilters} />
          </span>
        </span>
        <span className="capacitystrip-action" aria-hidden="true">
          {showCapacity ? "Detayı Gizle" : "Detayı Göster"}
          <ChevronDown size={17} />
        </span>
      </summary>
      {showCapacity && (
        <Table
          ref={capacityTableRef}
          todayDate={todayDate}
          todayMonthsKey={months.join("|")}
          className="matrix planning-grid allocation-grid"
          style={{
            width: labelWidth + months.length * monthWidth,
            minWidth: "100%",
          }}
        >
          <PlannedTableHeaders
            months={months}
            labelWidth={labelWidth}
            monthWidth={monthWidth}
            label=""
          />
          <TableBody>
            <PlannedSummaryRows {...props} selectedReport />
          </TableBody>
        </Table>
      )}
    </details>
  );
}
