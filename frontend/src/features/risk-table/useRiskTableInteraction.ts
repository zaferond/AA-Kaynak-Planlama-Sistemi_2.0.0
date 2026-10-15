import { useEffect, useRef, type KeyboardEvent } from "react";
import { riskValidationError } from "../../risk-validation";
import type { useRiskDraft } from "./useRiskDraft";

type DraftControls = ReturnType<typeof useRiskDraft>;
export function useRiskTableViewport() {
  const scrollRef = useRef<HTMLDivElement>(null);
  function revealNewRow() {
    requestAnimationFrame(() => {
      const element = scrollRef.current;
      if (element) {
        element.scrollLeft = 0;
        element.scrollTop = element.scrollHeight;
      }
    });
  }
  return { scrollRef, revealNewRow };
}
export function useRiskTableInteraction({
  draft,
  focusField,
  saving,
  conflict,
  save,
  cancel,
  setError,
}: DraftControls) {
  useEffect(() => {
    if (!draft) return;
    const field =
      document.querySelector<HTMLElement>(
        `[data-risk-input="${focusField}"]`,
      ) || document.querySelector<HTMLElement>("[data-risk-input]");
    field?.focus();
  }, [draft?.id, focusField]);
  useEffect(() => {
    if (!draft) return;
    const outside = (event: PointerEvent) => {
      const row = document.querySelector(".risk-editing-row");
      if (row?.contains(event.target as Node)) return;
      // These actions await this row's save before changing or leaving its view.
      if (
        (event.target as Element).closest(
          '[role="tab"],[data-risk-project-control],[data-risk-leave]',
        )
      )
        return;
      if (saving) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (
        (event.target as Element).closest("[data-risk-add],[data-risk-cancel]")
      )
        return;
      const nextRow = (event.target as Element).closest<HTMLTableRowElement>(
        "tr[data-risk-id]",
      );
      if (nextRow?.dataset.riskEditable === "true") return;
      const validationError = riskValidationError(draft);
      if (validationError) {
        event.preventDefault();
        event.stopPropagation();
        setError(validationError);
        return;
      }
      void save();
    };
    document.addEventListener("pointerdown", outside, true);
    return () => document.removeEventListener("pointerdown", outside, true);
  }, [draft, saving, conflict, save]);
  function onRowKeyDown(event: KeyboardEvent<HTMLTableRowElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      cancel();
    }
    if ((event.target as HTMLElement).closest(".risk-inline-delete")) return;
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      void save();
    }
  }
  return { onRowKeyDown };
}
