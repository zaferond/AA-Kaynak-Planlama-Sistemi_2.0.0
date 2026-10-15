import { Single } from "../../components/FilterPicker";
import { organizationPickerItems } from "../organization-picker-items";
import { leadershipScopedUnits } from "../../../../shared/leadership-planning";
import { currentPlanningDate } from "../../../../shared/resource-dates";
import { monthLabel } from "../../format";
import { statuses, type Data, type Team } from "../../model";
import type { EditorFieldProps } from "./editor-field-props";
type Props = EditorFieldProps<"bulkResources"> & {
  data: Data | null;
  leaderItems: { id: string; name: string }[];
  editTeams: Team[];
  resourceIds: string[];
};
export default function BulkResourceEditorFields({
  editor,
  setEditor,
  data,
  leaderItems,
  editTeams,
  resourceIds,
}: Props) {
  const organizationItems = data
    ? organizationPickerItems(
        data,
        leaderItems,
        leadershipScopedUnits(
          data,
          editTeams,
          editor.lead ? [editor.lead] : [],
        ),
        currentPlanningDate(),
      )
    : { leaders: [], teams: [] };
  return (
    <>
      <div className="bulk-edit-context">
        <strong>{resourceIds.length} kayıt seçildi</strong>
        <span>{monthLabel(editor.effective)} ayından itibaren</span>
      </div>
      <div className="bulk-edit-grid">
        <Single
          label="Liderlik filtresi"
          value={editor.lead}
          onChange={(l) => setEditor({ ...editor, lead: l, team: "" })}
          items={organizationItems.leaders}
          empty="Tüm liderlikler"
        />
        <Single
          label="Yeni takım"
          value={editor.team}
          onChange={(t) =>
            setEditor({
              ...editor,
              team: t,
              lead: data?.teams.find((x) => x.id === t)?.lead || editor.lead,
            })
          }
          items={organizationItems.teams.map((t) => ({
            ...t,
            name:
              t.kind === "leadership"
                ? "Doğrudan Liderlik · " + t.name
                : t.name,
          }))}
          empty="Takımı değiştirme"
        />
        <Single
          label="Yeni statü"
          value={editor.status}
          onChange={(s) =>
            setEditor({
              ...editor,
              status: s,
              included: s
                ? s === "Aktif İlan" || s === "Pasif İlan"
                  ? "no"
                  : "yes"
                : editor.included,
            })
          }
          items={statuses.map((s) => ({ id: s, name: s }))}
          empty="Statüyü değiştirme"
        />
        <label>
          Kaynak planlamasına dahil
          <select
            value={editor.included}
            onChange={(e) =>
              setEditor({
                ...editor,
                included: e.target.value as "keep" | "yes" | "no",
              })
            }
          >
            <option value="keep">Değiştirme</option>
            <option value="yes">Evet</option>
            <option value="no">Hayır</option>
          </select>
        </label>
      </div>
      <p className="bulk-edit-hint">
        Değiştirmediğiniz alanlar korunur. Aktif İlanı plana dahil etmek için
        Tahmini İşbaşı Tarihi gerekir.
      </p>
    </>
  );
}
