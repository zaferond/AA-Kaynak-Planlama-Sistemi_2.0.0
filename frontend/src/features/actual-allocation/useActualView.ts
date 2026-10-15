import { useEffect, useState } from "react";
import { readActualView, type ActualViewSnapshot } from "../../storage";
import type { Principal } from "../../access";
/** Discard responses from a different snapshot, period or session. */
export function useActualView(
  enabled: boolean,
  source: unknown,
  start: string,
  count: number,
  currentMonth: string,
  user: Principal | null,
) {
  const [retry, setRetry] = useState(0);
  // A same-scope refresh must keep mounted cells and their opening revisions.
  // A different period or permission scope must never reuse the old view.
  const key = JSON.stringify([
    start,
    count,
    currentMonth,
    user?.id,
    user?.role,
    user?.resourceId,
    user?.leaders,
  ]);
  const [result, setResult] = useState<{
    key: string;
    source: unknown;
    retry: number;
    value?: ActualViewSnapshot;
    error?: string;
  }>();
  useEffect(() => {
    if (!enabled) {
      setResult(undefined);
      return;
    }
    let cancelled = false;
    void readActualView(start, count)
      .then((value) => {
        if (!cancelled) setResult({ key, source, retry, value });
      })
      .catch((error) => {
        if (!cancelled)
          setResult((previous) => ({
            key,
            source,
            retry,
            value: previous?.key === key ? previous.value : undefined,
            error: (error as Error).message,
          }));
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, source, key, retry]);
  const current =
    enabled &&
    result?.key === key &&
    result.source === source &&
    result.retry === retry
      ? result
      : undefined;
  return {
    value: enabled && result?.key === key ? result.value : undefined,
    error: current?.error,
    busy: enabled && !current,
    reload: () => setRetry((n) => n + 1),
  };
}
