import { useMemo, useState } from "react";
import {
  ArrowDownToLine,
  Check,
  ChevronDown,
  ChevronRight,
  Pencil,
  Plus,
  X,
} from "lucide-react";
import type { Project } from "./model";
import {
  buildProjectInfoReport,
  updateReportedTopic,
  type ReportTopic,
} from "./project-info-report";
import { downloadProjectInfoReport } from "./project-info-report-export";
import {
  TOPIC_FILTERS,
  filterReportGroups,
  reportWeeks,
  topicFilterCounts,
  topicStatus,
  topicWeeks,
  type TopicFilter,
  type TopicWeek,
  type WeekState,
} from "./project-info-status";
import { currentPlanningDate } from "./resource-dates";
import {
  isoWeek,
  shiftWeek,
  weekDates,
  weekFromKey,
  weekLabel,
  type IsoWeek,
} from "./iso-week";

const STATUS_LABELS = { late: "Gecikti", active: "Sürüyor" } as const;

const dateFormat = new Intl.DateTimeFormat("tr-TR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
const dateLabel = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? dateFormat.format(new Date(value + "T12:00:00"))
    : value;
const monthEnd = (month: string) =>
  new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0))
    .toISOString()
    .slice(0, 10);

type Editing = {
  projectId: string;
  infoId: string;
  topic: ReportTopic;
  text: string;
  start: string;
  end: string;
};
type Props = {
  projects: Project[];
  canEdit: boolean;
  onSave: (project: Project) => Promise<void>;
  onAddInfo: (project: Project) => void;
  onEditInfo: (project: Project, infoId: string) => void;
  onOpenProjects?: () => void;
};

