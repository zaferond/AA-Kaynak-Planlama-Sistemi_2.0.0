import { useEffect, useState } from "react";

/** Employee & account table columns. Relative widths are shared out again
 * among the visible columns, so hiding one widens the others. */
export const EMPLOYEE_COLUMNS = [
  { id: "select", label: "Seç", width: 3, fixed: true },
  { id: "name", label: "Ad Soyad", width: 10, fixed: true },
  { id: "leadership", label: "Liderlik", width: 10 },
  { id: "team", label: "Takım", width: 10 },
  { id: "status", label: "Statü", width: 9 },
  { id: "included", label: "Kaynak Planına Dahil", width: 5 },
  { id: "start", label: "İşbaşı Tarihi", width: 6 },
  { id: "end", label: "İşten Ayrılış Tarihi", width: 6 },
  { id: "account", label: "Hesap", width: 8 },
  { id: "email", label: "E-posta Adresi", width: 7 },
  { id: "role", label: "Rol / Yetki", width: 6 },
  { id: "scope", label: "Yetki Kapsamı", width: 8 },
  { id: "note", label: "Açıklama", width: 7 },
  { id: "actions", label: "İşlemler", width: 5, fixed: true },
] as const;
export type EmployeeColumn = (typeof EMPLOYEE_COLUMNS)[number];
export type EmployeeColumnId = EmployeeColumn["id"];

const optionalIds = new Set<string>(
  EMPLOYEE_COLUMNS.filter((c) => !("fixed" in c)).map((c) => c.id),
);

/** Stored hidden ids; unknown, fixed or malformed entries are dropped. */
export function parseHiddenColumns(raw: string | null): EmployeeColumnId[] {
  try {
    const value: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(value)
      ? [...new Set(value)].filter(
          (id): id is EmployeeColumnId =>
            typeof id === "string" && optionalIds.has(id),
        )
      : [];
  } catch {
    return [];
  }
}

/** Visible columns in table order with percentage widths summing to 100. */
export function visibleEmployeeColumns(hidden: readonly string[]) {
  const columns = EMPLOYEE_COLUMNS.filter((c) => !hidden.includes(c.id));
  const total = columns.reduce((sum, c) => sum + c.width, 0);
  return columns.map((c) => ({ ...c, percent: (c.width / total) * 100 }));
}

const storageKey = (userId: string) =>
  "aa-kaynak-calisan-sutunlari-v1:" + userId;

function read(userId: string | undefined) {
  if (!userId) return [];
  try {
    return parseHiddenColumns(localStorage.getItem(storageKey(userId)));
  } catch {
    return [];
  }
}

/** Hidden optional columns, remembered per user in this browser. */
export function useEmployeeColumns(userId: string | undefined) {
  const [hidden, setHidden] = useState<EmployeeColumnId[]>(() => read(userId));
  useEffect(() => setHidden(read(userId)), [userId]);
  const update = (next: EmployeeColumnId[]) => {
    setHidden(next);
    if (!userId) return;
    try {
      localStorage.setItem(storageKey(userId), JSON.stringify(next));
    } catch {
      // Private mode or blocked storage: keep the in-memory choice.
    }
  };
  return {
    hidden,
    toggle: (id: EmployeeColumnId) =>
      update(
        hidden.includes(id) ? hidden.filter((x) => x !== id) : [...hidden, id],
      ),
    reset: () => update([]),
  };
}
