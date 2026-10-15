import type { Project } from "../../../shared/model.ts";

/** Index-based interactions own one project value and its opening revision. */
export type ProjectSnapshot = {
  project: Project;
  revision: number;
};

export function captureProjectSnapshot(
  project: Project,
  revision: number,
): ProjectSnapshot {
  return { project: structuredClone(project), revision };
}
