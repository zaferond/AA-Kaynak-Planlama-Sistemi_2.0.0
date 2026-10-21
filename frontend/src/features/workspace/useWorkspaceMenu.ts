import { useEffect, useRef, useState } from "react";

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
  return {
    open,
    // Existing layout uses this flag to reserve the menu's width.
    pinned: open,
    panelRef,
    triggerRef,
    toggle,
    close,
  };
}
export type WorkspaceMenu = ReturnType<typeof useWorkspaceMenu>;
