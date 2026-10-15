import React, { useRef } from "react";
import {
  useWindowedSections,
  type WindowedSection,
} from "../workspace/useWindowedSections";
import { CalendarDays } from "lucide-react";
import type { Data, Project, Resource } from "../../model";
import { phaseChipStyle } from "../../phase-chip";
import { ACTUAL_FTE_TOLERANCE } from "../../../../shared/actual-months.ts";
import { ActualAmount as Amount } from "../ActualAllocationInputs";
import ProjectResponsible from "../../ProjectResponsible";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  DEFAULT_MONTHLY_HOURS,
  workdaysInMonth,
  type ActualUnit,
} from "../../actual-units";
import { fullMonthFormat, numberFormat } from "./format";
import type { ActualAllocationView } from "./useActualAllocationView";
import type { ActualCapacityDialog } from "./useActualCapacityDialog";
import type {
  ActualAllocationSave,
  ActualCellSelection,
  ActualPhaseDetail,
} from "./types";

export default function ActualAllocationTable({
  data,
  projects,
  months,
  currentMonth,
  todayDate,
  unit,
  view,
  selectedCell,
  selectHoursContext,
  clearSelection,
  save,
  canEditPersonMonth,
  canViewPersonalCalendar,
  openLimit,
  onPhaseDetail,
  onOpenPersonalCalendar,
}: {
  data: Data;
  projects: Project[];
  months: string[];
  currentMonth: string;
  todayDate: string;
  unit: ActualUnit;
  view: ActualAllocationView;
  selectedCell: ActualCellSelection | null;
  selectHoursContext: (resourceId: string, month: string, key: string) => void;
  clearSelection: () => void;
  save: ActualAllocationSave;
  canEditPersonMonth: (id: string, month: string) => boolean;
  canViewPersonalCalendar: (id: string) => boolean;
  openLimit: ActualCapacityDialog["openLimit"];
  onPhaseDetail: (detail: ActualPhaseDetail) => void;
  onOpenPersonalCalendar: (resource: Resource) => void;
}) {
  const monthWidth = 76;
  const { people, eligible, groups, years, actualMonths, personMonthTotals } =
    view;
  const calendarTotals = (resourceId: string, month: string) =>
    actualMonths.get(resourceId, month);
  const effectiveHours = (resourceId: string, month: string) =>
    actualMonths.get(resourceId, month).effectiveHours;
  function amountFor(resource: Resource, project: Project, month: string) {
    return (
      data.actualAllocations?.[resource.id + "|" + project.id + "|" + month] ||
      0
    );
  }
  const tableRef = useRef<HTMLTableElement>(null);
  const chunkSize = Math.max(
    4,
    Math.min(20, Math.floor(200 / Math.max(1, months.length))),
  );
  const sections: WindowedSection[] = groups.flatMap((group) => {
    const project = projects[group.outer];
    const parts = Math.max(1, Math.ceil(group.inners.length / chunkSize));
    const headingKey = project.id + ":" + (group.inners[0] ?? "empty");
    return Array.from({ length: parts }, (_, part) => {
      const chunk = group.inners.slice(
        part * chunkSize,
        (part + 1) * chunkSize,
      );
      const first = part === 0;
      const key = project.id + ":" + (chunk[0] ?? "empty");
      return {
        key,
        headingKey,
        height: (first ? 80 : 0) + chunk.length * 80,
        render: () => (
          <TableBody
            key={key}
            data-window-key={key}
            className="project-row-group"
            data-project-group={project.id}
          >
            {first && (
              <TableRow
                className="group actual-project-group project-freeze-row"
                data-project-heading={project.id}
              >
                <TableCell className="actual-project-name">
                  <strong>{project.name}</strong>
                  <ProjectResponsible project={project} />
                  <span>
                    {project.start} — {project.end}
                  </span>
                </TableCell>
                {months.map((month) => {
                  const text =
                    month >= project.start && month <= project.end
                      ? project.phases[month]?.trim()
                      : "";
                  return (
                    <TableCell key={month} className="actual-phase-cell">
                      {text ? (
                        <button
                          type="button"
                          className="actual-phase-button phase-chip"
                          style={phaseChipStyle(project, month)}
                          title={text}
                          aria-label={
                            project.name + " / " + month + " aşaması: " + text
                          }
                          onClick={() => onPhaseDetail({ project, month })}
                        >
                          {text}
                        </button>
                      ) : month >= project.start && month <= project.end ? (
                        <span
                          className="phase-chip"
                          data-phase-empty="true"
                          title="Aşama girilmemiş"
                        >
                          -
                        </span>
                      ) : null}
                    </TableCell>
                  );
                })}
              </TableRow>
            )}
            {people.length > 0 &&
              chunk.map((index) => {
                const resource = people[index];
                return (
                  <React.Fragment key={project.id + "|" + resource.id}>
                    <TableRow>
                      <TableCell className="rowname">
                        <div className="actual-person-label">
                          <span className="person-calendar-slot">
                            {canViewPersonalCalendar(resource.id) && (
                              <button
                                type="button"
                                className="person-calendar-trigger"
                                aria-label={
                                  resource.name + " izin ve eğitim takvimini aç"
                                }
                                title={
                                  resource.name + " · izin ve eğitim takvimi"
                                }
                                onClick={() => {
                                  onOpenPersonalCalendar(resource);
                                }}
                              >
                                <CalendarDays size={15} />
                              </button>
                            )}
                          </span>
                          <span className="indent" aria-hidden="true">
                            ↳
                          </span>
                          <span className="actual-person-name">
                            {resource.name}
                          </span>
                        </div>
                      </TableCell>
                      {months.map((month) => {
                        const key =
                          resource.id + "|" + project.id + "|" + month;
                        const amount = amountFor(resource, project, month);
                        const selectable =
                          month <= currentMonth &&
                          eligible.has(resource.id + "|" + month) &&
                          month >= project.start &&
                          month <= project.end;
                        return (
                          <TableCell
                            key={month}
                            data-actual-context-cell={
                              selectable ? "true" : undefined
                            }
                            className={
                              [
                                amount > 0 ? "has-entry" : "",
                                !canEditPersonMonth(resource.id, month)
                                  ? "actual-cell-readonly"
                                  : "",
                                selectedCell?.key === key
                                  ? "actual-context-selected"
                                  : "",
                              ]
                                .filter(Boolean)
                                .join(" ") || undefined
                            }
                            onClick={() => {
                              if (selectable)
                                selectHoursContext(resource.id, month, key);
                            }}
                            onFocusCapture={() => {
                              if (selectable)
                                selectHoursContext(resource.id, month, key);
                            }}
                          >
                            <Amount
                              value={amount}
                              month={month}
                              unit={unit}
                              workedHours={effectiveHours(resource.id, month)}
                              savedPercent={data.actualPercentEntries?.[key]}
                              otherAllocated={
                                (personMonthTotals[resource.id + "|" + month] ||
                                  0) - amount
                              }
                              fullyAllocated={
                                (personMonthTotals[resource.id + "|" + month] ||
                                  0) >=
                                actualMonths.get(resource.id, month)
                                  .capacityFte -
                                  ACTUAL_FTE_TOLERANCE
                              }
                              disabled={
                                !selectable ||
                                !canEditPersonMonth(resource.id, month)
                              }
                              onLimitExceeded={(input) =>
                                openLimit("allocation", input)
                              }
                              onDeselect={() => clearSelection()}
                              label={
                                resource.name +
                                " / " +
                                project.name +
                                " / " +
                                month
                              }
                              onSave={(amount) =>
                                save(resource, project, month, amount)
                              }
                            />
                          </TableCell>
                        );
                      })}
                    </TableRow>
                    <TableRow className="actual-person-total">
                      <TableCell
                        className="rowname"
                        title={
                          resource.name +
                          (unit === "hours"
                            ? " · aylık çalışma − tüm projeler ve eğitim süresi"
                            : " · projeler ve eğitim toplamı")
                        }
                      >
                        <span className="indent">↳</span>
                        {unit === "hours"
                          ? "Kalan Aylık Çalışma Saati"
                          : "Dağıtılan Kaynak %'si"}
                      </TableCell>
                      {months.map((month) => {
                        const allocated =
                          personMonthTotals[resource.id + "|" + month] || 0;
                        const summary = actualMonths.get(resource.id, month);
                        const monthlyCapacity = summary.capacityFte;
                        const unallocatedHours =
                          summary.effectiveHours -
                          allocated * DEFAULT_MONTHLY_HOURS;
                        const remainingHours =
                          Math.abs(unallocatedHours) <
                          ACTUAL_FTE_TOLERANCE * DEFAULT_MONTHLY_HOURS
                            ? 0
                            : unallocatedHours;
                        const percent =
                          monthlyCapacity > 0
                            ? (allocated / monthlyCapacity) * 100
                            : 0;
                        const visible = eligible.has(resource.id + "|" + month);
                        const key = resource.id + "|total|" + month;
                        return (
                          <TableCell
                            key={month}
                            data-actual-context-cell={
                              visible ? "true" : undefined
                            }
                            className={
                              [
                                visible && percent >= 100 - 1e-8
                                  ? "actual-total-full"
                                  : "",
                                selectedCell?.key === key
                                  ? "actual-context-selected"
                                  : "",
                              ]
                                .filter(Boolean)
                                .join(" ") || undefined
                            }
                            onClick={() => {
                              if (visible)
                                selectHoursContext(resource.id, month, key);
                            }}
                            title={
                              unit === "hours"
                                ? `${resource.name} · ${month} · ${numberFormat.format(summary.effectiveHours)} saat aylık çalışma − ${numberFormat.format(summary.projectFte * DEFAULT_MONTHLY_HOURS)} saat proje dağılımı − ${numberFormat.format(summary.trainingHours)} saat eğitim = ${numberFormat.format(remainingHours)} saat kalan`
                                : resource.name +
                                  " · " +
                                  month +
                                  " · projeler ve " +
                                  numberFormat.format(
                                    calendarTotals(resource.id, month)
                                      .trainingHours,
                                  ) +
                                  " saat eğitim"
                            }
                          >
                            {visible
                              ? unit === "hours"
                                ? numberFormat.format(remainingHours)
                                : "%" + numberFormat.format(percent)
                              : "—"}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  </React.Fragment>
                );
              })}
          </TableBody>
        ),
      };
    });
  });
  const windowedRows = useWindowedSections(
    tableRef,
    sections,
    months.length + 1,
    view.scopeKey + ":" + view.visiblePage,
  );
  return (
    <Table
      ref={tableRef}
      stickyProjectRows
      todayDate={todayDate}
      todayMonthsKey={months.join("|")}
      className="matrix planning-grid allocation-grid"
      style={{ width: 200 + months.length * monthWidth }}
    >
      <colgroup>
        <col style={{ width: 200 }} />
        {months.map((month) => (
          <col key={month} style={{ width: monthWidth }} />
        ))}
      </colgroup>
      <TableHeader>
        <TableRow className="yearrow">
          <TableHead>Yıl</TableHead>
          {years.map((year, index) => (
            <TableHead
              key={year}
              colSpan={months.filter((month) => month.startsWith(year)).length}
              className={"year-band-" + (index % 6)}
            >
              {year}
            </TableHead>
          ))}
        </TableRow>
        <TableRow>
          <TableHead>Proje / Kişi</TableHead>
          {months.map((month) => (
            <TableHead
              key={month}
              data-month={month}
              className={
                "monthhead year-band-" + (years.indexOf(month.slice(0, 4)) % 6)
              }
              title={
                month +
                " · " +
                workdaysInMonth(month) +
                " hafta içi gün · ortak takvime göre saat hesabı"
              }
            >
              <span>
                {fullMonthFormat.format(new Date(month + "-01T12:00:00"))}
              </span>
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      {windowedRows}
    </Table>
  );
}
