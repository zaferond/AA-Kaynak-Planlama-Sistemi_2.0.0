import type { Data, Project } from "../../model";
import { actualTeamTotalIndex } from "../../model";
import { buildCapacityIndex } from "../../metrics";
import { buildProjectInfoReport } from "../../../../shared/project-info-report.ts";
import { topicStatus } from "../../project-info-status";
import { currentPlanningDate } from "../../resource-dates";
import type { Principal } from "../../access";
import type { Change } from "../../../../shared/commands";
import {
  earliestOpening,
  currentBaseline,
  leaderProgress,
  leaderResourceByMonth,
  lateTopicSignal,
  missingEntrySignal,
  monthsAfter,
  nextMonth,
  previousMonth,
  scenarioSignal,
  shortageSignal,
  underPlanSignal,
  workdaysPassed,
  progressSignals,
  projectRollup,
  riskLevel,
  type LeaderProgress,
  type ProjectProgress,
  type RiskLevel,
  type RiskSignal,
} from "../../../../shared/project-progress.ts";

export type ProgressContext = {
  data: Data;
  today: string;
  currentMonth: string;
  planned: (projectId: string) => Map<string, Record<string, number>>;
  actual: (projectId: string) => Map<string, Record<string, number>>;
  /** Allocated minus capacity of a leadership's teams in the 3 months after `month`. */
  shortages: (leader: string, month: string) => number[];
  lateTopics: (projectId: string) => number;
  scenarioStatuses: (projectId: string) => string[];
};

/** Planned and actual FTE per leadership, computed once per data snapshot. */
export function progressContext(
  data: Data,
  today = currentPlanningDate(),
): ProgressContext {
  const teamTotals = data.actualTeamTotals || actualTeamTotalIndex(data);
  const cache = new Map<string, Map<string, Record<string, number>>>();
  const by = (kind: string, entries: Record<string, number>, id: string) => {
    const key = kind + "\u0000" + id;
    if (!cache.has(key))
      cache.set(key, leaderResourceByMonth(data.teams, entries, id));
    return cache.get(key)!;
  };
  const capacity = new Map<string, ReturnType<typeof buildCapacityIndex>>();
  const ahead = (month: string) => [
    nextMonth(month),
    nextMonth(nextMonth(month)),
    nextMonth(nextMonth(nextMonth(month))),
  ];
  let late: Map<string, number> | null = null;
  return {
    data,
    today,
    currentMonth: today.slice(0, 7),
    planned: (id) => by("plan", data.allocations || {}, id),
    actual: (id) => by("actual", teamTotals, id),
    shortages(leader, month) {
      const months = ahead(month);
      if (!capacity.has(month))
        capacity.set(month, buildCapacityIndex(data, months));
      const index = capacity.get(month)!;
      const teams = data.teams.filter((team) => team.lead === leader);
      return months.map((m) =>
        teams.reduce((sum, team) => {
          const cell = index[team.id + "|" + m];
          return sum + (cell ? cell.total - cell.current : 0);
        }, 0),
      );
    },
    lateTopics(projectId) {
      late ??= new Map(
        buildProjectInfoReport(data.projects).map((group) => [
          group.id,
          group.infos.reduce(
            (count, info) =>
              count +
              info.topics.filter(
                (topic) => topicStatus(topic, today) === "late",
              ).length,
            0,
          ),
        ]),
      );
      return late.get(projectId) || 0;
    },
    scenarioStatuses: (projectId) =>
      (data.scheduleScenarios || [])
        .filter((s) => s.shifts.some((shift) => shift.projectId === projectId))
        .map((s) => s.status),
  };
}

export const canLead = (user: Principal | null, leader: string) =>
  user?.role === "admin" ||
  (user?.role === "manager" && user.leaders.includes(leader));

/** Months that can carry an actual entry: after the earliest plan opening. */
export function entryMonths(current: string, records?: ProjectProgress[]) {
  return monthsAfter(earliestOpening(records, current), current);
}
export const defaultEntryMonth = (
  current: string,
  records?: ProjectProgress[],
) => {
  const months = entryMonths(current, records);
  const previous = previousMonth(current);
  return months.includes(previous) ? previous : months.at(-1) || "";
};

export type LeaderRow = LeaderProgress & {
  signals: RiskSignal[];
  level: RiskLevel;
};
export type ProjectRow = {
  project: Project;
  leaders: LeaderRow[];
  target: number | null;
  actual: number | null;
  spent: number | null;
  performance: number | null;
  missing: number;
  signals: RiskSignal[];
  level: RiskLevel;
};

