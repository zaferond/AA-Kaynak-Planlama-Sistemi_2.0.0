import { useEffect, useRef, useState } from "react";
import { isUncertainWrite } from "../storage";
import type { Resource } from "../../../shared/model.ts";
import type { ActualUnit } from "../../../shared/actual-units.ts";
import {
  checkActualEntry,
  parseWorkedHoursInput,
  formatActualEntry as formatEntry,
} from "./actual-allocation-commands";

const unitLabels: Record<ActualUnit, string> = {
  percent: "%",
  days: "gün",
  hours: "saat",
};
export function WorkedHours({
  value,
  calculatedHours,
  maxHours,
  resource,
  month,
  disabled,
  onSave,
}: {
  value?: number;
  calculatedHours: number;
  maxHours: number;
  resource: Resource;
  month: string;
  disabled: boolean;
  onSave: (
    hours: number | null,
    input: HTMLInputElement | null,
  ) => Promise<boolean>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(
    String(value ?? calculatedHours).replace(".", ","),
  );
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const draftSave = useRef<typeof onSave | null>(null);
  const context = useRef(resource.id + "|" + month);
  const unknown = useRef(false);
  const explicitRetry = useRef(false);
  useEffect(() => {
    const nextContext = resource.id + "|" + month;
    if (context.current !== nextContext) {
      context.current = nextContext;
      draftSave.current = null;
      unknown.current = false;
    }
    if (draftSave.current) return;
    setText(String(value ?? calculatedHours).replace(".", ","));
    setDirty(false);
    setError("");
  }, [value, calculatedHours, resource.id, month, busy]);
  async function commit() {
    const explicit = explicitRetry.current;
    explicitRetry.current = false;
    if (disabled || busy || !dirty || (unknown.current && !explicit)) return;
    setBusy(true);
    try {
      const hours = parseWorkedHoursInput(text, maxHours);
      const saved = await (draftSave.current || onSave)(
        hours,
        inputRef.current,
      );
      draftSave.current = null;
      unknown.current = false;
      if (!saved) setText(String(value ?? calculatedHours).replace(".", ","));
      setDirty(false);
      setError("");
    } catch (cause) {
      unknown.current = isUncertainWrite(cause);
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <span className="worked-hours-input">
      <input
        ref={inputRef}
        aria-label={resource.name + " / " + month + " çalışılan saat"}
        inputMode="decimal"
        value={text}
        disabled={disabled || busy}
        placeholder={String(calculatedHours)}
        title={
          "Otomatik hesap: " +
          calculatedHours +
          " saat. Alanı boşaltırsanız otomatik hesap kullanılır."
        }
        onFocus={(event) => event.currentTarget.select()}
        onChange={(event) => {
          draftSave.current ??= onSave;
          setText(event.target.value);
          setDirty(true);
          setError("");
        }}
        onBlur={() => void commit()}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            event.stopPropagation();
          }
        }}
        onKeyUp={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            event.stopPropagation();
            explicitRetry.current = true;
            event.currentTarget.blur();
          }
        }}
      />
      {error && <small role="alert">{error}</small>}
    </span>
  );
}

export function ActualAmount({
  value,
  disabled,
  onSave,
  label,
  month,
  unit,
  workedHours,
  savedPercent,
  otherAllocated,
  fullyAllocated,
  onLimitExceeded,
  onDeselect,
}: {
  value: number;
  disabled: boolean;
  onSave: (entry: { unit: ActualUnit; value: number }) => Promise<void>;
  label: string;
  month: string;
  unit: ActualUnit;
  workedHours?: number;
  savedPercent?: number;
  otherAllocated: number;
  fullyAllocated: boolean;
  onLimitExceeded: (input: HTMLInputElement | null) => void;
  onDeselect: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(() =>
    formatEntry(value, unit, month, workedHours, savedPercent),
  );
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const draftSave = useRef<typeof onSave | null>(null);
  const context = useRef(label + "|" + month + "|" + unit);
  const unknown = useRef(false);
  const explicitRetry = useRef(false);
  useEffect(() => {
    const nextContext = label + "|" + month + "|" + unit;
    if (context.current !== nextContext) {
      context.current = nextContext;
      draftSave.current = null;
      unknown.current = false;
    }
    if (draftSave.current) return;
    setText(formatEntry(value, unit, month, workedHours, savedPercent));
    setDirty(false);
    setError("");
  }, [value, unit, month, workedHours, savedPercent, busy]);
  function showLimitWarning() {
    draftSave.current = null;
    unknown.current = false;
    setText(formatEntry(value, unit, month, workedHours, savedPercent));
    setDirty(false);
    setError("");
    onLimitExceeded(inputRef.current);
  }
  async function commit() {
    const explicit = explicitRetry.current;
    explicitRetry.current = false;
    if (disabled || busy || !dirty || (unknown.current && !explicit)) return;
    const checked = checkActualEntry(
      text,
      unit,
      month,
      workedHours,
      otherAllocated,
    );
    if (checked.kind === "invalid") {
      setError(checked.message);
      return;
    }
    if (checked.kind === "limit") {
      showLimitWarning();
      return;
    }
    setBusy(true);
    try {
      await (draftSave.current || onSave)(checked.entry);
      draftSave.current = null;
      unknown.current = false;
      setDirty(false);
      setError("");
    } catch (cause) {
      unknown.current = isUncertainWrite(cause);
      const message = (cause as Error).message;
      if (message.includes("%100")) showLimitWarning();
      else setError(message);
    } finally {
      setBusy(false);
    }
  }
  if (fullyAllocated && !disabled && value === 0 && !draftSave.current)
    return (
      <div
        className="actual-fully-allocated"
        role="status"
        title={
          label + " · kişinin aylık kaynağının tamamı diğer projelere dağıtıldı"
        }
        aria-label="Tüm kaynak dağıtıldı"
      >
        ✓ Dolu
      </div>
    );
  return (
    <div
      className="person-amount"
      data-window-keep={busy || dirty || !!error ? "true" : undefined}
    >
      <input
        ref={inputRef}
        aria-label={label + " / " + unitLabels[unit]}
        title={error || label + " / " + unitLabels[unit]}
        inputMode="decimal"
        value={unit === "percent" && text ? "%" + text : text}
        disabled={disabled || busy}
        placeholder={unit === "percent" ? "%" : "0"}
        onFocus={(event) => event.currentTarget.select()}
        onChange={(event) => {
          draftSave.current ??= onSave;
          setText(
            unit === "percent"
              ? event.target.value.replaceAll("%", "")
              : event.target.value,
          );
          setDirty(true);
          setError("");
        }}
        onBlur={() => void commit()}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            event.stopPropagation();
          }
        }}
        onKeyUp={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            event.stopPropagation();
            explicitRetry.current = true;
            event.currentTarget.blur();
            onDeselect();
          }
        }}
      />
      {error && <small role="alert">{error}</small>}
    </div>
  );
}
