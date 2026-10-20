import { assessProjectWarning } from "../../../../shared/scenario-warnings.ts";
import type { WarningAssessment } from "../../../../shared/scenario-warnings.ts";
import {
  currentBaseline,
  leaderProgress,
  projectRollup,
  nextMonth,
  monthsAfter,
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
  | "completed"
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
  completed: "Tamamlandı",
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
  completed:
    "İlgili liderliklerin tamamı gerçekleşen ilerlemeyi %100 olarak girmiş.",
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
  else if (values.every((v) => v.actual === 100)) state = "completed";
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

export type ResourceReview =
  | "needsPlan"
  | "recovery"
  | "review"
  | "release"
  | "planned"
  | "none"
  | "unassessed";
export const RESOURCE_LABELS: Record<ResourceReview, string> = {
  needsPlan: "İş devam ediyor, kaynak planı yok",
  recovery: "Gecikmeyi kapatma planı incelenmeli",
  review: "Kaynak planı yeniden değerlendirilebilir",
  release: "Tamamlanan işte kaynak planı sürüyor",
  planned: "Devam eden iş için kaynak planı var",
  none: "Tamamlandı, gelecek kaynak planı yok",
  unassessed: "Kaynak kararı için veri bekleniyor",
};
export const RESOURCE_ACTIONS: Record<ResourceReview, string> = {
  needsPlan: "Kaynak ayır veya proje takvimini güncelle.",
  recovery:
    "Ayrılan kaynağın gecikmeyi kapatıp kapatmayacağını ve teslim tarihlerini gözden geçir.",
  review:
    "Kalan işi ve kritik teslimleri koruyarak kaynak azaltma veya aktarma imkânını incele.",
  release:
    "Devam eden kaynak planını kontrol et; başka projelere aktarılabilecek kaynakları değerlendir.",
  planned: "Kaynak planını ve ilerlemeyi izlemeye devam et.",
  none: "Tamamlanan iş için önümüzdeki 3 ayda kaynak ayrılmamış.",
  unassessed: "Önce hedef planını ve gerçekleşen girişlerini tamamla.",
};

/** The main label stays short; the underlying missing-data reason stays visible. */
export const evaluationLabel = (point: ReportPoint) =>
  ["behind", "ahead", "onTrack", "completed"].includes(point.state)
    ? STATE_LABELS[point.state]
    : "Değerlendirme bekliyor";

export function explainSignal(reason: string) {
  if (reason.startsWith("Perf. ")) {
    const ratio = Number(reason.slice(6).replace(",", "."));
    if (Number.isFinite(ratio))
      return `Gerçekleşen ilerleme hedefin %${round(ratio * 100).toLocaleString("tr-TR")} düzeyinde.`;
  }
  let match = /^harcama \+(.+) puan$/.exec(reason);
  if (match)
    return `Kaynak tüketimi gerçekleşen ilerlemenin ${match[1]} puan üzerinde.`;
  match = /^(\d+) ay planın altında$/.exec(reason);
  if (match)
    return `Son ${match[1]} ayda kullanılan kaynak, planlananın %80'inin altında.`;
  match = /^kaynak eksiği (\d+) ay$/.exec(reason);
  if (match)
    return `Önümüzdeki 3 ayın ${match[1]} ayında liderlik kapasitesi yetersiz.`;
  match = /^(\d+) geciken kritik konu$/.exec(reason);
  if (match) return `${match[1]} kritik işin tarihi geçti.`;
  if (reason === "giriş gecikti") return "Aylık gerçekleşen girişi gecikmiş.";
  if (reason === "erteleme senaryosu uygulandı")
    return "Proje için erteleme senaryosu uygulanmış.";
  if (reason === "erteleme senaryosu kayıtlı")
    return "Proje için değerlendirilmesi gereken erteleme senaryosu var.";
  return reason;
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
  remaining: number | null;
  resourceReview: ResourceReview;
  resourceTitle: string;
  upcomingMonths: { month: string; planned: number }[];
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
  const upcomingMonths = horizon.map((m) => ({
    month: m,
    planned: leaders.reduce(
      (sum, l) =>
        sum + (ctx.planned(project.id).get(l.record.leader)?.[m] || 0),
      0,
    ),
  }));
  const upcoming = upcomingMonths.reduce((sum, m) => sum + m.planned, 0);
  const shortageMonths = horizon.filter((_, index) =>
    leaders.some(
      (l) => (ctx.shortages(l.record.leader, month)[index] || 0) > 0.01,
    ),
  ).length;
  const complete = point.gap !== null;
  const finished = point.state === "completed";
  // A rounded project average can reach 100 while a small/zero-weight leadership is unfinished.
  const remaining =
    complete && (finished || point.actual! < 100)
      ? round(100 - point.actual!)
      : null;
  const resourceReview: ResourceReview = !complete
    ? "unassessed"
    : finished
      ? upcoming > 0
        ? "release"
        : "none"
      : upcoming === 0
        ? "needsPlan"
        : point.gap! < 0
          ? "recovery"
          : point.gap! > 0
            ? "review"
            : "planned";
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
    (point.gap! < 0 ||
      relevantSignals.length > 0 ||
      shortageMonths > 0 ||
      resourceReview === "needsPlan");
  const risk: RiskLevel | null = complete
    ? severe
      ? "red"
      : warning
        ? "amber"
        : "green"
    : null;
  const support =
    complete && !finished && (point.gap! < 0 || resourceReview === "needsPlan");
  const resourceKnown = leaders.every((l) =>
    Object.keys(ctx.actual(project.id).get(l.record.leader) || {}).some(
      (m) => m > (l.record.baselines[0]?.openingMonth || month) && m <= month,
    ),
  );
  const donor =
    complete &&
    (finished || point.gap! >= 5) &&
    risk === "green" &&
    upcoming > 0 &&
    (finished ||
      (resourceKnown &&
        point.spent !== null &&
        point.spent - point.actual! < 15));
  const reasons = [
    ...new Set(relevantSignals.map((s) => explainSignal(s.reason))),
  ];
  if (["needsPlan", "recovery", "review", "release"].includes(resourceReview))
    reasons.unshift(RESOURCE_LABELS[resourceReview]);
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
  const action =
    resourceReview === "unassessed"
      ? point.state === "unplanned"
        ? "Hedef planını tamamla ve onaylat."
        : point.state === "missing"
          ? "İlgili liderliklerin gerçekleşen girişlerini tamamla."
          : point.state === "unweighted"
            ? "Kaynak dağılımını kontrol et."
            : "Takip dönemindeki bir ayı seç."
      : RESOURCE_ACTIONS[resourceReview];
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
    remaining,
    resourceReview,
    resourceTitle: RESOURCE_LABELS[resourceReview],
    upcomingMonths,
  };
}

