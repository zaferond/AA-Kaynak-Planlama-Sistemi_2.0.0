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
import MonthlyEntry from "./MonthlyEntry";
import BaselineEditor, { type BaselineSelection } from "./BaselineEditor";
import ProgressReport from "./ProgressReport";
import {
  defaultEntryMonth,
  entryMonths,
  progressContext,
} from "./progress-view";
import "./project-progress.css";

type View = "entry" | "baseline" | "report";

/** Proje İlerlemesi: monthly entry, baseline and report per leadership. */
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
        ? "entry"
        : "report",
  );
  useEffect(() => {
    if (focus) onFocusHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [month, setMonth] = useState(() => defaultEntryMonth(currentMonth));
  const [selection, setSelection] = useState<BaselineSelection>(null);
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
              <TabsTrigger value="entry">Aylık Giriş</TabsTrigger>
              <TabsTrigger value="baseline">
                Temel Plan
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
          {view !== "baseline" && months.length > 0 && (
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
      {view === "entry" &&
        (month ? (
          <MonthlyEntry
            ctx={ctx}
            user={user}
            month={month}
            saving={saving}
            onSave={onSave}
            onStartBaseline={(projectId, leader) => {
              setSelection({ projectId, leader });
              setView("baseline");
            }}
          />
        ) : (
          <p className="emptymsg">
            Aylık giriş {monthLabel(nextMonth(PROGRESS_OPENING_MONTH))} ile
            başlar. Şimdilik Temel Plan görünümünden projelerin hedef eğrilerini
            girip onaya gönderin.
          </p>
        ))}
      {view === "baseline" && (
        <BaselineEditor
          ctx={ctx}
          user={user}
          currentMonth={currentMonth}
          saving={saving}
          onSave={onSave}
          selection={selection}
          setSelection={setSelection}
        />
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
