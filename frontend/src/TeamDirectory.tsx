import { directoryTree } from "../../shared/directory-tree";
import { directoryResponsibilityIndex } from "../../shared/resource-roles";
import { ownValue } from "../../shared/records";
import React, { useState } from "react";
import { Building2, Users, Pencil } from "lucide-react";
import type { Data } from "./model";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import DirectoryManagementDialog from "./features/team-directory/DirectoryManagementDialog";
import { useDirectoryEditor } from "./features/team-directory/useDirectoryEditor";

export default function TeamDirectory({
  data,
  onSaved,
  canEdit,
  onEditingChange,
}: {
  data: Data;
  onSaved: (data: Data, message: string) => void;
  canEdit: boolean;
  onEditingChange?: (editing: boolean) => void;
}) {
  const responsibility = directoryResponsibilityIndex(data);
  const [query, setQuery] = useState("");
  const editor = useDirectoryEditor({ data, onSaved, onEditingChange });
  const groups = directoryTree(data, query);
  return (
    <section className="panel team-directory">
      <div className="panelhead">
        <div>
          <h2>Organizasyon Yapısı</h2>
          <p className="directory-summary">
            {data.leaders?.length || 0} liderlik ·{" "}
            {data.teams.filter((team) => team.kind !== "leadership").length}{" "}
            takım
          </p>
        </div>
        <div className="actions resource-toolbar directory-toolbar">
          <input
            type="search"
            aria-label="Liderlik veya takım ara"
            placeholder="Liderlik veya takım ara…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {canEdit && (
            <div className="directory-management-actions">
              <button
                type="button"
                className="button"
                onClick={() => editor.open("leader")}
              >
                <Building2 size={15} /> Liderlikleri Yönet
              </button>
              <button
                type="button"
                className="button primary"
                onClick={() => editor.open("team")}
              >
                <Users size={15} /> Takımları Yönet
              </button>
            </div>
          )}
        </div>
      </div>
      <Table className="directory-table" aria-label="Organizasyon yapısı">
        <colgroup>
          <col className="directory-lead-column" />
          <col className="directory-team-column" />
          <col />
          {canEdit && <col className="directory-action-column" />}
        </colgroup>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">Liderlik</TableHead>
            <TableHead scope="col">Takım / Birim</TableHead>
            <TableHead scope="col">Yönetici</TableHead>
            {canEdit && (
              <TableHead scope="col" className="directory-action-cell">
                İşlem
              </TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.map(({ lead, parent, depth, teams }) => (
            <React.Fragment key={lead}>
              <TableRow
                className={
                  "directory-group" +
                  (parent ? " directory-child-leadership" : "")
                }
                data-depth={depth}
              >
                <TableCell>
                  <span
                    className="directory-indent directory-unit-title"
                    style={{ paddingLeft: depth * 18 }}
                  >
                    {parent && <span aria-hidden="true">↳ </span>}
                    <Building2 size={14} aria-hidden="true" />
                    <strong>{lead || "Liderlik Eşleştirilmemiş"}</strong>
                  </span>
                  <small className="directory-team-count">
                    {teams.length} takım
                  </small>
                </TableCell>
                <TableCell>
                  {parent ? (
                    <>
                      <span className="directory-unit-kind">Alt Liderlik</span>
                      <small>Bağlı olduğu liderlik · {parent}</small>
                    </>
                  ) : (
                    <span className="directory-unit-kind">Liderlik</span>
                  )}
                </TableCell>
                <TableCell className="directory-manager-cell">
                  {ownValue(responsibility.leaders, lead) || "—"}
                </TableCell>
                {canEdit && (
                  <TableCell className="directory-action-cell">
                    <div className="directory-actions">
                      {lead && (
                        <button
                          type="button"
                          className="button"
                          aria-label={lead + " liderliğini düzenle"}
                          onClick={() => editor.open("leader", lead)}
                        >
                          <Pencil size={12} aria-hidden="true" />
                          Düzenle
                        </button>
                      )}
                    </div>
                  </TableCell>
                )}
              </TableRow>
              {teams.map((team) => (
                <TableRow
                  key={team.id}
                  className={
                    "directory-team" + (parent ? " directory-nested-team" : "")
                  }
                  data-directory-lead={lead}
                  data-depth={depth + 1}
                  style={
                    {
                      "--directory-indent": `${depth * 18}px`,
                    } as React.CSSProperties
                  }
                >
                  <TableCell>{lead || "—"}</TableCell>
                  <TableCell>
                    <span
                      className="directory-indent directory-unit-title"
                      style={{ paddingLeft: depth * 18 }}
                    >
                      {parent && <span aria-hidden="true">↳ </span>}
                      <Users size={13} aria-hidden="true" />
                      <strong>{team.name}</strong>
                    </span>
                  </TableCell>
                  <TableCell className="directory-manager-cell">
                    {ownValue(responsibility.teams, team.id) || "—"}
                  </TableCell>
                  {canEdit && (
                    <TableCell className="directory-action-cell">
                      <div className="directory-actions">
                        <button
                          type="button"
                          className="button"
                          aria-label={team.name + " takımını düzenle"}
                          onClick={() => editor.open("team", team.id)}
                        >
                          <Pencil size={12} aria-hidden="true" />
                          Düzenle
                        </button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </React.Fragment>
          ))}
        </TableBody>
      </Table>
      {!groups.length && (
        <p className="emptymsg">Aramanıza uygun liderlik veya takım yok.</p>
      )}
      {canEdit && <DirectoryManagementDialog data={data} editor={editor} />}
    </section>
  );
}
