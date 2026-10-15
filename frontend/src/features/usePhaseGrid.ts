import {
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { Data, Project } from "../model";
import type { Change } from "../../../shared/commands";
import {
  mergePlanSelection,
  rectangleKeys,
  topLeftPlanCell,
} from "../plan-cell-grid";
import {
  copyPhaseCells,
  phaseCellAvailable,
  phaseCellKey,
  preparePhaseCellsPaste,
  type PhaseCopyKind,
  type PhaseGridClipboard,
} from "./project-clipboard";
type Props = {
  data: Data | null;
  visibleProjects: Project[];
  months: string[];
  active: boolean;
  selectionKey: string;
  isAdmin: boolean;
  saving: boolean;
  batch: (changes: Change[]) => Promise<void>;
  setNotice: (message: string) => void;
  setError: (message: string) => void;
};
export function usePhaseGrid({
  data,
  visibleProjects,
  months,
  active,
  selectionKey,
  isAdmin,
  saving,
  batch,
  setNotice,
  setError,
}: Props) {
  const tableRef = useRef<HTMLTableElement>(null);
  const [cells, setCells] = useState<string[]>([]);
  const [clipboards, setClipboards] = useState<
    Partial<Record<PhaseCopyKind, PhaseGridClipboard>>
  >({});
  const [lastKind, setLastKind] = useState<PhaseCopyKind>("bundle");
  const anchor = useRef<string | null>(null),
    suppressClick = useRef(false),
    pending = useRef(false);
  const dragCleanup = useRef<(() => void) | null>(null);
  const rows = active
    ? visibleProjects.map((project) => project.id)
    : data?.projects.map((project) => project.id) || [];
  const visibleKey = JSON.stringify(rows);
  function clear() {
    dragCleanup.current?.();
    setCells([]);
    anchor.current = null;
  }
  useEffect(() => {
    clear();
  }, [active, selectionKey, visibleKey]);
  useEffect(
    () => () => {
      dragCleanup.current?.();
    },
    [],
  );
  const canUse = (key: string) => !!data && phaseCellAvailable(data, key);
  function menuSelection(key: string) {
    return active && cells.includes(key) ? cells : [key];
  }
  function selectAnchor(key: string) {
    if (active && !cells.includes(key)) {
      setCells([key]);
      anchor.current = key;
    }
  }
  function choose(event: MouseEvent<HTMLButtonElement>, key: string) {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    if (!canUse(key) || saving) return;
    if (event.shiftKey && anchor.current)
      setCells(
        mergePlanSelection(
          cells,
          rectangleKeys(rows, months, anchor.current, key, canUse),
          event.ctrlKey || event.metaKey,
        ),
      );
    else if (event.ctrlKey || event.metaKey)
      setCells(
        cells.includes(key)
          ? cells.filter((value) => value !== key)
          : [...cells, key],
      );
    else {
      setCells([key]);
      anchor.current = key;
    }
  }
  function startDrag(
    event: ReactPointerEvent<HTMLTableCellElement>,
    key: string,
  ) {
    if (!active || saving || event.button !== 0 || !canUse(key)) return;
    dragCleanup.current?.();
    const firstX = event.clientX,
      firstY = event.clientY,
      additive = event.ctrlKey || event.metaKey,
      previous = cells;
    let dragging = false,
      last = key;
    const move = (pointer: PointerEvent) => {
      if (
        !dragging &&
        Math.hypot(pointer.clientX - firstX, pointer.clientY - firstY) < 5
      )
        return;
      dragging = true;
      document.body.classList.add("phase-grid-dragging");
      const hovered = document
        .elementFromPoint(pointer.clientX, pointer.clientY)
        ?.closest<HTMLElement>("td[data-phase-cell]");
      if (
        hovered &&
        tableRef.current?.contains(hovered) &&
        hovered.dataset.phaseCell &&
        canUse(hovered.dataset.phaseCell)
      )
        last = hovered.dataset.phaseCell;
      setCells(
        mergePlanSelection(
          previous,
          rectangleKeys(rows, months, key, last, canUse),
          additive,
        ),
      );
      const scroller = tableRef.current?.parentElement;
      if (scroller) {
        const rect = scroller.getBoundingClientRect();
        if (pointer.clientX > rect.right - 28) scroller.scrollLeft += 18;
        else if (pointer.clientX < rect.left + 28) scroller.scrollLeft -= 18;
        if (pointer.clientY > rect.bottom - 28) scroller.scrollTop += 14;
        else if (pointer.clientY < rect.top + 28) scroller.scrollTop -= 14;
      }
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", cancel);
      document.body.classList.remove("phase-grid-dragging");
      dragCleanup.current = null;
    };
    const cancel = () => {
      cleanup();
      setCells(previous);
    };
    const stop = () => {
      cleanup();
      if (!dragging) return; // The ordinary click/keyboard handler selects single cells.
      const selected = mergePlanSelection(
        previous,
        rectangleKeys(rows, months, key, last, canUse),
        additive,
      );
      setCells(selected);
      anchor.current = key;
      suppressClick.current = true;
      setTimeout(() => {
        suppressClick.current = false;
      }, 0);
    };
    dragCleanup.current = cleanup;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop, { once: true });
    window.addEventListener("pointercancel", cancel, { once: true });
  }
  function copy(kind: PhaseCopyKind, source = cells) {
    if (!data) return;
    try {
      const clipboard = copyPhaseCells(data, rows, months, source);
      setClipboards((previous) => ({ ...previous, [kind]: clipboard }));
      setLastKind(kind);
      setError("");
      setNotice(
        clipboard.rowCount * clipboard.columnCount +
          " aşama hücresi kopyalandı. Hedef ayı seçip yapıştırın.",
      );
      if (kind !== "color" && navigator.clipboard && window.isSecureContext)
        void navigator.clipboard
          .writeText(
            clipboard.values
              .map((row) => row.map((value) => value.text).join("\t"))
              .join("\n"),
          )
          .catch(() => {});
    } catch (error) {
      setError((error as Error).message);
    }
  }
  async function paste(kind: PhaseCopyKind, key: string, selected = cells) {
    if (!data || !isAdmin || saving || pending.current || !clipboards[kind])
      return;
    pending.current = true;
    try {
      const commands = preparePhaseCellsPaste(
        data,
        rows,
        months,
        key,
        selected,
        clipboards[kind]!,
        kind,
      );
      await batch(commands);
      clear();
      setNotice("Seçilen aşama bilgileri hedef aylara yapıştırıldı.");
    } catch (error) {
      setError((error as Error).message);
    } finally {
      pending.current = false;
    }
  }
  function copyColor(color: string) {
    setClipboards((previous) => ({
      ...previous,
      color: { values: [[{ text: "", color }]], rowCount: 1, columnCount: 1 },
    }));
    setLastKind("color");
  }
  useEffect(() => {
    if (!active) return;
    const outside = (event: PointerEvent) => {
      if (!cells.length) return;
      const target = event.target;
      if (
        target instanceof Element &&
        (tableRef.current?.contains(target) || target.closest(".phase-menu"))
      )
        return;
      clear();
    };
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        clear();
        return;
      }
      if (!cells.length || !(event.ctrlKey || event.metaKey) || event.altKey)
        return;
      if (
        event.target instanceof Element &&
        event.target.closest('input,textarea,[contenteditable="true"]')
      )
        return;
      if (event.key.toLowerCase() === "c") {
        event.preventDefault();
        copy("bundle");
      }
      if (event.key.toLowerCase() === "v" && clipboards[lastKind] && isAdmin) {
        const key = topLeftPlanCell(rows, months, cells);
        if (key) {
          event.preventDefault();
          void paste(lastKind, key);
        }
      }
    };
    document.addEventListener("pointerdown", outside, true);
    window.addEventListener("keydown", keyboard);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("keydown", keyboard);
    };
  });
  return {
    tableRef,
    cells,
    choose,
    startDrag,
    clear,
    copy,
    paste,
    clipboards,
    copyColor,
    menuSelection,
    selectAnchor,
    key: phaseCellKey,
  };
}
