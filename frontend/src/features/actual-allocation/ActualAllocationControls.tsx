import type { Resource, Data } from "../../model";
import type { ActualUnit } from "../../actual-units";
import { WorkedHours } from "../ActualAllocationInputs";
import type { ActualAllocationView } from "./useActualAllocationView";
import type { WorkedHoursSave } from "./types";
import { fullMonthFormat } from "./format";

export default function ActualAllocationControls({
  data,
  unit,
  onUnitChange,
  selectedHoursPerson,
  selectedHoursMonth,
  actualMonths,
  saveHours,
  canEditPersonMonth,
}: {
  data: Data;
  unit: ActualUnit;
  onUnitChange: (unit: ActualUnit) => void;
  selectedHoursPerson?: Resource;
  selectedHoursMonth?: string;
  actualMonths: ActualAllocationView["actualMonths"];
  saveHours: WorkedHoursSave;
  canEditPersonMonth: (id: string, month: string) => boolean;
}) {
  const effectiveHours = (resourceId: string, month: string) =>
    actualMonths.get(resourceId, month).effectiveHours;
  const autoHours = (resourceId: string, month: string) =>
    actualMonths.get(resourceId, month).autoHours;
  return (
    <div className="panelhead">
      <div>
        <h2>AA Gerçekleşen Kaynak Dağılımı</h2>
      </div>
      <div className="actual-unit-control">
        <div className="actual-control-fields">
          <div className="actual-control-item actual-context-item actual-person-item">
            <span>Çalışan</span>
            <div className="actual-person-value">
              <strong
                className={
                  selectedHoursPerson ? "" : "actual-context-placeholder"
                }
                title={
                  selectedHoursPerson?.name ||
                  "Tablodaki bir kaynak hücresini seçin"
                }
                aria-live="polite"
              >
                {selectedHoursPerson?.name || "Hücre Seçiniz"}
              </strong>
            </div>
          </div>
          <div className="actual-control-item actual-context-item actual-month-item">
            <span>Ay</span>
            <strong
              className={
                selectedHoursPerson ? "" : "actual-context-placeholder"
              }
              aria-live="polite"
            >
              {selectedHoursPerson && selectedHoursMonth
                ? fullMonthFormat.format(
                    new Date(selectedHoursMonth + "-01T12:00:00"),
                  ) +
                  " " +
                  selectedHoursMonth.slice(0, 4)
                : "Hücre Seçiniz"}
            </strong>
          </div>
          <div className="actual-control-item actual-hours-item">
            <span>Aylık Çalışılan Saat</span>
            {selectedHoursPerson && selectedHoursMonth ? (
              <WorkedHours
                key={selectedHoursPerson.id + "|" + selectedHoursMonth}
                resource={selectedHoursPerson}
                month={selectedHoursMonth}
                value={
                  data.actualWorkedHours?.[
                    selectedHoursPerson.id + "|" + selectedHoursMonth
                  ] === undefined
                    ? undefined
                    : effectiveHours(selectedHoursPerson.id, selectedHoursMonth)
                }
                calculatedHours={autoHours(
                  selectedHoursPerson.id,
                  selectedHoursMonth,
                )}
                maxHours={
                  actualMonths.get(selectedHoursPerson.id, selectedHoursMonth)
                    .maxEffectiveHours
                }
                disabled={
                  !canEditPersonMonth(
                    selectedHoursPerson.id,
                    selectedHoursMonth,
                  )
                }
                onSave={(hours, input) =>
                  saveHours(
                    selectedHoursPerson,
                    selectedHoursMonth,
                    hours,
                    input,
                  )
                }
              />
            ) : (
              <span
                className="actual-hours-placeholder"
                aria-label="Çalışan ve ay seçilmedi"
              >
                Hücre Seçiniz
              </span>
            )}
          </div>
          <label
            className="actual-control-item actual-unit-item"
            htmlFor="actual-entry-unit"
          >
            <span>Kaynak Dağıtım Birimi</span>
            <select
              id="actual-entry-unit"
              value={unit}
              onChange={(event) =>
                onUnitChange(event.target.value as ActualUnit)
              }
            >
              <option value="percent">Yüzde (%)</option>
              <option value="hours">Saat</option>
            </select>
          </label>
        </div>
      </div>
    </div>
  );
}
