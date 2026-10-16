import { useMemo, useState } from "react";
import type { Data } from "../../model";
import { buildCapacityIndex, type Metric } from "../../metrics";
import {
  applyScenario,
  type ShiftScenario,
} from "../../../../shared/schedule-shift.ts";
import { workspaceMetric } from "../workspace/workspace-selectors";
import { newScenario } from "./scenario-comparison";

const usable = (scenario: ShiftScenario) =>
  scenario.shifts.some((s) => s.projectId && s.months);

/** Scenarios live for the session: the dialog edits them and the resource
 * reports can be drawn for one of them. Nothing here is saved. */
export function useScheduleScenarios(
  data: Data | null,
  months: string[],
  currentMonth: string,
) {
  const [scenarios, setScenarios] = useState<ShiftScenario[]>(() => [
    newScenario("Senaryo A", currentMonth, 3),
  ]);
  const [reportScenarioId, setReportScenarioId] = useState<string | null>(null);
  // Only scenarios that can be applied without problems are offered.
  const available = useMemo(
    () =>
      data
        ? scenarios.filter(
            (s) => usable(s) && !applyScenario(data, s).problems.length,
          )
        : [],
    [data, scenarios],
  );
  const active = available.find((s) => s.id === reportScenarioId) || null;
  const report = useMemo(() => {
    if (!data || !active) return null;
    const scenarioData = applyScenario(data, active).data;
    const cache = buildCapacityIndex(scenarioData, months);
    return {
      scenario: active,
      data: scenarioData,
      cache,
      metric: (ids: string[], month: string): Metric =>
        workspaceMetric(cache, ids, month),
    };
  }, [data, active, months]);
  return {
    scenarios,
    setScenarios,
    available,
    reportScenarioId: active?.id || null,
    setReportScenarioId,
    report,
  };
}
