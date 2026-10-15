import type { CSSProperties } from "react";
import { phaseColor, type Project } from "./model.ts";

// Presentation only: retain persisted color IDs and names. Muted, print-safe
// tones: a light fill, a same-hue hairline and a strong accent at the run start.
export const phaseChipPalette = [
  {
    id: "blue",
    name: "Çelik Mavi",
    bg: "#e6ecf3",
    ink: "#23384f",
    border: "#a9bbcf",
    accent: "#3e5b7b",
  },
  {
    id: "green",
    name: "Petrol Yeşili",
    bg: "#e2eee9",
    ink: "#1f4438",
    border: "#a3c3b6",
    accent: "#3a6e5c",
  },
  {
    id: "amber",
    name: "Kahverengi",
    bg: "#ede1d6",
    ink: "#4a2c17",
    border: "#c8a990",
    accent: "#7b4a2a",
  },
  {
    id: "red",
    name: "Kırmızı",
    bg: "#f6d8cf",
    ink: "#7a1a10",
    border: "#de9884",
    accent: "#b42318",
  },
  {
    id: "purple",
    name: "Petrol Mavisi",
    bg: "#e0edef",
    ink: "#1c4248",
    border: "#a1c4c9",
    accent: "#36727b",
  },
  {
    id: "gray",
    name: "Sarı",
    bg: "#f4eecf",
    ink: "#544713",
    border: "#d8ca86",
    accent: "#a48d24",
  },
];

/** `span` is the number of cells a run covers; its label may use that width. */
export function phaseChipStyle(
  project: Project,
  month: string,
  span = 1,
): CSSProperties {
  const color = phaseChipPalette.find(
    (item) => item.id === phaseColor(project, month).id,
  )!;
  return {
    "--phase-chip-accent": color.accent,
    "--phase-chip-border": color.border,
    "--phase-chip-background": color.bg,
    "--phase-chip-ink": color.ink,
    "--phase-run-span": span,
  } as CSSProperties;
}

export function phaseChipEmpty(project: Project, month: string) {
  return !project.phases[month]?.trim() && !project.phaseColors?.[month];
}

export type PhaseRunPart = "single" | "start" | "middle" | "end";

/** Identity of a filled phase cell; equal neighbours are drawn as one bar. */
export function phaseRunKey(project: Project, month: string, active = true) {
  const text = active ? project.phases[month]?.trim() : "";
  return text ? text + "\u0000" + phaseColor(project, month).id : "";
}

/** Gantt-style position of each cell inside a run of identical phases. */
export function phaseRunParts(keys: readonly string[]) {
  return keys.map((key, index): PhaseRunPart | undefined => {
    if (!key) return undefined;
    const joinsBefore = keys[index - 1] === key,
      joinsAfter = keys[index + 1] === key;
    return joinsBefore
      ? joinsAfter
        ? "middle"
        : "end"
      : joinsAfter
        ? "start"
        : "single";
  });
}

/** Cells covered by the run that starts at each index; 1 elsewhere. */
export function phaseRunSpans(keys: readonly string[]) {
  return keys.map((key, index) => {
    if (!key || keys[index - 1] === key) return 1;
    let end = index;
    while (keys[end + 1] === key) end++;
    return end - index + 1;
  });
}

export function shiftMonth(month: string, delta: number) {
  const [year, value] = month.split("-").map(Number);
  const index = year * 12 + value - 1 + delta;
  return (
    Math.floor(index / 12) + "-" + String((index % 12) + 1).padStart(2, "0")
  );
}
