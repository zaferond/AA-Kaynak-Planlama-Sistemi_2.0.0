import { directoryEmployeeName } from "../access/employee-access-draft";
import { organizationPickerItems } from "../organization-picker-items";
import { currentPlanningDate } from "../../../../shared/resource-dates";
import {
  resourceRole,
  resourceRoleLabels,
} from "../../../../shared/resource-roles";
import { ownValue } from "../../../../shared/records";
import { Switch } from "@/components/ui/switch";
import { Single } from "../../components/FilterPicker";
import {
  statuses,
  type Data,
  type Team,
  type Version,
  type ResourceRole,
} from "../../model";
import type { EditorFieldProps } from "./editor-field-props";
type Props = EditorFieldProps<"resource"> & {
  data: Data | null;
  leaderItems: { id: string; name: string }[];
  editTeams: Team[];
  chooseResourceStatus: (status: string) => void;
};
export default function ResourceEditorFields({
  editor,
  setEditor,
  data,
  leaderItems,
  editTeams,
  chooseResourceStatus,
}: Props) {
  const directoryName = directoryEmployeeName(data, editor.account?.form);
  const directoryManaged = directoryName !== undefined;
  const posting =
    editor.version.status === "Aktif İlan" ||
    editor.version.status === "Pasif İlan";
  const passivePosting = editor.version.status === "Pasif İlan";
  const assignmentKind = posting
    ? "member"
    : editor.assignmentKind ||
      resourceRole({ teams: data?.teams || [] }, editor.version);
  const selectedTeam = data?.teams.find(
    (team) => team.id === editor.version.team,
  );
  const startDateLabel =
    editor.version.status === "Aktif İlan" ||
    editor.version.status === "Pasif İlan"
      ? "Tahmini İşbaşı Tarihi"
      : "İşbaşı Tarihi";
  const organizationItems = data
    ? organizationPickerItems(
        data,
        leaderItems,
        editTeams.filter((team) => team.kind !== "leadership"),
        currentPlanningDate(),
      )
    : { leaders: [], teams: [] };
  return (
    <>
      <Single
        label="Statü"
        value={editor.version.status}
        onChange={chooseResourceStatus}
        items={statuses.map((s) => ({ id: s, name: s }))}
      />
      {!posting && (
        <>
          <label>
            Ad Soyad
            <input
              maxLength={200}
              autoFocus
              value={directoryName ?? editor.value.name}
              readOnly={directoryManaged}
              aria-readonly={directoryManaged || undefined}
              placeholder={
                directoryManaged ? "AD kullanıcısı seçin" : undefined
              }
              title={
                directoryManaged
                  ? "Ad Soyad Active Directory tarafından yönetilir."
                  : undefined
              }
              onChange={(e) =>
                !directoryManaged &&
                setEditor({
                  ...editor,
                  value: { ...editor.value, name: e.target.value },
                })
              }
            />
          </label>
          <label>
            Kaynak Rolü
            <select
              aria-label="Kaynak Rolü"
              value={assignmentKind}
              onChange={(event) => {
                const next = event.target.value as ResourceRole;
                const lead =
                  next === "leader"
                    ? selectedTeam?.lead || editor.version.lead || ""
                    : assignmentKind === "leader"
                      ? ""
                      : selectedTeam?.lead || "";
                setEditor({
                  ...editor,
                  assignmentKind: next,
                  version: {
                    ...editor.version,
                    assignmentRole: next,
                    lead,
                    team:
                      next === "leader"
                        ? ownValue(data?.leadershipUnits, lead) || ""
                        : assignmentKind === "leader"
                          ? ""
                          : editor.version.team,
                  },
                });
              }}
            >
              {Object.entries(resourceRoleLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </>
      )}
      <div className="resource-form-grid">
        {assignmentKind === "leader" ? (
          <Single
            label="Liderlik"
            compact
            value={editor.version.lead || ""}
            onChange={(lead) =>
              setEditor({
                ...editor,
                version: {
                  ...editor.version,
                  lead,
                  team: ownValue(data?.leadershipUnits, lead) || "",
                },
              })
            }
            items={organizationItems.leaders}
          />
        ) : (
          <label className="resource-derived-leadership">
            Liderlik
            <input
              type="text"
              value={selectedTeam?.lead || ""}
              readOnly
              placeholder={selectedTeam ? "Liderlik atanmamış" : "Takım seçin"}
            />
          </label>
        )}
        {assignmentKind !== "leader" && (
          <Single
            label="Takım"
            compact
            value={editor.version.team}
            onChange={(t) =>
              setEditor({
                ...editor,
                version: {
                  ...editor.version,
                  team: t,
                  lead: data?.teams.find((x) => x.id === t)?.lead || "",
                },
              })
            }
            items={organizationItems.teams}
          />
        )}
      </div>
      {assignmentKind === "leader" && (
        <small>
          Takım seçilmez. Bu kaynak seçilen liderliğin doğrudan kaynak satırında
          hesaplanır. Kullanıcı yetkisi ayrıca tanımlanır.
        </small>
      )}
      {!passivePosting && (
        <>
          <div className="resource-date-grid">
            <label>
              {startDateLabel}
              <input
                type="date"
                value={editor.version.start}
                onChange={(e) =>
                  setEditor({
                    ...editor,
                    version: {
                      ...editor.version,
                      start: e.target.value,
                    },
                  })
                }
              />
            </label>
            {editor.version.status === "İşten Ayrıldı" && (
              <label>
                İşten Ayrılış Tarihi
                <input
                  type="date"
                  value={editor.version.end}
                  onChange={(e) =>
                    setEditor({
                      ...editor,
                      version: {
                        ...editor.version,
                        end: e.target.value,
                      },
                    })
                  }
                />
              </label>
            )}
          </div>
          <label className="switchrow">
            <Switch
              checked={editor.version.included}
              onCheckedChange={(v) =>
                setEditor({
                  ...editor,
                  version: { ...editor.version, included: v },
                })
              }
            />
            Kaynak Planlamasına Dahil
          </label>
        </>
      )}
      <label>
        Açıklama
        <textarea
          rows={3}
          value={editor.value.note}
          onChange={(e) =>
            setEditor({
              ...editor,
              value: { ...editor.value, note: e.target.value },
            })
          }
        />
      </label>
      <small>
        Değişiklik geçmişi (ay):{" "}
        {editor.value.versions.map((v: Version) => v.effective).join(", ") ||
          "Yeni Kayıt"}
      </small>
    </>
  );
}
