import { resourceCapacity, type Data } from "./model.ts";
export type Metric = { current: number; total: number };
/** Aggregate the selected scope before calculating its remaining capacity or shortage. */
export function sumCapacityMetrics(
  cache: Record<string, Metric>,
  teamIds: string[],
  month: string,
): Metric {
  return teamIds.reduce(
    (sum, id) => {
      const cell = cache[id + "|" + month] || { current: 0, total: 0 };
      return {
        current: sum.current + cell.current,
        total: sum.total + cell.total,
      };
    },
    { current: 0, total: 0 },
  );
}
export function buildCapacityIndex(d: Data, months: string[]) {
  const out: Record<string, Metric> = {};
  for (const t of d.teams)
    for (const m of months) out[t.id + "|" + m] = { current: 0, total: 0 };
  for (const r of d.resources) {
    const versions = [...r.versions].sort((a, b) =>
      a.effective.localeCompare(b.effective),
    );
    let i = -1;
    for (const m of months) {
      while (i + 1 < versions.length && versions[i + 1].effective <= m) i++;
      if (i < 0) continue;
      const v = versions[i],
        cell = out[v.team + "|" + m];
      if (cell) cell.current += resourceCapacity(v, m);
    }
  }
  for (const [key, n] of Object.entries(d.allocations)) {
    const [t, , m] = key.split("|"),
      cell = out[t + "|" + m];
    if (cell) cell.total += n;
  }
  return out;
}
export function projectTotalIndex(
  d: Data,
  teamIds: string[],
  months: string[],
) {
  const ts = new Set(teamIds),
    ms = new Set(months),
    out: Record<string, number> = {};
  for (const [k, n] of Object.entries(d.allocations)) {
    const [t, p, m] = k.split("|");
    if (ts.has(t) && ms.has(m)) out[p + "|" + m] = (out[p + "|" + m] || 0) + n;
  }
  return out;
}
export function groupPage(
  outerCount: number,
  innerCount: number,
  page: number,
  size: number,
) {
  const total = outerCount * innerCount,
    start = page * size,
    end = Math.min(total, start + size);
  const groups: { outer: number; inners: number[] }[] = [];
  for (let i = start; i < end; i++) {
    const outer = Math.floor(i / innerCount),
      inner = i % innerCount;
    if (groups.at(-1)?.outer !== outer) groups.push({ outer, inners: [] });
    groups.at(-1)!.inners.push(inner);
  }
  return groups;
}
