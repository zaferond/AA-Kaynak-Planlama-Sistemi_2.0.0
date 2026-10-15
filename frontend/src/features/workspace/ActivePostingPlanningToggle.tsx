import { useRef, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { activePostingVersion } from "../../../../shared/active-posting-planning";
import { currentPlanningDate } from "../../../../shared/resource-dates";
import type { Change } from "../../../../shared/commands";
import type { Data } from "../../model";
import { activePostingPlanningChanges } from "./active-posting-changes";

type Props = {
  data: Data;
  canEdit: boolean;
  saving: boolean;
  onSave: (changes: Change[]) => Promise<void>;
  onError: (message: string) => void;
};

export default function ActivePostingPlanningToggle({
  data,
  canEdit,
  saving,
  onSave,
  onError,
}: Props) {
  const pendingRef = useRef(false);
  const [pending, setPending] = useState(false);
  const postings = data.resources.flatMap((resource) => {
    const version = activePostingVersion(resource);
    return version ? [version] : [];
  });
  const includedCount = postings.filter((v) => v.included && !!v.start).length;
  const checked = postings.length > 0 && includedCount === postings.length;

  async function toggle(included: boolean) {
    if (!canEdit || saving || pendingRef.current || !postings.length) return;
    pendingRef.current = true;
    setPending(true);
    try {
      const changes = activePostingPlanningChanges(
        data,
        included,
        currentPlanningDate(),
      );
      if (changes.length) await onSave(changes);
    } catch (error) {
      onError((error as Error).message);
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  return (
    <div
      className="workspace-view-options report-posting-options"
      role="group"
      aria-label="Aktif ilan planlama seçeneği"
      aria-busy={pending || saving}
    >
      <label>
        <Switch
          size="sm"
          checked={checked}
          disabled={!canEdit || saving || pending || !postings.length}
          onCheckedChange={(value) => void toggle(value)}
          aria-label="Aktif İlanları Dahil Et"
        />
        Aktif İlanları Dahil Et
      </label>
      {(pending || !canEdit || !postings.length) && (
        <small>
          {pending
            ? "Kaydediliyor…"
            : !canEdit
              ? "Bu ayarı yalnızca admin değiştirebilir."
              : "Aktif ilan bulunmuyor."}
        </small>
      )}
    </div>
  );
}
