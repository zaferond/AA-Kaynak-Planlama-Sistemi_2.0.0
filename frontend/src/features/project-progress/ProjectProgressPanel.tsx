import { useMemo, useState } from "react";
import type { Data } from "../../model";
import type { Principal } from "../../access";
import type { Change } from "../../../../shared/commands";
import { monthLabel } from "../../format";
import { currentPlanningMonth } from "../../resource-dates";
import PlanAndEntry from "./PlanAndEntry";
import ProgressReport from "./ProgressReport";
import {
  defaultEntryMonth,
  entryMonths,
  progressContext,
} from "./progress-view";
import "./project-progress.css";

import ScenarioWarningsPanel from "./ScenarioWarningsPanel";
import WarningSettingsPanel from "./WarningSettingsPanel";

export type ProgressView = "plan" | "report" | "warnings" | "settings";

/** Proje İlerlemesi: plan and monthly entry on one screen, and the report. */
export default function ProjectProgressPanel({
  data,
  user,
  saving,
  view,
  onSave,
}: {
  data: Data;
  user: Principal | null;
  saving: boolean;
  view: ProgressView;
  onSave: (changes: Change[]) => Promise<void>;
}) {
  const currentMonth = currentPlanningMonth().slice(0, 7);
  const months = entryMonths(currentMonth, data.projectProgress);
  const [selectedMonth, setMonth] = useState(() =>
    defaultEntryMonth(currentMonth, data.projectProgress),
  );
  const month = months.includes(selectedMonth)
    ? selectedMonth
    : defaultEntryMonth(currentMonth, data.projectProgress);
  const [responsible, setResponsible] = useState<string | null>(null);
  const responsibleNames = useMemo(
    () =>
      [
        ...new Set(data.projects.map((p) => p.responsibleName?.trim() || "")),
      ].sort((a, b) => a.localeCompare(b, "tr")),
    [data.projects],
  );
  const progressData = useMemo(
    () =>
      responsible === null
        ? data
        : {
            ...data,
            projects: data.projects.filter(
              (p) => (p.responsibleName?.trim() || "") === responsible,
            ),
          },
    [data, responsible],
  );
  const ctx = useMemo(() => progressContext(progressData), [progressData]);
  // Entry runs from the earliest plan start; with no month to pick yet the
  // report shows the current month.
  const reportMonth = month || currentMonth;

  const responsibleFilter = (
    <>
      <label className="progress-responsible-filter">
        Proje sorumlusu
        <select
          value={responsible === null ? "all" : "name:" + responsible}
          onChange={(e) =>
            setResponsible(
              e.target.value === "all" ? null : e.target.value.slice(5),
            )
          }
        >
          <option value="all">Tümü</option>
          {responsibleNames.map((name) => (
            <option key={name} value={"name:" + name}>
              {name || "Atanmamış"}
            </option>
          ))}
        </select>
      </label>
      {months.length > 0 && (
        <label className="progress-month">
          Ay
          <select value={month} onChange={(e) => setMonth(e.target.value)}>
            {[...months].reverse().map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
              </option>
            ))}
          </select>
        </label>
      )}
    </>
  );

  return (
    <section className="panel project-progress">
      {view === "warnings" && (
        <ScenarioWarningsPanel
          data={progressData}
          saving={saving}
          onSave={onSave}
        />
      )}
      {view === "settings" && user?.role === "admin" && (
        <WarningSettingsPanel data={data} saving={saving} onSave={onSave} />
      )}
      {view === "plan" && (
        <PlanAndEntry
          ctx={ctx}
          responsibleFilter={responsibleFilter}
          user={user}
          month={month}
          currentMonth={currentMonth}
          saving={saving}
          onSave={onSave}
        />
      )}
      {view === "report" && (
        <ProgressReport
          ctx={ctx}
          responsibleFilter={responsibleFilter}
          user={user}
          month={reportMonth}
          currentMonth={currentMonth}
          saving={saving}
          onSave={onSave}
        />
      )}
    </section>
  );
}
