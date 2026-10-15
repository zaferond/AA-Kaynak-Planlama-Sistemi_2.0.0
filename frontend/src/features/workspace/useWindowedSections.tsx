import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";

export type WindowedSection = {
  key: string;
  height: number;
  /** Keep this section mounted while any of its group's chunks are visible. */
  headingKey?: string;
  render: () => ReactNode;
};

/** Keeps the full scroll extent while mounting only nearby table sections. */
export function useWindowedSections(
  tableRef: RefObject<HTMLTableElement | null>,
  sections: WindowedSection[],
  columns: number,
  layoutKey: string,
) {
  const measured = useRef(new Map<string, number>());
  const [version, setVersion] = useState(0);
  const [viewport, setViewport] = useState({
    top: 0,
    height: 1000,
    held: [] as string[],
  });
  const identity = JSON.stringify([
    sections.map((section) => section.key),
    layoutKey,
  ]);
  useLayoutEffect(() => {
    measured.current.clear();
    const container = tableRef.current?.parentElement;
    if (container) container.scrollTop = 0;
    setViewport({ top: 0, height: container?.clientHeight || 1000, held: [] });
    setVersion((n) => n + 1);
  }, [identity, tableRef]);
  useLayoutEffect(() => {
    const table = tableRef.current;
    const container = table?.parentElement;
    if (!table || !container) return;
    let frame = 0,
      held = "";
    const update = () => {
      frame = 0;
      const focused = document.activeElement?.closest<HTMLElement>(
        "tbody[data-window-key]",
      );
      const next = {
        top: container.scrollTop,
        height: container.clientHeight,
        held: [
          ...new Set(
            [
              held,
              focused?.dataset.windowKey || "",
              ...Array.from(
                table.querySelectorAll('[data-window-keep="true"]'),
              ).map(
                (cell) =>
                  cell.closest<HTMLElement>("tbody[data-window-key]")?.dataset
                    .windowKey || "",
              ),
            ].filter(Boolean),
          ),
        ],
      };
      setViewport((previous) =>
        previous.top === next.top &&
        previous.height === next.height &&
        previous.held.length === next.held.length &&
        previous.held.every((key, i) => key === next.held[i])
          ? previous
          : next,
      );
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    let scrollTop = container.scrollTop;
    const onScroll = () => {
      const nextTop = container.scrollTop;
      if (nextTop === scrollTop) return;
      scrollTop = nextTop;
      schedule();
    };
    const hold = (event: PointerEvent) => {
      held =
        (event.target as HTMLElement)?.closest<HTMLElement>(
          "tbody[data-window-key]",
        )?.dataset.windowKey || "";
      schedule();
    };
    const release = () => {
      held = "";
      schedule();
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(container);
    container.addEventListener("scroll", onScroll, { passive: true });
    container.addEventListener("pointerdown", hold);
    container.addEventListener("focusin", schedule);
    container.addEventListener("focusout", schedule);
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    update();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      container.removeEventListener("scroll", onScroll);
      container.removeEventListener("pointerdown", hold);
      container.removeEventListener("focusin", schedule);
      container.removeEventListener("focusout", schedule);
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
    };
  }, [tableRef, identity]);
  useLayoutEffect(() => {
    const table = tableRef.current;
    if (!table) return;
    const update = () => {
      let changed = false;
      for (const body of table.querySelectorAll<HTMLTableSectionElement>(
        "tbody[data-window-key]",
      )) {
        const key = body.dataset.windowKey!;
        const height = body.offsetHeight;
        if (height > 0 && measured.current.get(key) !== height) {
          measured.current.set(key, height);
          changed = true;
        }
      }
      if (changed) setVersion((n) => n + 1);
    };
    update();
    const observer = new ResizeObserver(update);
    for (const body of table.querySelectorAll("tbody[data-window-key]"))
      observer.observe(body);
    return () => observer.disconnect();
  });
  return useMemo(() => {
    let position = tableRef.current?.querySelector("thead")?.offsetHeight || 0;
    let gap = 0;
    const output: ReactNode[] = [];
    const flush = (key: string) => {
      if (!gap) return;
      output.push(
        <tbody
          key={"gap-" + key}
          className="windowed-table-spacer"
          aria-hidden="true"
        >
          <tr>
            <td colSpan={columns} style={{ height: gap }} />
          </tr>
        </tbody>,
      );
      gap = 0;
    };
    const visibleKeys = new Set<string>();
    for (const section of sections) {
      const height = measured.current.get(section.key) || section.height;
      const visible =
        viewport.held.includes(section.key) ||
        (position + height >= viewport.top - 800 &&
          position <= viewport.top + viewport.height + 800);
      if (visible) {
        visibleKeys.add(section.key);
        if (section.headingKey) visibleKeys.add(section.headingKey);
      }
      position += height;
    }
    for (const section of sections) {
      const height = measured.current.get(section.key) || section.height;
      if (visibleKeys.has(section.key)) {
        flush(section.key);
        output.push(section.render());
      } else gap += height;
    }
    flush("end");
    return output;
  }, [sections, columns, viewport, version, tableRef]);
}
