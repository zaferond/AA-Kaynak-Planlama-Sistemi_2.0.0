// Signals only invalidate local state. Identity and permissions always come
// from the server; no account, snapshot, cookie or CSRF value is broadcast.
const key = "aa-session-change-v1";
const nonce = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
const source = nonce();
type Signal = { version: 1; id: string; source: string };

export function publishSessionChange() {
  if (typeof window === "undefined") return;
  const signal: Signal = {
    version: 1,
    id: nonce(),
    source,
  };
  try {
    window.localStorage.setItem(key, JSON.stringify(signal));
  } catch {
    // Storage can be disabled; the channel and server checks remain available.
  }
  try {
    const channel = new window.BroadcastChannel(key);
    channel.postMessage(signal);
    channel.close();
  } catch {
    // Older/restricted browsers still use storage events and server checks.
  }
}

export function watchSessionChanges(invalidate: () => void) {
  const target = window;
  const seen = new Set<string>();
  const receive = (value: unknown) => {
    if (
      !value ||
      typeof value !== "object" ||
      !("version" in value) ||
      value.version !== 1 ||
      !("source" in value) ||
      typeof value.source !== "string" ||
      !value.source ||
      value.source.length > 200 ||
      value.source === source ||
      !("id" in value) ||
      typeof value.id !== "string" ||
      !value.id ||
      value.id.length > 200 ||
      seen.has(value.id)
    )
      return;
    seen.add(value.id);
    if (seen.size > 64) seen.delete(seen.values().next().value!);
    invalidate();
  };
  const storage = (event: StorageEvent) => {
    if (event.key !== key || !event.newValue) return;
    try {
      receive(JSON.parse(event.newValue));
    } catch {
      // Other same-origin code can use localStorage; malformed signals are ignored.
    }
  };
  target.addEventListener("storage", storage);
  let channel: BroadcastChannel | undefined;
  try {
    channel = new target.BroadcastChannel(key);
    channel.onmessage = (event) => receive(event.data);
  } catch {
    // The storage event is an independent fallback.
  }
  return () => {
    target.removeEventListener("storage", storage);
    channel?.close();
  };
}
