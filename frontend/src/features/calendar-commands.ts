import type { Change } from "../../../shared/commands.ts";
import type { Data } from "../../../shared/model.ts";
import type {
  CalendarDay,
  PersonDay,
  WorkCalendar,
} from "../../../shared/actual-units.ts";
import {
  personDayKey,
  HOURS_PER_WORKDAY,
  workingHoursOnDate,
  personalDayEntries,
} from "../../../shared/actual-units.ts";
import {
  personDaySchema,
  PERSONAL_HOURS_STEP,
} from "../../../shared/calendar-rules.ts";
import { validPlanningDate } from "../../../shared/planning-dates.ts";
import type {
  SharedCalendarRange,
  PersonalCalendarRange,
} from "./work-calendar/calendar-ranges.ts";

export const CALENDAR_DAY_TYPES: { id: CalendarDay["type"]; label: string }[] =
  [
    { id: "official", label: "Resmî Tatil" },
    { id: "religious", label: "Bayram Tatili" },
    { id: "company", label: "Otokar Çalışma Dışı" },
  ];
export type CalendarDraft = { calendar: WorkCalendar; revision: number };

/** The revision belongs to the edited snapshot, even if background data refreshes. */
export function startCalendarDraft(data: Data): CalendarDraft {
  return {
    calendar: structuredClone(data.workCalendar || {}),
    revision: data.revisions["calendar:shared"] || 0,
  };
}

export function addCalendarDates(
  draft: CalendarDraft,
  input: {
    from: string;
    to: string;
    type: CalendarDay["type"];
    label: string;
    fraction: CalendarDay["fraction"];
  },
): CalendarDraft {
  const { from, type, fraction } = input;
  const end = input.to || from;
  if (!validPlanningDate(from) || !validPlanningDate(end))
    throw Error("Geçerli başlangıç ve bitiş tarihleri seçin.");
  if (end < from) throw Error("Bitiş tarihi başlangıçtan önce olamaz.");
  const first = new Date(from + "T12:00:00Z");
  const count =
    Math.round((Date.parse(end + "T12:00:00Z") - first.getTime()) / 86400000) +
    1;
  if (count > 62)
    throw Error("Bir seferde en fazla 62 günlük aralık ekleyebilirsiniz.");
  const name =
    input.label.trim() ||
    CALENDAR_DAY_TYPES.find((item) => item.id === type)!.label;
  if (name.length > 100)
    throw Error("Açıklama en fazla 100 karakter olabilir.");
  const calendar = { ...draft.calendar };
  for (let index = 0; index < count; index++) {
    const date = new Date(first);
    date.setUTCDate(date.getUTCDate() + index);
    calendar[date.toISOString().slice(0, 10)] = {
      type,
      label: name,
      fraction,
      range: { from, to: end },
    };
  }
  return { ...draft, calendar };
}

export function prepareCalendarChange(
  draft: CalendarDraft,
): Change<"calendar"> {
  return {
    kind: "calendar",
    id: "shared",
    value: structuredClone(draft.calendar),
    revision: draft.revision,
  };
}

export function removeCalendarRange(
  draft: CalendarDraft,
  range: SharedCalendarRange,
): CalendarDraft {
  const calendar = { ...draft.calendar };
  for (const key of range.keys) {
    const entry = calendar[key];
    if (
      !entry ||
      entry.type !== range.entry.type ||
      entry.label !== range.entry.label ||
      entry.fraction !== range.entry.fraction ||
      entry.range?.from !== range.entry.range?.from ||
      entry.range?.to !== range.entry.range?.to
    )
      throw Error("Çalışma dışı tarih kaydı değişti. Listeyi kontrol edin.");
    delete calendar[key];
  }
  return { ...draft, calendar };
}

export function editCalendarRange(
  draft: CalendarDraft,
  input: Parameters<typeof addCalendarDates>[1],
  original?: SharedCalendarRange,
): CalendarDraft {
  const base = original ? removeCalendarRange(draft, original) : draft;
  const added = addCalendarDates({ ...base, calendar: {} }, input);
  if (Object.keys(added.calendar).some((key) => base.calendar[key]))
    throw Error(
      "Seçilen aralık başka bir çalışma dışı tarih kaydıyla çakışıyor. Mevcut kaydı düzenleyin.",
    );
  return { ...base, calendar: { ...base.calendar, ...added.calendar } };
}

export function preparePersonalDayChange(
  data: Data,
  resourceId: string,
  input: {
    date: string;
    type: PersonDay["type"];
    hours: string;
    label: string;
  },
): Change<"personDay"> {
  if (!data.resources.some((resource) => resource.id === resourceId))
    throw Error(
      "Çalışan kaynak bulunamadı. Verileri yenileyip tekrar deneyin.",
    );
  if (!validPlanningDate(input.date))
    throw Error("İzin veya eğitim için geçerli tarih seçin.");
  const entry = personDaySchema.safeParse({
    type: input.type,
    hours: Number(input.hours.replace(",", ".")),
    label: input.label.trim(),
  });
  if (!entry.success)
    throw Error(
      `Saat ${PERSONAL_HOURS_STEP.toLocaleString("tr-TR")} ile ${HOURS_PER_WORKDAY} arasında, yarım saatlik adımlarla; açıklama en fazla 100 karakter girilmelidir.`,
    );
  const id = personDayKey(
    resourceId,
    input.date,
    input.type,
    data.personCalendar,
  );
  return {
    kind: "personDay",
    id,
    value: entry.data,
    revision: data.revisions["personDay:" + id] || 0,
  };
}

