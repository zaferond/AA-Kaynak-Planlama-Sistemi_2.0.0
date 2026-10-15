// Session-local notification/fence only. No snapshot, draft, secret or operation
// payload is persisted in browser storage or shared with another tab.
export class WriteBlockedError extends Error {
  constructor() {
    super(
      "Önceki kaydın sonucu belirsiz. Sunucu verilerini kontrol edip devam etmeden yeni kayıt gönderilemez. Düzenlemeleriniz korunuyor.",
    );
    this.name = "WriteBlockedError";
  }
}
export class WriteRecovery {
  private epoch = 0;
  private unknown = false;
  private checked: object | null = null;
  private listeners = new Set<() => void>();
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  pending = () => this.unknown;
  capture = () => this.epoch;
  assert(epoch = this.epoch) {
    if (this.unknown || epoch !== this.epoch) throw new WriteBlockedError();
  }
  markUnknown() {
    this.epoch++;
    this.unknown = true;
    this.checked = null;
    this.notify();
  }
  reset() {
    this.epoch++;
    this.unknown = false;
    this.checked = null;
    this.notify();
  }
  checkedAt(epoch: number) {
    if (!this.unknown || epoch !== this.epoch) throw new WriteBlockedError();
    return (this.checked = {});
  }
  acknowledge(check: object) {
    if (!this.unknown || check !== this.checked) throw new WriteBlockedError();
    this.unknown = false;
    this.checked = null;
    this.notify();
  }
  private notify() {
    for (const listener of this.listeners) listener();
  }
}
