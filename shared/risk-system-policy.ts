import { fold, type RiskSystem, type Risk } from "./model.ts";
export const riskSystemNameKey = (name: string): string =>
  fold(name).trim().replace(/\s+/g, " ");
export function riskUsesSystem(
  risk: Pick<Risk, "system" | "systemId">,
  system: RiskSystem,
): boolean {
  return (
    risk.systemId === system.id ||
    (!risk.systemId &&
      riskSystemNameKey(risk.system) === riskSystemNameKey(system.name))
  );
}

export function assertUniqueRiskSystemName(
  systems: readonly RiskSystem[],
  value: RiskSystem,
): void {
  if (
    systems.some(
      (item) =>
        item.id !== value.id &&
        riskSystemNameKey(item.name) === riskSystemNameKey(value.name),
    )
  )
    throw Error("Bu isimde bir sistem / alt sistem zaten bulunuyor.");
}
