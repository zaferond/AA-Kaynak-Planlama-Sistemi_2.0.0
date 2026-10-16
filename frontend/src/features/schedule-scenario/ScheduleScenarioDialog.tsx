import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import {
  ArrowDownToLine,
  ChartColumn,
  Copy,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Data } from "../../model";
import { fmt, monthLabel } from "../../format";
import {
  SCENARIO_STATUS_LABELS,
  scenarioApplyPlan,
  scenarioRevertPlan,
  type SavedScenario,
  type ShiftScenario,
} from "../../../../shared/schedule-shift";
import type { Change } from "../../../../shared/commands";
import SavedScenarioList, {
  type SavedScenarioAction,
} from "./SavedScenarioList";
import {
  compareScenarios,
  groupRemaining,
  newScenario,
  nextScenarioName,
  type ComparisonColumn,
  type ScenarioComparison,
} from "./scenario-comparison";
import { downloadScenarioWorkbook } from "./scenario-export";

type Props = {
  open: boolean;
  onClose: () => void;
  data: Data;
  currentMonth: string;
  scenarios: ShiftScenario[];
  setScenarios: Dispatch<SetStateAction<ShiftScenario[]>>;
  /** Draw the resource reports for this scenario. */
  onShowInReports: (scenarioId: string) => void;
  isAdmin: boolean;
  userId: string;
  saving: boolean;
  /** Writes one atomic batch; rejects with the server message. */
  onSaveChanges: (changes: Change[]) => Promise<void>;
};

const MAX_SCENARIOS = 3;

