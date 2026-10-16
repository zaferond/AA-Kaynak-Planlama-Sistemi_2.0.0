import type { RefObject } from "react";
import {
  ArrowDownToLine,
  CalendarClock,
  CalendarDays,
  FolderKanban,
  Layers3,
  Plus,
  ShieldAlert,
  Users,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Principal } from "../access";
import { RISK_MANAGEMENT_ENABLED, TAB_LABELS } from "../settings";
import { isProjectEditor } from "../../../shared/project-access.ts";
export type WorkspaceDensity = "detail" | "compact" | "overview";
export type ReportView = "resources" | "headcount";
type Props = {
  user: Principal | null;
  tab: string;
  mainTabsRef: RefObject<HTMLDivElement | null>;
  density: WorkspaceDensity;
  setDensity: (density: WorkspaceDensity) => void;
  setCount: (count: number) => void;
  view: string;
  setView: (view: string) => void;
  openProject: () => void;
  onOpenSharedCalendar: () => void;
  onOpenScenario: () => void;
  onExport: () => void;
  dataLoaded: boolean;
  hasTeams: boolean;
  hasProjects: boolean;
  organizationView: string;
  setOrganizationView: (view: string) => void;
  reportView: ReportView;
  setReportView: (view: ReportView) => void;
};
export default function WorkspaceNavigation({
  user,
  tab,
  mainTabsRef,
  density,
  setDensity,
  setCount,
  view,
  setView,
  openProject,
  onOpenSharedCalendar,
  onOpenScenario,
  onExport,
  dataLoaded,
  hasTeams,
  hasProjects,
  organizationView,
  setOrganizationView,
  reportView,
  setReportView,
}: Props) {
  const isAdmin = user?.role === "admin",
    isManager = user?.role === "manager",
    projectEditor = isProjectEditor(user);
  // "Normal-Proje" sees only the project and critical-topic screens.
  const anyRole =
    isAdmin || isManager || (user?.role === "normal" && !projectEditor);
  // Order and grouping: actuals · planning and projects · reports · administration.
  const mainTabs = (
    [
      { value: "actual", Icon: CalendarDays, group: "actuals", show: anyRole },
      {
        value: "activity",
        Icon: CalendarDays,
        group: "actuals",
        show: anyRole,
      },
      {
        value: "plan",
        Icon: CalendarDays,
        group: "planning",
        show: isAdmin || isManager,
      },
      { value: "projects", Icon: FolderKanban, group: "planning", show: true },
      {
        value: "risk",
        Icon: ShieldAlert,
        group: "planning",
        show: RISK_MANAGEMENT_ENABLED,
      },
      {
        value: "critical",
        Icon: FolderKanban,
        group: "planning",
        show: isAdmin || isManager || projectEditor,
      },
      {
        value: "overview",
        Icon: Layers3,
        group: "reports",
        show: isAdmin || isManager,
      },
      { value: "resources", Icon: Users, group: "admin", show: isAdmin },
    ] as const
  ).filter((item) => item.show);
  return (
    <div className="workspace-nav">
      <TabsList
        ref={mainTabsRef}
        className="navtabs"
        variant="line"
        aria-label="Ana sekmeler"
      >
        {mainTabs.map((item, index) => (
          <TabsTrigger
            key={item.value}
            value={item.value}
            data-tab-group={item.group}
            // A thin divider marks where a new group of tabs begins.
            data-group-start={
              index > 0 && mainTabs[index - 1].group !== item.group
                ? ""
                : undefined
            }
          >
            <item.Icon />
            {TAB_LABELS[item.value]}
          </TabsTrigger>
        ))}
      </TabsList>
      {!["access", "teams", "critical", "risk", "activity"].includes(tab) && (
        <div className="workspace-nav-actions">
          {tab === "overview" && (
            <Tabs
              value={reportView}
              onValueChange={(value) => setReportView(value as ReportView)}
            >
              <TabsList
                className="organization-view-switch"
                aria-label="Kaynak raporu görünümü"
              >
                <TabsTrigger value="resources">Kaynak Raporları</TabsTrigger>
                <TabsTrigger value="headcount">Head Count</TabsTrigger>
              </TabsList>
            </Tabs>
          )}
          {tab === "resources" && (
            <Tabs value={organizationView} onValueChange={setOrganizationView}>
              <TabsList
                className="organization-view-switch"
                aria-label="Organizasyon görünümü"
              >
                <TabsTrigger value="employees">
                  Çalışan & Yetki Tanımlama
                </TabsTrigger>
                <TabsTrigger value="teams">Organizasyon Yapısı</TabsTrigger>
              </TabsList>
            </Tabs>
          )}
          {["plan", "actual", "projects", "overview"].includes(tab) &&
            !(tab === "overview" && reportView === "headcount") && (
              <label className="densitycontrol">
                Görünüm
                <select
                  aria-label="Takvim yoğunluğu"
                  value={density}
                  onChange={(e) => {
                    const mode = e.target.value as typeof density;
                    setDensity(mode);
                    if (mode === "overview") setCount(60);
                  }}
                >
                  <option value="detail">Ayrıntılı</option>
                  <option value="compact">Kompakt</option>
                  <option value="overview">5 Yıllık Genel Bakış</option>
                </select>
              </label>
            )}
          {tab === "plan" && (
            <Tabs value={view} onValueChange={setView}>
              <TabsList
                className="plan-view-switch"
                aria-label="Dağılım görünümü"
              >
                <TabsTrigger value="team">Takım → Projeler</TabsTrigger>
                <TabsTrigger value="project">Proje → Takımlar</TabsTrigger>
              </TabsList>
            </Tabs>
          )}
          {(["plan", "projects"].includes(tab) ||
            (tab === "overview" && reportView === "resources")) &&
            (isAdmin || isManager) && (
              <button
                type="button"
                className="button"
                onClick={onOpenScenario}
                disabled={!dataLoaded || !hasProjects}
              >
                <CalendarClock size={17} />
                Erteleme Senaryosu
              </button>
            )}
          {tab === "projects" && (isAdmin || projectEditor) && (
            <button
              className="button project-create"
              onClick={() => openProject()}
            >
              <Plus size={17} />
              Yeni Proje Ekle
            </button>
          )}
          {tab === "actual" && isAdmin && (
            <button
              type="button"
              className="button"
              aria-label="Çalışma Takvimi'ni aç"
              onClick={onOpenSharedCalendar}
              disabled={!dataLoaded}
            >
              <CalendarDays size={17} />
              Çalışma Takvimi
            </button>
          )}
          {tab !== "resources" && (
            <button
              className="button"
              onClick={onExport}
              disabled={
                !dataLoaded ||
                (tab === "overview" && !hasTeams) ||
                (tab === "projects" && !hasProjects)
              }
            >
              <ArrowDownToLine size={17} />
              {tab === "projects"
                ? "Proje Raporunu İndir"
                : tab === "overview"
                  ? reportView === "headcount"
                    ? "Head Count Excel'e Aktar"
                    : "Kaynak Raporu İndir"
                  : "Excel'e Aktar"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
