import { ownValue } from "./records.ts";

/**
 * Project progress per project × leadership. Leaders enter a cumulative
 * target curve once (the baseline, approved by an admin) and the actual
 * percentage every month; the system compares both with resource data.
 * All percentages are cumulative shares of that leadership's own work on the
 * project: "how much of our part is done at the end of this month".
 */

/** Tracking starts in November 2026: the opening value describes October. */
export const PROGRESS_OPENING_MONTH = "2026-10";
export const PROGRESS_NOTE_MAX = 500;

export type ProgressTargets = Record<string, number>;
export type ProgressBaseline = {
  version: number;
  openingMonth: string;
  openingPct: number;
  targets: ProgressTargets;
  reason?: string;
  approvedByName: string;
  approvedAt: string;
};
export type ProgressProposal = {
  openingMonth: string;
  openingPct: number;
  targets: ProgressTargets;
  /** "approved" is only sent by an admin: the server turns it into a baseline. */
  status: "draft" | "pending" | "approved";
  reason?: string;
  updatedByName?: string;
  updatedAt?: string;
  submittedByName?: string;
  submittedAt?: string;
};
export type ProgressActual = {
  pct: number;
  note: string;
  byName?: string;
  at?: string;
};
export type ProjectProgress = {
  id: string;
  projectId: string;
  leader: string;
  /** Admin-set aggregation weight; otherwise the planned resource share. */
  weight?: number;
  baselines: ProgressBaseline[];
  proposal?: ProgressProposal;
  actuals: Record<string, ProgressActual>;
  createdBy: string;
  createdByName: string;
  createdAt: string;
};
export type ProgressLock = {
  id: string;
  lockedByName: string;
  lockedAt: string;
};

export function nextMonth(month: string) {
  const [y, m] = month.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}
export function previousMonth(month: string) {
  const [y, m] = month.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}
/** Months after `from` up to and including `to`. */
export function monthsAfter(from: string, to: string) {
  const out: string[] = [];
  for (let m = nextMonth(from); m <= to && out.length < 600; m = nextMonth(m))
    out.push(m);
  return out;
}

export const currentBaseline = (record: ProjectProgress) =>
  record.baselines.at(-1);

/** Problems that keep a proposal from being submitted; empty when valid. */
export function proposalProblems(
  proposal: Pick<ProgressProposal, "openingMonth" | "openingPct" | "targets">,
  projectEnd: string,
) {
  const problems: string[] = [];
  const months = monthsAfter(proposal.openingMonth, projectEnd);
  if (!months.length)
    problems.push("Projenin bitişi açılış ayından sonra olmalı.");
  let last = proposal.openingPct;
  for (const month of months) {
    const value = ownValue(proposal.targets, month);
    if (value === undefined) {
      problems.push(`${month} için hedef girilmedi.`);
      break;
    }
    if (value < last) {
      problems.push(`${month} hedefi bir önceki aydan küçük olamaz.`);
      break;
    }
    last = value;
  }
  if (months.length && last !== 100)
    problems.push("Bitiş ayının hedefi %100 olmalı.");
  return problems;
}

/** Teams' planned and actual FTE by leadership and month for one project. */
export function leaderResourceByMonth(
  teams: { id: string; lead?: string }[],
  entries: Record<string, number>,
  projectId: string,
) {
  const leadOf = new Map(teams.map((team) => [team.id, team.lead || ""]));
  const out = new Map<string, Record<string, number>>();
  for (const [key, value] of Object.entries(entries)) {
    const [teamId, project, month] = key.split("|");
    if (project !== projectId || !value) continue;
    const leader = leadOf.get(teamId);
    if (!leader) continue;
    const byMonth = out.get(leader) || {};
    byMonth[month] = (ownValue(byMonth, month) || 0) + value;
    out.set(leader, byMonth);
  }
  return out;
}
const sum = (byMonth: Record<string, number> | undefined, months: string[]) =>
  months.reduce((total, month) => total + (ownValue(byMonth, month) || 0), 0);

/**
 * Suggested target curve from the planned resource curve: the work left after
 * the opening value is spread in proportion to the remaining planned FTE.
 * Without any planned resource, the remainder is spread evenly over time.
 */
