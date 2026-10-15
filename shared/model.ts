import type { RiskCategory, RiskStatus, RiskStrategy } from "./risk-policy.ts";
import type { Account } from "./access.ts";
import catalog from "./catalog.json" with { type: "json" };
import { initialRiskSystems } from "./risk-system-seed.ts";
import {
  normalizeResourceDate,
  resourceMonthFraction,
} from "./resource-dates.ts";
import { personHoursInMonth, DEFAULT_MONTHLY_HOURS } from "./actual-units.ts";
import type { WorkCalendar, PersonCalendar } from "./actual-units.ts";
export type Team = {
  id: string;
  name: string;
  lead: string;
  managerName?: string;
  excelCapacity: number;
  kind?: "leadership";
  catalog?: boolean;
};
export type MilestoneNote = {
  text: string;
  includeInReport: boolean;
  completed?: boolean;
  start?: string;
  end?: string;
};
export type MilestoneRange = {
  displayKind?: "range" | "milestone";
  diamondStyle?: "solid" | "outline";
  start: string;
  end: string;
  description?: string;
  notes?: MilestoneNote[];
  color?: string;
};
export type Milestone = {
  id: string;
  name: string;
  start: string;
  end: string;
  /** Kind of the first detail; further detail kinds are stored in additionalRanges. */
  displayKind?: "range" | "milestone";
  diamondStyle?: "solid" | "outline";
  hasCriticalTopics?: boolean;
  additionalRanges?: MilestoneRange[];
  barColor?: string;
  barStyle?: "solid" | "striped" | "outline";
  barText?: string;
  barNotes?: MilestoneNote[];
};
export type Project = {
  id: string;
  name: string;
  sortOrder?: number;
  responsibleName?: string;
  code?: string;
  start: string;
  end: string;
  phases: Record<string, string>;
  phaseColors?: Record<string, string>;
  milestones?: Milestone[];
};
export type Risk = {
  id: string;
  projectId: string;
  reportedBy: string;
  category: RiskCategory;
  reportedAt: string;
  system: string;
  systemId?: string;
  description: string;
  cause: string;
  actionPlan: string;
  targetAt: string;
  status: RiskStatus;
  owner: string;
  likelihood: number;
  impact: number;
  strategy: RiskStrategy;
  implementedAt: string;
  actionResult: string;
  residualLikelihood: number | null;
  residualImpact: number | null;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
};
export type RiskSystem = { id: string; name: string };
export const resourceRoles = [
  "leader",
  "productOwner",
  "member",
  "coe",
] as const;
export type ResourceRole = (typeof resourceRoles)[number];
export type Version = {
  assignmentRole?: ResourceRole;
  effective: string;
  team: string;
  lead?: string;
  status: string;
  included: boolean;
  start: string;
  end: string;
  amount: number;
};
export type Resource = {
  id: string;
  name: string;
  note: string;
  code?: string;
  versions: Version[];
};
export type Data = {
  teams: Team[];
  projects: Project[];
  risks?: Risk[];
  riskSystems?: RiskSystem[];
  resources: Resource[];
  allocations: Record<string, number>;
  actualAllocations?: Record<string, number>;
  actualWorkedHours?: Record<string, number>;
  actualPercentEntries?: Record<string, number>;
  workCalendar?: WorkCalendar;
  personCalendar?: PersonCalendar;
  actualTeamTotals?: Record<string, number>;
  /** Response-only organisational labels; never persisted or used for authorization. */
  planningUnitManagers?: Record<string, string>;
  revisions: Record<string, number>;
  leaders?: string[];
  leaderManagers?: Record<string, string>;
  leaderParents?: Record<string, string>;
  leadershipUnits?: Record<string, string>;
  catalogVersion?: number;
  users?: Account[];
  legacyArchive?: {
    teams: Team[];
    allocations: Record<string, number>;
    resourceTeams: Record<string, string>;
  };
};
export const workingStatuses = [
  "Aktif Çalışan",
  "SAAT Ücretli Ofis Ç.",
  "Gear Up",
] as const;
export const isWorkingStatus = (status: string): boolean =>
  workingStatuses.some((value) => value === status);
export const isActualStatus = (status: string): boolean =>
  isWorkingStatus(status) || status === "İşten Ayrıldı";
