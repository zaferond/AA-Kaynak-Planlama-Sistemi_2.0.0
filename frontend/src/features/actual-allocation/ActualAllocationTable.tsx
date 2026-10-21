import React, { useRef } from "react";
import {
  useWindowedSections,
  type WindowedSection,
} from "../workspace/useWindowedSections";
import { CalendarDays, ChevronDown, ChevronRight } from "lucide-react";
import type { Data, Project, Resource } from "../../model";
import { actualVersionAt } from "../../model";
import { addableProjects } from "./person-layout";
import {
  phaseChipStyle,
  phaseRunKey,
  phaseRunParts,
  phaseRunSpans,
} from "../../phase-chip";
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
import { personMonthBalance } from "./person-month-balance";
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
  personControls,
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
  personControls: {
    collapsed: ReadonlySet<string>;
    onToggle: (personId: string) => void;
    onAdd: (personId: string, projectId: string) => void;
  };
}) {
  const monthWidth = 76;
  // Person rows carry a name, team and picker; give names room to read.
  const labelWidth = view.layout === "person" ? 260 : 200;
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
  /** Person-month total across all projects; drawn as a load bar under each
   * entry cell instead of a separate row per person. */
  function personMonthLoad(resource: Resource, month: string) {
    const summary = actualMonths.get(resource.id, month);
    const { percent, remainingHours, remainingPercent } = personMonthBalance({
      ...summary,
      totalFte: personMonthTotals[resource.id + "|" + month] || 0,
    });
    const hours = unit === "hours";
    return {
      percent,
      full: percent >= 100 - 1e-8,
      label: hours ? "Kalan Aylık Çalışma Saati" : "Dağıtılan Kaynak %'si",
      value: hours
        ? numberFormat.format(remainingHours)
        : "%" + numberFormat.format(percent),
      title: hours
        ? `${resource.name} · ${month} · ${numberFormat.format(summary.effectiveHours)} saat aylık çalışma − ${numberFormat.format(summary.projectFte * DEFAULT_MONTHLY_HOURS)} saat proje dağılımı − ${numberFormat.format(summary.trainingHours)} saat eğitim = ${numberFormat.format(remainingHours)} saat kalan`
        : resource.name +
          " · " +
          month +
          " · projeler ve " +
          numberFormat.format(
            calendarTotals(resource.id, month).trainingHours,
          ) +
          " saat eğitim",
      // Shown only in the tooltip; data-detail stays the stable description.
      remaining: hours
        ? ""
        : " · Kalan %" + numberFormat.format(remainingPercent),
    };
  }
  /** One entry cell; shared by both layouts so saving, permissions and the
   * capacity checks are identical. The load bar is only drawn where no
   * person row shows the month total. */
  function entryCell(
    resource: Resource,
    project: Project,
    month: string,
    withLoad: boolean,
  ) {
    const key = resource.id + "|" + project.id + "|" + month;
    const amount = amountFor(resource, project, month);
    const selectable =
      month <= currentMonth &&
      eligible.has(resource.id + "|" + month) &&
      month >= project.start &&
      month <= project.end;
    return (
      <TableCell
        key={month}
        data-actual-context-cell={selectable ? "true" : undefined}
        className={
          [
            amount > 0 ? "has-entry" : "",
            !canEditPersonMonth(resource.id, month)
              ? "actual-cell-readonly"
              : "",
            selectedCell?.key === key ? "actual-context-selected" : "",
          ]
            .filter(Boolean)
            .join(" ") || undefined
        }
        onClick={() => {
          if (selectable) selectHoursContext(resource.id, month, key);
        }}
        onFocusCapture={() => {
          if (selectable) selectHoursContext(resource.id, month, key);
        }}
      >
        <Amount
          value={amount}
          month={month}
          unit={unit}
          workedHours={effectiveHours(resource.id, month)}
          savedPercent={data.actualPercentEntries?.[key]}
          otherAllocated={
            (personMonthTotals[resource.id + "|" + month] || 0) - amount
          }
          fullyAllocated={
            (personMonthTotals[resource.id + "|" + month] || 0) >=
            actualMonths.get(resource.id, month).capacityFte -
              ACTUAL_FTE_TOLERANCE
          }
          disabled={!selectable || !canEditPersonMonth(resource.id, month)}
          onLimitExceeded={(input) => openLimit("allocation", input)}
          onDeselect={() => clearSelection()}
          label={resource.name + " / " + project.name + " / " + month}
          onSave={(amount) => save(resource, project, month, amount)}
        />
        {withLoad &&
          eligible.has(resource.id + "|" + month) &&
          (() => {
            const load = personMonthLoad(resource, month);
            return (
              <span
                className={
                  "actual-cell-load" + (load.full ? " actual-total-full" : "")
                }
                role="img"
                aria-label={load.label + ": " + load.value}
                title={
                  load.label +
                  ": " +
                  load.value +
                  "\n" +
                  load.title +
                  load.remaining
                }
                data-actual-total={resource.id + "|" + month}
                data-value={load.value}
                data-detail={load.title}
                style={
                  {
                    "--actual-load":
                      Math.min(100, Math.max(0, load.percent)) + "%",
                  } as React.CSSProperties
                }
              />
            );
          })()}
      </TableCell>
    );
  }
  const tableRef = useRef<HTMLTableElement>(null);
  const chunkSize = Math.max(
    4,
    Math.min(20, Math.floor(200 / Math.max(1, months.length))),
  );
  const calendarButton = (resource: Resource) =>
    canViewPersonalCalendar(resource.id) && (
      <button
        type="button"
        className="person-calendar-trigger"
        aria-label={resource.name + " izin ve eğitim takvimini aç"}
        title={resource.name + " · izin ve eğitim takvimi"}
        onClick={() => onOpenPersonalCalendar(resource)}
      >
        <CalendarDays size={15} />
      </button>
    );
  /** Person row cell: the month's total over all projects and what is left. */
  function balanceCell(resource: Resource, month: string) {
    const shown =
      month <= currentMonth && eligible.has(resource.id + "|" + month);
    if (!shown)
      return <TableCell key={month} className="actual-person-month" />;
    const summary = actualMonths.get(resource.id, month);
    const balance = personMonthBalance({
      ...summary,
      totalFte: personMonthTotals[resource.id + "|" + month] || 0,
    });
    const hours = unit === "hours";
    // Whole numbers keep the summary inside the month column; the exact
    // figures are in the tooltip and in the project rows.
    const whole = (value: number) => {
      const rounded = Math.round(Math.abs(value));
      return rounded === 0 && Math.abs(value) > 0 ? "<1" : String(rounded);
    };
    const left = hours
      ? whole(balance.remainingHours) + " sa"
      : "%" + whole(balance.remainingPercent);
    const exactLeft = hours
      ? numberFormat.format(Math.abs(balance.remainingHours)) + " saat"
      : "%" + numberFormat.format(Math.abs(balance.remainingPercent));
    const note =
      balance.state === "done"
        ? "tamam"
        : balance.state === "over"
          ? "aşım " + left
          : balance.state === "none"
            ? "çalışma yok"
            : "kalan " + left;
    const key = resource.id + "|*|" + month;
    return (
      <TableCell
        key={month}
        className={
          "actual-person-month" +
          (selectedCell?.key === key ? " actual-context-selected" : "")
        }
        data-actual-context-cell="true"
        data-remaining-state={balance.state}
        data-person-month={resource.id + "|" + month}
        title={
          resource.name +
          " · " +
          month +
          " · tüm projeler ve eğitim: %" +
          numberFormat.format(balance.percent) +
          (balance.state === "open"
            ? " · kalan " + exactLeft
            : balance.state === "over"
              ? " · aşım " + exactLeft
              : "")
        }
        onClick={() => selectHoursContext(resource.id, month, key)}
      >
        <strong>%{whole(balance.percent)}</strong>
        <small>{note}</small>
      </TableCell>
    );
  }
  // "Kişi → Proje": a sticky person row with all visible projects by default.
  // Data-only mode keeps "+ Proje" for opening a new entry row.
  const personSections: WindowedSection[] = view.personPage.map((group) => {
    const resource = group.person;
    const open = !personControls.collapsed.has(resource.id);
    const rows = open ? group.projects : [];
    const addable = addableProjects(group, projects).filter((project) =>
      months.some(
        (month) =>
          month <= currentMonth &&
          month >= project.start &&
          month <= project.end,
      ),
    );
    const canAdd = months.some(
      (month) =>
        month <= currentMonth &&
        eligible.has(resource.id + "|" + month) &&
        canEditPersonMonth(resource.id, month),
    );
    const lastMonth = months.filter((month) => month <= currentMonth).at(-1);
    const version = lastMonth
      ? actualVersionAt(resource, lastMonth)
      : undefined;
    const team = data.teams.find((item) => item.id === version?.team)?.name;
    const key = "person:" + resource.id;
    return {
      key,
      height: 52 + rows.length * 44,
      render: () => (
        <TableBody
          key={key}
          data-window-key={key}
          className="project-row-group actual-person-group"
          data-project-group={key}
        >
          <TableRow
            className="group actual-person-heading project-freeze-row"
            data-project-heading={key}
            data-person-heading={resource.id}
          >
            <TableCell className="actual-person-cell">
              <div className="actual-person-head">
                {group.projects.length > 0 ? (
                  <button
                    type="button"
                    className="actual-person-toggle"
                    aria-expanded={open}
                    aria-label={
                      resource.name + " projelerini " + (open ? "daralt" : "aç")
                    }
                    onClick={() => personControls.onToggle(resource.id)}
                  >
                    {open ? (
                      <ChevronDown size={15} />
                    ) : (
                      <ChevronRight size={15} />
                    )}
                  </button>
                ) : (
                  <span className="actual-person-toggle" aria-hidden="true" />
                )}
                <span className="actual-person-title">
                  <strong title={resource.name}>{resource.name}</strong>
                  <span className="actual-person-sub">
                    <small title={team}>
                      {team || ""}
                      {!group.projects.length &&
                        (team ? " · " : "") + "Bu dönemde giriş yok"}
                    </small>
                    {canAdd && addable.length > 0 && (
                      <select
                        className="actual-person-add"
                        title="Proje ekle: yeni giriş için satır açar"
                        aria-label={resource.name + " için proje ekle"}
                        value=""
                        onChange={(event) => {
                          if (event.target.value)
                            personControls.onAdd(
                              resource.id,
                              event.target.value,
                            );
                        }}
                      >
                        <option value="">+</option>
                        {addable.map((project) => (
                          <option key={project.id} value={project.id}>
                            {project.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </span>
                </span>
                {canViewPersonalCalendar(resource.id) && (
                  <span className="person-calendar-slot">
                    {calendarButton(resource)}
                  </span>
                )}
              </div>
            </TableCell>
            {months.map((month) => balanceCell(resource, month))}
          </TableRow>
          {rows.map((project) => (
            <TableRow
              key={resource.id + "|" + project.id}
              data-person-project={project.id}
            >
              <TableCell className="rowname">
                <div className="actual-project-label">
                  <span className="indent" aria-hidden="true">
                    ↳
                  </span>
                  <span
                    className="actual-project-row-name"
                    title={project.name}
                  >
                    {project.name}
                  </span>
                </div>
              </TableCell>
              {months.map((month) =>
                entryCell(resource, project, month, false),
              )}
            </TableRow>
          ))}
        </TableBody>
      ),
    };
  });
  const projectSections: WindowedSection[] = groups.flatMap((group) => {
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
        height: (first ? 80 : 0) + chunk.length * 44,
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
                {(() => {
                  const phaseKeys = months.map((month) =>
                    phaseRunKey(
                      project,
                      month,
                      month >= project.start && month <= project.end,
                    ),
                  );
                  const phaseRuns = phaseRunParts(phaseKeys);
                  const phaseSpans = phaseRunSpans(phaseKeys);
                  return months.map((month, monthIndex) => {
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
                            style={phaseChipStyle(
                              project,
                              month,
                              phaseSpans[monthIndex],
                            )}
                            data-phase-run={phaseRuns[monthIndex]}
                            title={text}
                            aria-label={
                              project.name + " / " + month + " aşaması: " + text
                            }
                            onClick={() => onPhaseDetail({ project, month })}
                          >
                            <span className="phasepreview">{text}</span>
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
                  });
                })()}
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
                      {months.map((month) =>
                        entryCell(resource, project, month, true),
                      )}
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
    view.layout === "person" ? personSections : projectSections,
    months.length + 1,
    view.scopeKey + ":" + view.visiblePage,
  );
  return (
    <Table
      ref={tableRef}
      stickyProjectRows
      todayDate={todayDate}
      todayColumn
      todayMonthsKey={months.join("|")}
      className="matrix planning-grid allocation-grid"
      style={
        {
          width: labelWidth + months.length * monthWidth,
          "--label-width": labelWidth + "px",
          // Phase labels span their run by this column pitch.
          "--month-width": monthWidth + "px",
        } as React.CSSProperties
      }
    >
      <colgroup>
        <col style={{ width: labelWidth }} />
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
          <TableHead>
            {view.layout === "person" ? "Kişi / Proje" : "Proje / Kişi"}
          </TableHead>
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
