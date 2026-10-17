// Per application instance, before JSON buffering. SQL transaction locks and
// revision/authorization checks remain the authority across processes.
const defaults = Object.freeze({
  activeLimit: 2,
  pendingLimit: 8,
  waitMs: 5000,
  bodyMs: 60000,
  // Writes one user may have admitted or queued at once. The client already
  // sends a session's writes in order, so 1 only stops one user from holding
  // every slot (e.g. slow bodies from several tabs or scripts).
  perUserLimit: 1,
});
const ranges = {
  activeLimit: [1, 8],
  pendingLimit: [0, 32],
  waitMs: [100, 10000],
  bodyMs: [1000, 120000],
  perUserLimit: [1, 32],
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
    perUserLimit: "MUTATION_PER_USER_LIMIT",
  })) {
    if (env[name] === undefined) continue;
    if (typeof env[name] !== "string" || !/^\d+$/.test(env[name].trim()))
      throw Error("Geçersiz yazma kabul ayarı: " + name);
    input[key] = Number(env[name]);
  }
  return mutationAdmissionLimits(input);
}
const busyError = (message, status) => () =>
  Object.assign(Error(message), { status, retryAfter: 1 });
const writeMessages = {
  unavailable:
    "Sunucu şu anda yoğun. Değişiklikleriniz kaydedilmedi. Düzenlemelerinizi koruyarak kısa bir süre sonra yeniden kaydedin.",
  userBusy:
    "Önceki kaydınız henüz tamamlanmadı. Bu değişiklik kaydedilmedi; birkaç saniye sonra yeniden kaydedin.",
};
const cancelled = () =>
  Object.assign(Error("İstek iptal edildi."), { name: "AbortError" });
export class MutationAdmission {
  #active = 0;
  #pending = [];
  #closed = false;
  #perUser = new Map();
  #unavailable;
  #userBusy;
  /** `messages` lets another queue (e.g. data reads) explain its refusals. */
  constructor(limits, messages = writeMessages) {
    this.limits = mutationAdmissionLimits(limits);
    this.#unavailable = busyError(messages.unavailable, 503);
    this.#userBusy = busyError(messages.userBusy, 429);
  }
  get counts() {
    return {
      active: this.#active,
      pending: this.#pending.length,
      closed: this.#closed,
    };
  }
  /** `user` (optional) counts against perUserLimit from queueing to release. */
  acquire(signal, user) {
    if (signal?.aborted) return Promise.reject(cancelled());
    if (this.#closed) return Promise.reject(this.#unavailable());
    if (user === undefined) return this.#acquire(signal);
    const held = this.#perUser.get(user) || 0;
    if (held >= this.limits.perUserLimit)
      return Promise.reject(this.#userBusy());
    this.#perUser.set(user, held + 1);
    const done = () => {
      const left = (this.#perUser.get(user) || 1) - 1;
      if (left > 0) this.#perUser.set(user, left);
      else this.#perUser.delete(user);
    };
    return this.#acquire(signal).then(
      (release) => {
        let released = false;
        return () => {
          if (released) return;
          released = true;
          done();
          release();
        };
      },
      (error) => {
        done();
        throw error;
      },
    );
  }
  #acquire(signal) {
    if (this.#active < this.limits.activeLimit)
      return Promise.resolve(this.#lease());
    if (this.#pending.length >= this.limits.pendingLimit)
      return Promise.reject(this.#unavailable());
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
      const timer = setTimeout(
        () => remove(this.#unavailable()),
        this.limits.waitMs,
      );
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
      entry.reject(this.#unavailable());
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
        release = await gate.acquire(controller.signal, req.user?._id);
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
