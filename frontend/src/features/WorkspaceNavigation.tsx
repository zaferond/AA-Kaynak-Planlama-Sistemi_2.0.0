import { useEffect, type RefObject } from "react";
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
  Pin,
  PinOff,
  X,
  Menu,
  ChevronsRight,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Principal } from "../access";
import { RISK_MANAGEMENT_ENABLED, TAB_LABELS } from "../settings";
import { isProjectEditor } from "../../../shared/project-access.ts";
import type { WorkspaceMenu } from "./workspace/useWorkspaceMenu";
export type WorkspaceDensity = "detail" | "compact" | "overview";
export type ReportView = "resources" | "headcount";
type Props = {
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
};
export default function WorkspaceNavigation({
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
  return (
    <div className="workspace-nav">
      <button
        type="button"
        className="workspace-menu-edge"
        data-workspace-menu-trigger
        aria-label="Sol menüyü aç"
        aria-controls="workspace-main-menu"
        aria-expanded={menu.open}
        style={{ top: menu.top }}
        onPointerEnter={(event) =>
          event.pointerType === "mouse" && menu.enter()
        }
        onPointerLeave={menu.leave}
        onClick={(event) => !menu.open && menu.toggle(event.detail === 0)}
      >
        <Menu
          className="workspace-menu-edge-icon"
          size={16}
          aria-hidden="true"
        />
        <span className="workspace-menu-edge-caption" aria-hidden="true">
          Menü
          <ChevronsRight size={14} />
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
        style={{ top: menu.top }}
        onPointerEnter={(event) =>
          event.pointerType === "mouse" && menu.enter()
        }
        onPointerLeave={menu.leave}
        onFocusCapture={menu.focus}
        onBlurCapture={menu.leave}
      >
        <div className="workspace-menu-heading">
          <strong>Çalışma alanı</strong>
          <button
            type="button"
            className="iconbutton"
            onClick={menu.pin}
            aria-label={menu.pinned ? "Menüyü serbest bırak" : "Menüyü sabitle"}
            aria-pressed={menu.pinned}
          >
            {menu.pinned ? <PinOff size={17} /> : <Pin size={17} />}
          </button>
          <button
            type="button"
            className="iconbutton"
            aria-label="Sol menüyü kapat"
            onClick={() => menu.close(true)}
          >
            <X size={18} />
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
              onClick={() => {
                if (item.value === tab && !menu.pinned) menu.close(true);
              }}
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
      {![
        "access",
        "teams",
        "critical",
        "risk",
        "activity",
        "progress",
      ].includes(tab) && (
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
                  <span className="scenario-pending-badge" aria-hidden="true">
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
      )}
    </div>
  );
}
