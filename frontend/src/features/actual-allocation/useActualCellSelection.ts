import { useEffect, useRef, useState, type RefObject } from "react";
import type { Resource } from "../../model";
import type { ActualCellSelection } from "./types";

export function useActualCellSelection({
  scopeKey,
  loading = false,
  visiblePage,
  eligible,
  months,
  currentMonth,
  people,
  limitOpenRef,
}: {
  scopeKey: string;
  loading?: boolean;
  visiblePage: number;
  eligible: ReadonlySet<string>;
  months: string[];
  currentMonth: string;
  people: Resource[];
  limitOpenRef: RefObject<boolean>;
}) {
  const [selectedCell, setSelectedCell] = useState<ActualCellSelection | null>(
    null,
  );
  const settledScope = useRef(scopeKey);
  useEffect(() => {
    if (loading) return;
    if (settledScope.current !== scopeKey) setSelectedCell(null);
    settledScope.current = scopeKey;
  }, [scopeKey, loading]);
  useEffect(() => setSelectedCell(null), [visiblePage]);
  useEffect(() => {
    const withinSelection = (target: EventTarget | null) =>
      target instanceof Element &&
      !!target.closest(
        '.person-allocation [data-actual-context-cell="true"], .person-allocation .actual-unit-control, .actual-limit-dialog, [data-write-recovery], [data-actual-view-status]',
      );
    const clearOutside = (event: Event) => {
      if (!limitOpenRef.current && !withinSelection(event.target))
        setSelectedCell(null);
    };
    const clearOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedCell(null);
    };
    document.addEventListener("click", clearOutside);
    document.addEventListener("focusin", clearOutside);
    document.addEventListener("keydown", clearOnEscape);
    return () => {
      document.removeEventListener("click", clearOutside);
      document.removeEventListener("focusin", clearOutside);
      document.removeEventListener("keydown", clearOnEscape);
    };
  }, [limitOpenRef]);
  const selectedHoursMonth =
    selectedCell &&
    months.includes(selectedCell.month) &&
    selectedCell.month <= currentMonth
      ? selectedCell.month
      : undefined;
  const selectedHoursPerson = selectedHoursMonth
    ? people.find(
        (resource) =>
          resource.id === selectedCell?.resourceId &&
          eligible.has(resource.id + "|" + selectedHoursMonth),
      )
    : undefined;
  function selectHoursContext(resourceId: string, month: string, key: string) {
    if (month > currentMonth || !eligible.has(resourceId + "|" + month)) return;
    setSelectedCell((previous) =>
      previous?.key === key ? previous : { key, resourceId, month },
    );
  }
  return {
    selectedCell,
    selectedHoursMonth,
    selectedHoursPerson,
    selectHoursContext,
    clearSelection: () => setSelectedCell(null),
  };
}
