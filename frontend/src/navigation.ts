import { currentUser } from "./storage";
import { RISK_MANAGEMENT_ENABLED } from "./settings";
import { isProjectEditor } from "../../shared/project-access.ts";
const adminDefaultTabs = [
  "actual",
  "activity",
  "projects",
  "progress",
  "plan",
  "risk",
  "critical",
  "overview",
  "resources",
] as const;
const managerDefaultTabs = [
  "actual",
  "activity",
  "projects",
  "progress",
  "plan",
  "risk",
  "critical",
  "overview",
] as const;
const normalDefaultTabs = ["actual", "activity", "projects", "risk"] as const;
const projectEditorDefaultTabs = ["projects", "critical"] as const;
export const defaultTabKey = (userId: string) =>
  "aa-kaynak-varsayilan-sekme-v1:" + userId;
export function allowedDefaultTabs(
  user: ReturnType<typeof currentUser>,
): readonly string[] {
  const tabs = isProjectEditor(user)
    ? projectEditorDefaultTabs
    : user?.role === "admin"
      ? adminDefaultTabs
      : user?.role === "manager"
        ? managerDefaultTabs
        : normalDefaultTabs;
  return RISK_MANAGEMENT_ENABLED ? tabs : tabs.filter((tab) => tab !== "risk");
}
export function readDefaultTab(user: ReturnType<typeof currentUser>) {
  if (!user) return "plan";
  try {
    const value = localStorage.getItem(defaultTabKey(user.id));
    const stored =
      value === "access" || value === "teams" ? "resources" : value;
    return stored && allowedDefaultTabs(user).includes(stored)
      ? stored
      : allowedDefaultTabs(user)[0];
  } catch {
    return allowedDefaultTabs(user)[0];
  }
}
