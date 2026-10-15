import type {
  Milestone,
  MilestoneNote,
  MilestoneRange,
  Project,
} from "./model.ts";

export function visibleMilestoneBarStyle(
  style: Milestone["barStyle"],
): "solid" | "outline" {
  return style === "outline" ? "outline" : "solid";
}

export const CRITICAL_DATE_OVERLAP_MESSAGE =
  "Güncellemek istediğiniz tarih diğer kritik tarihlerin içerisindeki bir tarihtir. Tekrar kontrol ediniz.";

/** Points may share a bar's dates; only duration bars must remain separate. */
export function assertMilestoneBarSeparation(
  ranges: Pick<MilestoneRange, "start" | "end" | "displayKind">[],
): void {
  const bars = ranges
    .filter((range) => range.displayKind !== "milestone")
    .sort(
      (a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end),
    );
  for (let index = 1; index < bars.length; index++)
    if (bars[index].start <= bars[index - 1].end)
      throw Error(CRITICAL_DATE_OVERLAP_MESSAGE);
}

export function rangeNotes(range: MilestoneRange): MilestoneNote[] {
  return (
    range.notes ??
    (range.description
      ? [{ text: range.description, includeInReport: false }]
      : [])
  );
}

export function noteDates(note: MilestoneNote, range: MilestoneRange) {
  return { start: note.start ?? range.start, end: note.end ?? range.end };
}

export function pointRangeAtDate(
  range: MilestoneRange,
  date: string,
): MilestoneRange {
  return {
    ...range,
    start: date,
    end: date,
    notes: rangeNotes(range).map((note) => ({
      ...note,
      start: date,
      end: date,
    })),
  };
}
export function changeRangeDisplayKind(
  range: MilestoneRange,
  kind: "range" | "milestone",
): MilestoneRange {
  if (kind === "range") return { ...range, displayKind: "range" };
  if (rangeNotes(range).length > 1)
    throw Error("Birden fazla detay not içeren aralık Milestone'a çevrilemez.");
  return pointRangeAtDate({ ...range, displayKind: "milestone" }, range.start);
}
export function assertPointRange(range: MilestoneRange) {
  if (range.displayKind !== "milestone") return;
  if (!rangeNotes(range)[0]?.text.trim()) throw Error("Milestone adı girin.");
  if (
    range.start !== range.end ||
    rangeNotes(range).length > 1 ||
    rangeNotes(range).some(
      (note) =>
        noteDates(note, range).start !== range.start ||
        noteDates(note, range).end !== range.end,
    )
  )
    throw Error(
      "Milestone tek tarih içermelidir; başlangıç ve bitişi aynı gün olmalıdır.",
    );
}
export function datedNotes(range: MilestoneRange): MilestoneNote[] {
  return rangeNotes(range).map((note) => ({
    ...note,
    ...noteDates(note, range),
  }));
}

/** Text does not determine a subtask's date contribution. Incomplete edits retain the current bar. */
export function rangeWithNoteDates(
  range: MilestoneRange,
  notes: MilestoneNote[],
): MilestoneRange {
  const next = { ...range, description: notes[0]?.text || "", notes };
  if (range.displayKind === "milestone") {
    const dated = {
      ...next,
      start: notes[0]?.start ?? range.start,
      end: notes[0]?.end ?? range.end,
    };
    assertPointRange(dated);
    return dated;
  }
  const dated = notes.map((note) => noteDates(note, range));
  if (
    !dated.length ||
    dated.some((note) => !note.start || !note.end || note.start > note.end)
  )
    return next;
  return {
    ...next,
    start: dated.reduce(
      (first, note) => (note.start < first ? note.start : first),
      dated[0].start,
    ),
    end: dated.reduce(
      (last, note) => (note.end > last ? note.end : last),
      dated[0].end,
    ),
  };
}

/** A date edited in the form expands its enclosing range without narrowing manually set bounds. */
export function expandRangeToNoteDates(
  range: MilestoneRange,
  notes: MilestoneNote[],
): MilestoneRange {
  if (range.displayKind === "milestone")
    return rangeWithNoteDates(range, notes);
  const dated = notes
    .map((note) => noteDates(note, range))
    .filter((note) => note.start && note.end && note.start <= note.end);
  return {
    ...range,
    description: notes[0]?.text || "",
    notes,
    start: dated.reduce(
      (first, note) => (!first || note.start < first ? note.start : first),
      range.start,
    ),
    end: dated.reduce(
      (last, note) => (!last || note.end > last ? note.end : last),
      range.end,
    ),
  };
}

