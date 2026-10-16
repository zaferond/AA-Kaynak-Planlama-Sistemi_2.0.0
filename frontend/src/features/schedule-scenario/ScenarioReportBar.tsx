import { CalendarClock } from "lucide-react";
import type { ShiftScenario } from "../../../../shared/schedule-shift.ts";
import type { Data } from "../../model";

type Props = {
  data: Data;
  scenarios: ShiftScenario[];
  activeId: string | null;
  onChange: (id: string | null) => void;
  onEdit: () => void;
};

/** Which plan the resource reports are drawn for: the current one or a
 * delay scenario (a what-if; the records stay as they are). */
export default function ScenarioReportBar({
  data,
  scenarios,
  activeId,
  onChange,
  onEdit,
}: Props) {
  if (!scenarios.length) return null;
  const active = scenarios.find((s) => s.id === activeId);
  const describe = (scenario: ShiftScenario) =>
    scenario.shifts
      .filter((s) => s.projectId && s.months)
      .map((s) => {
        const name = data.projects.find((p) => p.id === s.projectId)?.name;
        return `${name} ${s.months > 0 ? "+" : ""}${s.months} ay`;
      })
      .join(", ");
  return (
    <div
      className={"scenario-report-bar" + (active ? " is-active" : "")}
      role="group"
      aria-label="Rapor senaryosu"
    >
      <CalendarClock size={16} aria-hidden="true" />
      <span className="scenario-report-label">Raporlar:</span>
      <div className="scenario-report-options">
        <button
          type="button"
          className={"button" + (!active ? " primary" : "")}
          aria-pressed={!active}
          onClick={() => onChange(null)}
        >
          Mevcut
        </button>
        {scenarios.map((scenario) => (
          <button
            key={scenario.id}
            type="button"
            className={"button" + (scenario.id === activeId ? " primary" : "")}
            aria-pressed={scenario.id === activeId}
            title={describe(scenario)}
            onClick={() => onChange(scenario.id)}
          >
            {scenario.name}
          </button>
        ))}
      </div>
      <span className="scenario-report-note">
        {active
          ? `Senaryo görünümü: ${describe(active)}. Kayıtlar değişmedi; çerçeveli hücreler mevcut duruma göre değişenlerdir.`
          : "Erteleme senaryosu seçerek raporları yeni durumla görebilirsiniz."}
      </span>
      <button type="button" className="textbutton" onClick={onEdit}>
        Senaryoları Düzenle
      </button>
    </div>
  );
}
