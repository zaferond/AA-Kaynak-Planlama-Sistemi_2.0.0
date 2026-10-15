export const dateFormat = new Intl.DateTimeFormat("tr-TR", {
  day: "2-digit",
  month: "long",
  year: "numeric",
});
const shortDateFormat = new Intl.DateTimeFormat("tr-TR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
export const formatCalendarRange = (from: string, to: string) =>
  from === to
    ? shortDateFormat.format(new Date(from + "T12:00:00"))
    : `${shortDateFormat.format(new Date(from + "T12:00:00"))} → ${shortDateFormat.format(new Date(to + "T12:00:00"))}`;
