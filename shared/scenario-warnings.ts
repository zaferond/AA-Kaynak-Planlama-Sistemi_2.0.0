import type { Data, Project } from "./model.ts";
import {
  leaderResourceByMonth,
  monthsAfter,
  previousMonth,
  targetAt,
  type ProjectProgress,
} from "./project-progress.ts";
import {
  DEFAULT_WARNING_SETTINGS,
  WARNING_PROGRESS_LABELS,
  matchWarningRule,
  type WarningSettings,
  type WarningProgressState,
  type WarningResourceState,
  type WarningLifecycleState,
} from "./scenario-warning-policy.ts";

export type WarningConfig = {
  id: "global";
  settings: WarningSettings;
  updatedAt: string;
  updatedById: string;
  updatedByName: string;
};
export type WarningAssessment = {
  id: string;
  month: string | null;
  status: "ready" | "missing" | "completed" | "unlocked" | "notStarted";
  reason: string;
  planned: number | null;
  actual: number | null;
  deviation: number | null;
  remaining: number | null;
  futurePlanned: number | null;
  coverage: number | null;
  progressState: WarningProgressState | null;
  resourceState: WarningResourceState | null;
  trendEscalated: boolean;
  code: string | null;
  warning1: string;
  warning2: string;
  horizonMonths: number;
  nextResources: number;
  migratedReference: boolean;
};
export type WarningEvent = {
  status: WarningLifecycleState;
  explanation: string;
  at: string;
  byId: string;
  byName: string;
};
export type ScenarioWarning = {
  id: string;
  projectId: string;
  ruleKey: string;
  code: string | null;
  month: string;
  warning1: string;
  warning2: string;
  status: WarningLifecycleState;
  assessment: WarningAssessment;
  createdAt: string;
  updatedAt: string;
  history: WarningEvent[];
};

export const warningSettings = (data: Data): Readonly<WarningSettings> =>
  data.warningConfigs?.find((c) => c.id === "global")?.settings ||
  DEFAULT_WARNING_SETTINGS;

export function progressStateFor(
  deviation: number,
  settings: Readonly<WarningSettings> = DEFAULT_WARNING_SETTINGS,
): WarningProgressState {
  if (deviation >= settings.aheadThreshold) return "ahead";
  if (deviation < settings.criticalThreshold) return "critical";
  if (deviation < settings.behindThreshold) return "behind";
  return "onTrack";
}

/** Pure calculation; percentages are cumulative, coverage is a ratio. */
export function evaluateWarning(
  input: {
    planned: number;
    actual: number;
    futurePlanned: number;
    nextResources: number;
    /** Previous consecutive locked calendar months, newest first. */
    previousDeviations?: (number | null)[];
  },
  settings: Readonly<WarningSettings> = DEFAULT_WARNING_SETTINGS,
) {
  const deviation = Math.round((input.actual - input.planned) * 1e8) / 1e8;
  const remaining = Math.max(0, 100 - input.actual);
  const initial = progressStateFor(deviation, settings);
  const trendEscalated =
    initial === "behind" &&
    (input.previousDeviations || []).length >= settings.trendMonths - 1 &&
    input
      .previousDeviations!.slice(0, settings.trendMonths - 1)
      .every(
        (gap) => gap !== null && progressStateFor(gap, settings) === "behind",
      );
  const progressState = trendEscalated ? "critical" : initial;
  const coverage = remaining > 0 ? input.futurePlanned / remaining : null;
  const resourceState: WarningResourceState | null =
    remaining === 0
      ? null
      : input.nextResources <= 0
        ? "unplanned"
        : coverage! * 100 + 1e-9 < settings.coverageMinimum
          ? "insufficient"
          : coverage! * 100 - 1e-9 > settings.coverageMaximum
            ? "excess"
            : "sufficient";
  const rule = resourceState
    ? matchWarningRule(progressState, resourceState)
    : undefined;
  return {
    deviation,
    remaining,
    coverage,
    progressState,
    resourceState,
    trendEscalated,
    code: rule?.kod || null,
    warning1:
      remaining === 0
        ? ""
        : progressState === "critical"
          ? WARNING_PROGRESS_LABELS.critical
          : rule?.uyari1 || WARNING_PROGRESS_LABELS[progressState],
    warning2: remaining === 0 ? "" : rule?.uyari2 || "",
  };
}

type ScopeRow = {
  record: ProjectProgress;
  planned: Record<string, number>;
  weight: number;
};
function projectPoint(rows: ScopeRow[], month: string) {
  let planned = 0,
    actual = 0,
    weights = 0;
  if (!rows.length) return null;
  for (const row of rows) {
    const baseline = row.record.baselines
      .filter((b) => b.openingMonth < month)
      .at(-1);
    const entry = row.record.actuals[month];
    if (!baseline || !entry || !(row.weight > 0)) return null;
    planned += targetAt(baseline, month)! * row.weight;
    actual += entry.pct * row.weight;
    weights += row.weight;
  }
  return weights > 0
    ? {
        planned: Math.round((planned / weights) * 1e8) / 1e8,
        actual: Math.round((actual / weights) * 1e8) / 1e8,
      }
    : null;
}

