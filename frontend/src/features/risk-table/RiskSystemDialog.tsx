import { useEffect, useState } from "react";
import { Layers, Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { fold, type Data } from "../../model";
import { riskUsesSystem } from "../../../../shared/risk-system-policy";
import type { useDirectoryEditor } from "../team-directory/useDirectoryEditor";

export default function RiskSystemDialog({
  data,
  editor,
}: {
  data: Data;
  editor: ReturnType<typeof useDirectoryEditor>;
}) {
  const { kind, busy, dirty, error, conflict } = editor;
  const draft = editor.draft?.kind === "riskSystem" ? editor.draft : null;
  const [query, setQuery] = useState("");
  useEffect(() => setQuery(""), [kind]);
  const rows = (data.riskSystems || [])
    .filter((item) => fold(item.name).includes(fold(query)))
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, "tr"));
  const used = draft?.original
    ? (data.risks || []).filter((risk) => riskUsesSystem(risk, draft.original!))
        .length
    : 0;
  return (
    <Dialog
      open={kind === "riskSystem"}
      onOpenChange={(next) => {
        if (!next) editor.close();
      }}
    >
      <DialogContent className="directory-dialog" showCloseButton={!busy}>
        <DialogHeader>
          <DialogTitle>
            <Layers size={20} /> Sistem / Alt Sistem Yönetimi
          </DialogTitle>
          <DialogDescription>
            Listeden bir tanım seçin veya yeni tanım ekleyin. Kaydedilen adlar
            risk tablosundaki seçim listesinde kullanılacaktır.
          </DialogDescription>
        </DialogHeader>
        <div className="directory-manager-body">
          <aside className="directory-manager-list">
            <div className="directory-manager-list-header">
              <strong>Sistem / Alt Sistemler</strong>
              <span>{rows.length}</span>
            </div>
            <input
              type="search"
              aria-label="Sistem / alt sistem listesinde ara"
              placeholder="Kod veya isim ara…"
              value={query}
              disabled={busy}
              onChange={(event) => setQuery(event.target.value)}
            />
            <button
              type="button"
              className="button primary directory-new-button"
              disabled={busy}
              onClick={() => editor.choose()}
            >
              <Plus size={15} /> Yeni Sistem / Alt Sistem Ekle
            </button>
            <div
              className="directory-manager-records"
              aria-label="Sistem / alt sistem listesi"
            >
              {rows.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  disabled={busy}
                  className={
                    "directory-record" +
                    (draft?.original?.id === item.id ? " selected" : "")
                  }
                  aria-label={"Sistem / alt sistem: " + item.name}
                  aria-pressed={draft?.original?.id === item.id}
                  onClick={() => editor.choose(item.id)}
                >
                  <strong>{item.name}</strong>
                </button>
              ))}
              {!rows.length && (
                <p className="directory-manager-empty">Kayıt bulunamadı.</p>
              )}
            </div>
          </aside>
          <div className="directory-manager-details">
            {draft ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void editor.save();
                }}
              >
                <fieldset disabled={busy}>
                  <legend>
                    {draft.original ? "Seçili" : "Yeni"} Sistem / Alt Sistem
                  </legend>
                  <label htmlFor="risk-system-name">
                    Sistem / Alt Sistem Adı
                  </label>
                  <input
                    id="risk-system-name"
                    value={draft.value.name}
                    maxLength={200}
                    required
                    placeholder="Sistem / alt sistem adını yazın"
                    onChange={(event) =>
                      editor.update("name", event.target.value)
                    }
                  />
                  {!!used && (
                    <p>
                      Bu tanım {used} riskte kullanılıyor. Ad değişikliği bağlı
                      risklere de uygulanır.
                    </p>
                  )}
                  <div className="directory-manager-form-actions">
                    {draft.original && (
                      <button
                        type="button"
                        className="button directory-remove"
                        onClick={() => void editor.remove()}
                      >
                        <Trash2 size={15} /> Tanımı Sil
                      </button>
                    )}
                    <button
                      type="submit"
                      className="button primary"
                      disabled={
                        !draft.value.name.trim() || (!!draft.original && !dirty)
                      }
                    >
                      <Save size={15} />
                      {busy
                        ? "Kaydediliyor…"
                        : draft.original
                          ? "Değişiklikleri Kaydet"
                          : "Ekle"}
                    </button>
                  </div>
                </fieldset>
              </form>
            ) : (
              <div className="directory-manager-placeholder">
                <Layers size={32} />
                <strong>Bir sistem / alt sistem seçin</strong>
                <span>Düzenlemek için soldaki listeden seçim yapın.</span>
              </div>
            )}
            {error && (
              <p className="alert directory-manager-error" role="alert">
                {error}
              </p>
            )}
            {conflict && (
              <button
                type="button"
                className="button"
                disabled={busy}
                onClick={() => void editor.reload()}
              >
                <RefreshCw size={14} /> Güncel Listeyi Yükle
              </button>
            )}
          </div>
        </div>
        <div className="directory-manager-footer">
          <span>Risklerde kullanılan tanımlar silinemez.</span>
          <button
            type="button"
            className="button"
            disabled={busy}
            onClick={editor.close}
          >
            Kapat
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
