import type { Project } from "./model";

export default function ProjectResponsible({
  project,
}: {
  project?: Project | null;
}) {
  if (!project) return null;
  return (
    <small className="project-responsible">
      Proje Sorumlusu : {project.responsibleName?.trim() || "—"}
    </small>
  );
}
