import {
  currentBaseline,
  leaderProgress,
  projectRollup,
  nextMonth,
  progressSignals,
  type RiskLevel,
  type RiskSignal,
} from "../../../../shared/project-progress.ts";
import type { Project } from "../../model.ts";
import type {
  ProgressContext,
  ProjectRow,
  LeaderRow,
} from "./progress-view.ts";

export type ProgressState =
  | "behind"
  | "ahead"
  | "onTrack"
  | "missing"
  | "unplanned"
  | "unweighted"
  | "notStarted"
  | "future"
  | "outside";
export const STATE_LABELS: Record<ProgressState, string> = {
  behind: "Planın gerisinde",
  ahead: "Planın önünde",
  onTrack: "Planla uyumlu",
  missing: "Gerçekleşen verisi eksik",
  unplanned: "Onaylı plan eksik",
  notStarted: "Takip başlamadı",
  future: "Gelecek dönem",
  outside: "Takip dönemi dışında",
  unweighted: "Kaynak dağılımı eksik",
};
/** Plain-language meanings shared by the report cells and its guide. */
export const STATE_HELP: Record<ProgressState, string> = {
  behind:
    "Gerçekleşen ilerleme, seçili ayın hedefinden düşük. Gecikmenin nedeni incelenmeli.",
  ahead:
    "Gerçekleşen ilerleme, seçili ayın hedefinden yüksek. Kaynak aktarımı için riskler ayrıca incelenmeli.",
  onTrack: "Gerçekleşen ilerleme, seçili ayın hedefiyle eşit.",
  missing:
    "İlgili liderliklerin gerçekleşen girişleri tamamlanmadığı için proje toplamı değerlendirilemiyor.",
  unplanned:
    "İlgili liderliklerden en az birinin onaylı hedef planı yok. Plan girişi ve onayı tamamlanmalı.",
  notStarted: "Seçili ay, onaylı hedef planındaki takip başlangıcından önce.",
  future:
    "Seçili ay henüz gelmedi. Gerçekleşen ilerleme değerlendirmesi yapılmıyor.",
  outside:
    "Seçili ay, projenin bitiş tarihinden sonra. Bu ay için ilerleme değerlendirmesi yapılmıyor.",
  unweighted:
    "Kaynak dağılımı hesaplama için yeterli değil. Projenin kaynak planlaması kontrol edilmeli.",
};
export type ReportPoint = {
  target: number | null;
  actual: number | null;
  gap: number | null;
  performance: number | null;
  spent: number | null;
  state: ProgressState;
  entered: number;
  total: number;
};
const round = (n: number) => Math.round(n * 10) / 10;

/** Full-scope actuals only: partial submissions cannot look ahead of plan. */
export function managementPoint(
  ctx: ProgressContext,
  project: Project,
  leaders: LeaderRow[],
  month: string,
): ReportPoint {
  const values = leaders.map((l) => {
    const baseline = currentBaseline(l.record);
    const active =
      !!baseline &&
      month > l.record.baselines[0].openingMonth &&
      month <= project.end;
    const effectiveRecord = {
      ...l.record,
      baselines: l.record.baselines.filter((b) => b.openingMonth < month),
    };
    const value = leaderProgress(
      effectiveRecord,
      month,
      ctx.planned(project.id).get(l.record.leader),
      ctx.actual(project.id).get(l.record.leader),
      project.end,
    );
    return {
      ...value,
      target: active ? value.target : null,
      actual: active && month <= ctx.currentMonth ? value.actual : null,
      spent: active && month <= ctx.currentMonth ? value.spent : null,
      active,
      approved: !!baseline,
    };
  });
  const total = values.length;
  const entered = values.filter(
    (v) => v.actual !== null && v.target !== null,
  ).length;
  const allPlanned = total > 0 && values.every((v) => v.approved);
  const allActive = total > 0 && values.every((v) => v.active);
  const aggregate = projectRollup(values);
  const target = allPlanned && allActive ? aggregate.target : null;
  const actual =
    allPlanned && allActive && entered === total ? aggregate.actual : null;
  const gap =
    target !== null && actual !== null ? round(actual - target) : null;
  let state: ProgressState;
  if (!allPlanned) state = "unplanned";
  else if (month > project.end) state = "outside";
  else if (values.every((v) => !v.active)) state = "notStarted";
  else if (month > ctx.currentMonth) state = "future";
  else if (allActive && entered === total && gap === null) state = "unweighted";
  else if (gap === null) state = "missing";
  else state = gap < 0 ? "behind" : gap > 0 ? "ahead" : "onTrack";
  return {
    target,
    actual,
    gap,
    performance:
      actual !== null && target !== null && target > 0 ? actual / target : null,
    spent: allActive && allPlanned ? aggregate.spent : null,
    state,
    entered,
    total,
  };
}

