import type { CSSProperties } from "react";
import type { MilestoneRange } from "./model";

type Props = {
  color: string;
  style?: MilestoneRange["diamondStyle"];
  completed?: boolean;
};
export default function MilestoneDiamond({ color, style, completed }: Props) {
  return (
    <span
      aria-hidden="true"
      className={
        "milestone-diamond " +
        (style === "outline" ? "outline" : "solid") +
        (completed ? " completed" : "")
      }
      style={{ "--diamond-color": color } as CSSProperties}
    />
  );
}
