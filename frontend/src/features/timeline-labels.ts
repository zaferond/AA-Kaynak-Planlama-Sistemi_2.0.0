const monthFormat = new Intl.DateTimeFormat("tr-TR", {
  month: "short",
  year: "numeric",
});
export const monthLabel = (month: string) =>
  monthFormat.format(new Date(month + "-01T12:00:00"));
const dateFormat = new Intl.DateTimeFormat("tr-TR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});
export const dateLabel = (date: string) =>
  dateFormat.format(new Date(date + "T12:00:00"));
const barDateFormat = new Intl.DateTimeFormat("tr-TR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
export const barDateLabel = (date: string) =>
  barDateFormat.format(new Date(date + "T12:00:00"));
