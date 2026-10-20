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
import { Switch } from "@/components/ui/switch";
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
    layout,
  } = props;
  const [unit, setUnit] = useState<ActualUnit>("percent");
  const [page, setPage] = useState(0);
  const [phaseDetail, setPhaseDetail] = useState<ActualPhaseDetail | null>(
    null,
  );
  const [calendarPerson, setCalendarPerson] = useState<Resource | null>(null);
  const [calendarMode, setCalendarMode] = useState<ActualCalendarMode>(null);
  const [query, setQuery] = useState("");
  // Session-only: rows opened with "+ Proje" and people folded shut.
  const [added, setAdded] = useState<ReadonlySet<string>>(() => new Set());
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const toggleIn =
    (
      set: (
        update: (current: ReadonlySet<string>) => ReadonlySet<string>,
      ) => void,
    ) =>
    (key: string, on?: boolean) =>
      set((current) => {
        const next = new Set(current);
        if (on ?? !next.has(key)) next.add(key);
        else next.delete(key);
        return next;
      });
  const view = useActualAllocationView(props, page, { layout, query, added });
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
      <div className="actual-view-bar">
        {layout === "person" && (
          <input
            type="search"
            className="actual-person-search"
            aria-label="Kişi ara"
            placeholder="Kişi ara…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        )}
        <label className="actual-only-data">
          <Switch
            size="sm"
            checked={props.onlyDataRows}
            onCheckedChange={props.onOnlyDataRowsChange}
          />
          Sadece veri olanlar
        </label>
        {layout === "project" ? (
          <span className="actual-load-legend">
            <i aria-hidden="true" />
            Hücre altındaki çubuk: kişinin o ay tüm projelerdeki toplamı ·
            kalan, hücre seçilince üstteki Kalan alanında
          </span>
        ) : (
          <span className="actual-load-legend">
            Kişi satırı: o ay tüm projeler ve eğitim toplamı ile kalan
          </span>
        )}
        <Pager
          total={totalRows}
          page={visiblePage}
          size={pageSize}
          onChange={setPage}
          label={layout === "person" ? "Kişi" : "Kişi / proje satırı"}
        />
      </div>
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
        personControls={{
          collapsed,
          onToggle: (personId) => toggleIn(setCollapsed)(personId),
          onAdd: (personId, projectId) => {
            toggleIn(setAdded)(personId + "|" + projectId, true);
            toggleIn(setCollapsed)(personId, false);
          },
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
      {!!projects.length &&
        layout === "person" &&
        !!query.trim() &&
        !totalRows && (
          <p className="emptymsg">“{query.trim()}” ile eşleşen kişi yok.</p>
        )}
      {!!projects.length && props.onlyDataRows && !totalRows && (
        <p className="emptymsg">
          Seçili dönemde gerçekleşen değeri girilmiş satır yok. Bütün satırları
          görmek için “Sadece veri olanlar” anahtarını kapatın.
        </p>
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
