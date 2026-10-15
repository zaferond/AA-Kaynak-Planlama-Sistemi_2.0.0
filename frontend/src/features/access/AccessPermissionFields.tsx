import {
  planningPermissionRows,
  planningRowState,
  togglePlanningRow,
} from "./planning-permission-tree";
import { useMemo } from "react";
import { Plus, Check } from "lucide-react";
import type { Data } from "../../model";
import type { Account, Role } from "../../access";
import { isEmployeeResource } from "../../access";
import type { PermissionForm } from "./employee-access-draft";
import type { useDirectoryUsers } from "../useDirectoryUsers";
type Props = {
  data: Data;
  form: PermissionForm;
  setForm: (form: PermissionForm) => void;
  selected?: Account;
  busy: boolean;
  directory: ReturnType<typeof useDirectoryUsers>;
  leaderQuery: string;
  setLeaderQuery: (value: string) => void;
  directoryQuery: string;
  setDirectoryQuery: (value: string) => void;
  chooseEmployee: (id: string) => void;
  boundResource?: boolean;
};
export default function AccessPermissionFields({
  data,
  form,
  setForm,
  selected,
  busy,
  directory,
  leaderQuery,
  setLeaderQuery,
  directoryQuery,
  setDirectoryQuery,
  chooseEmployee,
  boundResource = false,
}: Props) {
  const creating = !form.id;
  const permissionRows = useMemo(
    () => planningPermissionRows(data),
    [data.leaders, data.leaderParents, data.teams],
  );
  const selectedCount = permissionRows.filter(
    (row) => planningRowState(data, form, row).checked,
  ).length;
  const people = data.resources
    .filter(isEmployeeResource)
    .sort((a, b) => a.name.localeCompare(b.name, "tr"));
  const linkedUsers = new Map(
    (data.users || [])
      .filter((u) => u.resourceId)
      .map((u) => [u.resourceId, u]),
  );
  const availablePeople = people.filter((p) => !linkedUsers.has(p.id));
  const roleField = (
    <label className="access-field">
      Rol
      <select
        aria-label="Rol"
        value={form.role}
        disabled={busy}
        onChange={(event) =>
          setForm({
            ...form,
            role: event.target.value as Role,
            resourceId:
              event.target.value === "admin" &&
              !boundResource &&
              selected?.authSource !== "ldap"
                ? ""
                : form.resourceId,
          })
        }
      >
        <option value="normal">Normal Kullanıcı</option>
        <option value="manager">Yönetici</option>
        {(creating || selected?.authSource === "ldap" || !boundResource) && (
          <option value="admin">Admin</option>
        )}
      </select>
    </label>
  );
  return (
    <>
      {creating && roleField}
      {creating && (
        <>
          <div className="access-directory-search">
            <label className="access-field">
              Kullanıcı Ara
              <input
                maxLength={100}
                disabled={busy || directory.busy}
                value={directoryQuery}
                onChange={(event) => setDirectoryQuery(event.target.value)}
              />
            </label>
            <button
              type="button"
              className="button"
              disabled={busy || directory.busy}
              onClick={() => {
                void directory.search(directoryQuery);
              }}
            >
              Ara / Yenile
            </button>
          </div>
          {directory.busy && (
            <p className="access-admin-note" role="status">
              AD kullanıcıları yükleniyor…
            </p>
          )}
          {directory.error && (
            <p className="negative" role="alert">
              {directory.error}
            </p>
          )}
          {directory.configured &&
            !directory.busy &&
            !directory.users.length && (
              <p className="access-admin-note" role="status">
                Aramanıza uygun aktif AD kullanıcısı bulunamadı.
              </p>
            )}
          {directory.configured &&
            !directory.busy &&
            directory.users.length > 0 && (
              <div
                className="access-directory-results"
                role="region"
                aria-label="Kullanıcı arama sonuçları"
              >
                {directory.users.map((person) => {
                  const assigned = data.users?.find(
                    (user) => user.directoryId === person.id,
                  );
                  const chosen = form.directoryUser?.id === person.id;
                  return (
                    <div
                      className={
                        "access-directory-result" +
                        (chosen ? " is-selected" : "")
                      }
                      key={person.id}
                    >
                      <div className="access-directory-identity">
                        <strong>{person.name}</strong>
                        <span>
                          {person.username}
                          {person.email ? " · " + person.email : ""}
                        </span>
                        {assigned && (
                          <small>
                            {assigned.active
                              ? "Yetki tanımlı"
                              : "Yetki kaldırılmış"}{" "}
                            · Mevcut kaydı Düzenle ekranından yönetin.
                          </small>
                        )}
                      </div>
                      <button
                        type="button"
                        className="button access-directory-select"
                        aria-label={
                          person.name +
                          (chosen ? " seçildi" : " kullanıcısını seç")
                        }
                        title={chosen ? "Seçildi" : "Kullanıcıyı seç"}
                        disabled={busy || !!assigned || chosen}
                        onClick={() =>
                          setForm({ ...form, directoryUser: person })
                        }
                      >
                        {chosen ? (
                          <Check size={16} aria-hidden="true" />
                        ) : (
                          <Plus size={16} aria-hidden="true" />
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          {directory.configured && (
            <small className="access-directory-hint">
              {directory.hasMore
                ? "İlk 50 sonuç gösteriliyor. Kullanıcı adı, ad veya e-posta ile aramayı daraltın."
                : "Kullanıcıyı + ile seçin."}
            </small>
          )}
          <label className="access-field">
            Ad Soyad
            <input readOnly value={form.directoryUser?.name || ""} />
          </label>
          <label className="access-field">
            Kullanıcı Adı
            <input
              readOnly
              autoComplete="off"
              value={form.directoryUser?.username || ""}
            />
          </label>
          <label className="access-field">
            E-posta
            <input readOnly value={form.directoryUser?.email || ""} />
          </label>
          {!boundResource && (
            <label className="access-field">
              Uygulamadaki Çalışan Kaydı
              <select
                aria-label="Uygulamadaki Çalışan Kaydı"
                required
                disabled={busy}
                value={form.resourceId}
                onChange={(event) => chooseEmployee(event.target.value)}
              >
                <option value="">Çalışan kaydı seçin</option>
                {availablePeople.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </select>
              <small>
                AD kullanıcısının kendi gerçekleşen dağılımı, izin ve eğitim
                kayıtları bu çalışanla ilişkilendirilir.
              </small>
            </label>
          )}
        </>
      )}
      {!creating && selected?.authSource === "ldap" && (
        <p className="access-admin-note">
          Active Directory · {selected.email || "AD kaydında e-posta yok"}.
          Kullanıcı bilgileri kurumsal dizinden alınır.
        </p>
      )}
      {!creating && roleField}
      {form.role === "manager" && (
        <fieldset className="access-leader-field">
          <legend>Planlanan Kaynak Dağılımı Yetkisi</legend>
          <p>
            Yönetici, planlanan kaynak dağılımında tüm takımları görüntüler.
            Seçilen liderlikler ve alt kırılımları veya tek tek seçilen takımlar
            için kaynak girişi yapabilir. Seçim yapılmazsa plan salt okunur
            kalır. Üst liderlik seçiliyken alt kırılımlar otomatik seçilir; ayrı
            seçim yapmak için önce üst liderliğin seçimini kaldırın.
          </p>
          <input
            aria-label="Liderlik veya takım ara"
            placeholder="Liderlik veya takım ara"
            value={leaderQuery}
            onChange={(event) => setLeaderQuery(event.target.value)}
          />
          <div className="access-leader-actions">
            <button
              type="button"
              className="button"
              disabled={
                busy ||
                !permissionRows.length ||
                selectedCount === permissionRows.length
              }
              onClick={() =>
                setForm({
                  ...form,
                  leaders: [...(data.leaders || [])],
                  planningTeams: data.teams
                    .filter((team) => !team.lead)
                    .map((team) => team.id),
                })
              }
            >
              Tümünü Seç
            </button>
            <button
              type="button"
              className="button"
              disabled={busy || !selectedCount}
              onClick={() =>
                setForm({ ...form, leaders: [], planningTeams: [] })
              }
            >
              Seçimi Temizle
            </button>
            <span>
              {selectedCount} / {permissionRows.length} seçili
            </span>
          </div>
          <div className="accessleaders">
            {planningPermissionRows(data, leaderQuery).map((row) => {
              const state = planningRowState(data, form, row);
              return (
                <label
                  key={row.kind + ":" + row.id}
                  data-leadership-depth={row.depth}
                  data-leadership-parent={row.parentId || undefined}
                  data-permission-kind={row.kind}
                  style={{
                    paddingInlineStart: 5 + Math.min(row.depth, 8) * 14,
                  }}
                  title={
                    state.inherited
                      ? "Üst liderlik yetkisine dahil"
                      : row.parentId
                        ? "Üst liderlik: " + row.parentId
                        : undefined
                  }
                >
                  <input
                    type="checkbox"
                    aria-label={
                      row.name + (row.kind === "team" ? " takımı" : "")
                    }
                    disabled={busy || state.inherited}
                    checked={state.checked}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        ...togglePlanningRow(
                          data,
                          form,
                          row,
                          event.target.checked,
                        ),
                      })
                    }
                  />
                  {row.depth > 0 && (
                    <span className="access-leader-branch" aria-hidden="true">
                      ↳
                    </span>
                  )}
                  <span className="access-leader-name">
                    {row.name}
                    <small>
                      {row.kind === "team" ? "Takım" : "Liderlik"}
                      {state.inherited ? " · Üst liderlikten" : ""}
                    </small>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      )}
      {!boundResource && !creating && form.role !== "admin" && (
        <label className="access-field">
          Çalışan Kaydı
          <select
            value={form.resourceId}
            disabled={busy}
            onChange={(event) => chooseEmployee(event.target.value)}
          >
            <option value="">Eşleştirilmedi</option>
            {people.map((person) => (
              <option
                key={person.id}
                value={person.id}
                disabled={
                  !!linkedUsers.get(person.id) &&
                  linkedUsers.get(person.id)?.id !== form.id
                }
              >
                {person.name}
                {linkedUsers.get(person.id) &&
                linkedUsers.get(person.id)?.id !== form.id
                  ? " · Başka hesaba bağlı"
                  : ""}
              </option>
            ))}
          </select>
          <small>
            {form.role === "manager"
              ? "Yönetici kendi gerçekleşen dağılımını, izin ve eğitim kayıtlarını da yönetebilir. Liderlik yetkileri korunur."
              : "Gerçekleşen kaynak dağılımı yalnızca eşleştirilen çalışan için düzenlenebilir."}
          </small>
        </label>
      )}
      {form.role === "admin" && (
        <p className="access-admin-note">
          Admin tüm liderliklerdeki verileri ve yetkilendirmeyi yönetir.
        </p>
      )}
    </>
  );
}