export default function ProjectInfoReport({
  projects,
  canEdit,
  onSave,
  onAddInfo,
  onEditInfo,
  onOpenProjects,
}: Props) {
  const [editing, setEditing] = useState<Editing | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<TopicFilter>("all");
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const groups = useMemo(() => buildProjectInfoReport(projects), [projects]);
  const [weekKeys, setWeekKeys] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const today = currentPlanningDate();
  const thisWeek = isoWeek(today);
  const weeks = useMemo(() => reportWeeks(groups), [groups]);
  const quickWeeks: [string, IsoWeek][] = [
    ["Geçen hafta", shiftWeek(thisWeek, -1)],
    ["Bu hafta", thisWeek],
    ["Gelecek hafta", shiftWeek(thisWeek, 1)],
  ];
  const weekCount = (week: IsoWeek) =>
    weeks.find((entry) => entry.week.key === week.key)?.count || 0;
  const toggleWeek = (key: string) =>
    setWeekKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  // Weeks picked from the list (not the quick buttons) show as removable chips.
  const otherSelected = [...weekKeys]
    .filter((key) => !quickWeeks.some(([, week]) => week.key === key))
    .sort()
    .flatMap((key) => weekFromKey(key) || []);
  const counts = topicFilterCounts(groups, today, weekKeys);
  const visibleGroups = filterReportGroups(groups, filter, today, weekKeys);
  const toggleProject = (id: string, open?: boolean) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (open ?? next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const allCollapsed =
    visibleGroups.length > 0 &&
    visibleGroups.every((project) => collapsed.has(project.id));
  const topicCount = groups.reduce(
    (total, project) =>
      total +
      project.infos.reduce((count, info) => count + info.topics.length, 0),
    0,
  );

  async function apply(
    projectId: string,
    infoId: string,
    topic: ReportTopic,
    change:
      | { text: string; start: string; end: string }
      | { includeInReport: false }
      | { completed: boolean },
  ) {
    const project = projects.find((item) => item.id === projectId);
    if (!project) return;
    setBusy(true);
    setError("");
    try {
      await onSave(updateReportedTopic(project, infoId, topic, change));
      setEditing(null);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel report project-info-report">
      <div className="panelhead">
        <div>
          <h2>Kritik Proje Konuları</h2>
          <p>
            Proje ve kritik konu bazında seçilen açıklamalar · {topicCount}{" "}
            detay konu
          </p>
        </div>
        {!!topicCount && (
          <button
            type="button"
            className="button project-info-export"
            onClick={() => {
              try {
                downloadProjectInfoReport(groups);
                setError("");
              } catch (cause) {
                setError((cause as Error).message);
              }
            }}
          >
            <ArrowDownToLine size={15} />
            Excel’e Aktar
          </button>
        )}
      </div>
      {error && !editing && (
        <p role="alert" className="project-info-error">
          {error}
        </p>
      )}
      {groups.length > 0 && (
        <div className="project-info-toolbar">
          <div
            className="project-info-filter"
            role="group"
            aria-label="Konu durumu"
          >
            {TOPIC_FILTERS.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                aria-pressed={filter === value}
                data-filter={value}
                onClick={() => setFilter(value)}
              >
                {label} <span>{counts[value]}</span>
              </button>
            ))}
          </div>
          <label className="project-info-jump">
            Projeye git
            <select
              value=""
              onChange={(event) => {
                const id = event.target.value;
                if (!id) return;
                toggleProject(id, true);
                requestAnimationFrame(() =>
                  document
                    .getElementById("critical-project-" + id)
                    ?.scrollIntoView({ block: "start", behavior: "smooth" }),
                );
              }}
            >
              <option value="">Seçin…</option>
              {visibleGroups.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="textbutton project-info-collapse-all"
            disabled={!visibleGroups.length}
            onClick={() =>
              setCollapsed(
                allCollapsed
                  ? new Set()
                  : new Set(visibleGroups.map((project) => project.id)),
              )
            }
          >
            {allCollapsed ? "Tümünü Aç" : "Tümünü Daralt"}
          </button>
          <div
            className="project-info-weekbar"
            role="group"
            aria-label="Hafta süzgeci"
          >
            <span className="project-info-weekbar-label">Hafta</span>
            <button
              type="button"
              aria-pressed={weekKeys.size === 0}
              onClick={() => setWeekKeys(new Set())}
            >
              Tümü
            </button>
            {quickWeeks.map(([label, week]) => (
              <button
                key={week.key}
                type="button"
                aria-pressed={weekKeys.has(week.key)}
                title={weekDates(week)}
                onClick={() => toggleWeek(week.key)}
              >
                {label} · {weekLabel(week, thisWeek.year)}{" "}
                <span>{weekCount(week)}</span>
              </button>
            ))}
            {otherSelected.map((week) => (
              <button
                key={week.key}
                type="button"
                aria-pressed="true"
                className="project-info-week-remove"
                title={weekDates(week) + " · süzgeçten çıkar"}
                onClick={() => toggleWeek(week.key)}
              >
                {weekLabel(week, thisWeek.year)} <span>{weekCount(week)}</span>
                <X size={12} aria-hidden="true" />
              </button>
            ))}
            <select
              aria-label="Hafta ekle"
              value=""
              onChange={(event) => {
                if (event.target.value) toggleWeek(event.target.value);
              }}
            >
              <option value="">Hafta ekle…</option>
              {weeks
                .filter(({ week }) => !weekKeys.has(week.key))
                .map(({ week, count }) => (
                  <option key={week.key} value={week.key}>
                    {weekLabel(week, thisWeek.year)} · {weekDates(week)} (
                    {count})
                  </option>
                ))}
            </select>
          </div>
        </div>
      )}
      {groups.length && !visibleGroups.length ? (
        <p className="emptymsg project-info-filter-empty">
          Bu durumda konu yok.
        </p>
      ) : groups.length ? (
        <div className="project-info-groups">
          {visibleGroups.map((project) => {
            const source = projects.find((item) => item.id === project.id);
            const projectTopicCount = project.infos.reduce(
              (count, info) => count + info.topics.length,
              0,
            );
            const projectStatuses = project.infos.flatMap((info) =>
              info.topics.map((topic) => topicStatus(topic, today)),
            );
            const late = projectStatuses.filter((s) => s === "late").length;
            const active = projectStatuses.filter((s) => s === "active").length;
            const open = !collapsed.has(project.id);
            return (
              <article
                className="project-info-group"
                key={project.id}
                id={"critical-project-" + project.id}
                data-collapsed={open ? undefined : "true"}
              >
                <header>
                  <div className="project-info-project-title">
                    <h3>
                      <button
                        type="button"
                        aria-expanded={open}
                        onClick={() => toggleProject(project.id)}
                      >
                        {open ? (
                          <ChevronDown size={16} aria-hidden="true" />
                        ) : (
                          <ChevronRight size={16} aria-hidden="true" />
                        )}
                        {project.name}
                      </button>
                    </h3>
                    <small>
                      {project.infos.length} kritik konu · {projectTopicCount}{" "}
                      detay konu
                    </small>
                  </div>
                  <span className="project-info-project-status">
                    {late > 0 && <em data-status="late">{late} gecikmiş</em>}
                    {active > 0 && (
                      <em data-status="active">{active} sürüyor</em>
                    )}
                  </span>
                  {canEdit && source && (
                    <button
                      type="button"
                      className="button project-info-add"
                      disabled={busy}
                      onClick={() => onAddInfo(source)}
                    >
                      <Plus size={14} />
                      Başlık Ekle
                    </button>
                  )}
                </header>
                {open &&
                  project.infos.map((info) => (
                    <div className="project-info-entry" key={info.id}>
                      <div className="project-info-entry-heading">
                        <div className="project-info-entry-title">
                          <span className="project-info-entry-index">
                            {String(info.index + 1).padStart(2, "0")}
                          </span>
                          <h4>{info.name}</h4>
                          <span className="project-info-entry-count">
                            {info.topics.length} detay konu
                          </span>
                        </div>
                        {canEdit && source && (
                          <button
                            type="button"
                            className="project-info-edit"
                            disabled={busy}
                            onClick={() => onEditInfo(source, info.id)}
                          >
                            <Pencil size={13} />
                            Başlık Düzenle
                          </button>
                        )}
                      </div>
                      <ul>
                        {info.topics.map((topic) => {
                          const status = topicStatus(topic, today);
                          const selected =
                            editing?.projectId === project.id &&
                            editing.infoId === info.id &&
                            editing.topic.rangeIndex === topic.rangeIndex &&
                            editing.topic.noteIndex === topic.noteIndex;
                          return (
                            <li
                              key={`${topic.rangeIndex}-${topic.noteIndex}`}
                              className={
                                topic.completed ? "completed" : undefined
                              }
                              data-status={status}
                            >
                              <div className="project-info-topic">
                                <div className="project-info-topic-content">
                                  {selected ? (
                                    <div className="project-info-editor-fields">
                                      <label>
                                        Açıklama
                                        <textarea
                                          autoFocus
                                          rows={3}
                                          aria-label="Kritik detay konu açıklaması"
                                          value={editing.text}
                                          onChange={(event) => {
                                            setEditing({
                                              ...editing,
                                              text: event.target.value,
                                            });
                                            setError("");
                                          }}
                                          onKeyDown={(event) => {
                                            if (event.key === "Escape") {
                                              setEditing(null);
                                              setError("");
                                            }
                                          }}
                                        />
                                      </label>
                                      <div className="project-info-editor-dates">
                                        <label>
                                          Başlangıç Tarihi
                                          <input
                                            type="date"
                                            aria-label="Kritik detay konu başlangıç tarihi"
                                            min={
                                              source
                                                ? source.start + "-01"
                                                : undefined
                                            }
                                            max={source && monthEnd(source.end)}
                                            value={editing.start}
                                            onChange={(event) => {
                                              setEditing({
                                                ...editing,
                                                start: event.target.value,
                                              });
                                              setError("");
                                            }}
                                          />
                                        </label>
                                        <label>
                                          Bitiş Tarihi
                                          <input
                                            type="date"
                                            aria-label="Kritik detay konu bitiş tarihi"
                                            min={
                                              source
                                                ? source.start + "-01"
                                                : undefined
                                            }
                                            max={source && monthEnd(source.end)}
                                            value={editing.end}
                                            onChange={(event) => {
                                              setEditing({
                                                ...editing,
                                                end: event.target.value,
                                              });
                                              setError("");
                                            }}
                                          />
                                        </label>
                                      </div>
                                    </div>
                                  ) : (
                                    <>
                                      <span>{topic.text}</span>
                                      <small>
                                        {dateLabel(topic.start)} –{" "}
                                        {dateLabel(topic.end)}
                                      </small>
                                      <TopicWeeks
                                        weeks={topicWeeks(topic, today)}
                                        thisWeek={thisWeek}
                                        selected={weekKeys}
                                      />
                                      {topic.completed && (
                                        <em className="project-info-complete-label">
                                          Tamamlandı
                                        </em>
                                      )}
                                      {(status === "late" ||
                                        status === "active") && (
                                        <em
                                          className="project-info-status"
                                          data-status={status}
                                        >
                                          {STATUS_LABELS[status]}
                                        </em>
                                      )}
                                    </>
                                  )}
                                </div>
                                {canEdit && (
                                  <div className="project-info-topic-actions">
                                    {selected ? (
                                      <>
                                        <button
                                          type="button"
                                          disabled={busy}
                                          onClick={() =>
                                            void apply(
                                              project.id,
                                              info.id,
                                              topic,
                                              {
                                                text: editing.text,
                                                start: editing.start,
                                                end: editing.end,
                                              },
                                            )
                                          }
                                        >
                                          Kaydet
                                        </button>
                                        <button
                                          type="button"
                                          disabled={busy}
                                          onClick={() => {
                                            setEditing(null);
                                            setError("");
                                          }}
                                        >
                                          Vazgeç
                                        </button>
                                      </>
                                    ) : (
                                      <>
                                        <button
                                          type="button"
                                          className="complete"
                                          aria-pressed={!!topic.completed}
                                          title={
                                            topic.completed
                                              ? "Tamamlandı işaretini kaldır"
                                              : "Konuyu tamamlandı olarak işaretle"
                                          }
                                          disabled={busy}
                                          onClick={() =>
                                            void apply(
                                              project.id,
                                              info.id,
                                              topic,
                                              { completed: !topic.completed },
                                            )
                                          }
                                        >
                                          {!topic.completed && (
                                            <Check size={12} />
                                          )}{" "}
                                          {topic.completed
                                            ? "Geri Al"
                                            : "Tamamlandı"}
                                        </button>
                                        <button
                                          type="button"
                                          disabled={busy}
                                          onClick={() => {
                                            setEditing({
                                              projectId: project.id,
                                              infoId: info.id,
                                              topic,
                                              text: topic.text,
                                              start: topic.start,
                                              end: topic.end,
                                            });
                                            setError("");
                                          }}
                                        >
                                          Düzenle
                                        </button>
                                        <button
                                          type="button"
                                          className="remove"
                                          disabled={busy}
                                          onClick={() =>
                                            void apply(
                                              project.id,
                                              info.id,
                                              topic,
                                              { includeInReport: false },
                                            )
                                          }
                                        >
                                          Rapordan Çıkar
                                        </button>
                                      </>
                                    )}
                                  </div>
                                )}
                              </div>
                              {selected && error && (
                                <p
                                  role="alert"
                                  className="project-info-inline-error"
                                >
                                  {error}
                                </p>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}
              </article>
            );
          })}
        </div>
      ) : (
        <div className="emptymsg project-info-empty">
          <h3>Raporda henüz kritik konu yok</h3>
          <p>
            {canEdit
              ? "Kritik konular Projeler ekranındaki başlıklardan gelir. Bir başlığın notunu açıp “Rapora Ekle” kutusunu işaretlediğinizde not burada listelenir."
              : "Kritik konular Projeler ekranındaki başlıklardan gelir. Bir yönetici notu “Rapora Ekle” ile işaretlediğinde burada listelenir."}
          </p>
          {onOpenProjects && (
            <button
              type="button"
              className="button primary"
              onClick={onOpenProjects}
            >
              Projeler ekranına git
            </button>
          )}
        </div>
      )}
    </section>
  );
}

const WEEK_STATE_NOTES: Record<WeekState, string> = {
  current: "",
  history: " · önceki tarih planı",
  missed: " · kapatılmadan geçti",
};

/** Consecutive weeks in the same state; runs of three or more become one
 * "W33–W40" chip so long ranges stay on one line. */
function weekRuns(weeks: TopicWeek[]) {
  const runs: TopicWeek[][] = [];
  for (const item of weeks) {
    const run = runs.at(-1);
    const last = run?.at(-1);
    if (
      run &&
      last &&
      last.state === item.state &&
      shiftWeek(last.week, 1).key === item.week.key
    )
      run.push(item);
    else runs.push([item]);
  }
  return runs.flatMap((run) => (run.length >= 3 ? [run] : run.map((w) => [w])));
}

function TopicWeeks({
  weeks,
  thisWeek,
  selected,
}: {
  weeks: TopicWeek[];
  thisWeek: IsoWeek;
  selected: ReadonlySet<string>;
}) {
  if (!weeks.length) return null;
  const year = thisWeek.year;
  return (
    <span
      className="project-info-weeks"
      aria-label={
        "Haftalar: " +
        weeks
          .map(
            ({ week, state }) =>
              weekLabel(week, year) + WEEK_STATE_NOTES[state],
          )
          .join(", ")
      }
    >
      {weekRuns(weeks).map((run) => {
        const first = run[0].week,
          last = run.at(-1)!.week;
        return (
          <span
            key={first.key}
            className="project-info-week"
            data-state={run[0].state}
            data-current={
              run.some(({ week }) => week.key === thisWeek.key) || undefined
            }
            data-selected={
              run.some(({ week }) => selected.has(week.key)) || undefined
            }
            title={
              (run.length > 1
                ? `${weekDates(first)} … ${weekDates(last)}`
                : weekDates(first)) + WEEK_STATE_NOTES[run[0].state]
            }
          >
            {run.length > 1
              ? `${weekLabel(first, year)}–${weekLabel(last, year)} · ${run.length} hafta`
              : weekLabel(first, year)}
          </span>
        );
      })}
    </span>
  );
}
