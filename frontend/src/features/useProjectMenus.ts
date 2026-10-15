import { useEffect, useRef, useState, type MouseEvent } from "react";
import type { Data, Project, Milestone } from "../model";
import type { Change } from "../../../shared/commands";
import {
  milestoneClipboardColor,
  prepareMilestoneColorPaste,
  type PhaseTarget,
  type MilestoneTarget,
} from "./project-clipboard";
import { usePhaseGrid } from "./usePhaseGrid";
import { milestoneRanges, rangeNotes } from "../../../shared/milestone-ranges";
import { prepareMilestoneReportChange } from "./project-timeline-commands";
import {
  captureProjectSnapshot,
  type ProjectSnapshot,
} from "./project-snapshot";
type Position = { x: number; y: number };
type Props = {
  data: Data | null;
  visibleProjects: Project[];
  months: string[];
  active: boolean;
  selectionKey: string;
  isAdmin: boolean;
  saving: boolean;
  batch: (changes: Change[]) => Promise<void>;
  setNotice: (message: string) => void;
  setError: (message: string) => void;
};
function menuPosition(
  event: MouseEvent<HTMLButtonElement>,
  height: number,
  width = 220,
): Position {
  const rect = event.currentTarget.getBoundingClientRect();
  const zoom =
    Number.parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
  return {
    x:
      Math.max(
        8,
        Math.min(event.clientX || rect.left, window.innerWidth - width * zoom),
      ) / zoom,
    y:
      Math.max(
        8,
        Math.min(
          event.clientY || rect.bottom,
          window.innerHeight - height * zoom,
        ),
      ) / zoom,
  };
}
export function useProjectMenus({
  data,
  visibleProjects,
  months,
  active,
  selectionKey,
  isAdmin,
  saving,
  batch,
  setNotice,
  setError,
}: Props) {
  const phaseGrid = usePhaseGrid({
    data,
    visibleProjects,
    months,
    active,
    selectionKey,
    isAdmin,
    saving,
    batch,
    setNotice,
    setError,
  });
  const menuRef = useRef<HTMLDivElement>(null);
  const [phaseMenu, setPhaseMenu] = useState<(PhaseTarget & Position) | null>(
    null,
  );
  const [milestoneMenu, setMilestoneMenu] = useState<
    (MilestoneTarget & Position & ProjectSnapshot) | null
  >(null);
  const reportSaving = useRef(false);
  const copiedPhase = phaseGrid.clipboards.text || null;
  const copiedPhaseColor =
    phaseGrid.clipboards.color?.rowCount === 1 &&
    phaseGrid.clipboards.color.columnCount === 1
      ? phaseGrid.clipboards.color.values[0][0].color
      : null;
  const copiedPhaseBundle = phaseGrid.clipboards.bundle || null;
  useEffect(() => {
    if (!phaseMenu && !milestoneMenu) return;
    menuRef.current?.focus();
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPhaseMenu(null);
        setMilestoneMenu(null);
      }
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [phaseMenu, milestoneMenu]);
  function openPhaseMenu(
    event: MouseEvent<HTMLButtonElement>,
    project: Project,
    month: string,
  ) {
    event.preventDefault();
    if (month < project.start || month > project.end) return;
    setMilestoneMenu(null);
    phaseGrid.selectAnchor(phaseGrid.key(project.id, month));
    setPhaseMenu({ projectId: project.id, month, ...menuPosition(event, 320) });
  }
  function openMilestoneMenu(
    event: MouseEvent<HTMLButtonElement>,
    project: Project,
    milestone: Milestone,
    rangeIndex: number,
  ) {
    event.preventDefault();
    if (!data) return;
    setPhaseMenu(null);
    const range = milestoneRanges(milestone)[rangeIndex];
    const count = range ? rangeNotes(range).length : 0;
    setMilestoneMenu({
      projectId: project.id,
      milestoneId: milestone.id,
      rangeIndex,
      ...captureProjectSnapshot(
        project,
        data.revisions["project:" + project.id] || 0,
      ),
      ...menuPosition(event, Math.min(480, 175 + count * 66), 380),
    });
  }
  async function toggleMilestoneReport(
    noteIndex: number,
    includeInReport: boolean,
  ) {
    if (!milestoneMenu || !isAdmin || saving || reportSaving.current) return;
    const target = milestoneMenu;
    reportSaving.current = true;
    try {
      await batch([
        prepareMilestoneReportChange(
          target.project,
          target.revision,
          target.milestoneId,
          target.rangeIndex,
          noteIndex,
          includeInReport,
        ),
      ]);
      setMilestoneMenu((current) => (current === target ? null : current));
      setNotice(
        includeInReport
          ? "Detay not rapora eklendi."
          : "Detay not rapordan çıkarıldı.",
      );
    } catch (error) {
      setError((error as Error).message);
    } finally {
      reportSaving.current = false;
    }
  }
  function copyPhase() {
    if (!phaseMenu) return;
    phaseGrid.copy(
      "text",
      phaseGrid.menuSelection(
        phaseGrid.key(phaseMenu.projectId, phaseMenu.month),
      ),
    );
    setPhaseMenu(null);
  }
  function copyPhaseColor() {
    if (!phaseMenu) return;
    phaseGrid.copy(
      "color",
      phaseGrid.menuSelection(
        phaseGrid.key(phaseMenu.projectId, phaseMenu.month),
      ),
    );
    setPhaseMenu(null);
  }
  function copyPhaseBundle() {
    if (!phaseMenu) return;
    phaseGrid.copy(
      "bundle",
      phaseGrid.menuSelection(
        phaseGrid.key(phaseMenu.projectId, phaseMenu.month),
      ),
    );
    setPhaseMenu(null);
  }
  async function pastePhase() {
    if (!phaseMenu) return;
    const key = phaseGrid.key(phaseMenu.projectId, phaseMenu.month);
    await phaseGrid.paste("text", key, phaseGrid.menuSelection(key));
    setPhaseMenu(null);
  }
  async function pastePhaseColor() {
    if (!phaseMenu) return;
    const key = phaseGrid.key(phaseMenu.projectId, phaseMenu.month);
    await phaseGrid.paste("color", key, phaseGrid.menuSelection(key));
    setPhaseMenu(null);
  }
  async function pastePhaseBundle() {
    if (!phaseMenu) return;
    const key = phaseGrid.key(phaseMenu.projectId, phaseMenu.month);
    await phaseGrid.paste("bundle", key, phaseGrid.menuSelection(key));
    setPhaseMenu(null);
  }
  function copyMilestoneColor() {
    if (!milestoneMenu) return;
    try {
      phaseGrid.copyColor(
        milestoneClipboardColor(milestoneMenu.project, milestoneMenu),
      );
      setMilestoneMenu(null);
      setNotice("Bar rengi kopyalandı");
    } catch (error) {
      setError((error as Error).message);
    }
  }
  async function pasteMilestoneColor() {
    if (
      !milestoneMenu ||
      copiedPhaseColor === null ||
      !isAdmin ||
      saving ||
      reportSaving.current
    )
      return;
    const target = milestoneMenu,
      color = copiedPhaseColor;
    reportSaving.current = true;
    try {
      await batch([prepareMilestoneColorPaste(target, target, color)]);
      setMilestoneMenu((current) => (current === target ? null : current));
      setNotice("Bar rengi yapıştırıldı");
    } catch (error) {
      setError((error as Error).message);
    } finally {
      reportSaving.current = false;
    }
  }
  return {
    phaseGrid,
    menuRef,
    phaseMenu,
    setPhaseMenu,
    milestoneMenu,
    setMilestoneMenu,
    copiedPhase,
    copiedPhaseColor,
    copiedPhaseBundle,
    openPhaseMenu,
    openMilestoneMenu,
    copyPhase,
    copyPhaseColor,
    copyPhaseBundle,
    pastePhase,
    pastePhaseColor,
    pastePhaseBundle,
    copyMilestoneColor,
    pasteMilestoneColor,
    toggleMilestoneReport,
  };
}