/** Use the same date checks in the project editor and the critical topics report. */
export function assertMilestoneDateRanges(
  project: Pick<Project, "start" | "end">,
  ranges: MilestoneRange[],
): void {
  const sorted = [...ranges].sort(
    (a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end),
  );
  for (const range of sorted) {
    assertPointRange(range);
    if (!range.start || !range.end)
      throw Error("Tüm tarih aralıklarını doldurun.");
    if (range.start > range.end)
      throw Error("Bitiş tarihi başlangıç tarihinden önce olamaz.");
    if (
      range.start < project.start + "-01" ||
      range.end.slice(0, 7) > project.end
    )
      throw Error("Bilgi tarihleri proje dönemi içinde olmalı.");
    for (const note of rangeNotes(range)) {
      if (note.includeInReport && !note.text.trim())
        throw Error("Rapora eklenecek açıklama boş olamaz.");
      if (!note.text.trim()) continue;
      const { start, end } = noteDates(note, range);
      if (
        !start ||
        !end ||
        start > end ||
        start < project.start + "-01" ||
        end.slice(0, 7) > project.end
      )
        throw Error(
          "Açıklama başlangıç ve bitiş tarihleri geçerli sırada ve proje dönemi içinde olmalı.",
        );
    }
  }
  assertMilestoneBarSeparation(ranges);
}

function savedNotes(range: MilestoneRange): MilestoneNote[] {
  return rangeNotes(range)
    .map((note) => ({
      text: note.text.trim(),
      includeInReport: note.includeInReport,
      ...(note.completed ? { completed: true } : {}),
      ...(note.start !== undefined ? { start: note.start } : {}),
      ...(note.end !== undefined ? { end: note.end } : {}),
    }))
    .filter((note) => note.text);
}

export function cleanMilestoneRanges(
  ranges: MilestoneRange[],
): MilestoneRange[] {
  return ranges.map((range) => {
    const notes = savedNotes(range);
    return { ...range, description: notes[0]?.text || "", notes };
  });
}

export function milestoneRanges(milestone: Milestone): MilestoneRange[] {
  if (milestone.hasCriticalTopics === false) return [];
  const color = milestone.barColor || "red";
  return [
    {
      start: milestone.start,
      end: milestone.end,
      color,
      ...(milestone.diamondStyle
        ? { diamondStyle: milestone.diamondStyle }
        : {}),
      ...(milestone.displayKind === "milestone"
        ? { displayKind: "milestone" as const }
        : {}),
      ...(milestone.barText !== undefined
        ? { description: milestone.barText }
        : {}),
      notes:
        milestone.barNotes ??
        (milestone.barText
          ? [{ text: milestone.barText, includeInReport: false }]
          : milestone.displayKind === "milestone"
            ? [
                {
                  text: milestone.name,
                  includeInReport: false,
                  start: milestone.start,
                  end: milestone.end,
                },
              ]
            : []),
    },
    ...(milestone.additionalRanges || []).map((range) => ({
      ...range,
      color: range.color || color,
      notes: rangeNotes(range),
    })),
  ];
}

export function withMilestoneRanges(
  milestone: Milestone,
  ranges: MilestoneRange[],
): Milestone {
  if (!ranges.length) throw Error("En az bir tarih aralığı gereklidir.");
  const {
    additionalRanges: _,
    barText: __,
    barNotes: ___,
    barColor: ____,
    hasCriticalTopics: _____,
    displayKind: ______,
    diamondStyle: _______,
    ...rest
  } = milestone;
  const [first, ...additionalRanges] = ranges;
  const firstNotes = rangeNotes(first);
  return {
    ...rest,
    ...(first.displayKind === "milestone"
      ? { displayKind: "milestone" as const }
      : {}),
    ...(first.diamondStyle ? { diamondStyle: first.diamondStyle } : {}),
    start: first.start,
    end: first.end,
    barColor: first.color || milestone.barColor || "red",
    barText: firstNotes[0]?.text || "",
    barNotes: firstNotes,
    ...(additionalRanges.length
      ? {
          additionalRanges: additionalRanges.map((range) => {
            const notes = rangeNotes(range);
            return { ...range, description: notes[0]?.text || "", notes };
          }),
        }
      : {}),
  };
}

