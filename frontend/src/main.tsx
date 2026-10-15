import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { ArrowRight, Eye, EyeOff, LockKeyhole, UserRound } from "lucide-react";
import { SYSTEM_NAME, UI_THEME } from "./settings";
import Portal from "./App";
import { login, observeSessionChanges, resumeRemembered } from "./storage";

function App() {
  const [ready, setReady] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const authRequest = useRef(0);
  const busyRef = useRef(false);
  const [sessionKey, setSessionKey] = useState(0);

  useEffect(() => {
    let active = true;
    const verify = async () => {
      const request = ++authRequest.current;
      try {
        const ok = await resumeRemembered();
        if (active && request === authRequest.current) {
          setReady(ok);
          setChecking(false);
        }
      } catch {
        if (active && request === authRequest.current) {
          // A failed focus check must not discard an authenticated editor.
          setChecking(false);
          setError("Oturum kontrol edilemedi. Tekrar deneyin.");
        }
      }
    };
    const reset = () => {
      authRequest.current++;
      busyRef.current = false;
      setReady(false);
      setBusy(false);
      setPassword("");
      // A new Portal instance also clears selections, editors and child caches.
      setSessionKey((key) => key + 1);
    };
    const expired = () => {
      reset();
      setChecking(false);
    };
    const changed = () => {
      reset();
      setError("");
      setChecking(true);
      void verify();
    };
    const focus = () => {
      if (!busyRef.current && document.visibilityState === "visible")
        void verify();
    };
    window.addEventListener("session-expired", expired);
    window.addEventListener("session-changed", changed);
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", focus);
    const stop = observeSessionChanges();
    void verify();
    return () => {
      active = false;
      authRequest.current++;
      stop();
      window.removeEventListener("session-expired", expired);
      window.removeEventListener("session-changed", changed);
      window.removeEventListener("focus", focus);
      document.removeEventListener("visibilitychange", focus);
    };
  }, []);
  useEffect(() => {
    document.title = SYSTEM_NAME;
  }, []);

  if (ready) return <Portal key={sessionKey} />;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const request = ++authRequest.current;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      await login(username, password, remember);
      if (request === authRequest.current) {
        setPassword("");
        setReady(true);
      }
    } catch (cause) {
      if (request === authRequest.current) setError((cause as Error).message);
    } finally {
      if (request === authRequest.current) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  }

  return (
    <main className="auth-screen">
      <div className="auth-shell">
        <aside className="auth-brand">
          <img
            className="auth-logo"
            src="/assets/otokar-logo.svg"
            alt="Otokar"
          />
          <div className="auth-brand-content">
            <h1>{SYSTEM_NAME}</h1>
            <p>
              Proje, takım ve çalışan kaynaklarını tek çalışma alanında yönetin.
            </p>
          </div>
          <div className="auth-brand-footer">
            Planlama - Kaynak Yönetimi - Raporlama
          </div>
          <div className="auth-brand-art" aria-hidden="true" />
        </aside>

        <section className="auth-panel" aria-label="Hesap Girişi">
          <div className="auth-panel-inner">
            <form
              className="auth-form"
              aria-label="Giriş Formu"
              onSubmit={submit}
            >
              <label htmlFor="login-username">Kullanıcı Adı</label>
              <div className="auth-field">
                <UserRound size={19} aria-hidden="true" />
                <input
                  id="login-username"
                  type="text"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder="Kullanıcı adınız"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  required
                  disabled={checking || busy}
                />
              </div>
              <label htmlFor="login-password">Şifre</label>
              <div className="auth-field">
                <LockKeyhole size={19} aria-hidden="true" />
                <input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Şifreniz"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  disabled={checking || busy}
                />
                <button
                  className="auth-visibility"
                  type="button"
                  aria-label={showPassword ? "Şifreyi Gizle" : "Şifreyi Göster"}
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword((value) => !value)}
                >
                  {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
                </button>
              </div>
              <label className="auth-remember">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(event) => setRemember(event.target.checked)}
                  disabled={checking || busy}
                />
                <span>Beni Hatırla</span>
              </label>
              {error && (
                <p className="auth-error" role="alert">
                  {error}
                </p>
              )}
              <button
                className="auth-submit"
                type="submit"
                disabled={checking || busy}
              >
                <span>
                  {checking
                    ? "Oturum Kontrol Ediliyor…"
                    : busy
                      ? "Giriş Yapılıyor…"
                      : "Giriş Yap"}
                </span>
                {!checking && !busy && (
                  <ArrowRight size={19} aria-hidden="true" />
                )}
              </button>
            </form>
          </div>
        </section>
      </div>
    </main>
  );
}

document.documentElement.dataset.theme = UI_THEME;
createRoot(document.getElementById("root")!).render(<App />);