export default function ScheduleScenarioDialog({
  open,
  onClose,
  data,
  currentMonth,
  scenarios,
  setScenarios,
  onShowInReports,
  isAdmin,
  userId,
  saving,
  onSaveChanges,
}: Props) {
  const [focus, setFocus] = useState(0);
  const [message, setMessage] = useState<{ text: string; error?: boolean }>();
  const saved = data.scheduleScenarios || [];
  const savedOf = (id: string) => saved.find((item) => item.id === id);
  const scenarioChange = (value: SavedScenario): Change => ({
    kind: "scenario",
    id: value.id,
    value,
    revision: data.revisions["scenario:" + value.id] || 0,
  });
  async function run(changes: Change[], done: string, after?: () => void) {
    setMessage(undefined);
    try {
      await onSaveChanges(changes);
      setMessage({ text: done });
      after?.();
    } catch (error) {
      setMessage({ text: (error as Error).message, error: true });
    }
  }
  // Cards of transferred or closed scenarios would compare against a plan
  // that already holds the shift; take them off the comparison.
  const dropCards = (ids: string[]) =>
    setScenarios((all) => {
      const rest = all.filter((s) => !ids.includes(s.id));
      return rest.length
        ? rest
        : [newScenario(nextScenarioName(saved), currentMonth, 3)];
    });
  const overlaps = (a: ShiftScenario, b: ShiftScenario) =>
    a.shifts.some((s) => b.shifts.some((t) => t.projectId === s.projectId));
  function saveCard(scenario: ShiftScenario) {
    const shifts = scenario.shifts.filter((s) => s.projectId && s.months);
    if (!shifts.length || !scenario.name.trim()) {
      setMessage({
        text: "Kaydetmek için senaryo adı ve en az bir proje ile ay sayısı girin.",
        error: true,
      });
      return;
    }
    const existing = savedOf(scenario.id);
    const value: SavedScenario = {
      ...(existing || {
        status: "draft",
        createdBy: userId,
        createdByName: "",
        createdAt: new Date().toISOString(),
      }),
      id: scenario.id,
      name: scenario.name.trim(),
      includeTimeline: scenario.includeTimeline,
      shifts,
    };
    void run([scenarioChange(value)], `“${value.name}” kaydedildi.`);
  }
  function act(action: SavedScenarioAction, item: SavedScenario) {
    if (action === "compare") {
      const index = scenarios.findIndex((s) => s.id === item.id);
      if (index >= 0) return setFocus(index);
      const card: ShiftScenario = {
        id: item.id,
        name: item.name,
        includeTimeline: item.includeTimeline,
        shifts: item.shifts,
      };
      setScenarios((all) =>
        all.length < MAX_SCENARIOS
          ? [...all, card]
          : [...all.slice(0, -1), card],
      );
      return;
    }
    if (action === "approve" || action === "withdraw")
      return void run(
        [
          scenarioChange({
            ...item,
            status: action === "approve" ? "approved" : "draft",
          }),
        ],
        action === "approve"
          ? `“${item.name}” onaylandı.`
          : `“${item.name}” onayı geri çekildi.`,
      );
    if (action === "delete") {
      if (!confirm(`“${item.name}” senaryosu silinsin mi?`)) return;
      return void run(
        [
          {
            kind: "scenario",
            id: item.id,
            value: null,
            operation: "delete",
            // The stored record's revision, as for any other change.
            revision: data.revisions["scenario:" + item.id] || 0,
          },
        ],
        `“${item.name}” silindi.`,
      );
    }
    if (action === "apply") {
      let plan;
      try {
        plan = scenarioApplyPlan(data, item);
      } catch (error) {
        return setMessage({ text: (error as Error).message, error: true });
      }
      // The server closes these too; say so before the transfer.
      const closing = saved.filter(
        (s) =>
          s.id !== item.id &&
          (s.status === "draft" || s.status === "approved") &&
          overlaps(s, item),
      );
      const closingNote = closing.length
        ? `\n\nAynı projeleri içeren ${closing.map((s) => "“" + s.name + "”").join(", ")} kapatılacak; geri alınırsa yeniden taslak olur.`
        : "";
      if (
        !confirm(
          `“${item.name}” takvime aktarılsın mı?\n\n${plan.moved} planlanan kayıt taşınacak; proje dönemleri${item.includeTimeline ? ", aşamalar ve kilometre taşları" : ""} güncellenecek. Bu işlem kayıtları değiştirir. Gerekirse “Geri Al” ile önceki takvime dönülebilir.${closingNote}`,
        )
      )
        return;
      return void run(
        [
          ...(plan.changes as Change[]),
          scenarioChange({ ...item, status: "applied", undo: plan.undo }),
        ],
        `“${item.name}” takvime aktarıldı.` +
          (closing.length ? ` ${closing.length} senaryo kapatıldı.` : ""),
        () => dropCards([item.id, ...closing.map((s) => s.id)]),
      );
    }
    if (action === "revert") {
      let changes;
      try {
        if (!item.undo) throw Error("Geri alma bilgisi bulunamadı.");
        changes = scenarioRevertPlan(data, item.undo);
      } catch (error) {
        return setMessage({ text: (error as Error).message, error: true });
      }
      if (
        !confirm(
          `“${item.name}” geri alınsın mı? Projeler ve planlanan kayıtlar aktarmadan önceki haline döner.`,
        )
      )
        return;
      return void run(
        [
          ...(changes as Change[]),
          scenarioChange({ ...item, status: "reverted" }),
        ],
        `“${item.name}” geri alındı; önceki takvim yüklendi.` +
          (saved.some(
            (s) => s.status === "closed" && s.closedByScenarioId === item.id,
          )
            ? " Bu aktarma yüzünden kapatılan senaryolar yeniden taslak oldu."
            : ""),
        () => dropCards([item.id]),
      );
    }
  }
  const comparison = useMemo(
    () => compareScenarios(data, scenarios, currentMonth),
    [data, scenarios, currentMonth],
  );
  const update = (index: number, next: ShiftScenario) =>
    setScenarios((all) => all.map((s, i) => (i === index ? next : s)));
  const shown = Math.min(focus, scenarios.length - 1);
  const reportTarget =
    comparison.columns[shown + 1]?.key || comparison.columns[1]?.key;

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="editor schedule-scenario-dialog">
        <DialogHeader>
          <DialogTitle>Erteleme Senaryosu</DialogTitle>
          <DialogDescription>
            Projeleri ileri veya geri kaydırıp etkisini görün. Bu ekran
            kayıtları değiştirmez; geçmiş aylar ve gerçekleşen girişler yerinde
            kalır.
          </DialogDescription>
        </DialogHeader>
        <div className="schedule-scenario-body">
          <section className="schedule-scenario-cards" aria-label="Senaryolar">
            {scenarios.map((scenario, index) => (
              <ScenarioCard
                key={scenario.id}
                data={data}
                scenario={scenario}
                problems={comparison.results[index]?.problems || []}
                saved={savedOf(scenario.id)}
                saving={saving}
                onSave={() => saveCard(scenario)}
                canRemove={scenarios.length > 1}
                canCopy={scenarios.length < MAX_SCENARIOS}
                onChange={(next) => update(index, next)}
                onRemove={() =>
                  setScenarios((all) => all.filter((_, i) => i !== index))
                }
                onCopy={() =>
                  setScenarios((all) => [
                    ...all,
                    {
                      ...structuredClone(scenario),
                      id: crypto.randomUUID(),
                      name: nextScenarioName([...all, ...saved]),
                      shifts: scenario.shifts.map((s) => ({
                        ...s,
                        months: s.months + 2,
                      })),
                    },
                  ])
                }
              />
            ))}
            {scenarios.length < MAX_SCENARIOS && (
              <button
                type="button"
                className="schedule-scenario-add"
                onClick={() =>
                  setScenarios((all) => [
                    ...all,
                    newScenario(
                      nextScenarioName([...all, ...saved]),
                      currentMonth,
                      3,
                    ),
                  ])
                }
              >
                <Plus size={16} aria-hidden="true" />
                Senaryo Ekle
              </button>
            )}
          </section>
          <SavedScenarioList
            data={data}
            openIds={scenarios.map((s) => s.id)}
            scenarios={saved}
            isAdmin={isAdmin}
            userId={userId}
            busy={saving}
            onAction={act}
            onDeleteClosed={() => {
              const closed = saved.filter((s) => s.status === "closed");
              if (
                !closed.length ||
                !confirm(`${closed.length} kapatılmış senaryo silinsin mi?`)
              )
                return;
              void run(
                closed.map((s) => ({
                  kind: "scenario",
                  id: s.id,
                  value: null,
                  operation: "delete" as const,
                  revision: data.revisions["scenario:" + s.id] || 0,
                })),
                `${closed.length} kapatılmış senaryo silindi.`,
              );
            }}
          />
          <ComparisonView
            comparison={comparison}
            data={data}
            shown={shown}
            onShow={setFocus}
          />
        </div>
        <div className="schedule-scenario-actions">
          {message ? (
            <small
              className={message.error ? "negative" : "scenario-message"}
              role={message.error ? "alert" : "status"}
            >
              {message.text}
            </small>
          ) : (
            <small>
              Kaydedilen senaryoyu admin onaylar ve takvime aktarır; geri
              alınabilir.
            </small>
          )}
          <button
            type="button"
            className="button"
            disabled={!comparison.ready}
            onClick={() => downloadScenarioWorkbook(data, comparison)}
          >
            <ArrowDownToLine size={16} aria-hidden="true" />
            Excel'e Aktar
          </button>
          <button
            type="button"
            className="button"
            disabled={!reportTarget}
            title="Liderlik ve Takım Bazında Eksik raporlarını bu senaryoyla açar"
            onClick={() => reportTarget && onShowInReports(reportTarget)}
          >
            <ChartColumn size={16} aria-hidden="true" />
            Raporlarda Göster
          </button>
          <button type="button" className="button primary" onClick={onClose}>
            Kapat
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ScenarioCard({
  data,
  scenario,
  problems,
  canRemove,
  canCopy,
  onChange,
  onRemove,
  onCopy,
  saved,
  saving,
  onSave,
}: {
  data: Data;
  scenario: ShiftScenario;
  problems: string[];
  canRemove: boolean;
  canCopy: boolean;
  onChange: (next: ShiftScenario) => void;
  onRemove: () => void;
  onCopy: () => void;
  saved?: SavedScenario;
  saving: boolean;
  onSave: () => void;
}) {
  // Approved or transferred scenarios are a record of the decision.
  const locked = !!saved && saved.status !== "draft";
  const setShift = (
    index: number,
    patch: Partial<ShiftScenario["shifts"][0]>,
  ) =>
    onChange({
      ...scenario,
      shifts: scenario.shifts.map((s, i) =>
        i === index ? { ...s, ...patch } : s,
      ),
    });
  return (
    <article className="schedule-scenario-card" aria-label={scenario.name}>
      <header>
        <input
          aria-label="Senaryo adı"
          value={scenario.name}
          maxLength={40}
          disabled={locked}
          onChange={(e) => onChange({ ...scenario, name: e.target.value })}
        />
        <button
          type="button"
          className="icon-button"
          title={
            locked ? "Onaylanmış senaryo değiştirilemez" : "Senaryoyu kaydet"
          }
          aria-label={scenario.name + " senaryosunu kaydet"}
          disabled={locked || saving}
          onClick={onSave}
        >
          <Save size={14} aria-hidden="true" />
        </button>
        {canCopy && (
          <button
            type="button"
            className="icon-button"
            title="Senaryoyu çoğalt (+2 ay)"
            aria-label={scenario.name + " senaryosunu çoğalt"}
            onClick={onCopy}
          >
            <Copy size={14} aria-hidden="true" />
          </button>
        )}
        {canRemove && (
          <button
            type="button"
            className="icon-button"
            title="Senaryoyu kaldır"
            aria-label={scenario.name + " senaryosunu kaldır"}
            onClick={onRemove}
          >
            <Trash2 size={14} aria-hidden="true" />
          </button>
        )}
      </header>
      {saved && (
        <p className="schedule-card-status" data-scenario-status={saved.status}>
          {SCENARIO_STATUS_LABELS[saved.status]}
          {locked
            ? " · değiştirilemez; çoğaltarak yeni taslak açabilirsiniz"
            : " · kayıtlı"}
        </p>
      )}
      <fieldset className="schedule-card-fields" disabled={locked}>
        <div className="schedule-shift-head" aria-hidden="true">
          <span>Proje</span>
          <span>Ay</span>
          <span>Başlangıç ayı</span>
        </div>
        {scenario.shifts.map((shift, index) => (
          <div className="schedule-shift-row" key={index}>
            <select
              aria-label="Proje"
              value={shift.projectId}
              onChange={(e) => setShift(index, { projectId: e.target.value })}
            >
              <option value="">Proje seçin</option>
              {data.projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <input
              type="number"
              aria-label="Kaydırılacak ay"
              title="Artı: erteleme, eksi: öne çekme"
              min={-24}
              max={24}
              step={1}
              value={shift.months}
              onChange={(e) =>
                setShift(index, {
                  months: Math.max(
                    -24,
                    Math.min(24, Math.trunc(Number(e.target.value)) || 0),
                  ),
                })
              }
            />
            <input
              type="month"
              aria-label="Kaydırmanın başladığı ay"
              value={shift.fromMonth}
              onChange={(e) =>
                e.target.value && setShift(index, { fromMonth: e.target.value })
              }
            />
            <button
              type="button"
              className="icon-button"
              aria-label="Projeyi senaryodan çıkar"
              title="Projeyi senaryodan çıkar"
              disabled={scenario.shifts.length === 1}
              onClick={() =>
                onChange({
                  ...scenario,
                  shifts: scenario.shifts.filter((_, i) => i !== index),
                })
              }
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        ))}
        <button
          type="button"
          className="textbutton"
          onClick={() =>
            onChange({
              ...scenario,
              shifts: [
                ...scenario.shifts,
                {
                  projectId: "",
                  months: scenario.shifts[0]?.months || 3,
                  fromMonth: scenario.shifts[0]?.fromMonth || "",
                },
              ],
            })
          }
        >
          + Proje Ekle
        </button>
        <label className="schedule-timeline-option">
          <input
            type="checkbox"
            checked={scenario.includeTimeline}
            onChange={(e) =>
              onChange({ ...scenario, includeTimeline: e.target.checked })
            }
          />
          Aşamalar, başlıklar ve kilometre taşları da kaysın
        </label>
      </fieldset>
      {problems.map((problem) => (
        <p key={problem} className="negative" role="alert">
          {problem}
        </p>
      ))}
    </article>
  );
}

function ComparisonView({
  comparison,
  data,
  shown,
  onShow,
}: {
  comparison: ScenarioComparison;
  data: Data;
  shown: number;
  onShow: (index: number) => void;
}) {
  if (!comparison.ready)
    return (
      <p className="schedule-scenario-empty">
        Karşılaştırma için en az bir senaryoda proje ve sıfırdan farklı bir ay
        sayısı seçin.
      </p>
    );
  const { columns, months, teams } = comparison;
  const scenario = columns[shown + 1] || columns[1];
  const base = columns[0];
  const teamName = (id: string) =>
    data.teams.find((t) => t.id === id)?.name || id;
  const better = (value: number, reference: number) =>
    value < reference - 1e-9
      ? "is-better"
      : value > reference + 1e-9
        ? "is-worse"
        : undefined;
  return (
    <section className="schedule-comparison" aria-label="Karşılaştırma">
      <p className="schedule-comparison-scope">
        {teams.length} takım etkileniyor · {monthLabel(months[0])} –{" "}
        {monthLabel(months.at(-1)!)}
      </p>
      <table className="schedule-summary-table">
        <thead>
          <tr>
            <th />
            {columns.map((column) => (
              <th key={column.key}>{column.name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {comparison.projects.map((project) => (
            <tr key={project.id}>
              <th>{project.name} bitişi</th>
              {columns.map((column) => (
                <td key={column.key}>
                  {monthLabel(column.projectEnds[project.id] || project.end)}
                </td>
              ))}
            </tr>
          ))}
          <tr>
            <th>Toplam kaynak açığı (kişi-ay)</th>
            {columns.map((column, i) => (
              <td
                key={column.key}
                className={
                  i
                    ? better(column.summary.shortage, base.summary.shortage)
                    : undefined
                }
              >
                {fmt(column.summary.shortage)}
              </td>
            ))}
          </tr>
          <tr>
            <th>Açık olan ay sayısı</th>
            {columns.map((column, i) => (
              <td
                key={column.key}
                className={
                  i
                    ? better(
                        column.summary.shortageMonths,
                        base.summary.shortageMonths,
                      )
                    : undefined
                }
              >
                {column.summary.shortageMonths}
              </td>
            ))}
          </tr>
          <tr>
            <th>En yüksek aylık açık</th>
            {columns.map((column) => (
              <td key={column.key}>
                {column.summary.peak
                  ? `${fmt(column.summary.peak.value)} · ${monthLabel(column.summary.peak.month)}`
                  : "Açık yok"}
              </td>
            ))}
          </tr>
          <tr>
            <th>Kaydırılan planlanan kayıt</th>
            {columns.map((column) => (
              <td key={column.key}>
                {column.key === "base" ? "—" : column.moved}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
      <div className="schedule-impact-head">
        <h3>Senaryo etkisi · kalan kaynak</h3>
        {columns.length > 2 && (
          <div role="group" aria-label="Gösterilen senaryo">
            {columns.slice(1).map((column, i) => (
              <button
                key={column.key}
                type="button"
                className={"button" + (i === shown ? " primary" : "")}
                aria-pressed={i === shown}
                onClick={() => onShow(i)}
              >
                {column.name}
              </button>
            ))}
          </div>
        )}
        <span className="schedule-impact-legend">
          <i className="is-worse" /> kötüleşen <i className="is-better" />{" "}
          iyileşen · değer: senaryodaki kalan (eksi = açık)
        </span>
      </div>
      <ImpactTable
        title="Liderlik bazında"
        firstHeader="Liderlik / Birim"
        rows={comparison.leaderRows.map((row) => ({
          key: "leader:" + (row.leader || row.unitId || row.name),
          label: row.name,
          depth: row.depth || 0,
          ids: row.ids,
        }))}
        months={months}
        base={base}
        scenario={scenario}
        total
      />
      <ImpactTable
        title="Takım bazında"
        firstHeader="Takım"
        rows={teams.map((team) => ({
          key: team,
          label: teamName(team),
          depth: 0,
          ids: [team],
        }))}
        months={months}
        base={base}
        scenario={scenario}
      />
    </section>
  );
}

type ImpactRow = { key: string; label: string; depth: number; ids: string[] };

/** Remaining capacity per row and month in the shown scenario; cells that
 * differ from the current plan are tinted, the tooltip gives both values. */
function ImpactTable({
  title,
  firstHeader,
  rows,
  months,
  base,
  scenario,
  total = false,
}: {
  title: string;
  firstHeader: string;
  rows: ImpactRow[];
  months: string[];
  base: ComparisonColumn;
  scenario: ComparisonColumn;
  /** Add a total row over the top-level rows (sub-rows are breakdowns). */
  total?: boolean;
}) {
  const totalIds = [
    ...new Set(rows.filter((row) => !row.depth).flatMap((row) => row.ids)),
  ];
  const all = total
    ? [
        ...rows,
        { key: "total", label: "Toplam", depth: 0, ids: totalIds, sum: true },
      ]
    : rows;
  return (
    <div className="schedule-impact-block">
      <h4>{title}</h4>
      <div className="schedule-impact-wrap">
        <table className="schedule-impact-table">
          <thead>
            <tr>
              <th>{firstHeader}</th>
              {months.map((month) => (
                <th key={month}>{monthLabel(month)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {all.map((row) => (
              <tr
                key={row.key}
                className={"sum" in row ? "schedule-impact-total" : undefined}
                data-depth={row.depth || undefined}
              >
                <th>
                  {row.depth ? (
                    <span
                      className="schedule-impact-branch"
                      style={{ paddingLeft: row.depth * 14 }}
                    >
                      ↳ {row.label}
                    </span>
                  ) : (
                    row.label
                  )}
                </th>
                {months.map((month) => {
                  const now = groupRemaining(base, row.ids, month);
                  const next = groupRemaining(scenario, row.ids, month);
                  const changed = Math.abs(next - now) > 1e-9;
                  return (
                    <td
                      key={month}
                      className={
                        [
                          next < -1e-9 ? "is-short" : "",
                          changed
                            ? next > now
                              ? "is-better"
                              : "is-worse"
                            : "",
                        ]
                          .filter(Boolean)
                          .join(" ") || undefined
                      }
                      title={`Mevcut: ${fmt(now)} · ${scenario.name}: ${fmt(next)}`}
                    >
                      {fmt(next)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
