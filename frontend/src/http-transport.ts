// Includes the response body, not just the arrival of HTTP headers. A browser
// abort cannot establish whether a POST has committed on the server.
export const REQUEST_DEADLINES = Object.freeze({
  read: 60_000,
  write: 120_000,
  version: 10_000,
});
export class RequestFailure extends Error {
  readonly outcomeUnknown: boolean;
  readonly timedOut: boolean;
  constructor(outcomeUnknown: boolean, timedOut: boolean) {
    super(
      outcomeUnknown
        ? "Kaydetme sonucu doğrulanamadı. İşlem sunucuda tamamlanmış olabilir. Düzenlemeleriniz korunuyor; tekrar kaydetmeden önce sunucu verilerini kontrol edin."
        : timedOut
          ? "Sunucu yanıtı zaman aşımına uğradı. Bağlantınızı kontrol edip tekrar deneyin."
          : "Sunucu yanıtı alınamadı. Bağlantınızı kontrol edip tekrar deneyin.",
    );
    this.name = "RequestFailure";
    this.outcomeUnknown = outcomeUnknown;
    this.timedOut = timedOut;
  }
}
export class HttpTransport {
  private active = new Set<(reason: Error) => void>();
  cancelAll(reason: Error) {
    for (const cancel of [...this.active]) cancel(reason);
  }
  async json(
    url: string,
    init: RequestInit,
    timeoutMs: number,
    inspect: (response: Response) => void,
  ) {
    const controller = new AbortController();
    const write = init.method === "POST";
    let finished = false;
    let cancel!: (reason: Error) => void;
    const interrupted = new Promise<never>((_resolve, reject) => {
      cancel = (reason) => {
        if (finished) return;
        finished = true;
        reject(reason);
        controller.abort(reason);
      };
    });
    this.active.add(cancel);
    const timer = setTimeout(
      () => cancel(new RequestFailure(write, true)),
      timeoutMs,
    );
    const run = async () => {
      let response;
      try {
        response = await fetch(url, { ...init, signal: controller.signal });
      } catch {
        throw new RequestFailure(write, false);
      }
      if (finished) {
        void response.body?.cancel().catch(() => {});
        throw new RequestFailure(write, false);
      }
      inspect(response);
      let result;
      try {
        result = await response.json();
      } catch {
        throw new RequestFailure(write, false);
      }
      if (!result || typeof result !== "object" || Array.isArray(result))
        throw new RequestFailure(write, false);
      if (finished) throw new RequestFailure(write, false);
      return { response, result };
    };
    try {
      return await Promise.race([run(), interrupted]);
    } catch (error) {
      controller.abort(error);
      throw error;
    } finally {
      finished = true;
      clearTimeout(timer);
      this.active.delete(cancel);
    }
  }
}
