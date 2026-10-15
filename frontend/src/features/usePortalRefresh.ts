import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { checkUpdates } from "../storage";
import { createPortalRefresh } from "./portal-refresh";

// Background reads wait until local editors, risk drafts and focused cells are idle.
export function usePortalRefresh({
  load,
  editing,
  saving,
  riskEditing,
  riskEditingRef,
  assertSessionRef,
  setError,
}: {
  load: () => Promise<void>;
  editing: boolean;
  saving: boolean;
  riskEditing: boolean;
  riskEditingRef: RefObject<boolean>;
  assertSessionRef: RefObject<() => void>;
  setError: (message: string) => void;
}) {
  const latest = useRef({ load, editing, saving, setError });
  useLayoutEffect(() => {
    latest.current = { load, editing, saving, setError };
  });
  const [refresh] = useState(() =>
    createPortalRefresh({
      load: () => latest.current.load(),
      checkUpdates,
      isBusy: () =>
        latest.current.editing ||
        latest.current.saving ||
        riskEditingRef.current,
      hasFocusedInput: () =>
        !!document.querySelector("input:focus,textarea:focus,select:focus"),
      isVisible: () => document.visibilityState === "visible",
      assertSession: () => assertSessionRef.current(),
      onLoadError: (error) => latest.current.setError((error as Error).message),
    }),
  );
  useEffect(() => {
    let blurTimer: ReturnType<typeof setTimeout> | null = null;
    void refresh.start();
    const changed = (e: StorageEvent) => {
      if (e.key === "kaynak-planlama-offline-v1") refresh.notify();
    };
    const afterBlur = () => {
      if (blurTimer !== null) clearTimeout(blurTimer);
      blurTimer = setTimeout(() => {
        blurTimer = null;
        refresh.flush();
      }, 0);
    };
    const timer = setInterval(() => {
      void refresh.poll();
    }, 15000);
    window.addEventListener("storage", changed);
    document.addEventListener("focusout", afterBlur);
    return () => {
      refresh.stop();
      clearInterval(timer);
      if (blurTimer !== null) clearTimeout(blurTimer);
      window.removeEventListener("storage", changed);
      document.removeEventListener("focusout", afterBlur);
    };
  }, [refresh]);
  useEffect(() => {
    refresh.flush();
  }, [editing, saving, riskEditing, refresh]);
}
