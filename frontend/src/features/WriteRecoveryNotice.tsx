import { useState, useSyncExternalStore } from "react";
import type { Data } from "../model";
import {
  hasUncertainWrite,
  observeWriteRecovery,
  inspectUncertainWrite,
  acknowledgeUncertainWrite,
} from "../storage";

export default function WriteRecoveryNotice({
  onRead,
}: {
  onRead: (data: Data) => void;
}) {
  const pending = useSyncExternalStore(observeWriteRecovery, hasUncertainWrite);
  const [check, setCheck] = useState<object | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!pending) return null;
  async function inspect() {
    setBusy(true);
    setError("");
    setCheck(null);
    try {
      const result = await inspectUncertainWrite();
      onRead(result.data);
      setCheck(result.check);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function acknowledge() {
    if (!check) return;
    try {
      acknowledgeUncertainWrite(check);
      setCheck(null);
      setError("");
    } catch (cause) {
      setError((cause as Error).message);
      setCheck(null);
    }
  }
  return (
    <section
      className="write-recovery-notice"
      role="alert"
      data-risk-cancel
      data-write-recovery
    >
      <div>
        <strong>Kaydetme sonucu belirsiz</strong>
        <p>
          İşlem sunucuda tamamlanmış olabilir. Yeni kayıtlar kontrolünüzü
          bekliyor; açık düzenlemeleriniz korunuyor.
        </p>
        {check && (
          <p>
            Sunucu verileri yüklendi. İlgili kayıtları ve açık taslağınızı
            kontrol edin. Bu okuma, önceki işlemin iptal edildiği anlamına
            gelmez; otomatik tekrar kayıt yapılmaz.
          </p>
        )}
        {error && <p>{error}</p>}
      </div>
      <div className="write-recovery-actions">
        <button
          className="button"
          disabled={busy}
          onClick={() => void inspect()}
        >
          {busy ? "Kontrol ediliyor…" : "Sunucu Verilerini Kontrol Et"}
        </button>
        {check && (
          <button
            className="button primary"
            disabled={busy}
            onClick={acknowledge}
          >
            Kontrol Ettim, Devam Et
          </button>
        )}
      </div>
    </section>
  );
}
