import type { ChangeEvent, Dispatch, SetStateAction } from "react";
import { exportBackup, resetAllocations, restoreBackup } from "../../storage";
import type { usePortalData } from "../usePortalData";
type Props = Pick<
  ReturnType<typeof usePortalData>,
  | "data"
  | "saving"
  | "setSaving"
  | "setData"
  | "setError"
  | "setNotice"
  | "batch"
  | "change"
> & {
  isAdmin: boolean;
  setCells: Dispatch<SetStateAction<string[]>>;
  setResourceIds: Dispatch<SetStateAction<string[]>>;
  flushRiskDraft: () => Promise<boolean>;
  assertSession: () => void;
  load: () => Promise<void>;
};
/** Coordinate confirmed data actions through the existing session/batch transport. */
export function createWorkspaceDataActions({
  data,
  saving,
  setSaving,
  setData,
  setError,
  setNotice,
  batch,
  change,
  isAdmin,
  setCells,
  setResourceIds,
  flushRiskDraft,
  assertSession,
  load,
}: Props) {
  async function resetAll() {
    if (!data || !isAdmin || saving) return;
    const n = Object.values(data.allocations).filter((v) => v !== 0).length;
    if (!n) {
      setNotice("Sıfırlanacak kaynak dağılımı yok.");
      return;
    }
    if (
      !confirm(
        "Tüm liderliklerdeki, tüm projelerdeki ve tüm aylardaki " +
          n +
          " dağıtım hücresi sıfırlanacak.\n\nEkrandaki filtreler ve görünür dönem bu işlemi sınırlamaz. Çalışan kayıtları, kapasite bilgileri ve proje planları korunur.\n\nGeri almak için işlem öncesi veri yedeği gerekir. Tüm dağılımlar sıfırlansın mı?",
      )
    )
      return;
    setSaving(true);
    try {
      setData(await resetAllocations(data));
      setCells([]);
      setError("");
      setNotice("Tüm dönemlerdeki kaynak dağılımları sıfırlandı.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  async function deleteResources(selected: string[]) {
    if (!data || saving || !selected.length) return;
    const unique = [...new Set(selected)];
    const names = unique.map(
      (id) =>
        data.resources.find((r) => r.id === id)?.name || "Bulunamayan kayıt",
    );
    const message =
      unique.length === 1
        ? "“" + names[0] + "” kaydı silinsin mi?"
        : unique.length +
          " seçili kayıt silinsin mi?\n\n" +
          names.slice(0, 8).join("\n") +
          (names.length > 8
            ? "\n… ve " + (names.length - 8) + " kayıt daha"
            : "");
    if (
      !confirm(
        message +
          "\n\nKayıtlar ve bu kişilere ait gerçekleşen dağılımlar silinir; aylık kaynaklar yeniden hesaplanır. Takımların planlanan proje tahsisleri korunur. Geri almak için silme öncesi yedeği yüklemeniz gerekir.",
      )
    )
      return;
    try {
      await batch(
        unique.map((id) => ({
          ...change("resource", id, null),
          operation: "delete" as const,
        })),
      );
      setResourceIds((old) => old.filter((id) => !unique.includes(id)));
      setNotice(
        unique.length + " kaynak kaydı silindi; kapasiteler güncellendi.",
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function downloadBackup() {
    if (!(await flushRiskDraft())) return;
    try {
      assertSession();
      await exportBackup();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function restoreBackupFile(e: ChangeEvent<HTMLInputElement>) {
    const input = e.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    try {
      if (!(await flushRiskDraft())) return;
      assertSession();
      if (
        !confirm(
          "Sunucudaki mevcut planlama verileri yedekteki verilerle değiştirilecek. Devam edilsin mi?",
        )
      )
        return;
      await restoreBackup(file);
      await load();
      setNotice("Yedek yüklendi");
      setCells([]);
      setResourceIds([]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      input.value = "";
    }
  }
  return { resetAll, deleteResources, downloadBackup, restoreBackupFile };
}
