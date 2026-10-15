import { useState, type RefObject } from "react";
import type { ChangeKind, ChangeValues } from "../../../shared/commands";
import type { Data } from "../model";
import {
  currentUser,
  readLocal,
  StaleSessionError,
  writeBatch,
  writeEmployeeRecord,
  writeLocal,
  type Change,
} from "../storage";

// Snapshot transport and mutation state. Editor revisions remain in editor drafts.
export function usePortalData(assertSessionRef: RefObject<() => void>) {
  const [user, setUser] = useState(currentUser);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  async function reload(onUnauthenticated: () => void) {
    try {
      assertSessionRef.current();
      const next = await readLocal();
      assertSessionRef.current();
      setData(next);
      setUser(currentUser());
      setError("");
    } catch (e) {
      if (e instanceof StaleSessionError) return;
      // Transient reads preserve authenticated snapshots and all open drafts.
      if (currentUser()) {
        setError((e as Error).message);
        return;
      }
      setData(null);
      setUser(currentUser());
      onUnauthenticated();
      setError((e as Error).message);
    }
  }
  async function save<K extends ChangeKind>(
    kind: K,
    id: string,
    value: ChangeValues[K] | null,
  ) {
    assertSessionRef.current();
    if (!data) throw Error("Veriler yüklenmedi");
    setData(
      await writeLocal(kind, id, value, data.revisions[kind + ":" + id] || 0),
    );
    setNotice("Veritabanına kaydedildi");
  }
  async function batch(changes: Change[]) {
    assertSessionRef.current();
    setSaving(true);
    try {
      setData(await writeBatch(changes));
      setNotice(changes.length + " kayıt birlikte kaydedildi");
      setError("");
    } finally {
      setSaving(false);
    }
  }
  async function saveEmployee(
    changes: Change[],
    permission: import("../../../shared/employee-account").EmployeePermission,
  ) {
    assertSessionRef.current();
    setSaving(true);
    try {
      setData(await writeEmployeeRecord(changes, permission));
      setNotice("Çalışan bilgileri ve yetkileri birlikte kaydedildi.");
      setError("");
    } finally {
      setSaving(false);
    }
  }
  function change<K extends ChangeKind>(
    kind: K,
    id: string,
    value: ChangeValues[K] | null,
  ): Change<K> {
    return { kind, id, value, revision: data?.revisions[kind + ":" + id] || 0 };
  }
  return {
    data,
    setData,
    user,
    setUser,
    error,
    setError,
    notice,
    setNotice,
    saving,
    setSaving,
    reload,
    save,
    batch,
    saveEmployee,
    change,
  };
}