export const statuses = [
  ...workingStatuses,
  "Aktif İlan",
  "Pasif İlan",
  "İşten Ayrıldı",
];
export const phasePalette = [
  {
    id: "blue",
    name: "Mavi",
    bg: "#eaf3fe",
    ink: "#215989",
    border: "#6a9bd0",
  },
  {
    id: "green",
    name: "Yeşil",
    bg: "#e6f5ed",
    ink: "#206447",
    border: "#55a780",
  },
  {
    id: "amber",
    name: "Sarı",
    bg: "#fff3d6",
    ink: "#79530c",
    border: "#d5a442",
  },
  {
    id: "red",
    name: "Kırmızı",
    bg: "#fdecea",
    ink: "#963d35",
    border: "#d77d72",
  },
  {
    id: "purple",
    name: "Mor",
    bg: "#f0eafb",
    ink: "#65468d",
    border: "#9f82c4",
  },
  { id: "gray", name: "Gri", bg: "#dfe5ea", ink: "#43596a", border: "#8c9fad" },
];
export function phaseColor(p: Project, m: string) {
  return (
    phasePalette.find((c) => c.id === p.phaseColors?.[m]) ||
    phasePalette[!p.phases[m]?.trim() || p.phases[m] === "ÇALIŞMA YOK" ? 5 : 0]
  );
}
export function phaseStyle(p: Project, m: string) {
  const color = phaseColor(p, m);
  return {
    background: color.bg,
    color: color.ink,
    borderLeft: "3px solid " + color.border,
  };
}
export function migrate(data: Data): Data {
  const d = structuredClone(data);
  d.actualAllocations ??= {};
  d.actualWorkedHours ??= {};
  d.actualPercentEntries ??= {};
  d.risks ??= [];
  d.riskSystems ??= structuredClone(initialRiskSystems) as RiskSystem[];
  if ((d.catalogVersion || 0) < 1) {
    for (const t of d.teams) t.catalog = false;
    for (const t of catalog.teams) {
      const existing = d.teams.find((x) => x.id === t.id);
      if (existing) {
        existing.name = t.name;
        existing.catalog = true;
      } else d.teams.push({ ...t });
    }
    d.leaders = [...new Set([...catalog.leaders, ...(d.leaders || [])])];
    for (const r of d.resources)
      for (const v of r.versions)
        v.lead ??= d.teams.find((t) => t.id === v.team)?.lead || "";
    d.catalogVersion = 1;
  }
  const retired = d.teams.filter((t) => !t.catalog);
  if (retired.length) {
    const ids = new Set(retired.map((t) => t.id));
    d.legacyArchive ??= { teams: [], allocations: {}, resourceTeams: {} };
    for (const t of retired)
      if (!d.legacyArchive.teams.some((x) => x.id === t.id))
        d.legacyArchive.teams.push(t);
    for (const [k, v] of Object.entries(d.allocations))
      if (ids.has(k.split("|")[0])) {
        d.legacyArchive.allocations[k] = v;
        delete d.allocations[k];
      }
    for (const r of d.resources)
      for (const v of r.versions)
        if (ids.has(v.team)) {
          d.legacyArchive.resourceTeams[r.id + "|" + v.effective] = v.team;
          v.team = "";
        }
    d.teams = d.teams.filter((t) => t.catalog);
  }
  d.catalogVersion = 2;
  for (const p of d.projects) {
    p.phaseColors ??= {};
    p.milestones ??= [];
    for (const m of p.milestones) {
      if (m.start.length === 7) m.start += "-01";
      if (m.end.length === 7)
        m.end = new Date(
          Date.UTC(Number(m.end.slice(0, 4)), Number(m.end.slice(5, 7)), 0),
        )
          .toISOString()
          .slice(0, 10);
      m.barColor ??= "red";
      m.barStyle ??= "solid";
    }
  }
  for (const r of d.resources)
    for (const v of r.versions) {
      v.start = normalizeResourceDate(v.start, "start");
      v.end = normalizeResourceDate(v.end, "end");
    }
  const oldCalendar = !d.workCalendar;
  d.workCalendar ??= {};
  d.personCalendar ??= {};
  if (oldCalendar)
    for (const key of Object.keys(d.actualPercentEntries || {})) {
      const [resourceId, , month] = key.split("|");
      if (d.actualWorkedHours?.[resourceId + "|" + month] !== undefined)
        continue;
      const hours = personHoursInMonth(
        month,
        resourceId,
        d.workCalendar,
        d.personCalendar,
      );
      d.actualPercentEntries![key] = hours
        ? (((d.actualAllocations?.[key] || 0) * DEFAULT_MONTHLY_HOURS) /
            hours) *
          100
        : 0;
    }
  return d;
}
export function versionAt(r: Resource, m: string) {
  return [...r.versions]
    .filter((v) => v.effective <= m)
    .sort((a, b) => b.effective.localeCompare(a.effective))[0];
}
/** Use the first known assignment for actual entries before the resource's earliest effective month. */
export function actualVersionAt(r: Resource, m: string) {
  return (
    versionAt(r, m) ||
    [...r.versions].sort((a, b) => a.effective.localeCompare(b.effective))[0]
  );
}
export function visibleActualVersion(
  r: Resource,
  m: string,
  currentMonth: string,
) {
  const current = versionAt(r, currentMonth);
  return current && isWorkingStatus(current.status)
    ? actualVersionAt(r, m)
    : undefined;
}
/** Build for one stable snapshot; discard after changing resource history. */
export function createActualTeamIndex(resources: Resource[]) {
  const byId = new Map(resources.map((resource) => [resource.id, resource]));
  const teams = new Map<string, string | undefined>();
  return {
    get(resourceId: string, month: string) {
      const key = resourceId + "|" + month;
      if (!teams.has(key)) {
        const resource = byId.get(resourceId);
        teams.set(
          key,
          resource ? actualVersionAt(resource, month)?.team || "" : undefined,
        );
      }
      return teams.get(key);
    },
  };
}
export function actualTeamTotalIndex(
  data: Data,
  allowedTeams?: Set<string>,
  assignments = createActualTeamIndex(data.resources),
) {
  const totals: Record<string, number> = {};
  const actuals = data.actualAllocations || {};
  for (const key of Object.keys(actuals)) {
    const [resourceId, projectId, month] = key.split("|");
    const team = assignments.get(resourceId, month);
    if (team && (!allowedTeams || allowedTeams.has(team))) {
      const totalKey = team + "|" + projectId + "|" + month;
      totals[totalKey] = (totals[totalKey] || 0) + actuals[key];
    }
  }
  return totals;
}
export function withVersion(r: Resource, v: Version) {
  return {
    ...r,
    versions: [
      ...r.versions.filter((x) => x.effective !== v.effective),
      v,
    ].sort((a, b) => a.effective.localeCompare(b.effective)),
  };
}
/** One eligibility rule for direct capacity queries and report indexes. */
export function resourceCapacity(
  version: Version | undefined,
  month: string,
): number {
  if (
    !version?.included ||
    !(
      isActualStatus(version.status) ||
      (version.status === "Aktif İlan" && !!version.start)
    )
  )
    return 0;
  return version.amount * resourceMonthFraction(version, month);
}
export function capacity(
  data: Data,
  ids: string[],
  month: string,
  leads?: string[],
) {
  let current = 0;
  const teamIds = new Set(ids),
    teamLeads = new Map(data.teams.map((team) => [team.id, team.lead]));
  for (const resource of data.resources) {
    const version = versionAt(resource, month);
    if (
      !version ||
      !teamIds.has(version.team) ||
      (leads?.length &&
        !leads.includes(version.lead || teamLeads.get(version.team) || ""))
    )
      continue;
    current += resourceCapacity(version, month);
  }
  return { current };
}
export function activeTeamMembers(data: Data, month: string) {
  const byTeam = new Map<string, string[]>();
  for (const resource of data.resources) {
    const version = versionAt(resource, month);
    if (
      !version?.included ||
      !isWorkingStatus(version.status) ||
      resourceMonthFraction(version, month) <= 0 ||
      !resource.name
    )
      continue;
    const members = byTeam.get(version.team);
    if (members) members.push(resource.name);
    else byTeam.set(version.team, [resource.name]);
  }
  for (const names of byTeam.values())
    names.sort((a, b) => a.localeCompare(b, "tr"));
  return Object.fromEntries(byTeam);
}
export function allocated(
  data: Data,
  ids: string[],
  m: string,
  projects?: string | string[],
) {
  const set = new Set(ids);
  const ps = typeof projects === "string" ? [projects] : projects;
  return Object.entries(data.allocations).reduce((n, [k, v]) => {
    const [t, p, mo] = k.split("|");
    return (
      n + (set.has(t) && mo === m && (!ps?.length || ps.includes(p)) ? v : 0)
    );
  }, 0);
}
export function monthsFrom(start: string, count: number) {
  const [y, m] = start.split("-").map(Number);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 + i, 1));
    return d.toISOString().slice(0, 7);
  });
}
export function fold(s: string) {
  return s
    .toLocaleLowerCase("tr")
    .replaceAll("ı", "i")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}
