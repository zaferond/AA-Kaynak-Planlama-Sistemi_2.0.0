import { useEffect, useState } from "react";

const storageKey = (userId: string) => "aa-kaynak-sadece-veri-v1:" + userId;

function read(userId: string | undefined) {
  if (!userId) return false;
  try {
    return localStorage.getItem(storageKey(userId)) === "1";
  } catch {
    return false;
  }
}

/** "Sadece veri olanlar" view preference, remembered per user in this browser.
 * Off by default: the planned and actual grids are also entry screens. */
export function useOnlyDataRows(userId: string | undefined) {
  const [value, setValue] = useState(() => read(userId));
  useEffect(() => setValue(read(userId)), [userId]);
  const update = (next: boolean) => {
    setValue(next);
    if (!userId) return;
    try {
      localStorage.setItem(storageKey(userId), next ? "1" : "0");
    } catch {
      // Private mode or blocked storage: keep the in-memory choice.
    }
  };
  return [value, update] as const;
}
