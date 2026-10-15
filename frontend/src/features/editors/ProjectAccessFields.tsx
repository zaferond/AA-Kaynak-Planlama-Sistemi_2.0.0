import { Picker } from "../../components/FilterPicker";
import type { Data, Project } from "../../model";
import { actualVersionAt } from "../../model";
import { currentPlanningMonth } from "../../../../shared/resource-dates.ts";
import {
  PROJECT_ACCESS_ROLES,
  type ProjectAccess,
} from "../../../../shared/project-access.ts";

const emptyAccess = (): ProjectAccess => ({
  roles: [],
  leaders: [],
  teams: [],
  people: [],
});

/** Viewing rules for a project: everyone, or any mix of roles, leaderships,
 * teams and people. Matching any one rule is enough. */
export default function ProjectAccessFields({
  data,
  value,
  onChange,
}: {
  data: Data | null;
  value: Project;
  onChange: (next: Project) => void;
}) {
  const access = value.access;
  const month = currentPlanningMonth();
  const teamName = new Map((data?.teams || []).map((t) => [t.id, t.name]));
  const leaderItems = (data?.leaders || []).map((name) => ({ id: name, name }));
  const teamItems = (data?.teams || [])
    .filter((team) => team.kind !== "leadership")
    .map((team) => ({ id: team.id, name: team.name, description: team.lead }));
  const peopleItems = (data?.resources || [])
    .filter((resource) => resource.name)
    .map((resource) => {
      const team = actualVersionAt(resource, month)?.team;
      return {
        id: resource.id,
        name: resource.name,
        description: team ? teamName.get(team) : undefined,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "tr"));
  const setAccess = (next: ProjectAccess | undefined) => {
    const { access: _previous, ...rest } = value;
    onChange(next ? { ...rest, access: next } : rest);
  };
  const update = (field: keyof ProjectAccess, items: string[]) =>
    setAccess({ ...(access || emptyAccess()), [field]: items });
  const ruleCount = access
    ? access.roles.length +
      access.leaders.length +
      access.teams.length +
      access.people.length
    : 0;
  return (
    <fieldset className="project-access">
      <legend>Görüntüleme yetkisi</legend>
      <div className="project-access-mode" role="radiogroup">
        <label>
          <input
            type="radio"
            name="project-access-mode"
            checked={!access}
            onChange={() => setAccess(undefined)}
          />
          Herkes görebilir
        </label>
        <label>
          <input
            type="radio"
            name="project-access-mode"
            checked={!!access}
            onChange={() => setAccess(access || emptyAccess())}
          />
          Yalnızca seçilenler
        </label>
      </div>
      {access && (
        <div className="project-access-rules">
          <div className="project-access-roles" role="group" aria-label="Rol">
            <span>Rol</span>
            {PROJECT_ACCESS_ROLES.map((role) => (
              <label key={role.id}>
                <input
                  type="checkbox"
                  checked={access.roles.includes(role.id)}
                  onChange={(event) =>
                    update(
                      "roles",
                      event.target.checked
                        ? [...access.roles, role.id]
                        : access.roles.filter((item) => item !== role.id),
                    )
                  }
                />
                {role.label}
              </label>
            ))}
          </div>
          <Picker
            label="Liderlik"
            value={access.leaders}
            onChange={(items) => update("leaders", items)}
            items={leaderItems}
            empty="Seçilmedi"
          />
          <Picker
            label="Takım"
            value={access.teams}
            onChange={(items) => update("teams", items)}
            items={teamItems}
            empty="Seçilmedi"
          />
          <Picker
            label="Kişi"
            value={access.people}
            onChange={(items) => update("people", items)}
            items={peopleItems}
            empty="Seçilmedi"
          />
          <p className="project-access-note">
            {ruleCount
              ? "Seçimlerden herhangi birine uyan kullanıcı projeyi görür. Liderlik seçimi alt liderlikleri ve takımlarını da kapsar."
              : "Henüz seçim yok: kaydedilirse proje herkese görünmeye devam eder."}{" "}
            Adminler her projeyi görür. Projede planlanan dağılımı olan takımlar
            ve gerçekleşen girişi olan kişiler projeyi seçim olmadan da görür.
          </p>
        </div>
      )}
    </fieldset>
  );
}
