import type { Data } from "../../../shared/model.ts";
import type { Change } from "../../../shared/commands.ts";
import { orderedProjects } from "../../../shared/project-order.ts";

/** Move within the complete order; filtered-out projects keep their relative order. */
export function prepareProjectReorder(
  data: Data,
  sourceId: string,
  targetId: string,
  after: boolean,
  expectedVisibleOrder: readonly string[],
): Change<"project">[] {
  const projects = orderedProjects(data.projects);
  const visible = new Set(expectedVisibleOrder);
  const current = projects.filter((p) => visible.has(p.id));
  if (
    current.length !== expectedVisibleOrder.length ||
    current.some((p, i) => p.id !== expectedVisibleOrder[i])
  )
    throw Error(
      "Proje sıralaması değişmiş. Verileri yenileyip tekrar deneyin.",
    );
  const source = projects.find((p) => p.id === sourceId);
  if (!source || !visible.has(sourceId) || !visible.has(targetId))
    throw Error("Proje bulunamadı. Verileri yenileyip tekrar deneyin.");
  if (sourceId === targetId) return [];
  const reordered = projects.filter((p) => p.id !== sourceId);
  const target = reordered.findIndex((p) => p.id === targetId);
  reordered.splice(target + (after ? 1 : 0), 0, source);
  if (reordered.every((p, i) => p.id === projects[i].id)) return [];
  return reordered.flatMap((p, sortOrder) =>
    p.sortOrder === sortOrder
      ? []
      : [
          {
            kind: "project" as const,
            id: p.id,
            revision: data.revisions["project:" + p.id] || 0,
            value: { ...p, sortOrder },
          },
        ],
  );
}
