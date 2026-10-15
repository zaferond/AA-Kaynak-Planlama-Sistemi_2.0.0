import { useEffect, useRef, useState } from "react";
import { directoryUsers } from "../storage";
import type { DirectoryUsers } from "../../../shared/directory-identity";
const empty: DirectoryUsers = { configured: false, users: [], hasMore: false };
export function useDirectoryUsers(enabled: boolean) {
  const [result, setResult] = useState(empty),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const request = useRef(0),
    active = useRef(false);
  async function search(query = "") {
    const id = ++request.current;
    setBusy(true);
    setError("");
    try {
      const next = await directoryUsers(query);
      if (active.current && id === request.current) setResult(next);
    } catch (cause) {
      if (active.current && id === request.current) {
        setResult(empty);
        setError((cause as Error).message);
      }
    } finally {
      if (active.current && id === request.current) setBusy(false);
    }
  }
  useEffect(() => {
    active.current = enabled;
    if (enabled) void search();
    else {
      setResult(empty);
      setError("");
      setBusy(false);
    }
    return () => {
      active.current = false;
      request.current++;
    };
  }, [enabled]);
  return { ...result, busy, error, search };
}