export function suggestTargets(
  openingMonth: string,
  openingPct: number,
  projectEnd: string,
  planned: Record<string, number> | undefined,
) {
  const months = monthsAfter(openingMonth, projectEnd);
  const total = sum(planned, months);
  const targets: ProgressTargets = {};
  let done = 0;
  months.forEach((month, index) => {
    done += total ? ownValue(planned, month) || 0 : 1;
    const share = total ? done / total : (index + 1) / months.length;
    targets[month] =
      Math.round((openingPct + (100 - openingPct) * share) * 10) / 10;
  });
  if (months.length) targets[months.at(-1)!] = 100;
  return targets;
}

/** Cumulative target of the approved baseline at the end of `month`. */
export function targetAt(
  baseline: ProgressBaseline | undefined,
  month: string,
) {
  if (!baseline) return null;
  if (month <= baseline.openingMonth) return baseline.openingPct;
  const months = Object.keys(baseline.targets).sort();
  let value = baseline.openingPct;
  for (const m of months) {
    if (m > month) break;
    value = baseline.targets[m];
  }
  return value;
}

export type LeaderProgress = {
  record: ProjectProgress;
  target: number | null;
  actual: number | null;
  previousActual: number | null;
  /** Resource consumed since the opening, on the same 0–100 scale. */
  spent: number | null;
  performance: number | null;
  note: string;
  /** Planned FTE of this leadership on the project (aggregation weight). */
  plannedTotal: number;
};

/**
 * One leadership's figures at the end of `month`. Spending is placed on the
 * progress scale: the opening share plus the remaining work in proportion to
 * the FTE consumed since the opening against that consumption plus the
 * planned FTE still ahead. The system holds no history before the opening.
 */
export function leaderProgress(
  record: ProjectProgress,
  month: string,
  planned: Record<string, number> | undefined,
  actualFte: Record<string, number> | undefined,
  projectEnd: string,
): LeaderProgress {
  const baseline = currentBaseline(record);
  const entry = ownValue(record.actuals, month);
  const previous = ownValue(record.actuals, previousMonth(month));
  const target = targetAt(baseline, month);
  const actual = entry ? entry.pct : null;
  let spent: number | null = null;
  if (baseline && month > baseline.openingMonth) {
    const consumed = sum(actualFte, monthsAfter(baseline.openingMonth, month));
    const ahead = sum(planned, monthsAfter(month, projectEnd));
    if (consumed + ahead > 0)
      spent =
        Math.round(
          (baseline.openingPct +
            ((100 - baseline.openingPct) * consumed) / (consumed + ahead)) *
            10,
        ) / 10;
  }
  return {
    record,
    target,
    actual,
    previousActual: previous ? previous.pct : null,
    spent,
    performance:
      actual !== null && target
        ? Math.round((actual / target) * 100) / 100
        : null,
    note: entry?.note || "",
    plannedTotal: Object.values(planned || {}).reduce((a, b) => a + b, 0),
  };
}

/**
 * Project figures as the weighted mean of its leaderships. The weight is the
 * admin's value when set, else the leadership's planned FTE; leaderships
 * without a value for a figure are left out of that figure's mean.
 */
export function projectRollup(rows: LeaderProgress[]) {
  const weightOf = (row: LeaderProgress) =>
    row.record.weight ?? row.plannedTotal;
  const mean = (
    subset: LeaderProgress[],
    pick: (row: LeaderProgress) => number | null,
  ) => {
    let total = 0,
      weights = 0;
    for (const row of subset) {
      const value = pick(row),
        weight = weightOf(row);
      if (value === null || !(weight > 0)) continue;
      total += value * weight;
      weights += weight;
    }
    return weights ? total / weights : null;
  };
  const round = (value: number | null) =>
    value === null ? null : Math.round(value * 10) / 10;
  // Performance compares target and actual over the same leaderships: those
  // that have entered this month.
  const entered = rows.filter(
    (row) => row.actual !== null && row.target !== null,
  );
  const actual = mean(entered, (row) => row.actual);
  const enteredTarget = mean(entered, (row) => row.target);
  return {
    target: round(mean(rows, (row) => row.target)),
    actual: round(actual),
    spent: round(mean(rows, (row) => row.spent)),
    performance:
      actual !== null && enteredTarget
        ? Math.round((actual / enteredTarget) * 100) / 100
        : null,
    missing: rows.filter((row) => row.target !== null && row.actual === null)
      .length,
  };
}

