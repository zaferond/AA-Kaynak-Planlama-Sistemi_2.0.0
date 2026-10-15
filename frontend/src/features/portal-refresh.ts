type Options = {
  load: () => Promise<void>;
  checkUpdates: () => Promise<boolean>;
  isBusy: () => boolean;
  hasFocusedInput: () => boolean;
  isVisible: () => boolean;
  assertSession: () => void;
  onLoadError: (error: unknown) => void;
};

/** Schedules reads only; snapshot ordering, draft revisions and HTTP cancellation keep their existing owners. */
export function createPortalRefresh(options: Options) {
  let active = false,
    lifetime = 0,
    pendingExternal = false;
  let loadInFlight: Promise<void> | null = null,
    checkInFlight: Promise<void> | null = null;
  function live(opening: number) {
    if (!active || opening !== lifetime) return false;
    try {
      options.assertSession();
      return true;
    } catch {
      return false;
    }
  }
  const blocked = () => options.isBusy() || options.hasFocusedInput();
  function flush() {
    if (!live(lifetime) || !pendingExternal || loadInFlight || blocked())
      return;
    pendingExternal = false;
    void runLoad(lifetime);
  }
  function runLoad(opening: number, initial = false) {
    const pending = Promise.resolve().then(async () => {
      try {
        if (!live(opening)) return;
        // An editor may open between a notification and this microtask.
        if (!initial && blocked()) {
          pendingExternal = true;
          return;
        }
        await options.load();
      } catch (error) {
        if (live(opening)) options.onLoadError(error);
      } finally {
        if (loadInFlight === pending) {
          loadInFlight = null;
          flush();
        }
      }
    });
    loadInFlight = pending;
    return pending;
  }
  function notify() {
    if (!live(lifetime)) return;
    pendingExternal = true;
    flush();
  }
  function poll(): Promise<void> {
    const opening = lifetime;
    if (!live(opening) || !options.isVisible()) return Promise.resolve();
    if (checkInFlight) return checkInFlight;
    // Continue checking identity while an editor is open; defer only the full read.
    const pending = Promise.resolve().then(async () => {
      try {
        if (!live(opening)) return;
        const changed = await options.checkUpdates();
        if (live(opening) && changed) notify();
      } catch {
        // Transient version checks do not discard drafts or show a read error.
      } finally {
        if (checkInFlight === pending) checkInFlight = null;
      }
    });
    checkInFlight = pending;
    return pending;
  }
  return {
    flush,
    notify,
    poll,
    start: () => {
      active = true;
      lifetime++;
      pendingExternal = false;
      loadInFlight = null;
      checkInFlight = null;
      return runLoad(lifetime, true);
    },
    stop: () => {
      active = false;
      lifetime++;
      pendingExternal = false;
      loadInFlight = null;
      checkInFlight = null;
    },
  };
}
