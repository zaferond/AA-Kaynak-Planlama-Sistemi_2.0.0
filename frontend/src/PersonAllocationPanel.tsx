import { allowedActualTeam, canReadPersonalCalendar } from "./access";
import { actualVersionAt } from "./model";
import { useEffect, useState } from "react";
import type { Resource, Project } from "./model";
import type { ActualUnit } from "./actual-units";
import { writeBatch } from "./storage";
import {
  prepareActualAllocationChange,
  prepareWorkedHoursChange,
  type ActualEntry,
} from "./features/actual-allocation-commands";
import Pager from "./Pager";
import ActualAllocationControls from "./features/actual-allocation/ActualAllocationControls";
import ActualAllocationTable from "./features/actual-allocation/ActualAllocationTable";
import ActualAllocationDialogs from "./features/actual-allocation/ActualAllocationDialogs";
import { useActualAllocationView } from "./features/actual-allocation/useActualAllocationView";
import { useActualCellSelection } from "./features/actual-allocation/useActualCellSelection";
import { useActualCapacityDialog } from "./features/actual-allocation/useActualCapacityDialog";
import type {
  PersonAllocationPanelProps,
  ActualCalendarMode,
  ActualPhaseDetail,
} from "./features/actual-allocation/types";

export default function PersonAllocationPanel(
  props: PersonAllocationPanelProps,
) {
  const {
    data,
    user,
    projects,
    months,
    currentMonth,
    todayDate,
    canEditCalendar,
    sharedCalendarOpen,
    onSharedCalendarClose,
    ownResourceId,
    onSaved,
  } = props;
  const [unit, setUnit] = useState<ActualUnit>("percent");
  const [page, setPage] = useState(0);
  const [phaseDetail, setPhaseDetail] = useState<ActualPhaseDetail | null>(
    null,
  );
  const [calendarPerson, setCalendarPerson] = useState<Resource | null>(null);
  const [calendarMode, setCalendarMode] = useState<ActualCalendarMode>(null);
  const view = useActualAllocationView(props, page);
  const { scopeKey, visiblePage, totalRows, pageSize, people, actualMonths } =
    view;
  useEffect(() => setPage(0), [scopeKey]);
  const limit = useActualCapacityDialog();
  const { openLimit } = limit;
  const selection = useActualCellSelection({
    ...view,
    loading: props.loading,
    months,
    currentMonth,
    limitOpenRef: limit.openRef,
  });
  const { selectedCell, selectedHoursMonth, selectedHoursPerson } = selection;
  function canEditPersonMonth(id: string, month: string) {
    if (props.loading) return false;
    if (user.role === "admin" || id === user.resourceId) return true;
    const resource = data.resources.find((person) => person.id === id);
    const version = resource && actualVersionAt(resource, month);
    return (
      user.role === "manager" &&
      !!version &&
      allowedActualTeam(data, user, version.team)
    );
  }
  function canViewPersonalCalendar(id: string) {
    return canReadPersonalCalendar(user, id);
  }
  async function save(
    resource: Resource,
    project: Project,
    month: string,
    entry: ActualEntry,
  ) {
    if (!canEditPersonMonth(resource.id, month))
      throw Error("Bu çalışanın verisini düzenleme yetkiniz yok.");
    onSaved(
      await writeBatch([
        prepareActualAllocationChange(
          data,
          resource.id,
          project.id,
          month,
          entry,
          actualMonths.get(resource.id, month),
        ),
      ]),
    );
  }

  async function saveHours(
    resource: Resource,
    month: string,
    hours: number | null,
    input: HTMLInputElement | null,
  ): Promise<boolean> {
    try {
      if (!canEditPersonMonth(resource.id, month))
        throw Error("Bu çalışanın verisini düzenleme yetkiniz yok.");
      onSaved(
        await writeBatch([
          prepareWorkedHoursChange(
            data,
            resource.id,
            month,
            hours,
            actualMonths.get(resource.id, month),
          ),
        ]),
      );
      return true;
    } catch (cause) {
      const message = (cause as Error).message;
      if (message.includes("%100") || message.includes("kapasitesini aşıyor")) {
        openLimit("hours", input);
        return false;
      }
      throw cause;
    }
  }
  return (
    <section className="panel person-allocation">
      <ActualAllocationControls
        data={data}
        unit={unit}
        onUnitChange={setUnit}
        selectedHoursPerson={selectedHoursPerson}
        selectedHoursMonth={selectedHoursMonth}
        actualMonths={actualMonths}
        saveHours={saveHours}
        canEditPersonMonth={canEditPersonMonth}
      />
      <Pager
        total={totalRows}
        page={visiblePage}
        size={pageSize}
        onChange={setPage}
        label="Kişi / proje satırı"
      />
      <ActualAllocationTable
        data={data}
        projects={projects}
        months={months}
        currentMonth={currentMonth}
        todayDate={todayDate}
        unit={unit}
        view={view}
        selectedCell={selectedCell}
        selectHoursContext={selection.selectHoursContext}
        clearSelection={selection.clearSelection}
        save={save}
        canEditPersonMonth={canEditPersonMonth}
        canViewPersonalCalendar={canViewPersonalCalendar}
        openLimit={openLimit}
        onPhaseDetail={setPhaseDetail}
        onOpenPersonalCalendar={(resource) => {
          setCalendarPerson(resource);
          setCalendarMode("personal");
        }}
      />
      <ActualAllocationDialogs
        data={data}
        calendarMode={sharedCalendarOpen ? "shared" : calendarMode}
        calendarPerson={sharedCalendarOpen ? null : calendarPerson}
        canEditCalendar={canEditCalendar}
        ownResourceId={ownResourceId}
        onSaved={onSaved}
        selectedCell={selectedCell}
        currentMonth={currentMonth}
        onCalendarClose={() => {
          onSharedCalendarClose();
          setCalendarMode(null);
          setCalendarPerson(null);
        }}
        limit={limit}
        phaseDetail={phaseDetail}
        onPhaseClose={() => setPhaseDetail(null)}
      />
      {!projects.length && (
        <p className="emptymsg">Seçili filtrelerde proje bulunamadı.</p>
      )}
      {!!projects.length && !people.length && (
        <p className="emptymsg">
          Seçili filtrelerde dağıtılabilir kişi bulunamadı; proje aşamaları
          gösteriliyor.
        </p>
      )}
    </section>
  );
}
