export type RiskLevel =
  "Anlamsız" | "Düşük" | "Orta" | "Yüksek" | "Tolere Edilemez";
export const riskBands = [
  { min: 1, max: 1, level: "Anlamsız", className: "undefined" },
  { min: 2, max: 6, level: "Düşük", className: "low" },
  { min: 7, max: 14, level: "Orta", className: "medium" },
  { min: 15, max: 24, level: "Yüksek", className: "high" },
  { min: 25, max: 25, level: "Tolere Edilemez", className: "critical" },
] as const;
export function riskBand(score: number) {
  return riskBands.find((band) => score >= band.min && score <= band.max);
}
export function riskAssessment(
  likelihood: number | null,
  impact: number | null,
): { score: number; level: RiskLevel; className: string } | null {
  if (
    likelihood === null ||
    impact === null ||
    !Number.isInteger(likelihood) ||
    !Number.isInteger(impact) ||
    likelihood < 1 ||
    likelihood > 5 ||
    impact < 1 ||
    impact > 5
  )
    return null;
  const score = likelihood * impact,
    band = riskBand(score)!;
  return { score, level: band.level, className: band.className };
}
