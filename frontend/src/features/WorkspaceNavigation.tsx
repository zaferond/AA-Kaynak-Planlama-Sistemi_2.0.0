import type { RefObject } from "react";
import {
  ArrowDownToLine,
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
    isManager = user?.role === "manager";
  return (
    <div className="workspace-nav">
      <TabsList
        ref={mainTabsRef}
        className="navtabs"
        variant="line"
        aria-label="Ana sekmeler"
      >
        {(isAdmin || isManager || user?.role === "normal") && (
          <TabsTrigger value="actual">
            <CalendarDays />
            {TAB_LABELS.actual}
          </TabsTrigger>
        )}
        {(isAdmin || isManager || user?.role === "normal") && (
          <TabsTrigger value="activity">
            <CalendarDays />
            {TAB_LABELS.activity}
          </TabsTrigger>
        )}
        {(isAdmin || isManager) && (
          <TabsTrigger value="plan">
            <CalendarDays />
            {TAB_LABELS.plan}
          </TabsTrigger>
        )}
        <TabsTrigger value="projects">
          <FolderKanban />
          {TAB_LABELS.projects}
        </TabsTrigger>
        {RISK_MANAGEMENT_ENABLED && (
          <TabsTrigger value="risk">
            <ShieldAlert />
            {TAB_LABELS.risk}
          </TabsTrigger>
        )}
        {(isAdmin || isManager) && (
          <TabsTrigger value="critical">
            <FolderKanban />
            {TAB_LABELS.critical}
          </TabsTrigger>
        )}
        {(isAdmin || isManager) && (
          <TabsTrigger value="overview">
            <Layers3 />
            {TAB_LABELS.overview}
          </TabsTrigger>
        )}
        {isAdmin && (
          <TabsTrigger value="resources">
            <Users />
            {TAB_LABELS.resources}
          </TabsTrigger>
        )}
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
          {tab === "projects" && isAdmin && (
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