export type PersonalRangeInput = {
  from: string;
  to: string;
  type: PersonDay["type"];
  hours: string;
  label: string;
};

/** Return date is exclusive; the existing daily records keep reports and revisions compatible. */
export function preparePersonalRangeChanges(
  data: Data,
  resourceId: string,
  input: PersonalRangeInput,
): Change<"personDay">[] {
  if (!validPlanningDate(input.from) || !validPlanningDate(input.to))
    throw Error("Geçerli ayrılış ve dönüş tarihleri seçin.");
  if (input.to <= input.from)
    throw Error("Dönüş tarihi ayrılış tarihinden sonra olmalıdır.");
  const count =
    (Date.parse(input.to + "T12:00:00Z") -
      Date.parse(input.from + "T12:00:00Z")) /
    86400000;
  if (count > 366)
    throw Error("Bir seferde en fazla 366 günlük aralık girebilirsiniz.");
  // Validate employee, type, hours and label even when every date is non-working.
  const first = preparePersonalDayChange(data, resourceId, {
    ...input,
    date: input.from,
  });
  const changes: Change<"personDay">[] = [];
  const start = Date.parse(input.from + "T12:00:00Z");
  for (let index = 0; index < count; index++) {
    const date = new Date(start + index * 86400000).toISOString().slice(0, 10);
    const available = workingHoursOnDate(date, data.workCalendar);
    if (!available) continue;
    const hours = Math.min(first.value!.hours, available);
    const otherHours = personalDayEntries(resourceId, date, data.personCalendar)
      .filter((entry) => entry.type !== input.type)
      .reduce((sum, entry) => sum + entry.hours, 0);
    if (hours + otherHours > available)
      throw Error(
        `${date} tarihinde izin ve eğitim toplamı çalışılabilir ${available.toLocaleString("tr-TR")} saati aşamaz. Günlük saati veya tarih aralığını kontrol edin.`,
      );
    const change = preparePersonalDayChange(data, resourceId, {
      date,
      type: input.type,
      hours: String(hours),
      label: input.label,
    });
    change.value!.range = {
      from: input.from,
      to: input.to,
      hours: first.value!.hours,
    };
    changes.push(change);
  }
  if (!changes.length)
    throw Error(
      "Seçilen aralıkta çalışılabilir gün yok. Dönüş günü hesaba katılmaz.",
    );
  return changes;
}

export type PersonalRangeDraft = {
  resourceId: string;
  range: PersonalCalendarRange;
  revisions: Record<string, number>;
};

export function startPersonalRangeDraft(
  data: Data,
  resourceId: string,
  range: PersonalCalendarRange,
): PersonalRangeDraft {
  const removals = preparePersonalRangeRemoval(data, resourceId, range);
  return {
    resourceId,
    range: structuredClone(range),
    revisions: Object.fromEntries(
      removals.map((change) => [change.id, change.revision]),
    ),
  };
}

export function preparePersonalRangeRemoval(
  data: Data,
  resourceId: string,
  range: PersonalCalendarRange,
): Change<"personDay">[] {
  return range.keys.map((id) =>
    preparePersonalDayRemoval(data, resourceId, id),
  );
}

export function preparePersonalRangeSave(
  data: Data,
  resourceId: string,
  input: PersonalRangeInput,
  original?: PersonalRangeDraft,
): Change<"personDay">[] {
  if (original && original.resourceId !== resourceId)
    throw Error("Düzenlenen kaydın çalışanı değişti. Takvimi yeniden açın.");
  const oldKeys = new Set(original?.range.keys || []);
  const personalCalendar = { ...data.personCalendar };
  for (const key of oldKeys) delete personalCalendar[key];
  const added = preparePersonalRangeChanges(
    { ...data, personCalendar: personalCalendar },
    resourceId,
    input,
  );
  for (const change of added) {
    if (personalCalendar[change.id])
      throw Error(
        "Seçilen aralık başka bir izin/eğitim kaydıyla çakışıyor. Mevcut kaydı düzenleyin.",
      );
    if (oldKeys.has(change.id))
      change.revision = original!.revisions[change.id];
  }
  const newKeys = new Set(added.map((change) => change.id));
  const removed = [...oldKeys]
    .filter((id) => !newKeys.has(id))
    .map((id) => ({
      kind: "personDay" as const,
      id,
      operation: "delete" as const,
      value: null,
      revision: original!.revisions[id],
    }));
  return [...removed, ...added];
}

export function preparePersonalDayRemoval(
  data: Data,
  resourceId: string,
  id: string,
): Change<"personDay"> {
  if (!id.startsWith(resourceId + "|") || !data.personCalendar?.[id])
    throw Error(
      "İzin veya eğitim kaydı bulunamadı. Verileri yenileyip tekrar deneyin.",
    );
  return {
    kind: "personDay",
    id,
    value: null,
    revision: data.revisions["personDay:" + id] || 0,
    operation: "delete",
  };
}
