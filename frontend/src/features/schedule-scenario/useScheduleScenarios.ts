import { useEffect, useMemo, useState } from "react";
import type { Data } from "../../model";
import { buildCapacityIndex, type Metric } from "../../metrics";
import {
  applyScenario,
  type ShiftScenario,
} from "../../../../shared/schedule-shift.ts";
import { workspaceMetric } from "../workspace/workspace-selectors";
import { newScenario, nextScenarioName } from "./scenario-comparison";

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
  // An untouched working card must not share its name with a saved scenario.
  const saved = data?.scheduleScenarios;
  useEffect(() => {
    if (!saved?.length) return;
    setScenarios((all) => {
      let changed = false;
      const next = all.map((card) => {
        const pristine = card.shifts.every((s) => !s.projectId);
        const owned = saved.some((s) => s.id === card.id);
        if (!pristine || owned || !saved.some((s) => s.name === card.name))
          return card;
        changed = true;
        return {
          ...card,
          name: nextScenarioName([...all.filter((c) => c !== card), ...saved]),
        };
      });
      return changed ? next : all;
    });
  }, [saved]);
  // Working cards plus saved drafts/approved scenarios not open as a card
  // (a transferred one is already in the data). Only problem-free ones.
  const available = useMemo(() => {
    if (!data) return [];
    const open = new Set(scenarios.map((s) => s.id));
    const savedOpen = (saved || []).filter(
      (s) =>
        !open.has(s.id) && (s.status === "draft" || s.status === "approved"),
    );
    return [...scenarios, ...savedOpen].filter(
      (s) => usable(s) && !applyScenario(data, s).problems.length,
    );
  }, [data, scenarios, saved]);
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
