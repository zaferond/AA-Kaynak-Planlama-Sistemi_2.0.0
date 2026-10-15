import {
  directoryResponsibilityIndex,
  resourceRole,
  resourceRoleLabels,
} from "../../../../shared/resource-roles";
import { directoryEmployees } from "../../../../shared/employee-directory";
import { descendantLeaders } from "../../../../shared/leadership-hierarchy";
import { currentPlanningMonth } from "../../../../shared/resource-dates";
import { Building2, Plus, RefreshCw, Save, Trash2, Users } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCallback, useEffect, useState } from "react";
import { fold, type Data } from "../../model";
import { ownValue } from "../../../../shared/records";
import type { useDirectoryEditor } from "./useDirectoryEditor";

export default function DirectoryManagementDialog({
  data,
  editor,
}: {
  data: Data;
  editor: ReturnType<typeof useDirectoryEditor>;
}) {
  const responsibility = directoryResponsibilityIndex(data);
  const { kind, draft, selectedId, dirty, busy, error, conflict } = editor;
  const [query, setQuery] = useState("");
  useEffect(() => setQuery(""), [kind]);
  const revealSelected = useCallback(
    (list: HTMLDivElement | null) => {
      const selected = list?.querySelector<HTMLButtonElement>(
        'button[aria-pressed="true"]',
      );
      if (list && selected)
        list.scrollTop =
          selected.offsetTop - (list.clientHeight - selected.offsetHeight) / 2;
    },
    [kind, selectedId, query],
  );
  const leaderMode = kind === "leader";
  const label = leaderMode ? "liderlik" : "takım";
  const rows = (
    leaderMode
      ? (data.leaders || []).map((name) => ({
          id: name,
          name,
          detail:
            ownValue(responsibility.leaders, name) || "Yönetici belirtilmedi",
        }))
      : data.teams
          .filter((team) => team.kind !== "leadership")
          .map((team) => ({
            id: team.id,
            name: team.name,
            detail: team.lead || "Liderlik eşleştirilmemiş",
          }))
  )
    .filter((row) => fold(row.name + " " + row.detail).includes(fold(query)))
    .sort((a, b) => a.name.localeCompare(b.name, "tr"));
  const isNew =
    draft?.kind === "leader" ? draft.originalName === null : !draft?.original;
  const name = draft?.kind === "leader" ? draft.name : draft?.value.name || "";
  const manager =
    draft?.kind === "leader"
      ? ownValue(responsibility.leaders, draft.originalName || "") || ""
      : draft?.kind === "team"
        ? ownValue(responsibility.teams, draft.value.id) || ""
        : "";
  const employees =
    selectedId && (kind === "leader" || kind === "team")
      ? directoryEmployees(data, kind, selectedId, currentPlanningMonth())
      : [];
  const excludedParents = selectedId
    ? descendantLeaders(data, selectedId)
    : new Set<string>();
  const linkedTeams =
    leaderMode && selectedId
      ? data.teams
          .filter(
            (team) =>
              team.kind !== "leadership" && excludedParents.has(team.lead),
          )
          .sort(
            (a, b) =>
              a.lead.localeCompare(b.lead, "tr") ||
              a.name.localeCompare(b.name, "tr"),
          )
      : [];
  const linkedLeaders =
    leaderMode && selectedId
      ? [...excludedParents]
          .filter((leader) => leader !== selectedId)
          .sort((a, b) => a.localeCompare(b, "tr"))
      : [];
  const hasDescendantTeams = linkedTeams.some(
    (team) => team.lead !== selectedId,
  );
  return (
    <Dialog
      open={!!kind}
      onOpenChange={(open) => {
        if (!open) editor.close();
      }}
    >
      <DialogContent className="directory-dialog" showCloseButton={!busy}>
        <DialogHeader>
          <DialogTitle>
            {leaderMode ? <Building2 size={20} /> : <Users size={20} />}
            {leaderMode ? "Liderlik Yönetimi" : "Takım Yönetimi"}
          </DialogTitle>
          <DialogDescription>
            Listeden bir kayıt seçin veya yeni {label} ekleyin. Kaydedilen
            tanımlar seçim listelerinde kullanılacaktır.
          </DialogDescription>
        </DialogHeader>
        <div className="directory-manager-body">
          <aside className="directory-manager-list">
            <div className="directory-manager-list-header">
              <strong>{leaderMode ? "Liderlikler" : "Takımlar"}</strong>
              <span>{rows.length}</span>
            </div>
            <input
              type="search"
              aria-label={
                leaderMode ? "Liderlik listesinde ara" : "Takım listesinde ara"
              }
              placeholder={leaderMode ? "Liderlik ara…" : "Takım ara…"}
              value={query}
              disabled={busy}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button
              type="button"
              className="button primary directory-new-button"
              disabled={busy}
              onClick={() => editor.choose()}
            >
              <Plus size={15} />{" "}
              {leaderMode ? "Yeni Liderlik Ekle" : "Yeni Takım Ekle"}
            </button>
            <div
              ref={revealSelected}
              className="directory-manager-records"
              aria-label={leaderMode ? "Liderlik listesi" : "Takım listesi"}
            >
              {rows.map((row) => (
                <button
                  type="button"
                  key={row.id}
                  disabled={busy}
                  className={
                    "directory-record" +
                    (selectedId === row.id ? " selected" : "")
                  }
                  aria-label={
                    (leaderMode ? "Liderlik: " : "Takım: ") + row.name
                  }
                  aria-pressed={selectedId === row.id}
                  onClick={() => editor.choose(row.id)}
                >
                  <strong>{row.name}</strong>
                  <small>{row.detail}</small>
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
                    {isNew ? "Yeni " : "Seçili "}
                    {leaderMode ? "Liderlik" : "Takım"}
                  </legend>
                  <label htmlFor="directory-name">
                    {leaderMode ? "Liderlik Adı" : "Takım Adı"}
                  </label>
                  <input
                    id="directory-name"
                    value={name}
                    maxLength={200}
                    required
                    placeholder={
                      leaderMode ? "Liderlik adını yazın" : "Takım adını yazın"
                    }
                    onChange={(event) =>
                      editor.update("name", event.target.value)
                    }
                  />
                  {draft.kind === "team" && (
                    <>
                      <label htmlFor="directory-leader">Liderlik</label>
                      <select
                        id="directory-leader"
                        value={draft.value.lead}
                        onChange={(event) =>
                          editor.update("lead", event.target.value)
                        }
                      >
                        <option value="">Liderlik Eşleştirilmemiş</option>
                        {(data.leaders || []).map((leader) => (
                          <option key={leader} value={leader}>
                            {leader}
                          </option>
                        ))}
                      </select>
                    </>
                  )}
                  {draft.kind === "leader" && (
                    <>
                      <label htmlFor="directory-parent">Üst Liderlik</label>
                      <select
                        id="directory-parent"
                        value={draft.parentName}
                        onChange={(event) =>
                          editor.update("parentName", event.target.value)
                        }
                      >
                        <option value="">Üst liderlik yok</option>
                        {(data.leaders || [])
                          .filter((leader) => !excludedParents.has(leader))
                          .map((leader) => (
                            <option key={leader} value={leader}>
                              {leader}
                            </option>
                          ))}
                      </select>
                    </>
                  )}
                  <label htmlFor="directory-manager">
                    {leaderMode ? "Liderlik Yöneticisi" : "Takım Yöneticisi"}
                  </label>
                  <input
                    id="directory-manager"
                    value={manager}
                    readOnly
                    aria-readonly="true"
                    className="directory-derived-manager"
                    placeholder={
                      leaderMode ? "Lider atanmadı" : "Product Owner atanmadı"
                    }
                    aria-describedby="directory-manager-source"
                  />
                  <small id="directory-manager-source">
                    Çalışan &amp; Yetki Tanımlama ekranındaki{" "}
                    {leaderMode ? "Lider" : "Product Owner"} rolünden otomatik
                    gösterilir; bu alanda elle değiştirilemez.
                  </small>
                  <div className="directory-manager-form-actions">
                    {!isNew && (
                      <button
                        type="button"
                        className="button directory-remove"
                        onClick={() => void editor.remove()}
                      >
                        <Trash2 size={15} />{" "}
                        {leaderMode ? "Liderliği Sil" : "Takımı Sil"}
                      </button>
                    )}
                    <button
                      type="submit"
                      className="button primary"
                      disabled={!name.trim() || (!isNew && !dirty)}
                    >
                      <Save size={15} />{" "}
                      {busy
                        ? "Kaydediliyor…"
                        : isNew
                          ? "Ekle"
                          : "Değişiklikleri Kaydet"}
                    </button>
                  </div>
                </fieldset>
              </form>
            ) : (
              <div className="directory-manager-placeholder">
                {leaderMode ? <Building2 size={32} /> : <Users size={32} />}
                <strong>
                  {leaderMode ? "Bir liderlik seçin" : "Bir takım seçin"}
                </strong>
                <span>Düzenlemek için soldaki listeden seçim yapın.</span>
              </div>
            )}
            {leaderMode && selectedId && (
              <section
                className="directory-teams"
                aria-label="Bağlı takımlar ve liderlikler"
              >
                <div className="directory-teams-heading">
                  <strong>Bağlı Takımlar ve Liderlikler</strong>
                  <span>
                    {linkedLeaders.length} liderlik · {linkedTeams.length} takım
                  </span>
                </div>
                {hasDescendantTeams && (
                  <p>Alt liderliklerin takımları dahildir.</p>
                )}
                {linkedTeams.length || linkedLeaders.length ? (
                  <ul>
                    {linkedLeaders.map((leader) => (
                      <li key={"leader:" + leader} data-directory-kind="leader">
                        <div className="directory-linked-name">
                          <strong>{leader}</strong>
                          <span className="directory-linked-type">
                            Liderlik
                          </span>
                        </div>
                        <small>
                          {ownValue(data.leaderParents, leader) === selectedId
                            ? "Doğrudan bağlı"
                            : "Üst liderlik · " +
                              (ownValue(data.leaderParents, leader) || "—")}
                        </small>
                      </li>
                    ))}
                    {linkedTeams.map((team) => (
                      <li key={"team:" + team.id} data-directory-kind="team">
                        <div className="directory-linked-name">
                          <strong>{team.name}</strong>
                          <span className="directory-linked-type">Takım</span>
                        </div>
                        <small>
                          {team.lead === selectedId
                            ? "Doğrudan bağlı"
                            : "Alt liderlik · " + team.lead}
                        </small>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>Bu liderliğe bağlı takım veya alt liderlik bulunmuyor.</p>
                )}
              </section>
            )}
            {selectedId && (
              <section
                className="directory-employees"
                aria-label="Bağlı çalışanlar"
              >
                <div className="directory-employees-heading">
                  <strong>Bağlı Çalışanlar</strong>
                  <span>{employees.length} çalışan</span>
                </div>
                {leaderMode && <p>Alt liderliklerin çalışanları dahildir.</p>}
                {employees.length ? (
                  <ul>
                    {employees.map(({ resource, team, version }) => (
                      <li key={resource.id}>
                        <strong>{resource.name}</strong>
                        <small>
                          {team.name} ·{" "}
                          {resourceRoleLabels[resourceRole(data, version)]} ·{" "}
                          {version.status}
                        </small>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>Bu kayda bağlı çalışan bulunmuyor.</p>
                )}
              </section>
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
          <span>
            Bağlı çalışan, dağılım veya yetki bulunan kayıtlar silinemez.
          </span>
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
