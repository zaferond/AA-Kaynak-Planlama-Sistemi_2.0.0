import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, GripVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { TableBody, TableRow, TableCell } from "@/components/ui/table";
import {
  periodOverlapsProject,
  phaseInitial,
  phaseMonthForPeriod,
} from "./timeline-periods";
import { phasePalette } from "./model";
import { phaseChipStyle, phaseChipEmpty } from "./phase-chip";
import ProjectResponsible from "./ProjectResponsible";
import { milestoneRanges } from "./milestone-ranges";
import { milestoneBarsForPeriods } from "./milestone-bars";
import { weeklyNoteLayout } from "./weekly-note-bars";
import MilestoneTrack from "./MilestoneTrack";
import type { ProjectTimelineRowProps } from "./features/project-timeline-types";
import { positionPointerTooltip } from "./features/position-pointer-tooltip";

import { monthLabel, dateLabel } from "./features/timeline-labels";

export default function ProjectTimelineRows({
  project,
  projectRevision,
  ordering,
  periods,
  density,
  expandAllDetails,
  showCodes = false,
  windowKey,
  expanded: controlledExpanded,
  onExpandedChange,
  isAdmin,
  saving,
  onProjectInfo,
  onPhaseClick,
  phaseSelection,
  onPhaseContextMenu,
  onAddMilestone,
  onEditMilestone,
  onDeleteMilestone,
  onReorderMilestone,
  onMilestoneContextMenu,
  onChangeMilestoneRange,
  onChangeMilestoneNote,
}: ProjectTimelineRowProps) {
  const [localExpanded, setLocalExpanded] = useState(expandAllDetails);
  const expanded = controlledExpanded ?? localExpanded;
  const setExpanded = (value: boolean) => {
    setLocalExpanded(value);
    onExpandedChange?.(value);
  };
  const [hoveredPhase, setHoveredPhase] = useState("");
  const [draggedTopic, setDraggedTopic] = useState("");
  const [dropTarget, setDropTarget] = useState<{
    id: string;
    after: boolean;
  } | null>(null);
  function clearTopicDrag() {
    setDraggedTopic("");
    setDropTarget(null);
  }
  useEffect(clearTopicDrag, [project.milestones, expanded, saving]);
  const phaseTooltipRef = useRef<HTMLDivElement>(null);
  const phasePointerRef = useRef({ x: 0, y: 0 });
  useLayoutEffect(() => setLocalExpanded(expandAllDetails), [expandAllDetails]);
  useEffect(() => setHoveredPhase(""), [periods]);
  useLayoutEffect(() => {
    if (hoveredPhase)
      positionPhaseTooltip(
        phasePointerRef.current.x,
        phasePointerRef.current.y,
      );
  }, [hoveredPhase]);
  useEffect(() => {
    if (!hoveredPhase) return;
    const hide = () => setHoveredPhase("");
    window.addEventListener("scroll", hide, true);
    return () => window.removeEventListener("scroll", hide, true);
  }, [hoveredPhase]);
  function positionPhaseTooltip(x: number, y: number) {
    phasePointerRef.current = { x, y };
    positionPointerTooltip(phaseTooltipRef.current, x, y);
  }
  const milestones = project.milestones || [];
  return (
    <TableBody
      className="project-row-group"
      data-project-group={project.id}
      data-window-key={windowKey}
    >
      <TableRow
        data-project-heading={project.id}
        className={
          "project-main-row project-freeze-row" +
          (ordering.dragging ? " project-dragging" : "") +
          (ordering.dropPosition
            ? " project-drop-" + ordering.dropPosition
            : "")
        }
        onDragOver={ordering.onDragOver}
        onDrop={ordering.onDrop}
      >
        <TableCell>
          <div className="project-name-cell">
            {isAdmin && (
              <button
                type="button"
                className="project-reorder-handle"
                disabled={saving}
                draggable={!saving}
                title="Sürükleyerek sırala · Alt + ↑ / ↓"
                aria-label={project.name + " proje sırasını değiştir"}
                onDragStart={ordering.onDragStart}
                onDragEnd={ordering.onDragEnd}
                onKeyDown={ordering.onKeyDown}
              >
                <GripVertical size={16} />
              </button>
            )}
            <button
              type="button"
              className="project-expand"
              aria-label={
                project.name +
                " kritik konularını " +
                (expanded ? "gizle" : "göster")
              }
              aria-expanded={expanded}
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? <ChevronDown size={14} /> : <Plus size={14} />}
            </button>
            <div className="project-name-copy">
              <button
                className="textbutton"
                disabled={!isAdmin}
                onClick={onProjectInfo}
              >
                {project.name}
              </button>
              <ProjectResponsible project={project} />
              <small>
                {project.start} → {project.end}
              </small>
            </div>
            {milestones.length > 0 && (
              <span
                className="milestone-count"
                title={milestones.length + " kritik konu"}
              >
                {milestones.length}
              </span>
            )}
          </div>
        </TableCell>
        {showCodes && (
          <TableCell className="project-code-cell">
            {project.code || "—"}
          </TableCell>
        )}
        {periods.map((period) => {
          const active = periodOverlapsProject(period, project);
          const month = phaseMonthForPeriod(period, project);
          const phaseText = active ? project.phases[month]?.trim() : "";
          return (
            <TableCell
              key={period.key}
              data-phase-cell={phaseSelection.key(project.id, month)}
              className={
                phaseSelection.cells.includes(
                  phaseSelection.key(project.id, month),
                )
                  ? "phase-cell-selected"
                  : undefined
              }
              onPointerDown={(event) =>
                phaseSelection.startDrag(
                  event,
                  phaseSelection.key(project.id, month),
                )
              }
            >
              <button
                className="phasebutton phase-chip"
                disabled={!active}
                style={phaseChipStyle(project, month)}
                data-phase-empty={!active || phaseChipEmpty(project, month)}
                aria-label={
                  project.name +
                  " / " +
                  (period.kind === "week"
                    ? period.fullLabel
                    : monthLabel(month)) +
                  " aşama ayrıntısı" +
                  (phaseText ? ": " + phaseText : "")
                }
                onMouseEnter={
                  phaseText
                    ? (event) => {
                        phasePointerRef.current = {
                          x: event.clientX,
                          y: event.clientY,
                        };
                        setHoveredPhase(phaseText);
                      }
                    : undefined
                }
                onMouseMove={
                  phaseText
                    ? (event) =>
                        positionPhaseTooltip(event.clientX, event.clientY)
                    : undefined
                }
                onMouseLeave={() => setHoveredPhase("")}
                onFocus={
                  phaseText
                    ? (event) => {
                        const rect =
                          event.currentTarget.getBoundingClientRect();
                        phasePointerRef.current = {
                          x: rect.left + rect.width / 2,
                          y: rect.bottom,
                        };
                        setHoveredPhase(phaseText);
                      }
                    : undefined
                }
                onBlur={() => setHoveredPhase("")}
                onContextMenu={(event) => {
                  setHoveredPhase("");
                  onPhaseContextMenu(event, month);
                }}
                aria-pressed={phaseSelection.cells.includes(
                  phaseSelection.key(project.id, month),
                )}
                onClick={(event) => {
                  setHoveredPhase("");
                  phaseSelection.choose(
                    event,
                    phaseSelection.key(project.id, month),
                  );
                }}
                onDoubleClick={() => {
                  setHoveredPhase("");
                  onPhaseClick(month);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    onPhaseClick(month);
                  }
                }}
              >
                <span className="phasepreview">
                  {!active ? (
                    "-"
                  ) : density === "overview" ? (
                    phaseText ? (
                      <strong className="phase-initial">
                        {phaseInitial(phaseText)}
                      </strong>
                    ) : (
                      "-"
                    )
                  ) : (
                    phaseText || "-"
                  )}
                </span>
              </button>
            </TableCell>
          );
        })}
      </TableRow>
      {expanded && (
        <>
          {isAdmin && (
            <TableRow className="milestone-section-row">
              <TableCell colSpan={periods.length + (showCodes ? 2 : 1)}>
                <div className="milestone-section">
                  <button
                    type="button"
                    className="button milestone-add"
                    disabled={saving}
                    onClick={onAddMilestone}
                  >
                    <Plus size={14} />
                    Başlık Ekle
                  </button>
                </div>
              </TableCell>
            </TableRow>
          )}
          {milestones.map((milestone, milestoneIndex) => {
            const ranges = milestoneRanges(milestone);
            const pointCount = ranges.filter(
              (range) => range.displayKind === "milestone",
            ).length;
            const bars = milestoneBarsForPeriods(ranges, periods);
            const color =
              phasePalette.find(
                (item) => item.id === (milestone.barColor || "red"),
              ) || phasePalette[3];
            const weeklyLayout =
              periods[0]?.kind === "week"
                ? weeklyNoteLayout(ranges, periods)
                : null;
            return (
              <TableRow
                className={
                  "milestone-row" +
                  (draggedTopic === milestone.id ? " topic-dragging" : "") +
                  (dropTarget?.id === milestone.id
                    ? dropTarget.after
                      ? " topic-drop-after"
                      : " topic-drop-before"
                    : "")
                }
                key={milestone.id}
                onDragOver={(event) => {
                  if (!isAdmin || saving || !draggedTopic) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  if (draggedTopic === milestone.id) {
                    setDropTarget(null);
                    return;
                  }
                  const rect = event.currentTarget.getBoundingClientRect();
                  setDropTarget({
                    id: milestone.id,
                    after: event.clientY > rect.top + rect.height / 2,
                  });
                }}
                onDrop={(event) => {
                  if (!isAdmin || saving || !draggedTopic) return;
                  event.preventDefault();
                  const rect = event.currentTarget.getBoundingClientRect();
                  onReorderMilestone(
                    draggedTopic,
                    milestone.id,
                    event.clientY > rect.top + rect.height / 2,
                  );
                  clearTopicDrag();
                }}
              >
                <TableCell>
                  <div className="milestone-name-cell">
                    {isAdmin && (
                      <button
                        type="button"
                        className="topic-reorder-handle"
                        disabled={saving || milestones.length < 2}
                        draggable={!saving && milestones.length > 1}
                        title="Sürükleyerek sırala · Alt + ↑ / ↓"
                        aria-label={milestone.name + " sırasını değiştir"}
                        onDragStart={(event) => {
                          event.dataTransfer.effectAllowed = "move";
                          event.dataTransfer.setData(
                            "text/plain",
                            milestone.name,
                          );
                          setDraggedTopic(milestone.id);
                        }}
                        onDragEnd={clearTopicDrag}
                        onKeyDown={(event) => {
                          if (!event.altKey || saving) return;
                          const offset =
                            event.key === "ArrowUp"
                              ? -1
                              : event.key === "ArrowDown"
                                ? 1
                                : 0;
                          if (!offset) return;
                          event.preventDefault();
                          const target = milestones[milestoneIndex + offset];
                          if (target)
                            onReorderMilestone(
                              milestone.id,
                              target.id,
                              offset > 0,
                            );
                        }}
                      >
                        <GripVertical size={16} />
                      </button>
                    )}
                    <span
                      className="milestone-symbol"
                      aria-hidden="true"
                      style={{ borderColor: color.border }}
                    />
                    <div className="milestone-name-copy">
                      <strong title={milestone.name}>{milestone.name}</strong>
                      <small
                        title={ranges
                          .map(
                            (range) =>
                              dateLabel(range.start) +
                              " – " +
                              dateLabel(range.end),
                          )
                          .join("\n")}
                      >
                        {ranges.length === 0
                          ? "Kritik detay konu eklenmedi"
                          : ranges.length === 1 &&
                              ranges[0].displayKind === "milestone"
                            ? "Milestone · " + dateLabel(milestone.start)
                            : ranges.length === 1
                              ? dateLabel(ranges[0].start) +
                                " – " +
                                dateLabel(ranges[0].end)
                              : pointCount
                                ? (ranges.length > pointCount
                                    ? ranges.length - pointCount + " aralık · "
                                    : "") +
                                  pointCount +
                                  " Milestone"
                                : ranges.length + " tarih aralığı"}
                      </small>
                      {!!weeklyLayout?.undated.length && (
                        <div className="weekly-undated-notes">
                          <span>Tarihi belirtilmemiş detaylar</span>
                          {weeklyLayout.undated.map((note) => (
                            <button
                              type="button"
                              key={`${note.rangeIndex}-${note.noteIndex}`}
                              title={note.text}
                              className={
                                note.completed ? "completed" : undefined
                              }
                              onClick={() => {
                                if (isAdmin && !saving)
                                  onEditMilestone(milestone);
                              }}
                            >
                              {note.text}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {isAdmin && (
                      <div className="milestone-actions">
                        <button
                          type="button"
                          title="Başlık Düzenle"
                          aria-label={milestone.name + " düzenle"}
                          disabled={saving}
                          onClick={() => onEditMilestone(milestone)}
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          type="button"
                          title="Kritik Konuyu Sil"
                          aria-label={milestone.name + " sil"}
                          disabled={saving}
                          onClick={() => onDeleteMilestone(milestone)}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    )}
                  </div>
                </TableCell>
                {showCodes && (
                  <TableCell className="project-code-cell" aria-hidden="true" />
                )}
                <TableCell
                  colSpan={periods.length}
                  className="milestone-month milestone-track-cell"
                >
                  {ranges.length ? (
                    <MilestoneTrack
                      project={project}
                      projectRevision={projectRevision}
                      milestone={milestone}
                      ranges={ranges}
                      bars={bars}
                      periods={periods}
                      weeklyLayout={weeklyLayout}
                      isAdmin={isAdmin}
                      saving={saving}
                      onEditMilestone={onEditMilestone}
                      onMilestoneContextMenu={onMilestoneContextMenu}
                      onChangeMilestoneRange={onChangeMilestoneRange}
                      onChangeMilestoneNote={onChangeMilestoneNote}
                    />
                  ) : (
                    <div className="milestone-track milestone-track-empty">
                      Kritik detay konu eklenmedi
                    </div>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </>
      )}
      {hoveredPhase &&
        createPortal(
          <div
            ref={phaseTooltipRef}
            className="project-phase-tooltip"
            role="tooltip"
            style={{ left: -10000, top: -10000 }}
          >
            {hoveredPhase}
          </div>,
          document.body,
        )}
    </TableBody>
  );
}
