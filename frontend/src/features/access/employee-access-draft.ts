import type { Data } from "../../model";
import type { UserInput } from "../../storage";
import type { DirectoryUser } from "../../../../shared/directory-identity";
import type { EmployeePermission } from "../../../../shared/employee-account";
export type PermissionForm = UserInput & { directoryUser?: DirectoryUser };
export type EmployeeAccessDraft = {
  form: PermissionForm | null;
  changed: boolean;
  revoke?: boolean;
};
export function accountForm(data: Data, id: string): PermissionForm | null {
  const user = data.users?.find((u) => u.id === id);
  return user
    ? {
        id: user.id,
        role: user.role,
        leaders: [...user.leaders],
        planningTeams: [...(user.planningTeams || [])],
        resourceId: user.resourceId || "",
        revision: data.revisions["user:" + user.id] || 0,
      }
    : null;
}
/** AD is the identity source. Keep the manual draft untouched when switching modes. */
export function directoryEmployeeName(
  data: Pick<Data, "users"> | null,
  form: PermissionForm | null | undefined,
): string | undefined {
  if (!form) return undefined;
  if (!form.id) return form.directoryUser?.name || "";
  const account = data?.users?.find((user) => user.id === form.id);
  return account?.authSource === "ldap" ? account.name : undefined;
}
export function employeePermission(
  draft: EmployeeAccessDraft | undefined,
  resourceId: string,
  data: Data,
): EmployeePermission | undefined {
  if (!draft?.changed || !draft.form) return;
  const form = draft.form;
  if (draft.revoke)
    return { action: "revoke", id: form.id, revision: form.revision };
  const user = data.users?.find((u) => u.id === form.id);
  if (form.role === "admin" && form.id && user?.authSource !== "ldap")
    throw Error("Admin hesaplarını ilgili kaydın Düzenle ekranından yönetin.");
  if (!form.id) {
    if (!form.directoryUser) throw Error("Active Directory kullanıcısı seçin.");
    return {
      action: "create",
      directoryId: form.directoryUser.id,
      role: form.role,
      leaders: form.leaders,
      planningTeams: form.planningTeams || [],
      resourceId,
    };
  }
  return {
    action: "update",
    id: form.id,
    role: form.role,
    leaders: form.leaders,
    planningTeams: form.planningTeams || [],
    resourceId,
    revision: form.revision,
    ...(!user?.active ? { reactivate: true } : {}),
  };
}
