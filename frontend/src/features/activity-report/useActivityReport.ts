import { useEffect, useState } from "react";
import { readActivityReport, type ActivityReportSnapshot } from "../../storage";
export function useActivityReport(
  enabled: boolean,
  source: unknown,
  start: string,
  count: number,
  projects: string[],
  currentMonth: string,
) {
  const projectKey = JSON.stringify(projects);
  const [retry, setRetry] = useState(0);
  const key =
    start + ":" + count + ":" + projectKey + ":" + currentMonth + ":" + retry;
  const [result, setResult] = useState<{
    key: string;
    source: unknown;
    value?: ActivityReportSnapshot;
    error?: string;
  }>();
  useEffect(() => {
    if (!enabled) {
      setResult(undefined);
      return;
    }
    let cancelled = false;
    void readActivityReport(start, count, JSON.parse(projectKey))
      .then((value) => {
        if (!cancelled) setResult({ key, source, value });
      })
      .catch((error) => {
        if (!cancelled)
          setResult({ key, source, error: (error as Error).message });
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, source, key, retry]);
  const current =
    enabled && result?.key === key && result.source === source
      ? result
      : undefined;
  return {
    value: current?.value,
    catalog: enabled && result?.source === source ? result?.value : undefined,
    error: current?.error,
    busy: enabled && !current,
    reload: () => setRetry((n) => n + 1),
  };
}
