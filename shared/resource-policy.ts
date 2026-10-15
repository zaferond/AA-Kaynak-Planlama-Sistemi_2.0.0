import { isWorkingStatus, type Version } from "./model.ts";
import { normalizeResourceDate } from "./resource-dates.ts";

export function requiresResourceStart(
  status: string,
  included: boolean,
): boolean {
  return (
    isWorkingStatus(status) ||
    status === "İşten Ayrıldı" ||
    (status === "Aktif İlan" && included)
  );
}

/** A legacy undated period may survive unchanged; edits must supply its date. */
export function unchangedLegacyPeriod(
  version: Version,
  previous?: Version,
): boolean {
  if (
    !previous ||
    previous.start ||
    version.start ||
    !isWorkingStatus(version.status)
  )
    return false;
  // Team/leadership metadata can move without inventing historical dates.
  return (
    version.effective === previous.effective &&
    version.status === previous.status &&
    version.included === previous.included &&
    version.amount === previous.amount &&
    normalizeResourceDate(version.end, "end") ===
      normalizeResourceDate(previous.end, "end")
  );
}

export function assertResourceDates(
  version: Version,
  allowLegacyMissingStart = false,
): void {
  if (version.status === "İşten Ayrıldı" && (!version.start || !version.end))
    throw Error(
      "İşten Ayrıldı statüsü için işbaşı ve işten ayrılış tarihleri zorunludur.",
    );
  if (
    requiresResourceStart(version.status, version.included) &&
    !version.start &&
    !allowLegacyMissingStart
  )
    throw Error("Bu statü için İşbaşı Tarihi girin.");
  if (
    version.start &&
    version.end &&
    normalizeResourceDate(version.end, "end") <
      normalizeResourceDate(version.start, "start")
  )
    throw Error("İşten Ayrılış Tarihi, İşbaşı Tarihi’nden önce olamaz.");
}
