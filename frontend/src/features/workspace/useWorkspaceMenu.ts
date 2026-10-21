import { useEffect, useLayoutEffect, useRef, useState } from "react";

const openKey = "aa-kaynak-menu-acik-v2";
function readOpen() {
  try {
    return localStorage.getItem(openKey) !== "0";
  } catch {
    return true;
  }
}

/** Navigation stays docked until explicitly closed; remember that choice. */
export function useWorkspaceMenu() {
  const [open, setOpen] = useState(readOpen);
  const [top, setTop] = useState(0);
  const headerRef = useRef<HTMLElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  function close(restoreFocus = false) {
    setOpen(false);
    if (restoreFocus || panelRef.current?.contains(document.activeElement))
      requestAnimationFrame(() => {
        if (panelRef.current?.inert)
          triggerRef.current?.focus({ preventScroll: true });
      });
  }
  function toggle(focusMenu = false) {
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
    try {
      localStorage.setItem(openKey, open ? "1" : "0");
    } catch {
      // Storage-less sessions still allow opening and closing the menu.
    }
  }, [open]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (
        event.key === "Escape" &&
        open &&
        (panelRef.current?.contains(document.activeElement) ||
          document.activeElement === triggerRef.current)
      ) {
        event.preventDefault();
        close(true);
      }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [open]);
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
    // Existing layout uses this flag to reserve the menu's width.
    pinned: open,
    top,
    headerRef,
    panelRef,
    triggerRef,
    toggle,
    close,
  };
}
export type WorkspaceMenu = ReturnType<typeof useWorkspaceMenu>;
