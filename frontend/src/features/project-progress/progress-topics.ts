import type { Project } from "../../model.ts";
import { milestoneRanges } from "../../milestone-ranges.ts";

export type Topic = {
  name: string;
  note: string;
  start: string;
  end: string;
  point: boolean;
  color: string;
};
/** Critical topics and milestones of the project that touch a month. */
export function topicsIn(project: Project, month: string): Topic[] {
  return (project.milestones || []).flatMap((milestone) =>
    milestoneRanges(milestone)
      .filter(
        (range) =>
          range.start.slice(0, 7) <= month && range.end.slice(0, 7) >= month,
      )
      .map((range) => ({
        name: milestone.name,
        note: range.notes?.find((n) => n.text?.trim())?.text.trim() || "",
        start: range.start,
        end: range.end,
        point: range.displayKind === "milestone",
        color: range.color || "red",
      })),
  );
}
