import type { ReportProject, ReportTopic } from "./project-info-report";

/** done: marked complete · late: end passed while open · active: today is
 * inside the range · planned: not started yet. */
export type TopicStatus = "done" | "late" | "active" | "planned";
export type TopicFilter = "all" | "open" | "late" | "done";

export const TOPIC_FILTERS: { value: TopicFilter; label: string }[] = [
  { value: "all", label: "Tümü" },
  { value: "open", label: "Açık" },
  { value: "late", label: "Gecikmiş" },
  { value: "done", label: "Tamamlandı" },
];

export function topicStatus(topic: ReportTopic, today: string): TopicStatus {
  if (topic.completed) return "done";
  if (topic.end && topic.end < today) return "late";
  if (topic.start && topic.start <= today) return "active";
  return "planned";
}

export function matchesTopicFilter(status: TopicStatus, filter: TopicFilter) {
  if (filter === "all") return true;
  if (filter === "done") return status === "done";
  if (filter === "late") return status === "late";
  return status !== "done";
}

export function topicFilterCounts(groups: ReportProject[], today: string) {
  const counts: Record<TopicFilter, number> = {
    all: 0,
    open: 0,
    late: 0,
    done: 0,
  };
  for (const project of groups)
    for (const info of project.infos)
      for (const topic of info.topics) {
        const status = topicStatus(topic, today);
        for (const { value } of TOPIC_FILTERS)
          if (matchesTopicFilter(status, value)) counts[value]++;
      }
  return counts;
}

/** Keeps each heading's original number; empty headings and projects drop. */
export function filterReportGroups(
  groups: ReportProject[],
  filter: TopicFilter,
  today: string,
) {
  return groups
    .map((project) => ({
      ...project,
      infos: project.infos
        .map((info, index) => ({
          ...info,
          index,
          topics: info.topics.filter((topic) =>
            matchesTopicFilter(topicStatus(topic, today), filter),
          ),
        }))
        .filter((info) => filter === "all" || info.topics.length),
    }))
    .filter((project) => filter === "all" || project.infos.length);
}
