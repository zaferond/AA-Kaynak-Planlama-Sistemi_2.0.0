export function capacityStatus(capacity: number, allocated: number) {
  const excess = allocated - capacity;
  const epsilon =
    Number.EPSILON * Math.max(1, Math.abs(capacity), Math.abs(allocated)) * 16;
  if (excess <= epsilon)
    return {
      className: "within-capacity",
      label: "Kaynak aşımı yok",
      ratio: 0,
    };
  if (capacity <= 0)
    return {
      className: "over-critical",
      label: "Kaynak sıfır; pozitif tahsis var. Aşım oranı hesaplanamaz.",
      ratio: null,
    };
  const ratio = excess / capacity;
  const critical = excess - capacity * 0.1 > epsilon;
  return {
    className: critical ? "over-critical" : "over-warning",
    label:
      "Kaynak aşımı: %" +
      (ratio * 100).toLocaleString("tr-TR", { maximumFractionDigits: 4 }) +
      (critical ? " — %10 üzerinde" : " — %10 veya altında"),
    ratio,
  };
}
