// Per application instance, before JSON buffering. SQL transaction locks and
// revision/authorization checks remain the authority across processes.
const defaults = Object.freeze({
  activeLimit: 2,
  pendingLimit: 8,
  waitMs: 5000,
  bodyMs: 60000,
});
const ranges = {
  activeLimit: [1, 8],
  pendingLimit: [0, 32],
  waitMs: [100, 10000],
  bodyMs: [1000, 120000],
};
export function mutationAdmissionLimits(input = {}) {
  const result = {};
  for (const [key, fallback] of Object.entries(defaults)) {
    const value = input[key] ?? fallback,
      [min, max] = ranges[key];
    if (!Number.isSafeInteger(value) || value < min || value > max)
      throw Error("Geçersiz yazma kabul sınırı: " + key);
    result[key] = value;
  }
  return Object.freeze(result);
}
export function mutationAdmissionConfig(env = {}) {
  const input = {};
  for (const [key, name] of Object.entries({
    activeLimit: "MUTATION_ACTIVE_LIMIT",
    pendingLimit: "MUTATION_PENDING_LIMIT",
    waitMs: "MUTATION_WAIT_MS",
    bodyMs: "MUTATION_BODY_MS",
  })) {
    if (env[name] === undefined) continue;
    if (typeof env[name] !== "string" || !/^\d+$/.test(env[name].trim()))
      throw Error("Geçersiz yazma kabul ayarı: " + name);
    input[key] = Number(env[name]);
  }
  return mutationAdmissionLimits(input);
}
const unavailable = () =>
  Object.assign(
    Error(
      "Sunucu şu anda yoğun. Değişiklikleriniz kaydedilmedi. Düzenlemelerinizi koruyarak kısa bir süre sonra yeniden kaydedin.",
    ),
    { status: 503, retryAfter: 1 },
  );
const cancelled = () =>
  Object.assign(Error("İstek iptal edildi."), { name: "AbortError" });
export class MutationAdmission {
  #active = 0;
  #pending = [];
  #closed = false;
  constructor(limits) {
    this.limits = mutationAdmissionLimits(limits);
  }
  get counts() {
    return {
      active: this.#active,
      pending: this.#pending.length,
      closed: this.#closed,
    };
  }
  acquire(signal) {
    if (signal?.aborted) return Promise.reject(cancelled());
    if (this.#closed) return Promise.reject(unavailable());
    if (this.#active < this.limits.activeLimit)
      return Promise.resolve(this.#lease());
    if (this.#pending.length >= this.limits.pendingLimit)
      return Promise.reject(unavailable());
    return new Promise((resolve, reject) => {
      const entry = { resolve, reject, cleanup: () => {} };
      const remove = (error) => {
        const index = this.#pending.indexOf(entry);
        if (index < 0) return;
        this.#pending.splice(index, 1);
        entry.cleanup();
        reject(error);
      };
      const abort = () => remove(cancelled());
      const timer = setTimeout(() => remove(unavailable()), this.limits.waitMs);
      timer.unref?.();
      entry.cleanup = () => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
      };
      this.#pending.push(entry);
      signal?.addEventListener("abort", abort, { once: true });
    });
  }
  #lease() {
    this.#active++;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.#active--;
      while (
        !this.#closed &&
        this.#pending.length &&
        this.#active < this.limits.activeLimit
      ) {
        const entry = this.#pending.shift();
        entry.cleanup();
        entry.resolve(this.#lease());
      }
    };
  }
  close() {
    this.#closed = true;
    for (const entry of this.#pending.splice(0)) {
      entry.cleanup();
      entry.reject(unavailable());
    }
  }
}

export function mutationAdmissionMiddleware(gate, authenticate) {
  const states = new WeakMap();
  const releaseUnstarted = (req) => {
    const state = states.get(req);
    if (state && !state.started) state.dispose();
  };
  return {
    releaseUnstarted,
    async middleware(req, res, next) {
      if (
        ["GET", "HEAD"].includes(req.method) ||
        req.path.replace(/\/+$/, "").toLowerCase() === "/auth/logout"
      )
        return next();
      const controller = new AbortController();
      let release, bodyTimer;
      const state = {
        started: false,
        start() {
          this.started = true;
          clearTimeout(bodyTimer);
        },
        dispose() {
          clearTimeout(bodyTimer);
          req.off("aborted", disconnect);
          res.off("close", disconnect);
          res.off("finish", finish);
          states.delete(req);
          release?.();
        },
      };
      const disconnect = () => {
        controller.abort();
        if (!state.started) state.dispose();
      };
      const finish = () => {
        if (!state.started) state.dispose();
      };
      req.once("aborted", disconnect);
      res.once("close", disconnect);
      res.once("finish", finish);
      try {
        release = await gate.acquire(controller.signal);
        if (controller.signal.aborted || res.destroyed || req.aborted) {
          state.dispose();
          return;
        }
        states.set(req, state);
        // Only pre-handler body reception is bounded here. Never abort an
        // executing transaction or free its slot on a client disconnect.
        bodyTimer = setTimeout(() => {
          if (!state.started) req.destroy();
        }, gate.limits.bodyMs);
        bodyTimer.unref?.();
        next();
      } catch (error) {
        state.dispose();
        if (!res.destroyed && !req.aborted) next(error);
      }
    },
    handler(fn) {
      return async (req, res) => {
        const state = states.get(req);
        if (!state) {
          if (req.aborted || res.destroyed) return;
          throw Error("Missing mutation admission lease.");
        }
        state.start();
        try {
          // A queued/slow-body request must not use a logged-out, expired or
          // permission-revoked session captured before admission.
          await authenticate(req, res);
          if (req.aborted || res.destroyed) return;
          return await fn(req, res);
        } finally {
          state.dispose();
        }
      };
    },
  };
}