export function withoutCriticalTopics(milestone: Milestone): Milestone {
  const {
    additionalRanges: _,
    barText: __,
    barNotes: ___,
    displayKind: ____,
    diamondStyle: _____,
    ...rest
  } = milestone;
  return { ...rest, hasCriticalTopics: false, barText: "", barNotes: [] };
}

export function addMilestoneNote(
  milestone: Milestone,
  rangeIndex: number,
): Milestone {
  const ranges = milestoneRanges(milestone);
  const range = ranges[rangeIndex];
  if (!range) throw Error("Tarih aralığı bulunamadı.");
  const notes = rangeNotes(range);
  if (range.displayKind === "milestone")
    throw Error(
      "Milestone tek bir ad içerir; yeni bir not veya Milestone ekleyin.",
    );
  if (notes.length >= 10)
    throw Error("Bir tarih aralığına en fazla 10 açıklama eklenebilir.");
  const next = {
    text: "",
    includeInReport: false,
    start: range.start,
    end: range.end,
  };
  return withMilestoneRanges(
    milestone,
    ranges.map((item, index) =>
      index === rangeIndex ? { ...item, notes: [...notes, next] } : item,
    ),
  );
}

export function removeMilestoneNote(
  milestone: Milestone,
  rangeIndex: number,
  noteIndex: number,
): Milestone {
  const ranges = milestoneRanges(milestone);
  const range = ranges[rangeIndex];
  if (!range) throw Error("Tarih aralığı bulunamadı.");
  const notes = datedNotes(range);
  if (noteIndex < 0 || noteIndex >= notes.length)
    throw Error("Açıklama bulunamadı.");
  return withMilestoneRanges(
    milestone,
    ranges.map((item, index) =>
      index === rangeIndex
        ? rangeWithNoteDates(
            item,
            notes.filter((_, i) => i !== noteIndex),
          )
        : item,
    ),
  );
}

export function removeMilestoneRange(
  milestone: Milestone,
  rangeIndex: number,
): Milestone {
  const ranges = milestoneRanges(milestone);
  if (rangeIndex < 0 || rangeIndex >= ranges.length)
    throw Error("Tarih aralığı bulunamadı.");
  if (ranges.length === 1)
    throw Error("Son tarih aralığını kaldırmak için bilgiyi silin.");
  return withMilestoneRanges(
    milestone,
    ranges.filter((_, index) => index !== rangeIndex),
  );
}

export function addDraftMilestoneRange(
  milestone: Milestone,
  projectEnd: string,
  isEmpty: boolean,
): Milestone {
  const ranges = isEmpty ? [] : milestoneRanges(milestone);
  if (ranges.length >= 20) throw Error("En fazla 20 kritik konu eklenebilir.");
  const last = ranges.at(-1);
  const next = last?.end ? new Date(last.end + "T12:00:00Z") : null;
  next?.setUTCDate(next.getUTCDate() + 1);
  const max = new Date(
    Date.UTC(Number(projectEnd.slice(0, 4)), Number(projectEnd.slice(5, 7)), 0),
  )
    .toISOString()
    .slice(0, 10);
  const date = last
    ? next && next.toISOString().slice(0, 10) <= max
      ? next.toISOString().slice(0, 10)
      : ""
    : milestone.start;
  return withMilestoneRanges(milestone, [
    ...ranges,
    {
      start: date,
      end: date,
      description: "",
      notes: [{ text: "", includeInReport: false }],
      color: last?.color || milestone.barColor || "red",
    },
  ]);
}

export function removeDraftMilestoneRange(
  milestone: Milestone,
  rangeIndex: number,
): { value: Milestone; isEmpty: boolean } {
  const ranges = milestoneRanges(milestone);
  if (rangeIndex < 0 || rangeIndex >= ranges.length)
    throw Error("Tarih aralığı bulunamadı.");
  return ranges.length === 1
    ? { value: milestone, isEmpty: true }
    : { value: removeMilestoneRange(milestone, rangeIndex), isEmpty: false };
}

