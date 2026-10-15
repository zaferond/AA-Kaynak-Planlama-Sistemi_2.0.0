import {
  useMemo,
  useState,
  useLayoutEffect,
  type MouseEvent,
  type CSSProperties,
} from "react";
import { Switch } from "@/components/ui/switch";
import { Table, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  TimelineMonthHead,
  TimelineYearRow,
  yearBandClass,
} from "../components/TimelineHeaders";
import ProjectTimelineRows from "../ProjectTimelineRows";
import type { Project, Milestone } from "../model";
import { projectTimelinePeriods } from "../timeline-periods";

import type { usePhaseGrid } from "./usePhaseGrid";
import { useProjectRowOrder } from "./useProjectRowOrder";
import type { ProjectTimelineRowProps } from "./project-timeline-types";
import WorkspaceFilterSummary, {
  type SummaryFilter,
} from "./workspace/WorkspaceFilterSummary";
import { useWindowedSections } from "./workspace/useWindowedSections";
import { useViewportWorkspace } from "./workspace/useViewportWorkspace";
export type ProjectTimelineActions = {
  onReorderProject: (
    sourceId: string,
    targetId: string,
    after: boolean,
    expected: string[],
  ) => Promise<void>;
  onProjectInfo: (project: Project) => void;
  onPhaseClick: (project: Project, month: string) => void;
  onPhaseContextMenu: (
    event: MouseEvent<HTMLButtonElement>,
    project: Project,
    month: string,
  ) => void;
  onAddMilestone: (project: Project) => void;
  onEditMilestone: (project: Project, milestone: Milestone) => void;
  onDeleteMilestone: (project: Project, milestone: Milestone) => Promise<void>;
  onReorderMilestone: (
    project: Project,
    sourceId: string,
    targetId: string,
    after: boolean,
  ) => Promise<void>;
  onMilestoneContextMenu: (
    event: MouseEvent<HTMLButtonElement>,
    project: Project,
    milestone: Milestone,
    rangeIndex: number,
  ) => void;
  onChangeMilestoneRange: ProjectTimelineRowProps["onChangeMilestoneRange"];
  onChangeMilestoneNote: ProjectTimelineRowProps["onChangeMilestoneNote"];
};
type Props = {
  filters: SummaryFilter[];
  projects: Project[];
  revisions: Record<string, number>;
  months: string[];
  weekly: boolean;
  showCodes: boolean;
  onCodesChange: (show: boolean) => void;
  todayDate: string;
  labelWidth: number;
  monthWidth: number;
  density: "detail" | "compact" | "overview";
  expandAllDetails: boolean;
  onDetailsChange: (show: boolean) => void;
  onWeeklyChange: (show: boolean) => void;
  isAdmin: boolean;
  saving: boolean;
  page: number;
  onPageChange: (page: number) => void;
  actions: ProjectTimelineActions;
  selection: ReturnType<typeof usePhaseGrid>;
};

