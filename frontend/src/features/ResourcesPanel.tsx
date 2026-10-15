import { planningGrantSummary } from "./access/planning-permission-tree";
import {
  resourceRole,
  resourceRoleLabels,
} from "../../../shared/resource-roles";
import { ROOT_ADMIN_ID } from "../access";
import type { AccessControls } from "./access/access-controls";
import {
  employeeAccountRows,
  accountRoleLabels,
  employeeSearchField,
} from "./access/employee-account-rows";
import { useFilterAppliedToast } from "./workspace/useFilterAppliedToast";
import type { Dispatch, SetStateAction } from "react";
import { Info, Plus } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Data, Resource } from "../model";
import { versionAt } from "../model";
import { fullDateLabel } from "../format";
import Pager from "../Pager";
import ResourceImportPanel from "../ResourceImportPanel";

type Props = {
  access: AccessControls;
  data: Data;
  start: string;
  search: string;
  onSearchChange: (value: string) => void;
  page: number;
  onPageChange: (page: number) => void;
  resourceIds: string[];
  onSelectionChange: Dispatch<SetStateAction<string[]>>;
  showImport: boolean;
  onImportVisibilityChange: Dispatch<SetStateAction<boolean>>;
  saving: boolean;
  notice: string;
  onEdit: (resource?: Resource) => void;
  onBulkEdit: () => void;
  onDelete: (ids: string[]) => Promise<void>;
  onImported: (data: Data, message: string) => void;
};
export default function ResourcesPanel({
  access,
  data,
  start,
  search,
  onSearchChange: setSearch,
  page: resourcePage,
  onPageChange: setResourcePage,
  resourceIds,
  onSelectionChange: setResourceIds,
  showImport,
  onImportVisibilityChange: setShowImport,
  saving,
  notice,
  onEdit: openResource,
  onBulkEdit: openBulk,
  onDelete: deleteResources,
  onImported,
}: Props) {
  const { notify, toast } = useFilterAppliedToast();
  const rows = employeeAccountRows(data, {
    start,
    ids: data.teams.map((team) => team.id),
    teamIds: [],
    leads: [],
    search,
  });
  const visibleResources = [
    ...new Map(
      rows.flatMap((row) =>
        row.resource ? [[row.resource.id, row.resource] as const] : [],
      ),
    ).values(),
  ];
  const busy = saving || access.busy;
  const effectiveResourcePage = Math.min(
    resourcePage,
    Math.max(0, Math.ceil(rows.length / 50) - 1),
  );
  return (
    <section className="panel employee-access-panel">
      {toast}
      <div className="panelhead">
        <div>
          <h2>Çalışan & Yetki Tanımlama</h2>
          <span className="employee-access-count">
            {data.resources.length} kaynak · {data.users?.length || 0} hesap
          </span>
        </div>
        <div className="actions resource-toolbar">
          <input
            placeholder="Çalışan, liderlik, takım, kullanıcı adı, e-posta veya statü ara…"
            aria-label="Kaynak ara"
            value={search}
            onChange={(e) => {
              const value = e.target.value;
              if (value === search) return;
              setSearch(value);
              notify(value.trim() ? employeeSearchField(data, value) : "reset");
            }}
          />
          <button className="button" onClick={() => setShowImport((v) => !v)}>
            Excel İçe Aktar
          </button>
          <button className="button" disabled={busy} onClick={access.onAudit}>
            Değişiklik Geçmişi
          </button>
          <button
            className="button primary"
            disabled={busy}
            onClick={() => openResource()}
          >
            <Plus size={17} />
            Kaynak Ekle / Yetki Tanımla
          </button>
        </div>
      </div>
      {data.resources.some(
        (r) => !(versionAt(r, start) || r.versions[0]).team,
      ) && (
        <div className="infonote">
          <Info size={16} />
          <span>
            {
              data.resources.filter(
                (r) => !(versionAt(r, start) || r.versions[0]).team,
              ).length
            }{" "}
            kaynak takım ataması bekliyor. Bu kayıtlar takım atanıncaya kadar
            kapasiteye dahil edilmez. Düzenle veya toplu düzenleme ile güncel
            takımları atayın.
          </span>
        </div>
      )}
      {showImport && (
        <ResourceImportPanel
          data={data}
          onClose={() => setShowImport(false)}
          onSaved={onImported}
        />
      )}
      <div className="bulkbar resource-bulkbar">
        <label>
          <input
            type="checkbox"
            aria-label="Filtredeki tüm kaynakları seç"
            checked={
              visibleResources.length > 0 &&
              visibleResources.every((r) => resourceIds.includes(r.id))
            }
            onChange={(e) =>
              setResourceIds(
                e.target.checked ? visibleResources.map((r) => r.id) : [],
              )
            }
          />
          Filtredeki Tüm Kayıtları Seç
        </label>
        <span>{resourceIds.length} kayıt seçildi</span>
        <button
          className="button primary"
          disabled={busy || !resourceIds.length}
          onClick={openBulk}
        >
          Seçilenleri Toplu Düzenle
        </button>
        <button
          className="button deletebutton"
          disabled={busy || !resourceIds.length}
          onClick={() => deleteResources(resourceIds)}
        >
          Seçilenleri Sil
        </button>
        <button className="textbutton" onClick={() => setResourceIds([])}>
          Seçimi Temizle
        </button>
      </div>
      {(access.notice || notice) && (
        <p className="access-notice employee-access-message" role="status">
          {access.notice || notice}
        </p>
      )}
      {access.error && (
        <p className="negative employee-access-message" role="alert">
          {access.error}
        </p>
      )}
      <div className="employee-access-table-wrap accesstable">
        <Table className="resource-table employee-access-table">
          <colgroup>
            {[3, 10, 10, 10, 7, 5, 6, 6, 8, 7, 6, 8, 9, 5].map(
              (width, index) => (
                <col key={index} style={{ width: width + "%" }} />
              ),
            )}
          </colgroup>
          <TableHeader>
            <TableRow>
              {[
                "Seç",
                "Ad Soyad",
                "Liderlik",
                "Takım",
                "Statü",
                "Kaynak Planına Dahil",
                "İşbaşı Tarihi",
                "İşten Ayrılış Tarihi",
                "Hesap",
                "E-posta Adresi",
                "Rol / Yetki",
                "Yetki Kapsamı",
                "Açıklama",
                "İşlemler",
              ].map((h) => (
                <TableHead key={h}>{h}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows
              .slice(
                effectiveResourcePage * 50,
                (effectiveResourcePage + 1) * 50,
              )
              .map(({ key, resource: r, account }) => {
                const v = r && (versionAt(r, start) || r.versions[0]);
                const root = account?.id === ROOT_ADMIN_ID;
                return (
                  <TableRow
                    key={key}
                    data-resource-id={r?.id}
                    data-account-id={account?.id}
                    className={
                      (root
                        ? "system-account-row "
                        : !r
                          ? "account-only-row "
                          : "") +
                      (account && account.id === access.selectedId
                        ? "access-selected-row"
                        : "")
                    }
                  >
                    <TableCell>
                      {r ? (
                        <input
                          type="checkbox"
                          aria-label={r.name + " seç"}
                          checked={resourceIds.includes(r.id)}
                          onChange={(e) =>
                            setResourceIds((old) =>
                              e.target.checked
                                ? [...new Set([...old, r.id])]
                                : old.filter((id) => id !== r.id),
                            )
                          }
                        />
                      ) : (
                        <span aria-label="Kaynak kaydı olmayan hesap">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <strong>{r?.name || account?.name}</strong>
                      {root ? (
                        <small className="subline">
                          Ana yönetici · Korumalı hesap
                        </small>
                      ) : r && v ? (
                        <small className="subline">
                          {resourceRoleLabels[resourceRole(data, v)]}
                        </small>
                      ) : (
                        <small className="subline">
                          Çalışan kaydı eşleştirilmedi
                        </small>
                      )}
                      {r && v && !versionAt(r, start) && (
                        <small className="subline">
                          İlk kayıt ayı: {v.effective}
                        </small>
                      )}
                    </TableCell>
                    <TableCell className="resourceteam">
                      {v
                        ? v.lead ||
                          data.teams.find((t) => t.id === v.team)?.lead ||
                          "Eşleştirilmemiş"
                        : "—"}
                    </TableCell>
                    <TableCell className="resourceteam">
                      {v
                        ? data.teams.find((t) => t.id === v.team)?.name ||
                          "Takım ataması bekliyor"
                        : "—"}
                    </TableCell>
                    <TableCell>
                      {v ? (
                        <span
                          className="badge resource-status-badge"
                          data-resource-status={v.status}
                        >
                          {v.status}
                        </span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      {v ? (v.included ? "Evet" : "Hayır") : "—"}
                    </TableCell>
                    <TableCell>{v ? fullDateLabel(v.start) : "—"}</TableCell>
                    <TableCell>{v ? fullDateLabel(v.end) : "—"}</TableCell>
                    <TableCell>
                      {account ? (
                        <>
                          <strong>{account.username}</strong>
                          <small className="subline">
                            {account.authSource === "ldap"
                              ? "Active Directory"
                              : "Yerel Hesap"}
                          </small>
                        </>
                      ) : (
                        <span className="account-missing">Hesap yok</span>
                      )}
                    </TableCell>
                    <TableCell className="account-email">
                      {account?.email || "—"}
                    </TableCell>
                    <TableCell>
                      {account ? (
                        <>
                          <span
                            className={"access-role-badge role-" + account.role}
                          >
                            {accountRoleLabels[account.role]}
                          </span>
                          <small
                            className={
                              "subline account-state " +
                              (account.active ? "is-active" : "is-inactive")
                            }
                          >
                            {account.active ? "Aktif" : "Yetki Kaldırıldı"}
                          </small>
                        </>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="account-scope">
                      {account ? planningGrantSummary(data, account) : "—"}
                    </TableCell>
                    <TableCell className="resource-description">
                      {r?.note || "—"}
                    </TableCell>
                    <TableCell>
                      <div className="employee-row-actions">
                        {r && (
                          <div className="resourceactions">
                            <button
                              className="textbutton"
                              disabled={busy}
                              onClick={() => openResource(r)}
                            >
                              Düzenle
                            </button>
                            <button
                              className="textbutton deletebutton"
                              disabled={busy}
                              aria-label={r.name + " kaydını sil"}
                              onClick={() => deleteResources([r.id])}
                            >
                              Sil
                            </button>
                          </div>
                        )}
                        {!r && account && !root && (
                          <button
                            type="button"
                            className="textbutton"
                            disabled={busy}
                            onClick={() => access.onEdit(account)}
                          >
                            Düzenle
                          </button>
                        )}
                        {root && (
                          <span className="protected-account-label">
                            Ana yönetici
                          </span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
          </TableBody>
        </Table>
      </div>
      <Pager
        total={rows.length}
        page={effectiveResourcePage}
        size={50}
        onChange={setResourcePage}
        label="Kayıt"
      />
      {!rows.length && (
        <p className="emptymsg">Bu filtrelere uygun çalışan veya hesap yok.</p>
      )}
    </section>
  );
}
