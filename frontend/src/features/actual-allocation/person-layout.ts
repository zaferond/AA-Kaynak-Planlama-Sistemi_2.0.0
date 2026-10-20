import type { Project, Resource } from "../../../../shared/model.ts";
import { ownValue } from "../../../../shared/records.ts";

/** "Kişi → Proje": all projects in the visible scope are listed by default.
 * Data-only mode keeps entered projects and rows explicitly added for entry. */
export type PersonGroup = {
  person: Resource;
  projects: Project[];
  hasData: boolean;
};

export const PERSONS_PER_PAGE = 30;

const searchText = (value: string) => value.toLocaleLowerCase("tr").trim();

export function personGroups({
  people,
  projects,
  months,
  actualAllocations,
  added,
  query,
  onlyDataRows,
}: {
  people: Resource[];
  projects: Project[];
  months: string[];
  actualAllocations: Record<string, number> | undefined;
  /** "personId|projectId" rows opened with "+ Proje". */
  added: ReadonlySet<string>;
  query: string;
  onlyDataRows: boolean;
}): PersonGroup[] {
  const needle = searchText(query);
  const values = actualAllocations || {};
  return people
    .filter((person) => !needle || searchText(person.name).includes(needle))
    .map((person) => {
      const withData = projects.filter((project) =>
        months.some(
          (month) =>
            (ownValue(values, person.id + "|" + project.id + "|" + month) ||
              0) !== 0,
        ),
      );
      const listed = onlyDataRows
        ? projects.filter(
            (project) =>
              withData.includes(project) ||
              added.has(person.id + "|" + project.id),
          )
        : projects;
      return { person, projects: listed, hasData: withData.length > 0 };
    })
    .filter((group) => !onlyDataRows || group.projects.length > 0);
}

/** Projects a person can still be given a row for, in report order. */
export const addableProjects = (group: PersonGroup, projects: Project[]) =>
  projects.filter((project) => !group.projects.includes(project));
