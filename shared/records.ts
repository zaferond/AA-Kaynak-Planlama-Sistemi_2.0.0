/** Read a stored key without treating inherited properties as records. */
export function ownValue<T>(
  record: Record<string, T> | null | undefined,
  key: string,
): T | undefined {
  return record != null && Object.hasOwn(record, key) ? record[key] : undefined;
}

/** Filter enumerable own records without materializing key/value pairs. */
export function filterOwnRecords<T>(
  record: Record<string, T> | null | undefined,
  include: (key: string) => boolean,
): Record<string, T> {
  const selected: Record<string, T> = {};
  if (!record) return selected;
  for (const key of Object.keys(record)) {
    if (!include(key)) continue;
    const value = record[key];
    if (key === "__proto__")
      Object.defineProperty(selected, key, {
        value,
        enumerable: true,
        writable: true,
        configurable: true,
      });
    else selected[key] = value;
  }
  return selected;
}
