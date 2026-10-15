import { useMemo, useState } from "react";
import { ArrowDownToLine, Check, Pencil, Plus } from "lucide-react";
import type { Project } from "./model";
import {
  buildProjectInfoReport,
  updateReportedTopic,
  type ReportTopic,
} from "./project-info-report";
import { downloadProjectInfoReport } from "./project-info-report-export";

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
};

export default function ProjectInfoReport({
  projects,
  canEdit,
  onSave,
  onAddInfo,
  onEditInfo,
}: Props) {
  const [editing, setEditing] = useState<Editing | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const groups = useMemo(() => buildProjectInfoReport(projects), [projects]);
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
        <button
          type="button"
          className="button project-info-export"
          disabled={!topicCount}
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
      </div>
      {error && !editing && (
        <p role="alert" className="project-info-error">
          {error}
        </p>
      )}
      {groups.length ? (
        <div className="project-info-groups">
          {groups.map((project) => {
            const source = projects.find((item) => item.id === project.id);
            const projectTopicCount = project.infos.reduce(
              (count, info) => count + info.topics.length,
              0,
            );
            return (
              <article className="project-info-group" key={project.id}>
                <header>
                  <div className="project-info-project-title">
                    <span
                      className="project-info-project-mark"
                      aria-hidden="true"
                    />
                    <div>
                      <h3>{project.name}</h3>
                      <small>
                        {project.infos.length} kritik konu · {projectTopicCount}{" "}
                        detay konu
                      </small>
                    </div>
                  </div>
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
                {project.infos.map((info, infoIndex) => (
                  <div className="project-info-entry" key={info.id}>
                    <div className="project-info-entry-heading">
                      <div className="project-info-entry-title">
                        <span className="project-info-entry-index">
                          {String(infoIndex + 1).padStart(2, "0")}
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
                                    {topic.completed && (
                                      <em className="project-info-complete-label">
                                        Tamamlandı
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
        <p className="emptymsg">
          Henüz “Rapora Ekle” seçili açıklama bulunmuyor.
        </p>
      )}
    </section>
  );
}
