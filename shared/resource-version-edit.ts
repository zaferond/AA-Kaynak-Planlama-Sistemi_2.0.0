import type { Resource, Version } from "./model.ts";

/** Editing before the first effective month targets that first record, not an earlier new record. */
export function resourceVersionForEdit(
  resource: Resource,
  selectedMonth: string,
): Version {
  const versions = [...resource.versions].sort((a, b) =>
    a.effective.localeCompare(b.effective),
  );
  const active = versions
    .filter((version) => version.effective <= selectedMonth)
    .at(-1);
  const chosen = active || versions[0];
  if (!chosen) throw Error("Kaynak için düzenlenecek statü kaydı bulunamadı.");
  return { ...chosen, effective: active ? selectedMonth : chosen.effective };
}

/** Moving the first start date earlier also moves the record's effective month. */
export function resourceVersionForSave(
  resource: Resource,
  draft: Version,
  isNew: boolean,
  selectedMonth: string,
): { resource: Resource; version: Version } {
  if (isNew)
    return {
      resource,
      version: {
        ...draft,
        effective: draft.start?.slice(0, 7) || selectedMonth,
      },
    };
  const first = [...resource.versions].sort((a, b) =>
    a.effective.localeCompare(b.effective),
  )[0];
  const original = resource.versions.find(
    (version) => version.effective === draft.effective,
  );
  if (
    original &&
    first &&
    original.effective === first.effective &&
    draft.start &&
    (!original.start || draft.start < original.start) &&
    draft.start.slice(0, 7) < original.effective
  ) {
    return {
      resource: {
        ...resource,
        versions: resource.versions.filter(
          (version) => version.effective !== original.effective,
        ),
      },
      version: { ...draft, effective: draft.start.slice(0, 7) },
    };
  }
  return { resource, version: draft };
}