export function leaderRow(
  ctx: ProgressContext,
  record: ProjectProgress,
  project: Project,
  month: string,
): LeaderRow {
  const row = leaderProgress(
    record,
    month,
    ctx.planned(project.id).get(record.leader),
    ctx.actual(project.id).get(record.leader),
    project.end,
  );
  // Without an approved baseline the leadership is not rated yet.
  const signals =
    row.target === null ||
    month <= (record.baselines[0]?.openingMonth || month) ||
    month > ctx.currentMonth
      ? []
      : [
          ...progressSignals(row),
          underPlanSignal(
            ctx.planned(project.id).get(record.leader),
            ctx.actual(project.id).get(record.leader),
            month,
          ),
          shortageSignal(ctx.shortages(record.leader, month)),
          missingEntrySignal({
            month,
            currentMonth: ctx.currentMonth,
            workdaysPassed: workdaysPassed(ctx.today),
            entered: row.actual !== null,
            locked: (ctx.data.progressLocks || []).some((l) => l.id === month),
          }),
        ].filter((signal): signal is RiskSignal => !!signal);
  return { ...row, signals, level: riskLevel(signals) };
}

const levelOrder: Record<RiskLevel, number> = { red: 0, amber: 1, green: 2 };

/** Projects with progress records, the riskiest first. */
export function projectRows(
  ctx: ProgressContext,
  month: string,
  {
    leader,
    projectId,
    includeUntracked = false,
  }: { leader?: string; projectId?: string; includeUntracked?: boolean } = {},
): ProjectRow[] {
  const records = ctx.data.projectProgress || [];
  const rows: ProjectRow[] = [];
  for (const project of ctx.data.projects) {
    if (projectId && project.id !== projectId) continue;
    const own = records.filter(
      (record) =>
        record.projectId === project.id &&
        (!leader || record.leader === leader),
    );
    if (includeUntracked) {
      for (const name of ctx.planned(project.id).keys()) {
        if ((leader && name !== leader) || own.some((r) => r.leader === name))
          continue;
        own.push({
          id: `untracked:${project.id}:${name}`,
          projectId: project.id,
          leader: name,
          baselines: [],
          actuals: {},
          createdBy: "",
          createdByName: "",
          createdAt: "",
        });
      }
    }
    if (!own.length) continue;
    const leaders = own
      .map((record) => leaderRow(ctx, record, project, month))
      .sort((a, b) => a.record.leader.localeCompare(b.record.leader, "tr"));
    const rollup = projectRollup(leaders);
    const signals =
      rollup.target === null ||
      !leaders.some(
        (l) =>
          currentBaseline(l.record) &&
          month > l.record.baselines[0].openingMonth &&
          month <= ctx.currentMonth,
      )
        ? []
        : [
            ...progressSignals(rollup),
            lateTopicSignal(ctx.lateTopics(project.id)),
            scenarioSignal(ctx.scenarioStatuses(project.id)),
          ].filter((signal): signal is RiskSignal => !!signal);
    // A project is at least as risky as its riskiest leadership.
    const worst = leaders.reduce<RiskLevel>(
      (level, row) =>
        levelOrder[row.level] < levelOrder[level] ? row.level : level,
      riskLevel(signals),
    );
    const missing = leaders.filter(
      (l) =>
        l.target !== null &&
        month > l.record.baselines[0].openingMonth &&
        month <= ctx.currentMonth &&
        l.actual === null,
    ).length;
    rows.push({ project, leaders, ...rollup, missing, signals, level: worst });
  }
  return rows.sort(
    (a, b) =>
      levelOrder[a.level] - levelOrder[b.level] ||
      (a.performance ?? 9) - (b.performance ?? 9) ||
      a.project.name.localeCompare(b.project.name, "tr"),
  );
}

export const progressChange = (
  data: Data,
  value: ProjectProgress,
  operation?: "delete",
): Change => ({
  kind: "progress",
  id: value.id,
  value: operation ? null : value,
  revision: data.revisions["progress:" + value.id] || 0,
  ...(operation ? { operation } : {}),
});

export const newProgressId = () =>
  "prg-" +
  (globalThis.crypto?.randomUUID?.() ||
    Date.now().toString(36) + Math.random().toString(36).slice(2));

export const pctLabel = (value: number | null | undefined) =>
  value === null || value === undefined
    ? "—"
    : value.toLocaleString("tr-TR", { maximumFractionDigits: 1 });
export const perfLabel = (value: number | null | undefined) =>
  value === null || value === undefined
    ? "—"
    : value.toLocaleString("tr-TR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
export const LEVEL_LABELS: Record<RiskLevel, string> = {
  red: "Kırmızı",
  amber: "Sarı",
  green: "Yeşil",
};
