// Frozen pre-optimization personMonthHours calculation from b977f1a.
// Test-only oracle. Do not use in production or silently update with the implementation.
export function referencePersonMonthHours(
  month,
  resourceId,
  manual,
  calendar = {},
  personal = {},
) {
  const year = Number(month.slice(0, 4)),
    monthIndex = Number(month.slice(5, 7)) - 1;
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  let baseHours = 0,
    leaveHours = 0,
    trainingHours = 0;
  for (let day = 1; day <= lastDay; day++) {
    const date = month + "-" + String(day).padStart(2, "0");
    const weekday = new Date(date + "T12:00:00Z").getUTCDay();
    const available =
      weekday === 0 || weekday === 6
        ? 0
        : 9 * (1 - (calendar[date]?.fraction || 0));
    baseHours += available;
    const key = resourceId + "|" + date;
    const entries = [
      personal[key],
      personal[key + "|leave"],
      personal[key + "|training"],
    ].filter((entry) => !!entry);
    const leave = Math.min(
      entries
        .filter((entry) => entry.type === "leave")
        .reduce((sum, entry) => sum + entry.hours, 0),
      available,
    );
    const training = Math.min(
      entries
        .filter((entry) => entry.type === "training")
        .reduce((sum, entry) => sum + entry.hours, 0),
      available - leave,
    );
    leaveHours += leave;
    trainingHours += training;
  }
  let workdays = 0;
  for (let day = 1; day <= lastDay; day++) {
    const weekday = new Date(Date.UTC(year, monthIndex, day)).getUTCDay();
    if (weekday >= 1 && weekday <= 5) workdays++;
  }
  const autoHours = baseHours - leaveHours,
    nonWorkingHours = workdays * 9 - baseHours + leaveHours;
  return {
    baseHours,
    leaveHours,
    trainingHours,
    autoHours,
    nonWorkingHours,
    effectiveHours:
      manual === undefined ? autoHours : Math.max(0, manual - nonWorkingHours),
    maxEffectiveHours: Math.max(0, 1000 - nonWorkingHours),
  };
}
