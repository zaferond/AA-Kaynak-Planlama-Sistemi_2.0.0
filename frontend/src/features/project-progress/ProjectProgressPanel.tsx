import { useEffect, useMemo, useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Data } from "../../model";
import type { Principal } from "../../access";
import type { Change } from "../../../../shared/commands";
import {
  PROGRESS_OPENING_MONTH,
  nextMonth,
} from "../../../../shared/project-progress.ts";
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
  const months = entryMonths(currentMonth);
  const [focus] = useState(focusProjectId);
  const [view, setView] = useState<View>(
    focus
      ? "report"
      : user?.role === "manager" && user.leaders.length
        ? "plan"
        : "report",
  );
  useEffect(() => {
    if (focus) onFocusHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [month, setMonth] = useState(() => defaultEntryMonth(currentMonth));
  const ctx = useMemo(() => progressContext(data), [data]);
  const pendingApprovals = (data.projectProgress || []).filter(
    (record) => record.proposal?.status === "pending",
  ).length;
  // Before the first tracked month ends there is nothing to enter yet; the
  // report then shows the opening state.
  const reportMonth = month || PROGRESS_OPENING_MONTH;

  return (
    <section className="panel project-progress">
      <div className="panelhead">
        <div>
          <h2>Proje İlerlemesi</h2>
          <p>
            Liderlik bazında hedeflenen ve gerçekleşen ilerleme (kümülatif %) ·
            takip {monthLabel(nextMonth(PROGRESS_OPENING_MONTH))} itibarıyla
          </p>
        </div>
        <div className="progress-head-actions">
          <Tabs value={view} onValueChange={(value) => setView(value as View)}>
            <TabsList
              className="organization-view-switch"
              aria-label="İlerleme görünümü"
            >
              <TabsTrigger value="plan">
                Plan ve Giriş
                {user?.role === "admin" && pendingApprovals > 0 && (
                  <span
                    className="progress-badge"
                    aria-label={pendingApprovals + " onay bekliyor"}
                  >
                    {pendingApprovals}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="report">İlerleme Raporu</TabsTrigger>
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
        <>
          {!month && (
            <p className="progress-card-hint progress-plan-note">
              Aylık gerçekleşen girişi{" "}
              {monthLabel(nextMonth(PROGRESS_OPENING_MONTH))} ile başlar.
              Şimdilik projelerin hedef eğrilerini girip onaya gönderin.
            </p>
          )}
          <PlanAndEntry
            ctx={ctx}
            user={user}
            month={month}
            currentMonth={currentMonth}
            saving={saving}
            onSave={onSave}
          />
        </>
      )}
      {view === "report" && (
        <ProgressReport
          ctx={ctx}
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
