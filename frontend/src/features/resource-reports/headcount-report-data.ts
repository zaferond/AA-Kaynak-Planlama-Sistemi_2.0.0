import { versionAt, type Data, type Team } from "../../model.ts";
import { normalizeResourceDate } from "../../resource-dates.ts";
import {
  expandLeadershipReportGroups,
  type ReportGroup,
} from "../resource-report-groups.ts";

export const HEADCOUNT_COLUMNS = [
  {
    key: "active",
    status: "Aktif Çalışan",
    label: "Aktif Çalışan",
    headerColor: "#3f6256",
  },
  {
    key: "gearUp",
    status: "Gear Up",
    label: "Gear Up",
    headerColor: "#53668c",
  },
  {
    key: "hourly",
    status: "SAAT Ücretli Ofis Ç.",
    label: "Saat Ücretli Çalışan",
    headerColor: "#756346",
  },
  {
    key: "activePosting",
    status: "Aktif İlan",
    label: "Aktif İlan",
    headerColor: "#3c7180",
  },
  {
    key: "passivePosting",
    status: "Pasif İlan",
    label: "Pasif İlan",
    headerColor: "#626b76",
  },
] as const;
export const HEADCOUNT_TOTAL_HEADER_COLOR = "#5e5076";
export const HEADCOUNT_TOTAL_CELL_COLOR = "#eee9f4";
export type HeadcountKey = (typeof HEADCOUNT_COLUMNS)[number]["key"];
export type HeadcountCounts = Record<HeadcountKey, number>;
export const HEADCOUNT_REPORTS: readonly {
  id: string;
  title: string;
  sheetName: string;
  keys: readonly HeadcountKey[];
  showTotal: boolean;
  showWithPostings: boolean;
}[] = [
  {
    id: "engineering",
    title: "AA Mühendislik Liderliği Head Count Raporu",
    sheetName: "Mühendislik Head Count",
    keys: ["active", "gearUp", "hourly"],
    showTotal: true,
    showWithPostings: false,
  },
  {
    id: "culture",
    title: "İnsan Kültür Dönüşüm Verilerine Göre Head Count",
    sheetName: "İKD Head Count",
    keys: ["active", "activePosting", "passivePosting"],
    showTotal: true,
    showWithPostings: true,
  },
];
export type HeadcountReportRow = ReportGroup & { counts: HeadcountCounts };
export type HeadcountReportData = {
  date: string;
  rows: HeadcountReportRow[];
  totals: HeadcountCounts;
};
const emptyCounts = (): HeadcountCounts => ({
  active: 0,
  gearUp: 0,
  hourly: 0,
  activePosting: 0,
  passivePosting: 0,
});
export const workingHeadcount = (counts: HeadcountCounts) =>
  counts.active + counts.gearUp + counts.hourly;
export const headcountColumnTotal = (
  counts: HeadcountCounts,
  keys: readonly HeadcountKey[],
) => keys.reduce((sum, key) => sum + counts[key], 0);
export const headcountWithPostings = (counts: HeadcountCounts) =>
  counts.active + counts.activePosting;

/** A current person/vacancy counts once, independent of FTE or planning inclusion.
 * Child rows are subtotals; grand totals use unique filtered unit IDs. */
export function buildHeadcountReport(
  data: Data,
  teams: readonly Team[],
  roots: readonly ReportGroup[],
  date: string,
): HeadcountReportData {
  const units = new Set(teams.map((team) => team.id));
  const byUnit = new Map<string, HeadcountCounts>();
  for (const resource of data.resources) {
    const version = versionAt(resource, date.slice(0, 7));
    if (!version || !units.has(version.team)) continue;
    const column = HEADCOUNT_COLUMNS.find(
      (item) => item.status === version.status,
    );
    if (!column) continue;
    const posting =
      column.key === "activePosting" || column.key === "passivePosting";
    if (
      !posting &&
      ((version.start &&
        normalizeResourceDate(version.start, "start") > date) ||
        (version.end && normalizeResourceDate(version.end, "end") < date))
    )
      continue;
    const counts = byUnit.get(version.team) || emptyCounts();
    counts[column.key]++;
    byUnit.set(version.team, counts);
  }
  const sum = (ids: readonly string[]) => {
    const result = emptyCounts();
    for (const id of new Set(ids)) {
      if (!units.has(id)) continue;
      const counts = byUnit.get(id);
      if (counts)
        for (const { key } of HEADCOUNT_COLUMNS) result[key] += counts[key];
    }
    return result;
  };
  return {
    date,
    rows: expandLeadershipReportGroups(data, teams, roots).map((group) => ({
      ...group,
      counts: sum(group.ids),
    })),
    totals: sum(roots.flatMap((group) => group.ids)),
  };
}
