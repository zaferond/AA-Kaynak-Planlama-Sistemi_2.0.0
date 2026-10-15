import type { Project } from "./model.ts";

/** Unranked legacy records retain their relative order until the first reorder. */
export function orderedProjects(projects: readonly Project[]): Project[] {
  return [...projects].sort(
    (a, b) => (a.sortOrder ?? -1) - (b.sortOrder ?? -1),
  );
}
