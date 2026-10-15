// Limits expensive aggregate GETs before taking the shared data lock. No
// waiting queue/cache; active queries keep their slot until their promise ends,
// even if the browser disconnects. Counts are local to this app instance.
export class ReportReadAdmission {
  #users = new Map();
  #active = 0;
  constructor({ activeLimit = 4, perUserLimit = 2 } = {}) {
    if (
      !Number.isInteger(activeLimit) ||
      activeLimit < 1 ||
      activeLimit > 8 ||
      !Number.isInteger(perUserLimit) ||
      perUserLimit < 1 ||
      perUserLimit > activeLimit
    )
      throw Error("Invalid report read limits.");
    this.activeLimit = activeLimit;
    this.perUserLimit = perUserLimit;
  }
  get counts() {
    return { active: this.#active, users: this.#users.size };
  }
  acquire(userId) {
    if (typeof userId !== "string" || !userId)
      throw Error("Missing report principal.");
    const current = this.#users.get(userId) || 0;
    const status =
      current >= this.perUserLimit
        ? 429
        : this.#active >= this.activeLimit
          ? 503
          : 0;
    if (status)
      throw Object.assign(
        Error(
          "Rapor şu anda yoğun. Kısa bir süre sonra Tekrar Dene ile yeniden yükleyin.",
        ),
        { status, retryAfter: 1 },
      );
    this.#active++;
    this.#users.set(userId, current + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.#active--;
      const remaining = this.#users.get(userId) - 1;
      if (remaining) this.#users.set(userId, remaining);
      else this.#users.delete(userId);
    };
  }
  handler(fn) {
    return async (req, res) => {
      const release = this.acquire(req.user._id);
      try {
        return await fn(req, res);
      } finally {
        release();
      }
    };
  }
}
