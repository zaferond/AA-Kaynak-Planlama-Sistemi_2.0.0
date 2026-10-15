type Options = {
  getTab: () => string;
  getLeaveGuard: () => (() => Promise<boolean>) | null;
  canSelectTab: (tab: string) => boolean;
  assertSession: () => void;
  selectTab: (tab: string) => void;
  logout: () => Promise<void>;
  reload: () => void;
  onError: (error: unknown) => void;
};

/** Owns pending navigation only. Draft validation/CAS and session transport stay with their owners. */
export function createWorkspaceNavigation(options: Options) {
  let active = true,
    lifetime = 0,
    tabRequest = 0;
  let exitInFlight: Promise<void> | null = null;
  function current(opening: number) {
    if (!active || opening !== lifetime) return false;
    options.assertSession();
    return true;
  }
  function report(error: unknown, opening: number) {
    try {
      if (current(opening)) options.onError(error);
    } catch {
      // The old workspace cannot report into a replacement session.
    }
  }
  async function checkDraft(opening: number) {
    try {
      if (!current(opening)) return false;
      const guard =
        options.getTab() === "risk" ? options.getLeaveGuard() : null;
      const allowed = !guard || (await guard());
      return current(opening) && allowed;
    } catch (error) {
      report(error, opening);
      return false;
    }
  }
  function flushRiskDraft() {
    return exitInFlight ? Promise.resolve(false) : checkDraft(lifetime);
  }
  async function changeTab(nextTab: string) {
    const request = ++tabRequest,
      opening = lifetime;
    if (exitInFlight || !options.canSelectTab(nextTab)) return;
    try {
      if (
        (await checkDraft(opening)) &&
        current(opening) &&
        request === tabRequest &&
        !exitInFlight &&
        options.canSelectTab(nextTab)
      )
        options.selectTab(nextTab);
    } catch (error) {
      report(error, opening);
    }
  }
  function signOut(): Promise<void> {
    if (exitInFlight) return exitInFlight;
    const opening = lifetime;
    tabRequest++;
    // Register before awaiting the draft so repeated clicks share the entire exit.
    const pending = Promise.resolve().then(async () => {
      try {
        if (!(await checkDraft(opening))) return;
        if (!current(opening)) return;
        await options.logout();
        // Successful logout intentionally invalidates the session guard.
        if (active && opening === lifetime) options.reload();
      } catch (error) {
        report(error, opening);
      } finally {
        if (exitInFlight === pending) exitInFlight = null;
      }
    });
    exitInFlight = pending;
    return pending;
  }
  return {
    flushRiskDraft,
    changeTab,
    signOut,
    activate: () => {
      active = true;
    },
    deactivate: () => {
      active = false;
      lifetime++;
      tabRequest++;
      exitInFlight = null;
    },
    invalidateTabRequest: () => {
      tabRequest++;
    },
  };
}
