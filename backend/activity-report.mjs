import { z } from "zod";
import { buildActivityRows } from "../shared/activity-report.ts";
import {
  activityTeamScope,
  createEmployeeAssignmentIndex,
} from "../shared/employee-directory.ts";
import { visibleLeaderParents } from "../shared/leadership-hierarchy.ts";
import { currentPlanningMonth } from "../shared/resource-dates.ts";
import {
  validPlanningMonth,
  MAX_FILTER_START,
} from "../shared/planning-dates.ts";
import { monthsFrom } from "../shared/model.ts";
export const activityQuery = z
  .object({
    start: z
      .string()
      .refine(
        (value) => validPlanningMonth(value) && value <= MAX_FILTER_START,
      ),
    count: z.coerce.number().int().min(1).max(60),
    projects: z
      .string()
      .max(16000)
      .default("[]")
      .transform((value, context) => {
        try {
          return z
            .array(z.string().max(120))
            .max(1000)
            .parse(JSON.parse(value));
        } catch {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Geçersiz proje filtresi.",
          });
          return z.NEVER;
        }
      }),
  })
  .strict();
export function activityReportResources(data, permitted, currentMonth) {
  const teamIds = new Set(permitted.map((team) => team.id));
  const assignments = createEmployeeAssignmentIndex(data, currentMonth);
  return data.resources.filter((resource) => {
    const assignment = assignments.get(resource.id);
    return assignment && teamIds.has(assignment.team.id);
  });
}
export function activityReport(
  data,
  user,
  query,
  currentMonth = currentPlanningMonth(),
) {
  const permitted = activityTeamScope(data, user, currentMonth);
  const resources = activityReportResources(data, permitted, currentMonth);
  const projects = data.projects.filter(
    (project) => !query.projects.length || query.projects.includes(project.id),
  );
  const leaders = [
    ...new Set(permitted.map((team) => team.lead).filter(Boolean)),
  ];
  return {
    teams: permitted.map((team) => ({
      id: team.id,
      name: team.name,
      lead: team.lead,
      excelCapacity: 0,
      ...(team.kind === "leadership" ? { kind: "leadership" } : {}),
    })),
    leaders,
    leaderParents: visibleLeaderParents(data, leaders),
    // Only aggregate cells leave the server: never return calendars, leave labels,
    // personal project records, HR notes, account identifiers or credentials.
    rows: buildActivityRows(
      { ...data, resources },
      permitted,
      projects,
      monthsFrom(query.start, query.count),
      currentMonth,
    ),
  };
}