export type ManagementAssessment = {
  point: ReportPoint;
  risk: RiskLevel | null;
  reasons: string[];
  action: string;
  donor: boolean;
  support: boolean;
  plannedMonth: number;
  actualMonth: number | null;
  upcoming: number;
  shortageMonths: number;
};

/** Decisions name review candidates; capacity shortage is leadership-wide. */
export function assessManagement(
  ctx: ProgressContext,
  project: Project,
  leaders: LeaderRow[],
  month: string,
  signals: RiskSignal[] = [],
): ManagementAssessment {
  const point = managementPoint(ctx, project, leaders, month);
  const horizon: string[] = [];
  for (let m = nextMonth(month); horizon.length < 3; m = nextMonth(m))
    horizon.push(m);
  const plannedMonth = leaders.reduce(
    (n, l) => n + (ctx.planned(project.id).get(l.record.leader)?.[month] || 0),
    0,
  );
  const actualMonth = leaders.every(
    (l) => ctx.actual(project.id).get(l.record.leader)?.[month] !== undefined,
  )
    ? leaders.reduce(
        (n, l) =>
          n + (ctx.actual(project.id).get(l.record.leader)?.[month] || 0),
        0,
      )
    : null;
  const upcoming = leaders.reduce(
    (n, l) =>
      n +
      horizon.reduce(
        (sum, m) =>
          sum + (ctx.planned(project.id).get(l.record.leader)?.[m] || 0),
        0,
      ),
    0,
  );
  const shortageMonths = horizon.filter((_, index) =>
    leaders.some(
      (l) => (ctx.shortages(l.record.leader, month)[index] || 0) > 0.01,
    ),
  ).length;
  const complete = point.gap !== null;
  const relevantSignals = [
    ...signals.filter(
      (s) => !s.reason.startsWith("Perf.") && !s.reason.startsWith("harcama"),
    ),
    ...progressSignals(point),
  ];
  const severe =
    complete &&
    ((point.performance !== null && point.performance < 0.8) ||
      point.gap! <= -15 ||
      relevantSignals.some((s) => s.level === "red"));
  const warning =
    complete &&
    (point.gap! < 0 || relevantSignals.length > 0 || shortageMonths > 0);
  const risk: RiskLevel | null = complete
    ? severe
      ? "red"
      : warning
        ? "amber"
        : "green"
    : null;
  const support = complete && point.gap! <= -5;
  const resourceKnown = leaders.every((l) =>
    Object.keys(ctx.actual(project.id).get(l.record.leader) || {}).some(
      (m) => m > (l.record.baselines[0]?.openingMonth || month) && m <= month,
    ),
  );
  const donor =
    complete &&
    point.gap! >= 5 &&
    risk === "green" &&
    upcoming > 0 &&
    resourceKnown &&
    point.spent !== null &&
    point.spent - point.actual! < 15;
  const reasons = [...new Set(relevantSignals.map((s) => s.reason))];
  if (point.gap !== null)
    reasons.unshift(
      point.gap < 0
        ? `Hedefin ${Math.abs(point.gap).toLocaleString("tr-TR")} puan gerisinde`
        : point.gap > 0
          ? `Hedefin ${point.gap.toLocaleString("tr-TR")} puan önünde`
          : "Hedefe eşit ilerleme",
    );
  if (shortageMonths)
    reasons.push(
      `İlgili liderliklerde gelecek 3 ayın ${shortageMonths} ayında kapasite açığı`,
    );
  let action = "İzlemeye devam et";
  if (!complete)
    action =
      point.state === "unplanned"
        ? "Hedef planını tamamla ve onaylat"
        : point.state === "missing"
          ? "Gerçekleşen girişlerini tamamla"
          : point.state === "unweighted"
            ? "Kaynak dağılımını kontrol et"
            : "Takip döneminde değerlendir";
  else if (support && shortageMonths === 3)
    action = "Takvim / kaynak senaryosu değerlendir";
  else if (support || risk === "red") action = "Destek ve darboğazları incele";
  else if (donor) action = "Kaynak aktarımı için incele";
  else if (risk === "amber") action = "Risk nedenlerini incele";
  return {
    point,
    risk,
    reasons,
    action,
    donor,
    support,
    plannedMonth,
    actualMonth,
    upcoming,
    shortageMonths,
  };
}

