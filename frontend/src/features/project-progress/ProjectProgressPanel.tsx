import { useEffect, useMemo, useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

type View = "plan" | "report";

/** Proje İlerlemesi: plan and monthly entry on one screen, and the report. */
export default function ProjectProgressPanel({
  data,
  user,
  saving,
  onSave,
  focusProjectId = "",
  onFocusHandled,
}: {
  data: Data;
  user: Principal | null;
  saving: boolean;
  onSave: (changes: Change[]) => Promise<void>;
  /** Opens the report on this project (from a badge on another screen). */
  focusProjectId?: string;
  onFocusHandled?: () => void;
}) {
  const currentMonth = currentPlanningMonth().slice(0, 7);
  const months = entryMonths(currentMonth, data.projectProgress);
  const [focus] = useState(focusProjectId);
  const [view, setView] = useState<View>(focus ? "report" : "plan");
  useEffect(() => {
    if (focus) onFocusHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
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
  const pendingApprovals = (data.projectProgress || []).filter(
    (record) => record.proposal?.status === "pending",
  ).length;
  // Entry runs from the earliest plan start; with no month to pick yet the
  // report shows the current month.
  const reportMonth = month || currentMonth;

  const responsibleFilter = (
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
  );

  return (
    <section className="panel project-progress">
      <div className="panelhead">
        <h2>Proje İlerlemesi</h2>
        <div className="progress-head-actions">
          <Tabs value={view} onValueChange={(value) => setView(value as View)}>
            <TabsList
              className="organization-view-switch"
              aria-label="İlerleme görünümü"
            >
              <TabsTrigger value="plan">
                Hedef Plan / Gerçekleşen Plan Giriş
                {user?.role === "admin" && pendingApprovals > 0 && (
                  <span
                    className="progress-badge"
                    aria-label={pendingApprovals + " onay bekliyor"}
                  >
                    {pendingApprovals}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="report">Proje İlerleme Raporu</TabsTrigger>
            </TabsList>
          </Tabs>
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
        </div>
      </div>
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
          initialDetail={focus}
        />
      )}
    </section>
  );
}
