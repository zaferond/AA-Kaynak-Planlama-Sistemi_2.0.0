export type ExcelCell = {
  value: string | number | boolean;
  formula?: boolean;
  error?: boolean;
};
export type ExcelRow = { number: number; cells: ExcelCell[] };
