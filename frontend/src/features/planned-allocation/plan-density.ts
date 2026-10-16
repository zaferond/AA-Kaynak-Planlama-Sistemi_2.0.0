/** Share of the planning unit's active capacity that one project cell uses.
 * Level 0 is an empty cell; 1–4 shade the entry from light to dark. */
export const PLAN_DENSITY_LEVELS = [
  { level: 1, label: "%10'dan az" },
  { level: 2, label: "%10–25" },
  { level: 3, label: "%25–50" },
  { level: 4, label: "%50 ve üzeri" },
] as const;

export function planDensity(value: number, capacity: number) {
  if (!(value > 0)) return { level: 0, share: 0 };
  // No active capacity: any planned amount is the heaviest load.
  if (!(capacity > 0)) return { level: 4, share: Infinity };
  const share = value / capacity;
  const level = share < 0.1 ? 1 : share < 0.25 ? 2 : share < 0.5 ? 3 : 4;
  return { level, share };
}

export function planDensityTitle(value: number, capacity: number) {
  const { share } = planDensity(value, capacity);
  if (!share) return undefined;
  return Number.isFinite(share)
    ? `Takımın aktif kaynağına oranı: %${Math.round(share * 100)}`
    : "Bu ay takımın aktif kaynağı yok";
}
