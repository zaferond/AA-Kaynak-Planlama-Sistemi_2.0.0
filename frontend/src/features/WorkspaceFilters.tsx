import { currentPlanningDate } from "../../../shared/resource-dates";
import { organizationPickerItems } from "./organization-picker-items";
import {
  useFilterAppliedToast,
  type FilterNotice,
} from "./workspace/useFilterAppliedToast";
import { useMemo } from "react";
import { selectedLeadershipScope } from "../../../shared/leadership-planning";
import type { Dispatch, SetStateAction } from "react";
import { SlidersHorizontal } from "lucide-react";
import {
  PLANNING_PERIODS as periods,
  MIN_PLANNING_MONTH,
  MAX_FILTER_START,
  validPlanningMonth,
} from "../../../shared/planning-dates";
import { Picker } from "../components/FilterPicker";
import type { Data, Team } from "../model";
import type { Principal } from "../access";
import type { WorkspaceDensity } from "./WorkspaceNavigation";
type SelectionSetter = Dispatch<SetStateAction<string[]>>;
type Props = {
  data: Data;
  user: Principal | null;
  tab: string;
  leads: string[];
  setLeads: (values: string[]) => void;
  teamIds: string[];
  setTeamIds: SelectionSetter;
  projectIds: string[];
  setProjectIds: (values: string[]) => void;
  personIds: string[];
  setPersonIds: (values: string[]) => void;
  leaderItems: { id: string; name: string }[];
  availableTeams: Team[];
  availablePeople: { id: string; name: string }[];
  start: string;
  setStart: (start: string) => void;
  count: number;
  setCount: (count: number) => void;
  density: WorkspaceDensity;
  setDensity: (density: WorkspaceDensity) => void;
  filterResetKey: number;
  resetFilters: () => void;
  saving: boolean;
  resetAll: () => Promise<void>;
  notice: string;
  showPeriodFilters?: boolean;
};
export default function WorkspaceFilters({
  data,
  user,
  tab,
  leads,
  setLeads,
  teamIds,
  setTeamIds,
  projectIds,
  setProjectIds,
  personIds,
  setPersonIds,
  leaderItems,
  availableTeams,
  availablePeople,
  start,
  setStart,
  count,
  setCount,
  density,
  setDensity,
  filterResetKey,
  resetFilters,
  saving,
  resetAll,
  notice,
  showPeriodFilters = true,
}: Props) {
  const isAdmin = user?.role === "admin";
  const { notify, toast } = useFilterAppliedToast();
  function applySelection(
    current: string[],
    next: string[],
    set: (value: string[]) => void,
    kind: FilterNotice,
  ) {
    if (
      current.length === next.length &&
      current.every((id) => next.includes(id))
    )
      return;
    set(next);
    notify(kind);
  }
  const today = currentPlanningDate();
  const organizationItems = useMemo(
    () => organizationPickerItems(data, leaderItems, availableTeams, today),
    [data, leaderItems, availableTeams, today],
  );
  return (
    <>
      {!["access", "teams", "critical", "risk", "resources"].includes(tab) && (
        <>
          <div
            className="planning-filterbar"
            role="group"
            aria-label="Planlama filtreleri"
          >
            <div className="filterbar-title">
              <SlidersHorizontal size={16} aria-hidden="true" />
              <span>Filtreler</span>
            </div>
            <div className="filters" key={filterResetKey}>
              {tab !== "projects" && (
                <Picker
                  label="Liderlik"
                  value={leads}
                  onChange={(v) => {
                    if (
                      leads.length === v.length &&
                      leads.every((id) => v.includes(id))
                    )
                      return;
                    setLeads(v);
                    const selected = selectedLeadershipScope(data, v, true);
                    setTeamIds((old) =>
                      old.filter(
                        (id) =>
                          !v.length ||
                          selected.has(
                            data.teams.find((t) => t.id === id)?.lead || "",
                          ),
                      ),
                    );
                    notify("leader");
                  }}
                  items={organizationItems.leaders}
                />
              )}
              {tab !== "projects" && (
                <Picker
                  label="Takım"
                  value={teamIds}
                  onChange={(v) =>
                    applySelection(teamIds, v, setTeamIds, "team")
                  }
                  items={organizationItems.teams}
                />
              )}
              {tab !== "resources" && tab !== "overview" && (
                <Picker
                  label="Proje"
                  value={projectIds}
                  onChange={(v) =>
                    applySelection(projectIds, v, setProjectIds, "project")
                  }
                  items={data.projects}
                />
              )}
              {tab === "actual" && (
                <Picker
                  label="Kişi"
                  value={personIds}
                  onChange={(v) =>
                    applySelection(personIds, v, setPersonIds, "person")
                  }
                  items={availablePeople}
                />
              )}
              {showPeriodFilters && (
                <>
                  <label className="pick">
                    <span>Başlangıç Ayı</span>
                    <input
                      type="month"
                      min={MIN_PLANNING_MONTH}
                      max={MAX_FILTER_START}
                      value={start}
                      onChange={(e) => {
                        if (
                          validPlanningMonth(e.target.value) &&
                          e.target.value >= MIN_PLANNING_MONTH &&
                          e.target.value <= MAX_FILTER_START &&
                          e.target.value !== start
                        ) {
                          setStart(e.target.value);
                          notify("startMonth");
                        }
                      }}
                    />
                  </label>
                  <label className="pick period">
                    <span>Görünür Dönem</span>
                    <select
                      value={count}
                      onChange={(e) => {
                        if (Number(e.target.value) === count) return;
                        setCount(Number(e.target.value));
                        if (
                          Number(e.target.value) !== 60 &&
                          density === "overview"
                        )
                          setDensity("detail");
                        notify("period");
                      }}
                    >
                      {periods.map((n) => (
                        <option key={n} value={n}>
                          {n < 12 ? "6 ay" : n / 12 + " yıl (" + n + " ay)"}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              )}
            </div>
            <div className="filteractions">
              <button
                className="button resetfilters"
                title="Tüm seçimleri ve aramaları temizler; varsayılan döneme döner."
                onClick={() => {
                  resetFilters();
                  notify("reset");
                }}
              >
                Filtreleri Sıfırla
              </button>
              {tab === "plan" && isAdmin && (
                <button
                  className="button deletebutton"
                  disabled={
                    saving ||
                    !Object.values(data.allocations).some((v) => v !== 0)
                  }
                  onClick={resetAll}
                >
                  Tüm Dağılımları Sıfırla
                </button>
              )}
            </div>
          </div>
          {notice && (
            <div className="filterline">
              <span role="status">{notice}</span>
            </div>
          )}
        </>
      )}
      {toast}
    </>
  );
}
