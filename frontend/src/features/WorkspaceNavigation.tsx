import { useEffect, type RefObject } from "react";
import { createPortal } from "react-dom";
import {
  ArrowDownToLine,
  CalendarClock,
  CalendarDays,
  FolderKanban,
  Layers3,
  Plus,
  ShieldAlert,
  TrendingUp,
  Users,
  PanelLeftClose,
  ChevronRight,
} from "lucide-react";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Principal } from "../access";
import { RISK_MANAGEMENT_ENABLED, SYSTEM_NAME, TAB_LABELS } from "../settings";
import { isProjectEditor } from "../../../shared/project-access.ts";
import type { WorkspaceMenu } from "./workspace/useWorkspaceMenu";
import WorkspaceSectionHeader, {
  type WorkspaceSectionTab,
} from "./workspace/WorkspaceSectionHeader";
import type { ActualLayout } from "./actual-allocation/useActualAllocationView";
import type { ProgressView } from "./project-progress/ProjectProgressPanel";
export type WorkspaceDensity = "detail" | "compact" | "overview";
export type ReportView = "resources" | "headcount";
export type ProjectView = "projects" | "scenario";
type Props = {
  sidebarHost: HTMLElement | null;
  menu: WorkspaceMenu;
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
  /** Saved drafts waiting for an admin decision. */
  pendingScenarios?: number;
  onExport: () => void;
  dataLoaded: boolean;
  hasTeams: boolean;
  hasProjects: boolean;
  organizationView: string;
  setOrganizationView: (view: string) => void;
  reportView: ReportView;
  setReportView: (view: ReportView) => void;
  actualLayout: ActualLayout;
  setActualLayout: (view: ActualLayout) => void;
  progressView: ProgressView;
  setProgressView: (view: ProgressView) => void;
  projectView: ProjectView;
  setProjectView: (view: ProjectView) => void;
  pendingProgressApprovals: number;
};
export default function WorkspaceNavigation({
  sidebarHost,
  menu,
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
  pendingScenarios = 0,
  onExport,
  dataLoaded,
  hasTeams,
  hasProjects,
  organizationView,
  setOrganizationView,
  reportView,
  setReportView,
  actualLayout,
  setActualLayout,
  progressView,
  setProgressView,
  projectView,
  setProjectView,
  pendingProgressApprovals,
}: Props) {
  useEffect(() => {
    if (!menu.open) return;
    const list = mainTabsRef.current;
    const active = list?.querySelector<HTMLElement>(
      '[role="tab"][data-state="active"]',
    );
    if (list && active) {
      if (active.offsetTop < list.scrollTop) list.scrollTop = active.offsetTop;
      else if (
        active.offsetTop + active.offsetHeight >
        list.scrollTop + list.clientHeight
      )
        list.scrollTop =
          active.offsetTop + active.offsetHeight - list.clientHeight;
    }
  }, [menu.open, tab, mainTabsRef]);
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
      { value: "projects", Icon: FolderKanban, group: "planning", show: true },
      {
        value: "progress",
        Icon: TrendingUp,
        group: "planning",
        show: isAdmin || isManager,
      },
      {
        value: "plan",
        Icon: CalendarDays,
        group: "planning",
        show: isAdmin || isManager,
      },
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
  let sectionTabs: WorkspaceSectionTab[] = [],
    sectionValue = tab;
  let changeSection: (value: string) => void = () => {};
  let sectionLabel = "Ekran görünümleri";
  if (tab === "actual") {
    sectionTabs = [
      { value: "person", label: "Kişi → Proje" },
      { value: "project", label: "Proje → Kişi" },
    ];
    sectionValue = actualLayout;
    changeSection = (value) => setActualLayout(value as ActualLayout);
    sectionLabel = "Gerçekleşen görünümü";
  } else if (tab === "projects") {
    sectionTabs = [
      { value: "projects", label: "Projeler" },
      ...(isAdmin || isManager
        ? [
            {
              value: "scenario",
              label: "Erteleme Senaryosu",
              badge: isAdmin ? pendingScenarios : 0,
            },
          ]
        : []),
    ];
    sectionValue = projectView;
    changeSection = (value) => setProjectView(value as ProjectView);
    sectionLabel = "Proje görünümü";
  } else if (tab === "progress") {
    sectionTabs = [
      {
        value: "plan",
        label: "Hedef Plan / Gerçekleşen Plan Giriş",
        badge: isAdmin ? pendingProgressApprovals : 0,
      },
      { value: "report", label: "Proje İlerleme Raporu" },
      { value: "warnings", label: "Senaryo Uyarıları" },
      ...(isAdmin ? [{ value: "settings", label: "Uyarı Ayarları" }] : []),
    ];
    sectionValue = progressView;
    changeSection = (value) => setProgressView(value as ProgressView);
    sectionLabel = "İlerleme görünümü";
  } else if (tab === "plan") {
    sectionTabs = [
      { value: "team", label: "Takım → Projeler" },
      { value: "project", label: "Proje → Takımlar" },
    ];
    sectionValue = view;
    changeSection = setView;
    sectionLabel = "Dağılım görünümü";
  } else if (tab === "overview") {
    sectionTabs = [
      { value: "resources", label: "Kaynak Raporları" },
      { value: "headcount", label: "Head Count" },
    ];
    sectionValue = reportView;
    changeSection = (value) => setReportView(value as ReportView);
    sectionLabel = "Kaynak raporu görünümü";
  } else if (tab === "resources") {
    sectionTabs = [
      { value: "employees", label: "Çalışan & Yetki Tanımlama" },
      { value: "teams", label: "Organizasyon Yapısı" },
    ];
    sectionValue = organizationView;
    changeSection = setOrganizationView;
    sectionLabel = "Organizasyon görünümü";
  }
  const sectionTitle = [
    "progress",
    "resources",
    "overview",
    "projects",
  ].includes(tab)
    ? sectionTabs.find((item) => item.value === sectionValue)?.label ||
      TAB_LABELS[tab as keyof typeof TAB_LABELS]
    : TAB_LABELS[tab as keyof typeof TAB_LABELS];
  return (
    <div className="workspace-nav">
      {sidebarHost &&
        createPortal(
          <>
            <button
              ref={menu.triggerRef}
              type="button"
              className="workspace-menu-edge"
              inert={menu.open}
              aria-hidden={menu.open}
              data-workspace-menu-trigger
              aria-label="Sol menüyü aç"
              aria-controls="workspace-main-menu"
              aria-expanded={menu.open}
              onClick={(event) => !menu.open && menu.toggle(event.detail === 0)}
            >
              <ChevronRight
                className="workspace-menu-edge-icon"
                size={18}
                aria-hidden="true"
              />
              <span className="workspace-menu-edge-caption" aria-hidden="true">
                Menü
              </span>
            </button>
            <aside
              id="workspace-main-menu"
              className="workspace-menu-panel"
              ref={menu.panelRef}
              data-open={menu.open}
              data-pinned={menu.pinned}
              aria-label="Ana menü"
              aria-hidden={!menu.open}
              inert={!menu.open}
            >
              <div className="workspace-menu-heading">
                <div className="workspace-menu-brand">
                  <Layers3 size={20} aria-hidden="true" />
                  <h1>{SYSTEM_NAME}</h1>
                </div>
                <button
                  type="button"
                  className="iconbutton"
                  aria-label="Sol menüyü kapat"
                  onClick={() => menu.close(true)}
                >
                  <PanelLeftClose size={18} />
                </button>
              </div>
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
                    <span>{TAB_LABELS[item.value]}</span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </aside>
          </>,
          sidebarHost,
        )}
      <WorkspaceSectionHeader
        title={sectionTitle}
        label={sectionLabel}
        tabs={sectionTabs}
        value={sectionValue}
        onChange={changeSection}
        actionsPlacement={tab === "actual" ? "tabs" : "heading"}
        actions={
          ![
            "access",
            "teams",
            "critical",
            "risk",
            "activity",
            "progress",
          ].includes(tab) &&
          !(tab === "projects" && projectView === "scenario") && (
            <div className="workspace-nav-actions">
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
              {(tab === "plan" ||
                (tab === "overview" && reportView === "resources")) &&
                (isAdmin || isManager) && (
                  <button
                    type="button"
                    className="button"
                    title={
                      isAdmin && pendingScenarios > 0
                        ? pendingScenarios + " senaryo onay bekliyor"
                        : undefined
                    }
                    onClick={onOpenScenario}
                    disabled={!dataLoaded || !hasProjects}
                  >
                    <CalendarClock size={17} />
                    Erteleme Senaryosu
                    {isAdmin && pendingScenarios > 0 && (
                      // The button title carries the meaning; its name stays fixed.
                      <span
                        className="scenario-pending-badge"
                        aria-hidden="true"
                      >
                        {pendingScenarios}
                      </span>
                    )}
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
          )
        }
      />
    </div>
  );
}
