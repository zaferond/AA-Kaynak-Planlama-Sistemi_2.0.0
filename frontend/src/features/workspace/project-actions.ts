import type { usePortalData } from "../usePortalData";
import type { Project } from "../../model";
import type { ProjectSnapshot } from "../project-snapshot";
import { prepareProjectReorder } from "../project-order-commands";
import {
  prepareMilestoneReorder,
  prepareTimelineChange,
} from "../project-timeline-commands";
type Props = Pick<
  ReturnType<typeof usePortalData>,
  "data" | "saving" | "batch" | "setNotice" | "setError"
> & { isAdmin: boolean };
/** Keep revision/date preparation in the existing pure command modules. */
export function createProjectActions({
  data,
  saving,
  batch,
  setNotice,
  setError,
  isAdmin,
}: Props) {
  async function reorderProject(
    sourceId: string,
    targetId: string,
    after: boolean,
    expected: string[],
  ) {
    if (!data || !isAdmin || saving) return;
    try {
      const commands = prepareProjectReorder(
        data,
        sourceId,
        targetId,
        after,
        expected,
      );
      if (!commands.length) return;
      await batch(commands);
      setNotice("Proje sıralaması kaydedildi.");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function reorderMilestone(
    project: Project,
    sourceId: string,
    targetId: string,
    after: boolean,
  ) {
    if (!data || !isAdmin || saving) return;
    try {
      const command = prepareMilestoneReorder(
        data,
        project.id,
        sourceId,
        targetId,
        after,
        (project.milestones || []).map((m) => m.id),
      );
      if (!command) return;
      await batch([command]);
      setNotice("Kritik konu sıralaması kaydedildi.");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function changeMilestoneRange(
    snapshot: ProjectSnapshot,
    milestoneId: string,
    rangeIndex: number,
    mode: "move" | "start" | "end",
    days: number,
  ) {
    if (!data || !isAdmin || saving || days === 0) return;
    try {
      await batch([
        prepareTimelineChange(snapshot, milestoneId, {
          target: "range",
          rangeIndex,
          mode,
          days,
        }),
      ]);
      setNotice(
        mode === "move"
          ? "Kritik konu barı ve açıklama tarihleri " +
              Math.abs(days) +
              " gün " +
              (days > 0 ? "sağa" : "sola") +
              " taşındı."
          : "Kritik konu barının " +
              (mode === "start" ? "başlangıç" : "bitiş") +
              " tarihi ve bağlı detay açıklama tarihleri güncellendi.",
      );
    } catch (error) {
      setError((error as Error).message);
    }
  }
  async function changeMilestoneNote(
    snapshot: ProjectSnapshot,
    milestoneId: string,
    rangeIndex: number,
    noteIndex: number,
    mode: "move" | "start" | "end",
    days: number,
  ) {
    if (!data || !isAdmin || saving || days === 0) return;
    try {
      await batch([
        prepareTimelineChange(snapshot, milestoneId, {
          target: "note",
          rangeIndex,
          noteIndex,
          mode,
          days,
        }),
      ]);
      setNotice(
        mode === "move"
          ? "Detay açıklama ve kritik konu tarihleri güncellendi."
          : "Detay açıklamanın ve kritik konunun tarihleri güncellendi.",
      );
    } catch (error) {
      setError((error as Error).message);
    }
  }
  return {
    reorderProject,
    reorderMilestone,
    changeMilestoneRange,
    changeMilestoneNote,
  };
}