export default function ProjectTimelinePanel({
  filters,
  projects,
  revisions,
  months,
  weekly,
  showCodes,
  onCodesChange,
  todayDate,
  labelWidth,
  monthWidth,
  density,
  expandAllDetails,
  onDetailsChange,
  onWeeklyChange,
  isAdmin,
  saving,
  page,
  onPageChange,
  actions,
  selection,
}: Props) {
  const viewportRef = useViewportWorkspace();
  const labelColumns = showCodes ? 2 : 1;
  const codeWidth = showCodes ? 110 : 0;
  const [expandedProjects, setExpandedProjects] = useState<
    Record<string, boolean>
  >({});
  useLayoutEffect(() => setExpandedProjects({}), [expandAllDetails]);
  const ordering = useProjectRowOrder(
    projects,
    isAdmin,
    saving,
    actions.onReorderProject,
  );
  const projectPeriods = useMemo(
    () => projectTimelinePeriods(months, weekly),
    [months, weekly],
  );
  const projectYearBands = useMemo(
    () => [...new Set(projectPeriods.map((period) => period.year))],
    [projectPeriods],
  );
  const sections = projects.map((p) => ({
    key: p.id,
    height:
      82 +
      ((expandedProjects[p.id] ?? expandAllDetails)
        ? 44 + (p.milestones || []).length * 100
        : 0),
    render: () => (
      <ProjectTimelineRows
        key={p.id}
        windowKey={p.id}
        expanded={expandedProjects[p.id] ?? expandAllDetails}
        onExpandedChange={(value) =>
          setExpandedProjects((old) => ({ ...old, [p.id]: value }))
        }
        project={p}
        showCodes={showCodes}
        projectRevision={revisions["project:" + p.id] || 0}
        ordering={ordering.rowProps(p.id)}
        phaseSelection={selection}
        periods={projectPeriods}
        density={density}
        expandAllDetails={expandAllDetails}
        isAdmin={!!isAdmin}
        saving={saving}
        onProjectInfo={() => actions.onProjectInfo(p)}
        onPhaseClick={(m) => actions.onPhaseClick(p, m)}
        onPhaseContextMenu={(event, m) =>
          actions.onPhaseContextMenu(event, p, m)
        }
        onAddMilestone={() => actions.onAddMilestone(p)}
        onEditMilestone={(milestone) => actions.onEditMilestone(p, milestone)}
        onDeleteMilestone={(milestone) =>
          void actions.onDeleteMilestone(p, milestone)
        }
        onReorderMilestone={(sourceId, targetId, after) =>
          void actions.onReorderMilestone(p, sourceId, targetId, after)
        }
        onMilestoneContextMenu={(event, milestone, rangeIndex) =>
          actions.onMilestoneContextMenu(event, p, milestone, rangeIndex)
        }
        onChangeMilestoneRange={actions.onChangeMilestoneRange}
        onChangeMilestoneNote={actions.onChangeMilestoneNote}
      />
    ),
  }));
  const windowedRows = useWindowedSections(
    selection.tableRef,
    sections,
    projectPeriods.length + labelColumns,
    `${weekly}|${density}|${months.join("|")}|${expandAllDetails}|${showCodes}`,
  );
  return (
    <section className="panel workspace-dock" ref={viewportRef}>
      <WorkspaceFilterSummary filters={filters} />
      <div
        className="workspace-view-options"
        role="group"
        aria-label="Görünüm seçenekleri"
      >
        <label>
          <Switch
            size="sm"
            checked={expandAllDetails}
            onCheckedChange={onDetailsChange}
          />
          Detayları Göster
        </label>
        <label
          title={
            isAdmin
              ? "Detay kutusunu basılı tutup taşıyın; uçlarından günlük adımlarla genişletip daraltın."
              : "Detay açıklamalar kendi haftalarında gösterilir; gerçek tarihleri kutularda görünür."
          }
        >
          <Switch
            size="sm"
            checked={weekly}
            onCheckedChange={onWeeklyChange}
            aria-label="Haftalık proje görünümü"
          />
          Haftalık Görünüm
        </label>
        <label>
          <Switch
            size="sm"
            checked={showCodes}
            onCheckedChange={onCodesChange}
            aria-label="Proje Kodlarını Göster"
          />
          Proje Kodlarını Göster
        </label>
      </div>
      <div className="workspace-record-count">{projects.length} proje</div>
      <Table
        stickyProjectRows
        todayOverlay
        ref={selection.tableRef}
        todayDate={todayDate}
        todayMonthsKey={projectPeriods.map((period) => period.key).join("|")}
        className={
          "matrix projectmatrix planning-grid" +
          (weekly ? " weekly-projectmatrix" : "") +
          (showCodes ? " project-codes-visible" : "")
        }
        style={
          {
            width: labelWidth + codeWidth + projectPeriods.length * monthWidth,
            minWidth: "100%",
            "--project-name-width": `${labelWidth}px`,
          } as CSSProperties
        }
      >
        <colgroup>
          <col style={{ width: labelWidth }} />
          {showCodes && <col style={{ width: codeWidth }} />}
          {projectPeriods.map((period) => (
            <col key={period.key} style={{ width: monthWidth }} />
          ))}
        </colgroup>
        <TableHeader>
          <TimelineYearRow
            years={projectPeriods.map((period) => period.year)}
            labelColumns={labelColumns}
          />
          <TableRow>
            <TableHead>Proje</TableHead>
            {showCodes && (
              <TableHead className="project-code-cell">Proje Kodu</TableHead>
            )}
            {projectPeriods.map((period) =>
              period.kind === "month" ? (
                <TimelineMonthHead
                  key={period.key}
                  month={period.month}
                  years={projectYearBands}
                />
              ) : (
                <TableHead
                  key={period.key}
                  data-date-start={period.start}
                  data-date-end={period.end}
                  className={
                    "monthhead weekhead " +
                    yearBandClass(projectYearBands.indexOf(period.year))
                  }
                  title={period.fullLabel}
                >
                  <span className="week-number">W{period.weekNumber}</span>
                  <span className="week-range">{period.label}</span>
                </TableHead>
              ),
            )}
          </TableRow>
        </TableHeader>
        {windowedRows}
      </Table>
      {!projects.length && (
        <p className="emptymsg">Seçili filtrelere uygun proje bulunamadı.</p>
      )}
    </section>
  );
}
