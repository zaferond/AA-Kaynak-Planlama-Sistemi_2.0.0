import type { Risk } from "./model.ts";

export function riskCreationOrder(risks: Risk[]): Risk[] {
  return [...risks].sort(
    (left, right) =>
      left.createdAt.localeCompare(right.createdAt) ||
      left.id.localeCompare(right.id),
  );
}
