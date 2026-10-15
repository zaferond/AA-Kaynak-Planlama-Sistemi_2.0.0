const numberFormat = new Intl.NumberFormat("tr-TR", {
  maximumFractionDigits: 2,
});
export const fmt = (n: number) => numberFormat.format(n);
const dateFormat = new Intl.DateTimeFormat("tr-TR", {
    month: "short",
    year: "numeric",
  }),
  shortDateFormat = new Intl.DateTimeFormat("tr-TR", { month: "short" });
const monthLabels = new Map<string, string>();
export const monthLabel = (m: string) => {
  if (!monthLabels.has(m))
    monthLabels.set(m, dateFormat.format(new Date(m + "-01T12:00:00")));
  return monthLabels.get(m)!;
};
const fullDateFormat = new Intl.DateTimeFormat("tr-TR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
export const fullDateLabel = (date: string) =>
  date ? fullDateFormat.format(new Date(date + "T12:00:00")) : "Belirtilmemiş";

export { shortDateFormat };
