import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Risk } from "../../model";
import { ApiError, isUncertainWrite } from "../../storage";
import { riskValidationError } from "../../risk-validation";
import { riskFocusField } from "./columns";
import type { RiskDraftOptions } from "./types";

// Captures opening values/revision; refreshed snapshots never rebase a live draft.
export function useRiskDraft(
  {
    leaveGuardRef,
    revisions,
    onEditingChange,
    onReload,
    createSignal,
    createRisk,
    canDelete,
    onSave,
    onDelete,
  }: RiskDraftOptions,
  revealNewRow: () => void,
) {
  const [draft, setDraft] = useState<Risk | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [focusField, setFocusField] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  // Capture value and revision together. Refreshed props must never rebase a draft.
  const editBase = useRef<{ value: Risk | null; revision: number } | null>(
    null,
  );
  const editingActive = !!draft;
  useLayoutEffect(() => {
    onEditingChange(editingActive);
    return () => onEditingChange(false);
  }, [editingActive, onEditingChange]);
  const saveInFlight = useRef<Promise<boolean> | null>(null);
  useEffect(() => {
    if (!createSignal) return;
    if (isNew) {
      revealNewRow();
      return;
    }
    let active = true;
    void (async () => {
      if (draft && !(await save())) return;
      if (!active) return;
      setError("");
      setConflict(false);
      setFocusField("description");
      setIsNew(true);
      editBase.current = { value: null, revision: 0 };
      setDraft(createRisk());
      revealNewRow();
    })();
    return () => {
      active = false;
    };
  }, [createSignal]);
  const update = <K extends keyof Risk>(key: K, value: Risk[K]) => {
    if (saving || saveInFlight.current) return;
    setDraft((old) => (old ? { ...old, [key]: value } : old));
  };
  async function activate(risk: Risk, key: string) {
    if (saving || draft?.id === risk.id) return;
    // Take both from this render, before awaiting another row's save.
    const base = {
      value: structuredClone(risk),
      revision: revisions["risk:" + risk.id] || 0,
    };
    if (draft && !(await save())) return;
    setError("");
    setConflict(false);
    setIsNew(false);
    setFocusField(riskFocusField(key));
    editBase.current = base;
    setDraft(structuredClone(base.value));
  }
  function save(): Promise<boolean> {
    if (saveInFlight.current) return saveInFlight.current;
    if (!draft || saving || conflict || uncertain || !editBase.current)
      return Promise.resolve(false);
    const validationError = riskValidationError(draft);
    if (validationError) {
      setError(validationError);
      return Promise.resolve(false);
    }
    const original = editBase.current.value;
    if (
      !isNew &&
      original &&
      JSON.stringify(original) === JSON.stringify(draft)
    ) {
      clearDraft();
      setError("");
      return Promise.resolve(true);
    }
    if (
      !confirm("Yaptığınız Değişiklikler Kaydedilecektir. Onaylıyor musunuz ?")
    ) {
      // Mouse-down and focus may both request the same tab change. Keep the
      // declined result for this event turn so cancellation cannot prompt twice.
      const declined = Promise.resolve(false);
      saveInFlight.current = declined;
      setTimeout(() => {
        if (saveInFlight.current === declined) saveInFlight.current = null;
      }, 0);
      return declined;
    }
    setSaving(true);
    setError("");
    const revision = editBase.current.revision;
    const pending = (async () => {
      try {
        await onSave(draft, revision);
        clearDraft();
        return true;
      } catch (caught) {
        setError((caught as Error).message);
        setConflict(caught instanceof ApiError && caught.status === 409);
        setUncertain(isUncertainWrite(caught));
        return false;
      } finally {
        saveInFlight.current = null;
        setSaving(false);
      }
    })();
    saveInFlight.current = pending;
    return pending;
  }
  useEffect(() => {
    leaveGuardRef.current = () =>
      saveInFlight.current || (draft ? save() : Promise.resolve(true));
    return () => {
      leaveGuardRef.current = null;
    };
  }, [draft, saving, conflict, uncertain, onSave, isNew, leaveGuardRef]);
  function clearDraft() {
    editBase.current = null;
    setDraft(null);
    setIsNew(false);
    setConflict(false);
    setUncertain(false);
  }
  function cancel() {
    if (saving) return;
    clearDraft();
    setError("");
  }
  async function reload() {
    if (
      !draft ||
      saving ||
      !confirm(
        "Kaydedilmemiş düzenlemeleriniz kaldırılacak ve güncel risk kaydı yüklenecek. Devam edilsin mi?",
      )
    )
      return;
    const id = draft.id;
    setSaving(true);
    try {
      const latest = await onReload();
      const risk = latest.risks?.find((risk) => risk.id === id);
      if (!risk) {
        clearDraft();
        setError("Risk kaydı silinmiş veya artık erişilemiyor.");
      } else {
        editBase.current = {
          value: structuredClone(risk),
          revision: latest.revisions["risk:" + id] || 0,
        };
        setDraft(structuredClone(risk));
        setIsNew(false);
        setConflict(false);
        setUncertain(false);
        setError("");
      }
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setSaving(false);
    }
  }
  async function remove() {
    if (
      !draft ||
      !canDelete ||
      saving ||
      conflict ||
      uncertain ||
      !editBase.current ||
      !confirm(
        "“" + draft.description.slice(0, 90) + "” risk kaydı silinsin mi?",
      )
    )
      return;
    setSaving(true);
    setError("");
    try {
      await onDelete(draft, editBase.current.revision);
      clearDraft();
    } catch (caught) {
      setError((caught as Error).message);
      setConflict(caught instanceof ApiError && caught.status === 409);
      setUncertain(isUncertainWrite(caught));
    } finally {
      setSaving(false);
    }
  }

  async function inspectOutcome() {
    if (!draft || saving || !editBase.current) return;
    setSaving(true);
    try {
      const latest = await onReload();
      // Do not rebase or replace the draft, even if the desired text now exists.
      // A snapshot is not an operation receipt; unchanged revision only permits
      // an explicit CAS retry, not an automatic resend or proof of cancellation.
      const changed =
        (latest.revisions["risk:" + draft.id] || 0) !==
        editBase.current.revision;
      setConflict(changed);
      setUncertain(false);
      setError(
        changed
          ? "Sunucudaki kayıt sürümü değişmiş. Düzenlemeleriniz korunuyor; güncel kaydı yüklemeden yeniden kaydedilemez."
          : "Sunucuda açılış sürümü görülüyor. İşlem daha sonra tamamlanabilir; otomatik tekrar kayıt yapılmadı. Taslağınızı aynı revizyonla tekrar onaylayabilirsiniz.",
      );
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return {
    draft,
    isNew,
    focusField,
    saving,
    error,
    conflict,
    uncertain,
    inspectOutcome,
    setError,
    update,
    activate,
    save,
    cancel,
    reload,
    remove,
  };
}
