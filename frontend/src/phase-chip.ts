import type { CSSProperties } from "react";
import { phaseColor, type Project } from "./model.ts";

// Presentation only: retain persisted color IDs and the milestone palette.
export const phaseChipPalette = [
  {
    id: "blue",
    name: "Çelik Mavi",
    bg: "#d7e2eb",
    ink: "#39566f",
    border: "#39566f",
  },
  {
    id: "green",
    name: "Petrol Yeşili",
    bg: "#d3e4dc",
    ink: "#2d5d53",
    border: "#356a60",
  },
  {
    id: "amber",
    name: "Mat Bronz",
    bg: "#ecddc2",
    ink: "#705224",
    border: "#82612c",
  },
  {
    id: "red",
    name: "Kırmızı",
    bg: "#f0cccc",
    ink: "#793c3c",
    border: "#a65c5c",
  },
  {
    id: "purple",
    name: "Petrol Mavisi",
    bg: "#cde3e5",
    ink: "#29585f",
    border: "#356a73",
  },
  {
    id: "gray",
    name: "Sarı",
    bg: "#f3e8a6",
    ink: "#65551a",
    border: "#b3a044",
  },
];

export function phaseChipStyle(project: Project, month: string): CSSProperties {
  const color = phaseChipPalette.find(
    (item) => item.id === phaseColor(project, month).id,
  )!;
  return {
    "--phase-chip-accent": color.border,
    "--phase-chip-background": color.bg,
    "--phase-chip-ink": color.ink,
    "--phase-chip-highlight":
      color.id === "red" || color.id === "gray" ? "10%" : "30%",
  } as CSSProperties;
}

export function phaseChipEmpty(project: Project, month: string) {
  return !project.phases[month]?.trim() && !project.phaseColors?.[month];
}
