import { useEffect, useLayoutEffect, useRef, useState } from "react";

/** Hover is temporary; keyboard focus and an explicit pin keep navigation open. */
export function useWorkspaceMenu(tab: string) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [top, setTop] = useState(0);
  const headerRef = useRef<HTMLElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const openTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const keyboard = useRef(false);
  const pointerInside = useRef(false);
  function cancelTimers() {
    clearTimeout(closeTimer.current);
    clearTimeout(openTimer.current);
  }
  function close(restoreFocus = false) {
    cancelTimers();
    setOpen(false);
    setPinned(false);
    if (restoreFocus || panelRef.current?.contains(document.activeElement))
      // Wait for the triggering key's native click before moving focus. Moving
      // during Enter's keydown can otherwise click the header and reopen it.
      requestAnimationFrame(() => {
        if (panelRef.current?.inert)
          triggerRef.current?.focus({ preventScroll: true });
      });
  }
  function enter() {
    pointerInside.current = true;
    cancelTimers();
    openTimer.current = setTimeout(() => setOpen(true), 100);
  }
  function leave() {
    pointerInside.current = false;
    cancelTimers();
    closeTimer.current = setTimeout(() => {
      if (
        !pinned &&
        !pointerInside.current &&
        !(
          keyboard.current && panelRef.current?.contains(document.activeElement)
        )
      )
        close();
    }, 220);
  }
  function focus() {
    cancelTimers();
    setOpen(true);
  }
  function toggle(focusMenu = false) {
    cancelTimers();
    if (open) close();
    else {
      setOpen(true);
      if (focusMenu)
        requestAnimationFrame(() => {
          panelRef.current
            ?.querySelector<HTMLButtonElement>(
              '[role="tab"][aria-selected="true"]',
            )
            ?.focus({ preventScroll: true });
        });
    }
  }
  useEffect(() => {
    // A declined/failed navigation keeps the menu and draft available.
    if (!pinned) close();
  }, [tab]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      keyboard.current = true;
      if (event.key === "Escape" && open) {
        event.preventDefault();
        close(true);
      }
    };
    const pointer = (event: PointerEvent) => {
      keyboard.current = false;
      const target = event.target;
      if (
        open &&
        !pinned &&
        target instanceof Element &&
        !panelRef.current?.contains(target) &&
        !target.closest("[data-workspace-menu-trigger]")
      )
        close();
    };
    document.addEventListener("keydown", key);
    document.addEventListener("pointerdown", pointer, true);
    return () => {
      document.removeEventListener("keydown", key);
      document.removeEventListener("pointerdown", pointer, true);
    };
  }, [open, pinned]);
  useEffect(() => () => cancelTimers(), []);
  useLayoutEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    const measure = () => {
      const zoom =
        Number.parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
      setTop(Math.max(0, header.getBoundingClientRect().bottom / zoom));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    window.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    measure();
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, []);
  return {
    open,
    pinned,
    top,
    headerRef,
    panelRef,
    triggerRef,
    enter,
    leave,
    focus,
    toggle,
    close,
    pin: () => {
      cancelTimers();
      setPinned(!pinned);
      setOpen(true);
    },
  };
}
export type WorkspaceMenu = ReturnType<typeof useWorkspaceMenu>;
