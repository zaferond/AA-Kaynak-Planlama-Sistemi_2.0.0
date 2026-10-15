export function positionPointerTooltip(
  tooltip: HTMLElement | null,
  x: number,
  y: number,
) {
  if (!tooltip) return;
  const { width, height } = tooltip.getBoundingClientRect();
  const gap = 12;
  const left = Math.max(8, Math.min(x + gap, window.innerWidth - width - 8));
  const top =
    y + gap + height + 8 <= window.innerHeight
      ? y + gap
      : Math.max(8, y - height - gap);
  const zoom =
    Number.parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
  tooltip.style.left = left / zoom + "px";
  tooltip.style.top = top / zoom + "px";
}
