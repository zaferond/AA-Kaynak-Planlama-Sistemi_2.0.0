import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import type { Principal } from "../../access";
import type { RiskLeaveGuard } from "../risk-table/types";
import {
  allowedDefaultTabs,
  defaultTabKey,
  readDefaultTab,
} from "../../navigation";
import { TAB_LABELS } from "../../settings";
import { currentUser, logout } from "../../storage";
import { createWorkspaceNavigation } from "./workspace-navigation";

export function useWorkspaceNavigation({
  user,
  fullPlan,
  assertSessionRef,
  setError,
  setNotice,
}: {
  user: Principal | null;
  fullPlan: boolean;
  assertSessionRef: RefObject<() => void>;
  setError: (message: string) => void;
  setNotice: (message: string) => void;
}) {
  const [tab, setTab] = useState(() =>
    fullPlan ? "plan" : readDefaultTab(currentUser()),
  );
  const [defaultTab, setDefaultTab] = useState(() =>
    readDefaultTab(currentUser()),
  );
  const riskLeaveGuard = useRef<RiskLeaveGuard | null>(null);
  const riskEditingRef = useRef(false);
  const [riskEditing, setRiskEditing] = useState(false);
  const onRiskEditingChange = useCallback((editing: boolean) => {
    riskEditingRef.current = editing;
    setRiskEditing(editing);
  }, []);
  const latest = useRef({ tab, user, setError });
  useLayoutEffect(() => {
    latest.current = { tab, user, setError };
  });
  const [navigation] = useState(() =>
    createWorkspaceNavigation({
      getTab: () => latest.current.tab,
      getLeaveGuard: () => riskLeaveGuard.current,
      canSelectTab: (next) =>
        allowedDefaultTabs(latest.current.user).includes(next),
      assertSession: () => assertSessionRef.current(),
      selectTab: setTab,
      logout,
      reload: () => window.location.reload(),
      onError: (error) => latest.current.setError((error as Error).message),
    }),
  );
  useEffect(() => {
    navigation.activate();
    return navigation.deactivate;
  }, [navigation]);
  useEffect(() => {
    const allowed = allowedDefaultTabs(user);
    if (!allowed.includes(tab)) {
      navigation.invalidateTabRequest();
      setTab(allowed[0]);
    }
  }, [user?.role, tab, navigation]);
  useEffect(() => {
    setDefaultTab(readDefaultTab(user));
  }, [user?.id, user?.role]);
  function setOpeningTab(nextTab: string) {
    if (!user || !allowedDefaultTabs(user).includes(nextTab)) return;
    try {
      localStorage.setItem(defaultTabKey(user.id), nextTab);
      setDefaultTab(nextTab);
      setNotice(
        "Varsayılan Sekme ayarlandı: " +
          TAB_LABELS[nextTab as keyof typeof TAB_LABELS] +
          ". Sonraki açılışta bu sekme gösterilir.",
      );
    } catch {
      setError("Varsayılan Sekme bu tarayıcıda kaydedilemedi.");
    }
  }
  return {
    tab,
    defaultTab,
    setOpeningTab,
    riskLeaveGuard,
    riskEditingRef,
    riskEditing,
    onRiskEditingChange,
    flushRiskDraft: navigation.flushRiskDraft,
    changeTab: navigation.changeTab,
    signOut: navigation.signOut,
  };
}