export const shiftCalendarDate = (date: string, days: number) => {
  const value = new Date(date + "T12:00:00Z");
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};

/** Move one bar and its dated notes by the same number of calendar days. */
export function shiftMilestoneRange(
  project: Pick<Project, "start" | "end">,
  milestone: Milestone,
  rangeIndex: number,
  days: number,
): Milestone {
  const ranges = milestoneRanges(milestone);
  if (!Number.isInteger(days) || rangeIndex < 0 || rangeIndex >= ranges.length)
    throw Error("Taşınacak tarih aralığı bulunamadı.");
  const moved = ranges.map((range, index) =>
    index === rangeIndex
      ? {
          ...range,
          start: shiftCalendarDate(range.start, days),
          end: shiftCalendarDate(range.end, days),
          notes: rangeNotes(range).map((note) => ({
            ...note,
            ...(note.start !== undefined
              ? { start: shiftCalendarDate(note.start, days) }
              : {}),
            ...(note.end !== undefined
              ? { end: shiftCalendarDate(note.end, days) }
              : {}),
          })),
        }
      : range,
  );
  assertMilestoneDateRanges(project, moved);
  return withMilestoneRanges(milestone, moved);
}

/** Resize one end of a bar and the same end of every detail within it. */
export function resizeMilestoneRange(
  project: Pick<Project, "start" | "end">,
  milestone: Milestone,
  rangeIndex: number,
  edge: "start" | "end",
  days: number,
): Milestone {
  if (milestoneRanges(milestone)[rangeIndex]?.displayKind === "milestone")
    throw Error(
      "Milestone tek tarihli olduğundan genişletilemez; sürükleyerek taşıyın.",
    );
  const ranges = milestoneRanges(milestone);
  if (!Number.isInteger(days) || rangeIndex < 0 || rangeIndex >= ranges.length)
    throw Error("Düzenlenecek tarih aralığı bulunamadı.");
  const resized = ranges.map((range, index) =>
    index === rangeIndex
      ? {
          ...range,
          [edge]: shiftCalendarDate(range[edge], days),
          notes: datedNotes(range).map((note) => ({
            ...note,
            [edge]: shiftCalendarDate(note[edge]!, days),
          })),
        }
      : range,
  );
  if (
    resized.some((range) =>
      range.notes?.some(
        (note) =>
          note.text.trim() && note.start && note.end && note.start > note.end,
      ),
    )
  )
    throw Error(
      "Bar daraltılamıyor: detay açıklamanın başlangıcı bitiş tarihini geçiyor.",
    );
  assertMilestoneDateRanges(project, resized);
  return withMilestoneRanges(milestone, resized);
}

/** Move or resize one dated detail, expanding its parent while preserving manual bounds. */
export function changeMilestoneNoteDates(
  project: Pick<Project, "start" | "end">,
  milestone: Milestone,
  rangeIndex: number,
  noteIndex: number,
  mode: "move" | "start" | "end",
  days: number,
): Milestone {
  const ranges = milestoneRanges(milestone);
  const range = ranges[rangeIndex];
  const notes = range && datedNotes(range);
  if (
    !Number.isInteger(days) ||
    !range ||
    !notes ||
    noteIndex < 0 ||
    noteIndex >= notes.length
  )
    throw Error("Düzenlenecek detay açıklama bulunamadı.");
  const note = notes[noteIndex];
  if (!note.text.trim()) throw Error("Boş detay açıklama taşınamaz.");
  if (!note.start || !note.end)
    throw Error("Detay açıklamanın başlangıç ve bitiş tarihlerini girin.");
  const start =
    mode === "end" ? note.start : shiftCalendarDate(note.start, days);
  const end = mode === "start" ? note.end : shiftCalendarDate(note.end, days);
  if (start > end)
    throw Error("Açıklama bitiş tarihi başlangıç tarihinden önce olamaz.");
  const changed = notes.map((item, index) =>
    index === noteIndex ? { ...item, start, end } : item,
  );
  const next = ranges.map((item, index) =>
    index === rangeIndex ? expandRangeToNoteDates(item, changed) : item,
  );
  assertMilestoneDateRanges(project, next);
  return withMilestoneRanges(milestone, next);
}