export type ManagedProject = {
  row: ProjectRow;
  assessment: ManagementAssessment;
  leaders: { row: LeaderRow; assessment: ManagementAssessment }[];
};
export function manageProject(
  ctx: ProgressContext,
  row: ProjectRow,
  month: string,
): ManagedProject {
  const leaders = row.leaders.map((l) => ({
    row: l,
    assessment: assessManagement(ctx, row.project, [l], month, l.signals),
  }));
  const base = assessManagement(ctx, row.project, row.leaders, month, [
    ...row.signals,
    ...row.leaders.flatMap((l) => l.signals),
  ]);
  const concerns = leaders.filter(
    (l) => l.assessment.risk === "red" || l.assessment.risk === "amber",
  );
  const risk =
    base.risk === "red" || concerns.some((l) => l.assessment.risk === "red")
      ? "red"
      : base.risk === "amber" || concerns.length
        ? "amber"
        : base.risk;
  const support = base.support || leaders.some((l) => l.assessment.support);
  const scenario =
    (base.support && base.shortageMonths === 3) ||
    leaders.some(
      (l) => l.assessment.support && l.assessment.shortageMonths === 3,
    );
  const assessment: ManagementAssessment = {
    ...base,
    risk,
    support,
    donor: base.donor && concerns.length === 0,
    reasons: [
      ...new Set([
        ...base.reasons,
        ...concerns.map(
          (l) =>
            `${l.row.record.leader}: ${STATE_LABELS[l.assessment.point.state]}${l.assessment.point.gap === null ? "" : ` (${l.assessment.point.gap.toLocaleString("tr-TR")} puan)`}`,
        ),
      ]),
    ],
    action: scenario
      ? "Takvim / kaynak senaryosu değerlendir"
      : support || risk === "red"
        ? "Destek ve darboğazları incele"
        : base.action,
  };
  return {
    row,
    leaders,
    assessment,
  };
}

/** A shared leadership is necessary; no transfer quantity is inferred. */
export function transferComparisons(projects: ManagedProject[]) {
  const pairs: {
    from: ManagedProject;
    to: ManagedProject;
    leader: string;
    planned: number;
    fromGap: number;
    toGap: number;
  }[] = [];
  for (const from of projects) {
    if (!from.assessment.donor) continue;
    for (const source of from.leaders.filter((l) => l.assessment.donor)) {
      for (const to of projects) {
        if (from.row.project.id === to.row.project.id || !to.assessment.support)
          continue;
        const destination = to.leaders.find(
          (l) =>
            l.row.record.leader === source.row.record.leader &&
            l.assessment.support,
        );
        if (destination)
          pairs.push({
            from,
            to,
            leader: source.row.record.leader,
            planned: source.assessment.upcoming,
            fromGap: source.assessment.point.gap!,
            toGap: destination.assessment.point.gap!,
          });
      }
    }
  }
  return pairs.sort((a, b) => a.toGap - b.toGap || b.planned - a.planned);
}
