import type { Principal } from "../../access";
import type { Project } from "../../model";
import type { ProjectProgress } from "../../../../shared/project-progress.ts";
import type { ProgressContext } from "./progress-view";

export type ProgressItem = {
  project: Project;
  leader: string;
  record: ProjectProgress | undefined;
};

/**
 * Leaderships the user works for: an admin sees all of them, a leader those
 * granted in "Kaynak Planlama Yetkisi" (the same list the server checks).
 */
export function progressLeaders(ctx: ProgressContext, user: Principal | null) {
  if (user?.role === "admin") return ctx.data.leaders || [];
  if (user?.role === "manager") return user.leaders;
  return [];
}

/**
 * A leadership's projects: those it has planned resource on, plus any that
 * already carry a progress record. Grouped by leadership, names in order.
 */
export function progressGroups(
  ctx: ProgressContext,
  leaders: string[],
): [string, ProgressItem[]][] {
  const records = ctx.data.projectProgress || [];
  return [...leaders]
    .sort((a, b) => a.localeCompare(b, "tr"))
    .map((leader): [string, ProgressItem[]] => [
      leader,
      ctx.data.projects
        .filter(
          (project) =>
            ctx.planned(project.id).has(leader) ||
            records.some(
              (r) => r.projectId === project.id && r.leader === leader,
            ),
        )
        .map((project) => ({
          project,
          leader,
          record: records.find(
            (r) => r.projectId === project.id && r.leader === leader,
          ),
        })),
    ])
    .filter(([, items]) => items.length > 0);
}
