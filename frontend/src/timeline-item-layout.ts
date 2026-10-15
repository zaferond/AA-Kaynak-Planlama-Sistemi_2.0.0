export type TimelineItem = {
  id: string;
  left: number;
  right: number;
  minimumHeight: number;
};

function groupLayout(
  items: TimelineItem[],
  measuredHeights: Record<string, number>,
) {
  const lanes = new Map<string, number>();
  const ends: number[] = [];
  const heights: number[] = [];
  for (const item of items) {
    let lane = ends.findIndex((end) => end <= item.left);
    if (lane < 0) lane = ends.length;
    ends[lane] = item.right + 4;
    heights[lane] = Math.max(
      heights[lane] || 0,
      item.minimumHeight,
      measuredHeights[item.id] || 0,
    );
    lanes.set(item.id, lane);
  }
  const laneCenters: number[] = [];
  let bottom = 6;
  for (const height of heights) {
    laneCenters.push(bottom + height / 2);
    bottom += height + 8;
  }
  return {
    centers: Object.fromEntries(
      [...lanes].map(([id, lane]) => [id, laneCenters[lane]]),
    ),
    height: bottom - 8 + 6,
  };
}

/** Center independent items and collision groups around the same row midpoint. */
export function timelineItemLayout(
  items: TimelineItem[],
  measuredHeights: Record<string, number>,
): { centers: Record<string, number>; height: number } {
  const groups: TimelineItem[][] = [];
  let right = -Infinity;
  for (const item of [...items].sort((a, b) => a.left - b.left)) {
    if (item.left >= right) groups.push([]);
    groups.at(-1)!.push(item);
    right = Math.max(right, item.right + 4);
  }
  const layouts = groups.map((group) => groupLayout(group, measuredHeights));
  const height = Math.max(36, ...layouts.map((layout) => layout.height));
  return {
    height,
    centers: Object.fromEntries(
      layouts.flatMap((layout) =>
        Object.entries(layout.centers).map(([id, center]) => [
          id,
          center + (height - layout.height) / 2,
        ]),
      ),
    ),
  };
}