export type RiskLevel = "green" | "amber" | "red";
export type RiskSignal = { level: Exclude<RiskLevel, "green">; reason: string };

/** Signals that follow from the entered and resource figures. */
export function progressSignals(row: {
  performance: number | null;
  actual: number | null;
  spent: number | null;
}): RiskSignal[] {
  const signals: RiskSignal[] = [];
  const perf = row.performance;
  if (perf !== null && perf < 0.9)
    signals.push({
      level: perf < 0.8 ? "red" : "amber",
      reason: "Perf. " + perf.toFixed(2).replace(".", ","),
    });
  if (row.actual !== null && row.spent !== null) {
    const gap = Math.round(row.spent - row.actual);
    if (gap >= 15)
      signals.push({
        level: gap >= 25 ? "red" : "amber",
        reason: `harcama +${gap} puan`,
      });
  }
  return signals;
}
export function riskLevel(signals: RiskSignal[]): RiskLevel {
  return signals.some((s) => s.level === "red")
    ? "red"
    : signals.length
      ? "amber"
      : "green";
}

/** Actual FTE below 80 % of the plan for consecutive months up to `month`. */
export function underPlanSignal(
  planned: Record<string, number> | undefined,
  actual: Record<string, number> | undefined,
  month: string,
): RiskSignal | null {
  let run = 0;
  for (let m = month; run < 3; m = previousMonth(m)) {
    const plan = ownValue(planned, m) || 0;
    if (!(plan > 0) || (ownValue(actual, m) || 0) >= plan * 0.8) break;
    run++;
  }
  return run >= 2
    ? { level: run >= 3 ? "red" : "amber", reason: `${run} ay planın altında` }
    : null;
}

/** Team shortage (allocated minus capacity, FTE) in the next three months. */
export function shortageSignal(shortages: number[]): RiskSignal | null {
  const short = shortages.filter((value) => value > 0.01);
  if (!short.length) return null;
  const worst = Math.max(...short);
  return {
    level: short.length >= 3 || worst > 1 ? "red" : "amber",
    reason: `kaynak eksiği ${short.length} ay`,
  };
}

export function lateTopicSignal(late: number): RiskSignal | null {
  return late
    ? {
        level: late >= 2 ? "red" : "amber",
        reason: `${late} geciken kritik konu`,
      }
    : null;
}

export function scenarioSignal(statuses: string[]): RiskSignal | null {
  if (statuses.includes("applied"))
    return { level: "red", reason: "erteleme senaryosu uygulandı" };
  if (statuses.some((s) => s === "draft" || s === "approved"))
    return { level: "amber", reason: "erteleme senaryosu kayıtlı" };
  return null;
}

/**
 * A missing monthly entry: late once the fifth working day of the next month
 * has passed, red when the month was locked without it.
 */
export function missingEntrySignal({
  month,
  currentMonth,
  workdaysPassed,
  entered,
  locked,
}: {
  month: string;
  currentMonth: string;
  workdaysPassed: number;
  entered: boolean;
  locked: boolean;
}): RiskSignal | null {
  if (entered || month >= currentMonth) return null;
  if (locked) return { level: "red", reason: "giriş yapılmadan kilitlendi" };
  if (month < previousMonth(currentMonth) || workdaysPassed >= 5)
    return { level: "amber", reason: "giriş gecikti" };
  return null;
}

/** Weekdays from the 1st of the month up to and including `date` (YYYY-MM-DD). */
export function workdaysPassed(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  let count = 0;
  for (let day = 1; day <= d; day++) {
    const weekday = new Date(Date.UTC(y, m - 1, day)).getUTCDay();
    if (weekday !== 0 && weekday !== 6) count++;
  }
  return count;
}