export type ManagedProject = {
  scenario?: WarningAssessment;
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
  const uncoveredLeaders = leaders.filter(
    (l) => l.assessment.resourceReview === "needsPlan",
  );
  const delayedLeaders = leaders.filter(
    (l) => l.assessment.resourceReview === "recovery",
  );
  const resourceReview =
    base.point.gap !== null && uncoveredLeaders.length
      ? "needsPlan"
      : base.point.gap !== null && delayedLeaders.length
        ? "recovery"
        : base.resourceReview;
  const assessment: ManagementAssessment = {
    ...base,
    risk,
    support,
    resourceReview,
    resourceTitle:
      resourceReview === "needsPlan" && base.resourceReview !== "needsPlan"
        ? "Bazı liderliklerde kaynak planı yok"
        : resourceReview === "recovery" && base.resourceReview !== "recovery"
          ? "Bazı liderlikler planın gerisinde"
          : base.resourceTitle,
    donor: base.donor && concerns.length === 0,
    reasons: [
      ...new Set([
        ...base.reasons,
        ...uncoveredLeaders.map(
          (l) =>
            `${l.row.record.leader}: tamamlanmamış iş var, önümüzdeki 3 ayda kaynak planı yok.`,
        ),
        ...delayedLeaders.map(
          (l) =>
            `${l.row.record.leader}: gecikmeyi kapatmak için kaynak planı incelenmeli.`,
        ),
        ...leaders
          .filter(
            (l) =>
              ["review", "release"].includes(l.assessment.resourceReview) &&
              l.assessment.resourceReview !== base.resourceReview,
          )
          .map((l) => `${l.row.record.leader}: ${l.assessment.resourceTitle}.`),
        ...concerns.map(
          (l) =>
            `${l.row.record.leader}: ${STATE_LABELS[l.assessment.point.state]}${l.assessment.point.gap === null ? "" : ` (${l.assessment.point.gap.toLocaleString("tr-TR")} puan)`}`,
        ),
      ]),
    ],
    action:
      resourceReview !== base.resourceReview
        ? RESOURCE_ACTIONS[resourceReview]
        : base.action,
  };
  return {
    scenario: ctx.data
      ? ctx.data.warningAssessments?.find((a) => a.id === row.project.id) ||
        assessProjectWarning(ctx.data, row.project)
      : undefined,
    row,
    leaders,
    assessment,
  };
}

/** A shared leadership is necessary; no transfer quantity is inferred. */
export function transferComparisons(
  projects: ManagedProject[],
  ctx?: ProgressContext,
) {
  const pairs: {
    from: ManagedProject;
    to: ManagedProject;
    leader: string;
    planned: number;
    fromGap: number;
    toGap: number;
    horizonMonths: number;
  }[] = [];
  for (const from of projects) {
    if (
      from.scenario
        ? !["S-07", "S-08"].includes(from.scenario.code || "")
        : !from.assessment.donor
    )
      continue;
    const horizonMonths = from.scenario?.horizonMonths || 3;
    const sourceAmount = (l: ManagedProject["leaders"][number]) =>
      ctx && from.scenario?.month
        ? monthsAfter(from.scenario.month, from.row.project.end)
            .slice(0, horizonMonths)
            .reduce(
              (sum, m) =>
                sum +
                (ctx.planned(from.row.project.id).get(l.row.record.leader)?.[
                  m
                ] || 0),
              0,
            )
        : l.assessment.upcoming;
    for (const source of from.leaders.filter((l) =>
      from.scenario ? sourceAmount(l) > 0 : l.assessment.donor,
    )) {
      for (const to of projects) {
        if (
          from.row.project.id === to.row.project.id ||
          (to.scenario
            ? !["S-01", "S-02", "S-06"].includes(to.scenario.code || "")
            : !to.assessment.support)
        )
          continue;
        const destination = to.leaders.find(
          (l) =>
            l.row.record.leader === source.row.record.leader &&
            (to.scenario ? true : l.assessment.support),
        );
        if (destination)
          pairs.push({
            from,
            to,
            leader: source.row.record.leader,
            planned: sourceAmount(source),
            horizonMonths,
            fromGap: from.scenario?.deviation ?? source.assessment.point.gap!,
            toGap: to.scenario?.deviation ?? destination.assessment.point.gap!,
          });
      }
    }
  }
  return pairs.sort((a, b) => a.toGap - b.toGap || b.planned - a.planned);
}
