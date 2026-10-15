import { useEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";
import {
  changeMilestoneNoteDates,
  milestoneRanges,
  noteDates,
  rangeNotes,
  resizeMilestoneRange,
  shiftCalendarDate,
  shiftMilestoneRange,
} from "../milestone-ranges";
import { calendarDayDifference, dateAtPeriodPosition } from "../milestone-bars";
import { daysForWeekDrag, type WeeklyNoteBar } from "../weekly-note-bars";
import type { MilestoneTrackProps } from "./project-timeline-types";
import {
  captureProjectSnapshot,
  type ProjectSnapshot,
} from "./project-snapshot";
import type { Milestone } from "../model";
import type { TimelinePeriod } from "../timeline-periods";

type DragMode = "move" | "start" | "end";
type DragInteraction = {
  snapshot: ProjectSnapshot;
  milestone: Milestone;
  periods: TimelinePeriod[];
};
type DragState = {
  interaction: DragInteraction;
  pointerId: number;
  rangeIndex: number;
  mode: DragMode;
  startX: number;
  startDate: string;
  timer: ReturnType<typeof setTimeout> | null;
  active: boolean;
  cancelled: boolean;
  moved: boolean;
  days: number;
  valid: boolean;
};
type DragPreview = {
  rangeIndex: number;
  mode: DragMode;
  days: number;
  start: string;
  end: string;
  message: string;
  x: number;
  y: number;
};
type NoteDragState = {
  interaction: DragInteraction;
  pointerId: number;
  rangeIndex: number;
  noteIndex: number;
  mode: DragMode;
  startX: number;
  timer: ReturnType<typeof setTimeout> | null;
  active: boolean;
  moved: boolean;
  days: number;
  valid: boolean;
};
type NoteDragPreview = DragPreview & { noteIndex: number };

type Props = Pick<
  MilestoneTrackProps,
  | "project"
  | "projectRevision"
  | "milestone"
  | "periods"
  | "isAdmin"
  | "saving"
  | "onChangeMilestoneRange"
  | "onChangeMilestoneNote"
> & {
  onBeginRange: () => void;
  onBeginNote: () => void;
};
export function useMilestoneDrag({
  project,
  projectRevision,
  milestone,
  periods,
  isAdmin,
  saving,
  onChangeMilestoneRange,
  onChangeMilestoneNote,
  onBeginRange,
  onBeginNote,
}: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const noteDragRef = useRef<NoteDragState | null>(null);
  const suppressClickRef = useRef(false);
  const [interaction, setInteraction] = useState<DragInteraction | null>(null);
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState<DragPreview | null>(null);
  const [notePreview, setNotePreview] = useState<NoteDragPreview | null>(null);
  useEffect(
    () => () => {
      if (dragRef.current?.timer) clearTimeout(dragRef.current.timer);
      if (noteDragRef.current?.timer) clearTimeout(noteDragRef.current.timer);
    },
    [],
  );
  function captureInteraction() {
    const snapshot = captureProjectSnapshot(project, projectRevision);
    const capturedMilestone = snapshot.project.milestones?.find(
      (item) => item.id === milestone.id,
    );
    return capturedMilestone
      ? {
          snapshot,
          milestone: capturedMilestone,
          periods: structuredClone(periods),
        }
      : null;
  }
  function beginDrag(
    event: PointerEvent<HTMLElement>,
    rangeIndex: number,
    mode: DragMode,
  ) {
    if (
      !isAdmin ||
      saving ||
      dragRef.current ||
      noteDragRef.current ||
      event.pointerType !== "mouse" ||
      event.button !== 0 ||
      !trackRef.current
    )
      return;
    const opening = captureInteraction();
    if (!opening) return;
    const range = milestoneRanges(opening.milestone)[rangeIndex];
    if (!range) return;
    const rect = trackRef.current.getBoundingClientRect();
    const startDate = dateAtPeriodPosition(
      event.clientX,
      rect.left,
      rect.width,
      opening.periods,
    );
    onBeginRange();
    setInteraction(opening);
    const drag: DragState = {
      interaction: opening,
      pointerId: event.pointerId,
      rangeIndex,
      mode,
      startX: event.clientX,
      startDate,
      timer: null,
      active: mode !== "move",
      cancelled: false,
      moved: false,
      days: 0,
      valid: true,
    };
    if (mode === "move")
      drag.timer = setTimeout(() => {
        if (dragRef.current !== drag || drag.cancelled) return;
        drag.active = true;
        setDragging(true);
        setPreview({
          rangeIndex,
          mode,
          days: 0,
          start: range.start,
          end: range.end,
          message: "",
          x: event.clientX,
          y: event.clientY,
        });
      }, 350);
    else {
      setDragging(true);
      setPreview({
        rangeIndex,
        mode,
        days: 0,
        start: range.start,
        end: range.end,
        message: "",
        x: event.clientX,
        y: event.clientY,
      });
    }
    dragRef.current = drag;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveDrag(event: PointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (!drag.active) {
      if (Math.abs(event.clientX - drag.startX) > 6) {
        if (drag.timer) clearTimeout(drag.timer);
        drag.timer = null;
        drag.cancelled = true;
        drag.moved = true;
      }
      return;
    }
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return;
    const {
      snapshot: { project },
      milestone,
      periods,
    } = drag.interaction;
    const date = dateAtPeriodPosition(
      event.clientX,
      rect.left,
      rect.width,
      periods,
    );
    const days = calendarDayDifference(drag.startDate, date);
    drag.days = days;
    if (days) drag.moved = true;
    const range = milestoneRanges(milestone)[drag.rangeIndex];
    const start =
      drag.mode === "end" ? range.start : shiftCalendarDate(range.start, days);
    const end =
      drag.mode === "start" ? range.end : shiftCalendarDate(range.end, days);
    try {
      if (drag.mode === "move")
        shiftMilestoneRange(project, milestone, drag.rangeIndex, days);
      else
        resizeMilestoneRange(
          project,
          milestone,
          drag.rangeIndex,
          drag.mode,
          days,
        );
      drag.valid = true;
      setPreview({
        rangeIndex: drag.rangeIndex,
        mode: drag.mode,
        days,
        start,
        end,
        message: "",
        x: event.clientX,
        y: event.clientY,
      });
    } catch (error) {
      drag.valid = false;
      setPreview((current) => ({
        rangeIndex: drag.rangeIndex,
        mode: drag.mode,
        days: current?.days || 0,
        start,
        end,
        message: (error as Error).message,
        x: event.clientX,
        y: event.clientY,
      }));
    }
  }

  function endDrag(event: PointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.timer) clearTimeout(drag.timer);
    if (drag.moved || projectRevision !== drag.interaction.snapshot.revision) {
      suppressClickRef.current = true;
      setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
    }
    if (drag.active && drag.days !== 0 && drag.valid)
      void onChangeMilestoneRange(
        drag.interaction.snapshot,
        drag.interaction.milestone.id,
        drag.rangeIndex,
        drag.mode,
        drag.days,
      );
    dragRef.current = null;
    setInteraction(null);
    setDragging(false);
    setPreview(null);
  }

  function cancelDrag(event: PointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.timer) clearTimeout(drag.timer);
    dragRef.current = null;
    setInteraction(null);
    setDragging(false);
    setPreview(null);
  }

  function beginNoteDrag(
    event: PointerEvent<HTMLElement>,
    note: WeeklyNoteBar,
    mode: DragMode,
  ) {
    if (
      !isAdmin ||
      saving ||
      dragRef.current ||
      noteDragRef.current ||
      event.pointerType !== "mouse" ||
      event.button !== 0 ||
      !trackRef.current
    )
      return;
    const opening = captureInteraction();
    if (!opening) return;
    const range = milestoneRanges(opening.milestone)[note.rangeIndex];
    if (!range || !rangeNotes(range)[note.noteIndex]) return;
    onBeginNote();
    setInteraction(opening);
    const drag: NoteDragState = {
      interaction: opening,
      pointerId: event.pointerId,
      rangeIndex: note.rangeIndex,
      noteIndex: note.noteIndex,
      mode,
      startX: event.clientX,
      timer: null,
      active: mode !== "move",
      moved: false,
      days: 0,
      valid: true,
    };
    const initialPreview: NoteDragPreview = {
      rangeIndex: note.rangeIndex,
      noteIndex: note.noteIndex,
      mode,
      days: 0,
      start: note.start,
      end: note.end,
      message: "",
      x: event.clientX,
      y: event.clientY,
    };
    noteDragRef.current = drag;
    if (mode === "move")
      drag.timer = setTimeout(() => {
        if (noteDragRef.current !== drag) return;
        drag.active = true;
        setNotePreview(initialPreview);
      }, 350);
    else setNotePreview(initialPreview);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveNoteDrag(event: PointerEvent<HTMLElement>) {
    const drag = noteDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (!drag.active) {
      if (Math.abs(event.clientX - drag.startX) > 6) {
        if (drag.timer) clearTimeout(drag.timer);
        drag.timer = null;
        drag.moved = true;
      }
      return;
    }
    if (Math.abs(event.clientX - drag.startX) > 5) drag.moved = true;
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return;
    const {
      snapshot: { project },
      milestone,
      periods,
    } = drag.interaction;
    const ranges = milestoneRanges(milestone);
    const days = daysForWeekDrag(
      drag.startX,
      event.clientX,
      rect.left,
      rect.width,
      periods,
    );
    drag.days = days;
    const note = rangeNotes(ranges[drag.rangeIndex])[drag.noteIndex];
    if (!note) return;
    const original = noteDates(note, ranges[drag.rangeIndex]);
    const start =
      drag.mode === "end"
        ? original.start
        : shiftCalendarDate(original.start, days);
    const end =
      drag.mode === "start"
        ? original.end
        : shiftCalendarDate(original.end, days);
    try {
      changeMilestoneNoteDates(
        project,
        milestone,
        drag.rangeIndex,
        drag.noteIndex,
        drag.mode,
        days,
      );
      drag.valid = true;
      setNotePreview({
        rangeIndex: drag.rangeIndex,
        noteIndex: drag.noteIndex,
        mode: drag.mode,
        days,
        start,
        end,
        message: "",
        x: event.clientX,
        y: event.clientY,
      });
    } catch (error) {
      drag.valid = false;
      setNotePreview({
        rangeIndex: drag.rangeIndex,
        noteIndex: drag.noteIndex,
        mode: drag.mode,
        days,
        start,
        end,
        message: (error as Error).message,
        x: event.clientX,
        y: event.clientY,
      });
    }
  }

  function endNoteDrag(event: PointerEvent<HTMLElement>) {
    const drag = noteDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.timer) clearTimeout(drag.timer);
    if (drag.moved || projectRevision !== drag.interaction.snapshot.revision) {
      suppressClickRef.current = true;
      setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
    }
    if (drag.active && drag.days !== 0 && drag.valid)
      void onChangeMilestoneNote(
        drag.interaction.snapshot,
        drag.interaction.milestone.id,
        drag.rangeIndex,
        drag.noteIndex,
        drag.mode,
        drag.days,
      );
    noteDragRef.current = null;
    setInteraction(null);
    setNotePreview(null);
  }

  function cancelNoteDrag(event: PointerEvent<HTMLElement>) {
    const drag = noteDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.timer) clearTimeout(drag.timer);
    noteDragRef.current = null;
    setInteraction(null);
    setNotePreview(null);
  }

  return {
    interaction,
    isInteracting: () => !!(dragRef.current || noteDragRef.current),
    isNoteDragging: () => !!noteDragRef.current,
    trackRef,
    suppressClickRef,
    dragging,
    preview,
    notePreview,
    beginDrag,
    moveDrag,
    endDrag,
    cancelDrag,
    beginNoteDrag,
    moveNoteDrag,
    endNoteDrag,
    cancelNoteDrag,
  };
}
