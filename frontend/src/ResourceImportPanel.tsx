import { useMemo, useState } from "react";
import type { Data } from "./model";
import { openExcel } from "./excel-reader";
import { sourceRows, prepareImport } from "./resource-import";
import type { ImportRow } from "./resource-import";
import { downloadResourceTemplate } from "./resource-template";
import { importResources } from "./storage";
export default function ResourceImportPanel({
  data,
  onSaved,
  onClose,
}: {
  data: Data;
  onSaved: (d: Data, message: string) => void;
  onClose: () => void;
}) {
  const [book, setBook] = useState<Awaited<
      ReturnType<typeof openExcel>
    > | null>(null),
    [path, setPath] = useState(""),
    [filename, setFilename] = useState(""),
    [rows, setRows] = useState<ImportRow[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [page, setPage] = useState(0),
    [onlyErrors, setOnlyErrors] = useState(false);
  const preview = useMemo(
    () => (rows.length ? prepareImport(data, rows) : []),
    [data, rows],
  );
  const counts = {
    ready: preview.filter((p) => p.state === "ready").length,
    duplicate: preview.filter((p) => p.state === "duplicate").length,
    error: preview.filter((p) => p.state === "error").length,
  };
  const shown = onlyErrors
    ? preview.filter((p) => p.state === "error")
    : preview;
  const pages = Math.max(1, Math.ceil(shown.length / 50)),
    activePage = Math.min(page, pages - 1);
  async function selectSheet(b: NonNullable<typeof book>, p: string) {
    setPath(p);
    setRows([]);
    setError("");
    setPage(0);
    setOnlyErrors(false);
    const result = sourceRows(await b.rows(p), b.date1904);
    if (!result.length) throw Error("Bu sayfada kaynak kaydı yok.");
    setRows(result);
  }
  async function selectFile(file: File) {
    setBusy(true);
    setRows([]);
    setBook(null);
    setError("");
    setFilename(file.name);
    try {
      const b = await openExcel(file);
      setBook(b);
      await selectSheet(
        b,
        b.sheets.find((s) => s.name === "Kaynaklar")?.path || b.sheets[0].path,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (busy || !counts.ready || counts.error) return;
    setBusy(true);
    setError("");
    try {
      const result = await importResources(rows);
      onSaved(
        result.data,
        result.imported +
          " kaynak eklendi" +
          (result.skipped
            ? " · " + result.skipped + " tekrar eden satır atlandı."
            : "."),
      );
      setRows([]);
      setBook(null);
      setFilename("");
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="resourceimport">
      <div className="panelhead">
        <div>
          <h3>Excel ile Toplu Kaynak Ekle</h3>
          <p>
            Dosya bu tarayıcıda okunur. Önizlemeyi kontrol edip aktarımı
            başlatın.
          </p>
        </div>
        <button className="button" disabled={busy} onClick={onClose}>
          Kapat
        </button>
      </div>
      <div className="importbody">
        <ol>
          <li>
            Şablonu indirin. Güncel liderlik, takım ve statü listeleri şablonda
            bulunur.
          </li>
          <li>
            Kaynaklar sayfasını doldurun. Her çalışan veya ilan bir satır
            olmalı.
          </li>
          <li>
            Dosyayı seçin. Hataları Excel’de düzeltip yeniden yükleyin; ardından
            kayıtları ekleyin.
          </li>
        </ol>
        <div className="actions">
          <button
            className="button"
            disabled={busy}
            onClick={() => {
              try {
                downloadResourceTemplate(data);
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            Excel Şablonunu İndir
          </button>
          <label className="button">
            {busy ? "Dosya işleniyor…" : "Excel Dosyası Seç"}
            <input
              type="file"
              hidden
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void selectFile(file);
              }}
            />
          </label>
          {book && (
            <label>
              Sayfa{" "}
              <select
                value={path}
                disabled={busy}
                onChange={async (e) => {
                  setBusy(true);
                  try {
                    await selectSheet(book, e.target.value);
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {book.sheets.map((s) => (
                  <option key={s.path} value={s.path}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <p className="importhint">
          .xlsx · En fazla 10 MB ve 5.000 kayıt. Yalnızca yeni kaynaklar
          eklenir. Aynı ad soyad ve takım varsa satır atlanır. Mevcut kayıtlar
          güncellenmez.
        </p>
        {filename && (
          <p>
            Dosya: <strong>{filename}</strong>
          </p>
        )}
        {error && (
          <p className="negative" role="alert">
            {error}
          </p>
        )}
        {!!preview.length && (
          <>
            <div className="importcounts">
              <span>{counts.ready} yeni kayıt</span>
              <span>{counts.duplicate} tekrar (atlanacak)</span>
              <span className={counts.error ? "negative" : ""}>
                {counts.error} hatalı satır
              </span>
            </div>
            <label className="importerrorfilter">
              <input
                type="checkbox"
                checked={onlyErrors}
                onChange={(e) => {
                  setOnlyErrors(e.target.checked);
                  setPage(0);
                }}
              />
              Yalnızca Hatalı Satırları Göster
            </label>
            <div className="importtable">
              <table>
                <thead>
                  <tr>
                    {[
                      "Excel Satırı",
                      "Ad Soyad",
                      "Liderlik",
                      "Takım",
                      "Statü",
                      "Dahil",
                      "Kişi Eşdeğeri",
                      "İşbaşı Tarihi",
                      "İşten Ayrılış Tarihi",
                      "Sonuç",
                    ].map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shown
                    .slice(activePage * 50, (activePage + 1) * 50)
                    .map((p) => {
                      const v = p.source.values,
                        r = p.resource?.versions[0];
                      return (
                        <tr key={p.source.row} className={"import-" + p.state}>
                          <td>{p.source.row}</td>
                          <td>{String(v.name || "")}</td>
                          <td>{p.lead || String(v.lead || "")}</td>
                          <td>{p.teamName}</td>
                          <td>{String(v.status || "")}</td>
                          <td>
                            {r
                              ? r.included
                                ? "Evet"
                                : "Hayır"
                              : String(v.included ?? "")}
                          </td>
                          <td>{r?.amount ?? String(v.amount ?? "")}</td>
                          <td>{r?.start || String(v.start || "")}</td>
                          <td>{r?.end || String(v.end || "")}</td>
                          <td>
                            {p.state === "ready"
                              ? "Eklenecek"
                              : p.state === "duplicate"
                                ? "Tekrar — atlanacak"
                                : p.errors.join(" ")}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
            <div className="importpagination">
              <button
                className="button"
                disabled={!activePage}
                onClick={() => setPage(activePage - 1)}
              >
                Önceki
              </button>
              <span>
                {activePage + 1} / {pages} sayfa
              </span>
              <button
                className="button"
                disabled={activePage + 1 >= pages}
                onClick={() => setPage(activePage + 1)}
              >
                Sonraki
              </button>
            </div>
            {counts.error > 0 && (
              <p className="negative">
                Hatalar düzeltilene kadar hiçbir kayıt eklenmez.
              </p>
            )}
            <button
              className="button primary"
              disabled={busy || !counts.ready || !!counts.error}
              onClick={save}
            >
              {busy ? "Aktarılıyor…" : counts.ready + " Kaydı İçe Aktar"}
            </button>
          </>
        )}
      </div>
    </section>
  );
}
