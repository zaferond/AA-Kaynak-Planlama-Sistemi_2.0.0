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
import ProjectInfoTopicDialog, {
  type TopicEdit,
} from "./ProjectInfoTopicDialog";
import TopicWeeks from "./ProjectInfoWeeks";
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
type Editing = TopicEdit & { infoId: string };
type Props = {
  projects: Project[];
  canEdit: boolean;
  onSave: (project: Project) => Promise<void>;
  onAddInfo: (project: Project) => void;
  onEditInfo: (project: Project, infoId: string) => void;
  onOpenProjects?: () => void;
  progressBadge?: (projectId: string) => React.ReactNode;
};

export default function ProjectInfoReport({
  projects,
  canEdit,
  onSave,
  onAddInfo,
  onEditInfo,
  onOpenProjects,
  progressBadge,
}: Props) {
  const [editing, setEditing] = useState<Editing | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<TopicFilter>("all");
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const allGroups = useMemo(() => buildProjectInfoReport(projects), [projects]);
  // Project filter: "" shows every project. A project that no longer has
  // reported topics falls back to all.
  const [projectFilter, setProjectFilter] = useState("");
  const projectId = allGroups.some((project) => project.id === projectFilter)
    ? projectFilter
    : "";
  const groups = useMemo(
    () =>
      projectId
        ? allGroups.filter((project) => project.id === projectId)
        : allGroups,
    [allGroups, projectId],
  );
  const groupTopicCount = (project: (typeof allGroups)[number]) =>
    project.infos.reduce((count, info) => count + info.topics.length, 0);
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
  const topicCount = allGroups.reduce(
    (total, project) => total + groupTopicCount(project),
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
      if ("text" in change) setEditing(null);
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
          <h2>Haftalık Kritik Konular</h2>
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
                downloadProjectInfoReport(allGroups);
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
      {allGroups.length > 0 && (
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
          <div
            className="project-info-project-filter"
            data-active={projectId ? "true" : undefined}
          >
            <label>
              Proje
              <select
                aria-label="Proje süzgeci"
                value={projectId}
                onChange={(event) => {
                  const id = event.target.value;
                  setProjectFilter(id);
                  // A chosen project is always shown expanded.
                  if (id) toggleProject(id, true);
                }}
              >
                <option value="">Tüm projeler ({allGroups.length})</option>
                {allGroups.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name} ({groupTopicCount(project)})
                  </option>
                ))}
              </select>
            </label>
            {projectId && (
              <button
                type="button"
                className="project-info-project-clear"
                aria-label="Proje süzgecini kaldır"
                title="Tüm projeleri göster"
                onClick={() => setProjectFilter("")}
              >
                <X size={13} aria-hidden="true" />
              </button>
            )}
          </div>
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
          {projectId
            ? "Bu projede seçili süzgeçlere uyan konu yok."
            : "Bu durumda konu yok."}
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
                      {progressBadge?.(project.id)}
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
                                  <span>{topic.text}</span>
                                  {/* Dates and their weeks sit under the text. */}
                                  <div className="project-info-topic-meta">
                                    <small>
                                      {dateLabel(topic.start)} –{" "}
                                      {dateLabel(topic.end)}
                                    </small>
                                    <TopicWeeks
                                      weeks={topicWeeks(topic)}
                                      thisWeek={thisWeek}
                                      selected={weekKeys}
                                    />
                                  </div>
                                </div>
                                {(topic.completed ||
                                  status === "late" ||
                                  status === "active") && (
                                  <div className="project-info-topic-state">
                                    {topic.completed ? (
                                      <em className="project-info-complete-label">
                                        Tamamlandı
                                      </em>
                                    ) : (
                                      <em
                                        className="project-info-status"
                                        data-status={status}
                                      >
                                        {
                                          STATUS_LABELS[
                                            status as "late" | "active"
                                          ]
                                        }
                                      </em>
                                    )}
                                  </div>
                                )}
                                {canEdit && (
                                  <div className="project-info-topic-actions">
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
                                        disabled={busy || !source}
                                        onClick={() => {
                                          if (!source) return;
                                          setEditing({
                                            project: source,
                                            infoId: info.id,
                                            infoName: info.name,
                                            topic,
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
                                  </div>
                                )}
                              </div>
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
      <ProjectInfoTopicDialog
        edit={editing}
        today={today}
        busy={busy}
        error={error}
        onClose={() => {
          setEditing(null);
          setError("");
        }}
        onSave={(change) =>
          editing &&
          void apply(editing.project.id, editing.infoId, editing.topic, change)
        }
      />
    </section>
  );
}
