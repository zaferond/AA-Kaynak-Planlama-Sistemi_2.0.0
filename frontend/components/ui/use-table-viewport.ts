import { useLayoutEffect, useRef, type RefObject } from "react";
import { todayMonthProgress } from "@/src/resource-dates";

/** Cache content coordinates when layout changes. Horizontal scrolling does not
 * change a group's vertical bounds, so it requires neither measuring nor painting. */
export function useStickyProjectRows(
  containerRef: RefObject<HTMLDivElement | null>,
  enabled: boolean | undefined,
) {
  const measureRef = useRef<(() => void) | null>(null);
  useLayoutEffect(() => {
    const container = containerRef.current;
    const header = container?.querySelector("thead");
    if (!enabled || !container || !header) return;
    let frame = 0;
    let needsMeasure = false;
    let lastTop = -1;
    let headerHeight = 0;
    let positions: {
      heading: HTMLTableRowElement;
      end: number;
      height: number;
    }[] = [];
    const setProperty = (element: HTMLElement, key: string, value: string) => {
      if (element.style.getPropertyValue(key) !== value)
        element.style.setProperty(key, value);
    };
    const paint = () => {
      const top = container.scrollTop;
      lastTop = top;
      setProperty(container, "--project-sticky-offset", `${headerHeight}px`);
      for (const { heading, end, height } of positions) {
        setProperty(
          heading,
          "--project-row-top",
          `${Math.min(headerHeight, end - top - height)}px`,
        );
      }
    };
    const measure = () => {
      needsMeasure = false;
      headerHeight = header.offsetHeight;
      const zoom =
        Number.parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
      const top = container.getBoundingClientRect().top;
      const scrollTop = container.scrollTop;
      const groups = Array.from(
        container.querySelectorAll<HTMLTableSectionElement>(
          "tbody[data-project-group]",
        ),
      );
      const ends = new Map<string, number>();
      // Read every bound before any style write. A windowed team's final chunk
      // bounds its heading even when its intermediate chunks are not mounted.
      for (const group of groups) {
        const key = group.dataset.projectGroup!;
        const end =
          (group.getBoundingClientRect().bottom - top) / zoom + scrollTop;
        ends.set(key, Math.max(ends.get(key) ?? -Infinity, end));
      }
      positions = groups.flatMap((group) => {
        const heading = group.querySelector<HTMLTableRowElement>(
          "[data-project-heading]",
        );
        return heading
          ? [
              {
                heading,
                end: ends.get(group.dataset.projectGroup!)!,
                height: heading.getBoundingClientRect().height / zoom,
              },
            ]
          : [];
      });
      paint();
    };
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (needsMeasure) measure();
        else if (container.scrollTop !== lastTop) paint();
      });
    };
    const onScroll = () => {
      if (container.scrollTop !== lastTop) schedule();
    };
    const onResize = () => {
      needsMeasure = true;
      schedule();
    };
    measureRef.current = measure;
    container.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    const observer = new ResizeObserver(onResize);
    observer.observe(header);
    const table = container.querySelector("table");
    if (table) observer.observe(table);
    return () => {
      cancelAnimationFrame(frame);
      measureRef.current = null;
      observer.disconnect();
      container.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      container.style.removeProperty("--project-sticky-offset");
      for (const row of container.querySelectorAll<HTMLElement>(
        "[data-project-heading]",
      ))
        row.style.removeProperty("--project-row-top");
    };
  }, [enabled, containerRef]);
  // React can replace virtual chunks without resizing the table's total height.
  useLayoutEffect(() => {
    measureRef.current?.();
  });
}

/** The marker is an absolute child in content coordinates. Native scrolling
 * already moves it with the dates; only a layout/date change needs a new position. */
export function useTodayDateMarker(
  containerRef: RefObject<HTMLDivElement | null>,
  markerRef: RefObject<HTMLDivElement | null>,
  todayDate: string | undefined,
  todayMonthsKey: string | undefined,
  aboveRows = false,
) {
  useLayoutEffect(() => {
    const container = containerRef.current;
    const marker = markerRef.current;
    if (!container || !marker || !todayDate) return;
    const table = container.querySelector("table");
    const header = Array.from(
      container.querySelectorAll<HTMLTableCellElement>(
        "thead th[data-month], thead th[data-date-start]",
      ),
    ).find(
      (cell) =>
        cell.dataset.month === todayDate.slice(0, 7) ||
        (!!cell.dataset.dateStart &&
          cell.dataset.dateStart <= todayDate &&
          todayDate <= (cell.dataset.dateEnd || "")),
    );
    if (!table || !header) {
      marker.style.display = "none";
      return;
    }
    const start = header.dataset.dateStart,
      end = header.dataset.dateEnd;
    const progress =
      start && end
        ? ((Date.parse(todayDate + "T12:00:00Z") -
            Date.parse(start + "T12:00:00Z")) /
            86400000 +
            0.5) /
          ((Date.parse(end + "T12:00:00Z") - Date.parse(start + "T12:00:00Z")) /
            86400000 +
            1)
        : todayMonthProgress(todayDate);
    let frame = 0,
      visibilityFrame = 0;
    let markerLeft = 0,
      frozenWidth = 0,
      lastLeft = container.scrollLeft;
    const updateVisibility = () => {
      visibilityFrame = 0;
      const value =
        aboveRows && markerLeft - container.scrollLeft < frozenWidth
          ? "hidden"
          : "visible";
      if (marker.style.visibility !== value) marker.style.visibility = value;
    };
    const onScroll = () => {
      if (container.scrollLeft === lastLeft) return;
      lastLeft = container.scrollLeft;
      if (!visibilityFrame)
        visibilityFrame = requestAnimationFrame(updateVisibility);
    };
    const update = () => {
      frame = 0;
      const containerRect = container.getBoundingClientRect();
      const headerRect = header.getBoundingClientRect();
      const zoom =
        Number.parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
      const left =
        (headerRect.left - containerRect.left + headerRect.width * progress) /
          zoom +
        container.scrollLeft;
      const height = table.offsetHeight;
      markerLeft = left;
      frozenWidth = aboveRows
        ? Math.max(
            0,
            ...Array.from(header.parentElement!.children).map((cell) => {
              const style = getComputedStyle(cell);
              return style.position === "sticky" && style.left !== "auto"
                ? (Number.parseFloat(style.left) || 0) +
                    (cell as HTMLElement).offsetWidth
                : 0;
            }),
          )
        : 0;
      marker.style.left = `${left}px`;
      marker.style.top = "0px";
      marker.style.height = `${height}px`;
      marker.style.display = "block";
      updateVisibility();
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    const observer = new ResizeObserver(schedule);
    observer.observe(container);
    observer.observe(table);
    observer.observe(header);
    window.addEventListener("resize", schedule);
    if (aboveRows)
      container.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(visibilityFrame);
      observer.disconnect();
      window.removeEventListener("resize", schedule);
      container.removeEventListener("scroll", onScroll);
    };
  }, [containerRef, markerRef, todayDate, todayMonthsKey, aboveRows]);
}
