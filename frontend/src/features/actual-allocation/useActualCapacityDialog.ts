import { useRef, useState } from "react";

type LimitKind = "allocation" | "hours";
export function useActualCapacityDialog() {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<LimitKind>("allocation");
  const returnInput = useRef<HTMLInputElement | null>(null);
  const openRef = useRef(false);
  function openLimit(kind: LimitKind, input: HTMLInputElement | null) {
    returnInput.current = input;
    openRef.current = true;
    setKind(kind);
    setOpen(true);
  }
  function onOpenChange(open: boolean) {
    openRef.current = open;
    setOpen(open);
  }
  function onCloseAutoFocus(event: Event) {
    const input = returnInput.current;
    if (input?.isConnected && !input.disabled) {
      event.preventDefault();
      requestAnimationFrame(() => {
        if (input.isConnected && !input.disabled) {
          input.focus();
          input.select();
        }
      });
    }
    returnInput.current = null;
  }
  return {
    open,
    kind,
    openRef,
    openLimit,
    onOpenChange,
    onCloseAutoFocus,
    close: () => onOpenChange(false),
  };
}
export type ActualCapacityDialog = ReturnType<typeof useActualCapacityDialog>;
