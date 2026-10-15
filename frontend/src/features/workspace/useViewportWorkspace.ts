import { useLayoutEffect, useRef } from "react";

/** The page ends one viewport below this panel's filter summary.
 * The remaining rows scroll inside its tables; no wheel/key events are intercepted.
 */
export function useViewportWorkspace() {
  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const panel = ref.current;
    const app = panel?.closest<HTMLElement>(".app");
    if (!panel || !app) return;
    let frame = 0;
    const update = () => {
      const zoom =
        Number.parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
      const tail = Math.max(
        0,
        app.getBoundingClientRect().bottom -
          panel.getBoundingClientRect().bottom,
      );
      const height = Math.max(1, (window.innerHeight - tail) / zoom);
      const value = height.toFixed(2) + "px";
      if (panel.style.getPropertyValue("--workspace-height") !== value)
        panel.style.setProperty("--workspace-height", value);
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    update();
    const observer = new ResizeObserver(schedule);
    observer.observe(panel);
    observer.observe(app);
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", schedule);
    };
  }, []);
  return ref;
}
