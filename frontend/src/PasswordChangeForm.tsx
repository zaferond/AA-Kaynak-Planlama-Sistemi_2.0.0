import { useId, useState } from "react";
import { changePassword } from "./storage";

const MIN_LENGTH = 10;

/** Current password, new password twice. Used as the forced first-login step
 * and from the user menu; `onDone` runs after the server accepted it. */
export default function PasswordChangeForm({
  onDone,
  onCancel,
  cancelLabel = "Vazgeç",
}: {
  onDone: () => void;
  onCancel?: () => void;
  cancelLabel?: string;
}) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const hintId = useId();
  const problem = !current
    ? "Mevcut şifrenizi girin."
    : next.length < MIN_LENGTH
      ? `Yeni şifre en az ${MIN_LENGTH} karakter olmalı.`
      : next.includes("'")
        ? "Yeni şifre tek tırnak içeremez."
        : next === current
          ? "Yeni şifre mevcut şifreyle aynı olamaz."
          : repeat !== next
            ? "Yeni şifre ile tekrarı aynı değil."
            : "";
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (problem || busy) return;
    setBusy(true);
    setError("");
    try {
      await changePassword(current, next);
      onDone();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const touched = !!(current || next || repeat);
  return (
    <form className="password-change-form" onSubmit={submit} noValidate>
      <label>
        Mevcut şifre
        <input
          type="password"
          autoComplete="current-password"
          autoFocus
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
        />
      </label>
      <label>
        Yeni şifre
        <input
          type="password"
          autoComplete="new-password"
          aria-describedby={hintId}
          value={next}
          onChange={(e) => setNext(e.target.value)}
        />
      </label>
      <small id={hintId} className="password-change-hint">
        En az {MIN_LENGTH} karakter; kullanıcı adınız veya örnek şifre olamaz.
      </small>
      <label>
        Yeni şifre (tekrar)
        <input
          type="password"
          autoComplete="new-password"
          value={repeat}
          onChange={(e) => setRepeat(e.target.value)}
        />
      </label>
      {(error || (touched && problem)) && (
        <p role="alert" className="password-change-error">
          {error || problem}
        </p>
      )}
      <div className="password-change-actions">
        {onCancel && (
          <button
            type="button"
            className="button"
            disabled={busy}
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
        )}
        <button
          type="submit"
          className="button primary"
          disabled={busy || !!problem}
        >
          {busy ? "Kaydediliyor…" : "Şifreyi Değiştir"}
        </button>
      </div>
    </form>
  );
}
