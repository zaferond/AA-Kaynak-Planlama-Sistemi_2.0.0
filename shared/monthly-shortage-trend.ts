import { sumCapacityMetrics, type Metric } from "./metrics.ts";

export type MonthlyShortagePoint = {
  month: string;
  total: number;
  teamCount: number;
};

/** Match the report table's net remaining capacity for the same selected scope. */
export function buildMonthlyShortageTrend(
  capacity: Record<string, Metric>,
  teamIds: string[],
  months: string[],
): MonthlyShortagePoint[] {
  return months.map((month) => {
    const value = sumCapacityMetrics(capacity, teamIds, month);
    const total = Math.max(0, value.total - value.current);
    return {
      month,
      total,
      teamCount: teamIds.length,
    };
  });
}

/** Every selected month counts, including months without a shortage. */
export function summarizeMonthlyShortage(points: MonthlyShortagePoint[]) {
  const total = points.reduce((sum, point) => sum + point.total, 0);
  const monthCount = points.length;
  return { total, monthCount, average: monthCount ? total / monthCount : 0 };
}