/** Full-project assessment. Call on the server before user scope is applied. */
export function assessProjectWarning(
  data: Data,
  project: Project,
  settings: Readonly<WarningSettings> = warningSettings(data),
  source?: {
    planned: Map<string, Record<string, number>>;
    records: ProjectProgress[];
  },
): WarningAssessment {
  const locked = new Set((data.progressLocks || []).map((l) => l.id));
  const month = [...locked].sort().at(-1) || null;
  const result: WarningAssessment = {
    id: project.id,
    month,
    status: "unlocked",
    reason: "Henüz kilitlenmiş ay yok.",
    planned: null,
    actual: null,
    deviation: null,
    remaining: null,
    futurePlanned: null,
    coverage: null,
    progressState: null,
    resourceState: null,
    trendEscalated: false,
    code: null,
    warning1: "Değerlendirme bekliyor",
    warning2: "",
    horizonMonths: settings.resourceHorizonMonths,
    nextResources: 0,
    migratedReference: false,
  };
  if (!month) return result;
  const planned =
    source?.planned ||
    leaderResourceByMonth(data.teams, data.allocations || {}, project.id);
  const records =
    source?.records ||
    (data.projectProgress || []).filter((r) => r.projectId === project.id);
  const leaders = new Set([
    ...records.map((r) => r.leader),
    ...[...planned]
      .filter(([, values]) =>
        Object.entries(values).some(
          ([m, value]) => m >= project.start && m <= project.end && value > 0,
        ),
      )
      .map(([leader]) => leader),
  ]);
  if (
    project.start > month ||
    (records.length > 0 &&
      records.every(
        (r) => r.baselines[0] && r.baselines[0].openingMonth >= month,
      ))
  )
    return {
      ...result,
      status: "notStarted",
      reason: "Son kilitli ayda proje takibi başlamamış.",
    };
  const rows: ScopeRow[] = [];
  for (const leader of leaders) {
    const record = records.find((r) => r.leader === leader);
    if (!record?.baselines.length)
      return {
        ...result,
        status: "missing",
        warning1: "Veri eksik",
        reason: "İlgili liderliklerin onaylı hedef planları tamamlanmalı.",
      };
    const baseline = record.baselines.at(-1)!;
    const values = planned.get(leader) || {};
    const total =
      Object.values(values).reduce((a, b) => a + b, 0) ||
      baseline.resourceReference?.resourceTotal ||
      0;
    rows.push({ record, planned: values, weight: record.weight ?? total });
  }
  const point = projectPoint(rows, month);
  if (!point)
    return {
      ...result,
      status: "missing",
      warning1: "Veri eksik",
      reason:
        "Son kilitli ay için tüm liderliklerin hedef ve gerçekleşen girişleri tamamlanmalı; kaynak ağırlıkları bulunmalı.",
    };
  Object.assign(result, point, {
    deviation: point.actual - point.planned,
    remaining: Math.max(0, 100 - point.actual),
  });
  if (point.actual >= 100)
    return {
      ...result,
      status: "completed",
      reason: "Proje tamamlandı; senaryo uyarısı üretilmez.",
      warning1: "Tamamlandı",
    };
  let futurePlanned = 0,
    weights = 0;
  for (const row of rows) {
    const reference = row.record.baselines.at(-1)!.resourceReference;
    const futureResources = Object.entries(row.planned).reduce(
      (n, [m, value]) => n + (m > month && m <= project.end ? value : 0),
      0,
    );
    if ((!reference || reference.resourceTotal <= 0) && futureResources > 0)
      return {
        ...result,
        status: "missing",
        warning1: "Veri eksik",
        reason:
          "Kaynak/hedef referansı eksik; hedef planı yeniden onaylanmalı.",
      };
    futurePlanned +=
      (futureResources > 0
        ? (futureResources * reference!.workPct) / reference!.resourceTotal
        : 0) * row.weight;
    weights += row.weight;
    result.migratedReference ||= reference?.source === "migration";
  }
  const horizon = monthsAfter(month, project.end).slice(
    0,
    settings.resourceHorizonMonths,
  );
  const nextResources = rows.reduce(
    (n, row) => n + horizon.reduce((sum, m) => sum + (row.planned[m] || 0), 0),
    0,
  );
  const previousDeviations: (number | null)[] = [];
  for (
    let m = previousMonth(month);
    previousDeviations.length < settings.trendMonths - 1;
    m = previousMonth(m)
  ) {
    const previous = locked.has(m) ? projectPoint(rows, m) : null;
    previousDeviations.push(
      previous ? previous.actual - previous.planned : null,
    );
  }
  const futurePct = Math.round((futurePlanned / weights) * 1e8) / 1e8;
  return {
    ...result,
    status: "ready",
    reason: "",
    futurePlanned: futurePct,
    nextResources,
    ...evaluateWarning(
      {
        ...point,
        futurePlanned: futurePct,
        nextResources,
        previousDeviations,
      },
      settings,
    ),
  };
}
