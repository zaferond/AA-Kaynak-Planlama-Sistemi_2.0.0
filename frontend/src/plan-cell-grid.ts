export type GridClipboard<T> = {
  values: T[][];
  rowCount: number;
  columnCount: number;
};
export type PlanClipboard = GridClipboard<number>;

export function mergePlanSelection(
  existing: string[],
  range: string[],
  additive: boolean,
): string[] {
  return additive ? [...new Set([...existing, ...range])] : range;
}

export function topLeftPlanCell(
  rows: string[],
  months: string[],
  selected: string[],
): string | null {
  const selection = new Set(selected);
  for (const row of rows) {
    for (const month of months) {
      const key = row + "|" + month;
      if (selection.has(key)) return key;
    }
  }
  return null;
}

export function rectangleKeys(
  rows: string[],
  months: string[],
  from: string,
  to: string,
  canUse: (key: string) => boolean,
): string[] {
  const firstRow = rows.findIndex(
    (row) => from.slice(0, from.lastIndexOf("|")) === row,
  );
  const lastRow = rows.findIndex(
    (row) => to.slice(0, to.lastIndexOf("|")) === row,
  );
  const firstMonth = months.indexOf(from.slice(from.lastIndexOf("|") + 1));
  const lastMonth = months.indexOf(to.slice(to.lastIndexOf("|") + 1));
  if ([firstRow, lastRow, firstMonth, lastMonth].some((index) => index < 0))
    return [];
  const keys: string[] = [];
  for (
    let r = Math.min(firstRow, lastRow);
    r <= Math.max(firstRow, lastRow);
    r++
  ) {
    for (
      let c = Math.min(firstMonth, lastMonth);
      c <= Math.max(firstMonth, lastMonth);
      c++
    ) {
      const key = rows[r] + "|" + months[c];
      if (canUse(key)) keys.push(key);
    }
  }
  return keys;
}

export function copyGridCells<T>(
  rows: string[],
  months: string[],
  selected: string[],
  read: (key: string) => T,
): GridClipboard<T> {
  const selection = new Set(selected);
  if (
    selected.some(
      (key) =>
        !rows.some((row) => key.slice(0, key.lastIndexOf("|")) === row) ||
        !months.includes(key.slice(key.lastIndexOf("|") + 1)),
    )
  ) {
    throw Error("Kopyalamak için aynı sayfada görünen hücreleri seçin.");
  }
  const rowIndexes = rows
    .map((row, index) =>
      months.some((month) => selection.has(row + "|" + month)) ? index : -1,
    )
    .filter((index) => index >= 0);
  const columnIndexes = months
    .map((month, index) =>
      rows.some((row) => selection.has(row + "|" + month)) ? index : -1,
    )
    .filter((index) => index >= 0);
  if (!rowIndexes.length || !columnIndexes.length)
    throw Error("Önce görünür hücrelerden bir aralık seçin.");
  const rowStart = rowIndexes[0],
    rowEnd = rowIndexes.at(-1)!;
  const columnStart = columnIndexes[0],
    columnEnd = columnIndexes.at(-1)!;
  const values: T[][] = [];
  for (let r = rowStart; r <= rowEnd; r++) {
    const line: T[] = [];
    for (let c = columnStart; c <= columnEnd; c++) {
      const key = rows[r] + "|" + months[c];
      if (!selection.has(key))
        throw Error(
          "Kopyalamak için kesintisiz dikdörtgen bir hücre aralığı seçin.",
        );
      line.push(read(key));
    }
    values.push(line);
  }
  return { values, rowCount: values.length, columnCount: values[0].length };
}

export function pasteGridCells<T>(
  rows: string[],
  months: string[],
  anchor: string,
  selected: string[],
  clipboard: GridClipboard<T>,
  canUse: (key: string) => boolean,
): { key: string; value: T }[] {
  let anchorRow = rows.findIndex(
    (row) => anchor.slice(0, anchor.lastIndexOf("|")) === row,
  );
  let anchorColumn = months.indexOf(anchor.slice(anchor.lastIndexOf("|") + 1));
  if (anchorRow < 0 || anchorColumn < 0)
    throw Error("Yapıştırma hücresi görünür tabloda bulunamadı.");
  if (
    clipboard.rowCount === 1 &&
    clipboard.columnCount === 1 &&
    selected.includes(anchor) &&
    selected.length > 1
  ) {
    return selected.map((key) => {
      if (!canUse(key))
        throw Error("Seçimde proje dönemi dışında bir hücre var.");
      return { key, value: clipboard.values[0][0] };
    });
  }
  if (
    selected.includes(anchor) &&
    selected.length === clipboard.rowCount * clipboard.columnCount
  ) {
    const selectedRows = rows
      .map((row, index) =>
        months.some((month) => selected.includes(row + "|" + month))
          ? index
          : -1,
      )
      .filter((index) => index >= 0);
    const selectedColumns = months
      .map((month, index) =>
        rows.some((row) => selected.includes(row + "|" + month)) ? index : -1,
      )
      .filter((index) => index >= 0);
    if (
      selectedRows.length === clipboard.rowCount &&
      selectedColumns.length === clipboard.columnCount
    ) {
      anchorRow = selectedRows[0];
      anchorColumn = selectedColumns[0];
    }
  }
  const result: { key: string; value: T }[] = [];
  for (let r = 0; r < clipboard.rowCount; r++) {
    for (let c = 0; c < clipboard.columnCount; c++) {
      const row = rows[anchorRow + r],
        month = months[anchorColumn + c];
      if (!row || !month)
        throw Error("Kopyalanan aralık görünür tablonun dışına taşıyor.");
      const key = row + "|" + month;
      if (!canUse(key))
        throw Error(
          "Yapıştırılacak aralıkta proje dönemi dışında bir hücre var.",
        );
      result.push({ key, value: clipboard.values[r][c] });
    }
  }
  return result;
}

export function copyPlanCells(
  rows: string[],
  months: string[],
  selected: string[],
  allocations: Record<string, number>,
): PlanClipboard {
  return copyGridCells(rows, months, selected, (key) => allocations[key] || 0);
}
export function pastePlanCells(
  rows: string[],
  months: string[],
  anchor: string,
  selected: string[],
  clipboard: PlanClipboard,
  canUse: (key: string) => boolean,
): { key: string; value: number }[] {
  return pasteGridCells(rows, months, anchor, selected, clipboard, canUse);
}
