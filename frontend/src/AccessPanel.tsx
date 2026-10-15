import { employeeAssignment } from "../../shared/employee-directory";
import { currentPlanningMonth } from "../../shared/resource-dates";
import AuditLogDialog from "./AuditLogDialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { AccessControls } from "./features/access/access-controls";
import type { Data } from "./model";
import type { Account } from "./access";
import { ROOT_ADMIN_ID } from "./access";
import { saveUser, revokeUser } from "./storage";
import { useDirectoryUsers } from "./features/useDirectoryUsers";
import AccessPermissionFields from "./features/access/AccessPermissionFields";
import type { PermissionForm } from "./features/access/employee-access-draft";
export default function AccessPanel({
  data,
  onSaved,
  onEditingChange,
  children,
}: {
  data: Data;
  onSaved: (d: Data) => void;
  onEditingChange?: (editing: boolean) => void;
  children: (controls: AccessControls) => ReactNode;
}) {
  const [form, setForm] = useState<PermissionForm | null>(null),
    [leaderQuery, setLeaderQuery] = useState(""),
    [directoryQuery, setDirectoryQuery] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const [showAudit, setShowAudit] = useState(false);
  const returnFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    onEditingChange?.(!!form || busy);
    return () => onEditingChange?.(false);
  }, [!!form, busy, onEditingChange]);
  const selected = data.users?.find((user) => user.id === form?.id);
  const directory = useDirectoryUsers(false);
  function chooseEmployee(resourceId: string) {
    if (!form) return;
    const assignment = employeeAssignment(
      data,
      resourceId,
      currentPlanningMonth(),
    );
    setLeaderQuery("");
    setForm({
      ...form,
      resourceId,
      leaders: assignment?.team.lead ? [assignment.team.lead] : [],
    });
  }
  function edit(user: Account) {
    if (user.id === ROOT_ADMIN_ID) return;
    returnFocus.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setError("");
    setNotice("");
    setLeaderQuery("");
    setForm({
      id: user.id,
      role: user.role,
      leaders: [...user.leaders],
      planningTeams: [...(user.planningTeams || [])],
      resourceId: user.resourceId || "",
      revision: data.revisions["user:" + user.id] || 0,
    });
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!form || !selected || busy) return;
    setError("");
    setBusy(true);
    try {
      const updated = await saveUser({
        id: form.id,
        role: form.role,
        leaders: form.leaders,
        planningTeams: form.planningTeams || [],
        resourceId: form.resourceId,
        revision: form.revision,
        ...(!selected.active ? { reactivate: true } : {}),
      });
      onSaved(updated);
      setForm(null);
      setNotice("Yetkiler kaydedildi. Kullanıcının açık oturumları yenilendi.");
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function removePermission(user: Account) {
    if (busy || user.id === ROOT_ADMIN_ID || !user.active) return;
    if (
      !window.confirm(
        `${user.name} için uygulama yetkisi kaldırılacak ve açık oturumlar kapatılacak. Çalışan ve geçmiş kayıtları korunacak. Onaylıyor musunuz?`,
      )
    )
      return;
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const updated = await revokeUser({
        id: user.id,
        revision: data.revisions["user:" + user.id] || 0,
      });
      onSaved(updated);
      setForm(null);
      setNotice("Uygulama yetkisi kaldırıldı. Açık oturumlar kapatıldı.");
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const permissionForm = form && selected && (
    <form className="access-permission-form" onSubmit={submit}>
      <div className="access-form-heading">
        <DialogHeader>
          <span>YETKİ DÜZENLEME</span>
          <DialogTitle>{selected.name}</DialogTitle>
          <DialogDescription>{selected.username}</DialogDescription>
        </DialogHeader>
        <span className="access-role-badge">
          {selected.active ? "Aktif" : "Yetki Kaldırıldı"}
        </span>
      </div>
      <AccessPermissionFields
        data={data}
        form={form}
        setForm={setForm}
        selected={selected}
        busy={busy}
        directory={directory}
        leaderQuery={leaderQuery}
        setLeaderQuery={setLeaderQuery}
        directoryQuery={directoryQuery}
        setDirectoryQuery={setDirectoryQuery}
        chooseEmployee={chooseEmployee}
      />
      {error && (
        <p className="negative" role="alert">
          {error}
        </p>
      )}
      <div className="access-form-actions">
        <button className="button primary" disabled={busy}>
          {busy
            ? "Kaydediliyor…"
            : !selected.active
              ? "Yeniden Yetki Ver"
              : "Kaydet"}
        </button>
        {selected.active && selected.id !== ROOT_ADMIN_ID && (
          <button
            type="button"
            className="button access-revoke-button"
            disabled={busy}
            onClick={() => void removePermission(selected)}
          >
            Uygulama Yetkisini Kaldır
          </button>
        )}
        <button
          type="button"
          className="button"
          disabled={busy}
          onClick={() => setForm(null)}
        >
          Vazgeç
        </button>
      </div>
    </form>
  );
  return (
    <>
      {children({
        busy,
        selectedId: form?.id,
        onEdit: edit,
        onAudit: () => setShowAudit(true),
        notice,
        error: form ? "" : error,
      })}
      <Dialog
        open={!!form && !!selected}
        onOpenChange={(open) => {
          if (!open && !busy) setForm(null);
        }}
      >
        <DialogContent
          className="access-permission-dialog"
          showCloseButton={!busy}
          onEscapeKeyDown={(event) => {
            if (busy) event.preventDefault();
          }}
          onPointerDownOutside={(event) => {
            if (busy) event.preventDefault();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (returnFocus.current?.isConnected) returnFocus.current.focus();
          }}
        >
          {permissionForm}
        </DialogContent>
      </Dialog>
      <AuditLogDialog open={showAudit} onOpenChange={setShowAudit} />
    </>
  );
}
