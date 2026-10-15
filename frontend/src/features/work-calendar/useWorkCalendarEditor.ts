import { useEffect, useMemo, useState } from "react";
import type { WorkCalendar } from "../../actual-units";
import { HOURS_PER_WORKDAY } from "../../actual-units";
import { writeBatch } from "../../storage";
import {
  editCalendarRange,
  removeCalendarRange,
  prepareCalendarChange,
  preparePersonalRangeSave,
  preparePersonalRangeRemoval,
  startPersonalRangeDraft,
  startCalendarDraft,
  type CalendarDraft,
  type PersonalRangeDraft,
} from "../calendar-commands";
import type {
  SharedCalendarRange,
  PersonalCalendarRange,
} from "./calendar-ranges";
import type {
  WorkCalendarDialogProps,
  SharedCalendarForm,
  PersonalCalendarForm,
} from "./types";

const emptyCalendar: WorkCalendar = {};

export function useWorkCalendarEditor({
  open,
  onOpenChange,
  data,
  mode,
  resource,
  canEdit,
  canEditPersonal,
  onSaved,
  initialYear,
  initialPersonalRange,
}: WorkCalendarDialogProps) {
  const [year, setYear] = useState(initialYear);
  const [calendarDraft, setCalendarDraft] = useState<CalendarDraft | null>(
    null,
  );
  const draft =
    mode === "personal"
      ? data.workCalendar || emptyCalendar
      : calendarDraft?.calendar || emptyCalendar;
  const [sharedForm, setSharedForm] = useState<SharedCalendarForm>({
    from: "",
    to: "",
    type: "official",
    label: "",
    fraction: 1,
  });
  const [personalForm, setPersonalForm] = useState<PersonalCalendarForm>({
    from: "",
    to: "",
    type: "leave",
    hours: String(HOURS_PER_WORKDAY),
    label: "",
  });
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editingShared, setEditingShared] =
    useState<SharedCalendarRange | null>(null);
  const [editingPersonal, setEditingPersonal] =
    useState<PersonalRangeDraft | null>(null);
  // Opening values/revision stay paired; a refreshed snapshot cannot rebase a shared draft.
  useEffect(() => {
    if (open) {
      setCalendarDraft(startCalendarDraft(data));
      setYear(initialYear);
      setDirty(false);
      setError("");
      setEditingShared(null);
      setEditingPersonal(null);
      setSharedForm((previous) => ({ ...previous, from: "", to: "" }));
      setPersonalForm((previous) => ({
        ...previous,
        from: "",
        to: "",
        hours: String(HOURS_PER_WORKDAY),
        label: "",
      }));
      if (
        mode === "personal" &&
        resource &&
        initialPersonalRange &&
        canEditPersonal
      ) {
        try {
          setEditingPersonal(
            startPersonalRangeDraft(data, resource.id, initialPersonalRange),
          );
          setPersonalForm({
            from: initialPersonalRange.from,
            to: initialPersonalRange.to,
            type: initialPersonalRange.entry.type,
            hours: String(initialPersonalRange.hours),
            label: initialPersonalRange.entry.label,
          });
        } catch (cause) {
          setError((cause as Error).message);
        }
      }
    }
  }, [open, initialYear, resource?.id, mode, initialPersonalRange]);
  function updateShared<K extends keyof SharedCalendarForm>(
    key: K,
    value: SharedCalendarForm[K],
  ) {
    setSharedForm((previous) => ({ ...previous, [key]: value }));
  }
  function updatePersonal<K extends keyof PersonalCalendarForm>(
    key: K,
    value: PersonalCalendarForm[K],
  ) {
    setPersonalForm((previous) => ({ ...previous, [key]: value }));
  }
  const personalPreview = useMemo(() => {
    if (!resource || !personalForm.from || !personalForm.to) return null;
    try {
      const changes = preparePersonalRangeSave(
        data,
        resource.id,
        personalForm,
        editingPersonal || undefined,
      ).filter((change) => change.operation !== "delete");
      return {
        days: changes.length,
        hours: changes.reduce((sum, change) => sum + change.value!.hours, 0),
        error: "",
      };
    } catch (cause) {
      return { days: 0, hours: 0, error: (cause as Error).message };
    }
  }, [data, resource?.id, personalForm, editingPersonal]);
  function cancelSharedEdit() {
    if (busy) return;
    setEditingShared(null);
    setSharedForm((previous) => ({ ...previous, from: "", to: "", label: "" }));
    setError("");
  }
  function editShared(range: SharedCalendarRange) {
    if (!canEdit || busy) return;
    setEditingShared(structuredClone(range));
    setSharedForm({
      from: range.from,
      to: range.to,
      type: range.entry.type,
      fraction: range.entry.fraction,
      label: range.entry.label,
    });
    setError("");
  }
  function cancelPersonalEdit() {
    if (busy) return;
    setEditingPersonal(null);
    setPersonalForm((previous) => ({
      ...previous,
      from: "",
      to: "",
      label: "",
    }));
    setError("");
  }
  function editPersonal(range: PersonalCalendarRange) {
    if (!canEditPersonal || !resource || busy) return;
    try {
      setEditingPersonal(startPersonalRangeDraft(data, resource.id, range));
      setPersonalForm({
        from: range.from,
        to: range.to,
        type: range.entry.type,
        hours: String(range.hours),
        label: range.entry.label,
      });
      setError("");
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  function setPersonalStart(from: string) {
    setPersonalForm((previous) => {
      const date = new Date(from + "T12:00:00Z");
      const next = Number.isNaN(date.getTime())
        ? ""
        : new Date(date.getTime() + 86400000).toISOString().slice(0, 10);
      return {
        ...previous,
        from,
        to: next,
      };
    });
  }
  function setSharedStart(from: string) {
    setSharedForm((previous) => ({
      ...previous,
      from,
      to: from,
    }));
  }
  function addDates() {
    setError("");
    if (!calendarDraft || !canEdit || busy) return;
    try {
      setCalendarDraft(
        editCalendarRange(
          calendarDraft,
          sharedForm,
          editingShared || undefined,
        ),
      );
      setEditingShared(null);
      setDirty(true);
      setYear(Number(sharedForm.from.slice(0, 4)));
      setSharedForm((previous) => ({
        ...previous,
        label: "",
        from: "",
        to: "",
      }));
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  function removeDate(range: SharedCalendarRange) {
    if (!calendarDraft || !canEdit || busy) return;
    try {
      setCalendarDraft(removeCalendarRange(calendarDraft, range));
      if (editingShared?.keys[0] === range.keys[0]) cancelSharedEdit();
      setDirty(true);
      setError("");
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  async function save() {
    if (!canEdit || busy || !dirty || !calendarDraft || editingShared) return;
    setBusy(true);
    setError("");
    try {
      const next = await writeBatch([prepareCalendarChange(calendarDraft)]);
      onSaved(next);
      onOpenChange(false);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function savePersonal() {
    if (!resource || !canEditPersonal || busy) return;
    setBusy(true);
    setError("");
    try {
      const next = await writeBatch(
        preparePersonalRangeSave(
          data,
          resource.id,
          personalForm,
          editingPersonal || undefined,
        ),
      );
      onSaved(next);
      setEditingPersonal(null);
      setYear(Number(personalForm.from.slice(0, 4)));
      setPersonalForm((previous) => ({
        ...previous,
        from: "",
        to: "",
        label: "",
      }));
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function removePersonal(range: PersonalCalendarRange) {
    if (!resource || !canEditPersonal || busy) return;
    setBusy(true);
    setError("");
    try {
      const next = await writeBatch(
        preparePersonalRangeRemoval(data, resource.id, range),
      );
      onSaved(next);
      if (editingPersonal?.range.keys[0] === range.keys[0]) {
        setEditingPersonal(null);
        setPersonalForm((previous) => ({
          ...previous,
          from: "",
          to: "",
          label: "",
        }));
      }
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function requestOpenChange(value: boolean) {
    if (!busy) onOpenChange(value);
  }
  return {
    year,
    setYear,
    draft,
    sharedForm,
    personalForm,
    dirty,
    busy,
    error,
    updateShared,
    updatePersonal,
    editingShared,
    editingPersonal,
    editShared,
    editPersonal,
    cancelSharedEdit,
    cancelPersonalEdit,
    setPersonalStart,
    personalPreview,
    setSharedStart,
    addDates,
    removeDate,
    save,
    savePersonal,
    removePersonal,
    requestOpenChange,
  };
}
export type WorkCalendarEditor = ReturnType<typeof useWorkCalendarEditor>;
