import type React from "react";
import {
  useEffect,
  useRef,
  useState,
  useMemo,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import { allowedPlanningTeam, type Principal } from "../access";
import type { Data } from "../model";
import {
  copyPlanCells,
  mergePlanSelection,
  pastePlanCells,
  rectangleKeys,
  topLeftPlanCell,
  type PlanClipboard,
} from "../plan-cell-grid";
import type { Change } from "../storage";
type Props = {
  visiblePlanRows: string[];
  months: string[];
  cells: string[];
  setCells: Dispatch<SetStateAction<string[]>>;
  planTableRef: RefObject<HTMLTableElement | null>;
  data: Data | null;
  saving: boolean;
  user: Principal | null;
  active: boolean;
  batch: (changes: Change[]) => Promise<void>;
  setNotice: (message: string) => void;
  setError: (message: string) => void;
};
export function usePlannedGrid({
  visiblePlanRows,
  months,
  cells,
  setCells,
  planTableRef,
  data,
  saving,
  user,
  active,
  batch,
  setNotice,
  setError,
}: Props) {
  const teamIndex = useMemo(
    () => new Map(data?.teams.map((team) => [team.id, team]) || []),
    [data?.teams],
  );
  const projectIndex = useMemo(
    () => new Map(data?.projects.map((project) => [project.id, project]) || []),
    [data?.projects],
  );
  const writableTeams = useMemo(
    () =>
      new Set(
        data && user
          ? data.teams
              .filter((team) => allowedPlanningTeam(data, user, team.id))
              .map((team) => team.id)
          : [],
      ),
    [data, user],
  );
  const cellSet = new Set(cells);
  const selectionRef = useRef(cells);
  selectionRef.current = cells;
  const planPastePending = useRef(false),
    planFocusFrame = useRef<number | null>(null),
    planMenuRef = useRef<HTMLDivElement | null>(null);
  const allocationChange = (id: string, value: number): Change => ({
    kind: "allocation",
    id,
    value,
    revision: data?.revisions["allocation:" + id] || 0,
  });
  const [planMenu, setPlanMenu] = useState<{
      key: string;
      x: number;
      y: number;
    } | null>(null),
    [copiedPlan, setCopiedPlan] = useState<PlanClipboard | null>(null);
  useEffect(() => {
    if (!planMenu) return;
    planMenuRef.current?.focus();
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPlanMenu(null);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [planMenu]);
  const firstSelectedPlanCell = topLeftPlanCell(visiblePlanRows, months, cells);
  function focusPlanSelection(selected: string[]) {
    const key = topLeftPlanCell(visiblePlanRows, months, selected);
    if (!key) return;
    if (planFocusFrame.current !== null)
      cancelAnimationFrame(planFocusFrame.current);
    planFocusFrame.current = requestAnimationFrame(() => {
      const cell = [
        ...(planTableRef.current?.querySelectorAll<HTMLTableCellElement>(
          "td[data-plan-cell]",
        ) || []),
      ].find((item) => item.dataset.planCell === key);
      const input = cell?.querySelector<HTMLInputElement>(".cell input");
      if (input && !input.disabled) {
        input.focus({ preventScroll: true });
        input.dataset.gridSelectionFocus = "true";
        input.select();
      }
      planFocusFrame.current = null;
    });
  }
  function clearPlanSelection() {
    if (planFocusFrame.current !== null) {
      cancelAnimationFrame(planFocusFrame.current);
      planFocusFrame.current = null;
    }
    if (
      document.activeElement instanceof HTMLInputElement &&
      planTableRef.current?.contains(document.activeElement)
    )
      delete document.activeElement.dataset.gridSelectionFocus;
    setCells([]);
    setPlanMenu(null);
  }
  function completePlanEntry() {
    // A completed older save must not clear a newly selected range.
    if (selectionRef.current === cells) clearPlanSelection();
  }
  useEffect(() => {
    if (!active) return;
    const outside = (event: PointerEvent) => {
      if (!cells.length && !planMenu && planFocusFrame.current === null) return;
      const target = event.target;
      if (!(target instanceof Node)) return;
      const cell =
        target instanceof Element ? target.closest("td[data-plan-cell]") : null;
      if (
        (cell && planTableRef.current?.contains(cell)) ||
        planMenuRef.current?.contains(target)
      )
        return;
      clearPlanSelection();
    };
    document.addEventListener("pointerdown", outside, true);
    return () => document.removeEventListener("pointerdown", outside, true);
  });
  function planCellAvailable(key: string) {
    const [teamId, projectId, month] = key.split("|");
    const project = projectIndex.get(projectId);
    const team = teamIndex.get(teamId);
    return (
      !!project && !!team && month >= project.start && month <= project.end
    );
  }
  function planCellWritable(key: string) {
    const teamId = key.split("|")[0],
      team = teamIndex.get(teamId);
    return (
      !saving &&
      !!team &&
      !!data &&
      !!user &&
      writableTeams.has(team.id) &&
      planCellAvailable(key)
    );
  }
  function selectPlanRange(
    from: string,
    to: string,
    previous: string[],
    additive: boolean,
  ) {
    setCells(
      mergePlanSelection(
        previous,
        rectangleKeys(visiblePlanRows, months, from, to, planCellWritable),
        additive,
      ),
    );
  }
  function startPlanDrag(
    event: React.PointerEvent<HTMLTableCellElement>,
    key: string,
  ) {
    if (
      event.button !== 0 ||
      !planCellWritable(key) ||
      (event.target as HTMLElement).closest("button")
    )
      return;
    const x = event.clientX,
      y = event.clientY,
      additive = event.ctrlKey || event.metaKey,
      previous = cells;
    let dragging = false,
      lastKey = key;
    const move = (pointer: PointerEvent) => {
      if (!dragging && Math.hypot(pointer.clientX - x, pointer.clientY - y) < 5)
        return;
      if (!dragging) {
        dragging = true;
        document.body.classList.add("plan-dragging");
        if (
          document.activeElement instanceof HTMLInputElement &&
          planTableRef.current?.contains(document.activeElement)
        )
          document.activeElement.blur();
      }
      const hovered = document
        .elementFromPoint(pointer.clientX, pointer.clientY)
        ?.closest<HTMLElement>("td[data-plan-cell]");
      const next = hovered?.dataset.planCell;
      if (next && next !== lastKey && planCellWritable(next)) {
        lastKey = next;
        selectPlanRange(key, next, previous, additive);
      } else if (lastKey === key) selectPlanRange(key, key, previous, additive);
      const scroller = planTableRef.current?.parentElement;
      if (scroller) {
        const box = scroller.getBoundingClientRect(),
          edge = 28;
        if (pointer.clientX > box.right - edge) scroller.scrollLeft += 18;
        else if (pointer.clientX < box.left + edge) scroller.scrollLeft -= 18;
        if (pointer.clientY > box.bottom - edge) scroller.scrollTop += 14;
        else if (pointer.clientY < box.top + edge) scroller.scrollTop -= 14;
      }
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      document.body.classList.remove("plan-dragging");
      const selected = dragging
        ? mergePlanSelection(
            previous,
            rectangleKeys(
              visiblePlanRows,
              months,
              key,
              lastKey,
              planCellWritable,
            ),
            additive,
          )
        : additive
          ? previous.includes(key)
            ? previous.filter((item) => item !== key)
            : [...previous, key]
          : cellSet.has(key)
            ? cells
            : [key];
      setCells(selected);
      if (selected.length) focusPlanSelection(selected);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop, { once: true });
    window.addEventListener("pointercancel", stop, { once: true });
    if (additive) event.preventDefault();
  }
  async function fillSelectedPlanCells(value: number) {
    if (!data || saving || !cells.length)
      throw Error("Önce kaynak hücrelerini seçin.");
    const selected = [...new Set(cells)];
    if (selected.some((key) => !planCellWritable(key)))
      throw Error("Seçimde düzenlenemeyen bir hücre var.");
    const changed = selected.filter(
      (key) => (data.allocations[key] || 0) !== value,
    );
    if (!changed.length) {
      setNotice("Seçili hücrelerde değer zaten aynı.");
      completePlanEntry();
      return;
    }
    await batch(changed.map((key) => allocationChange(key, value)));
    completePlanEntry();
    setNotice(changed.length + " seçili hücreye kaynak miktarı uygulandı.");
  }
  function openPlanMenu(
    event: React.MouseEvent<HTMLTableCellElement>,
    key: string,
  ) {
    if (!planCellAvailable(key)) return;
    event.preventDefault();
    if (!cellSet.has(key)) setCells([key]);
    setPlanMenu({
      key,
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - 230)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - 155)),
    });
  }
  function copyPlanValues(source: string[]) {
    if (!data) return;
    try {
      const copied = copyPlanCells(
        visiblePlanRows,
        months,
        source,
        data.allocations,
      );
      setCopiedPlan(copied);
      setError("");
      setNotice(
        copied.rowCount * copied.columnCount +
          " hücrenin kaynak değeri kopyalandı. Hedefte Ctrl/⌘+V veya sağ tık ile yapıştırın.",
      );
      if (navigator.clipboard && window.isSecureContext)
        void navigator.clipboard
          .writeText(copied.values.map((row) => row.join("\t")).join("\n"))
          .catch(() => {});
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function copyPlanSelection() {
    if (!planMenu) return;
    copyPlanValues(cellSet.has(planMenu.key) ? cells : [planMenu.key]);
    setPlanMenu(null);
  }
  async function pastePlanValues(anchor: string, target: string[]) {
    if (!data || !copiedPlan || saving || planPastePending.current) return;
    planPastePending.current = true;
    try {
      const changes = pastePlanCells(
        visiblePlanRows,
        months,
        anchor,
        target,
        copiedPlan,
        planCellWritable,
      );
      if (
        changes.some(
          (item) =>
            !Number.isFinite(item.value) ||
            item.value < 0 ||
            item.value > 10000,
        )
      )
        throw Error("Kaynak değeri 0–10.000 arasında olmalıdır.");
      const actual = changes.filter(
        (item) => (data.allocations[item.key] || 0) !== item.value,
      );
      setPlanMenu(null);
      if (!actual.length) {
        setNotice("Hedef hücrelerdeki değerler zaten aynı.");
        return;
      }
      await batch(actual.map((item) => allocationChange(item.key, item.value)));
      setCells(changes.map((item) => item.key));
      setNotice(actual.length + " hücreye kaynak dağılımı yapıştırıldı.");
    } catch (e) {
      setPlanMenu(null);
      setError((e as Error).message);
    } finally {
      planPastePending.current = false;
    }
  }
  async function pastePlanSelection() {
    if (!planMenu) return;
    await pastePlanValues(
      planMenu.key,
      cellSet.has(planMenu.key) ? cells : [planMenu.key],
    );
  }
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (!active) return;
      if (event.key === "Escape" && cells.length) {
        clearPlanSelection();
        return;
      }
      if (!cells.length || !(event.ctrlKey || event.metaKey) || event.altKey)
        return;
      const target = event.target;
      const editable =
        target instanceof HTMLElement
          ? target.closest(
              'input:not([type="checkbox"]),textarea,[contenteditable="true"]',
            )
          : null;
      if (
        editable &&
        !(
          editable instanceof HTMLInputElement &&
          editable.dataset.gridSelectionFocus === "true"
        )
      )
        return;
      const key = event.key.toLowerCase();
      if (key === "c") {
        event.preventDefault();
        copyPlanValues(cells);
      } else if (
        key === "v" &&
        copiedPlan &&
        !saving &&
        firstSelectedPlanCell
      ) {
        event.preventDefault();
        void pastePlanValues(firstSelectedPlanCell, cells);
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  });
  return {
    planMenu,
    setPlanMenu,
    planMenuRef,
    copiedPlan,
    firstSelectedPlanCell,
    planCellWritable,
    startPlanDrag,
    openPlanMenu,
    copyPlanSelection,
    pastePlanSelection,
    fillSelectedPlanCells,
    clearPlanSelection,
    completePlanEntry,
  };
}
