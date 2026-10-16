import type { ReportProject, ReportTopic } from "./project-info-report.ts";
import { weekFromKey, weeksInRange, type IsoWeek } from "./iso-week.ts";

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

export type WeekState = "current" | "history" | "missed";
export type TopicWeek = { week: IsoWeek; state: WeekState };
/** Selected week keys; empty means every week. */
export type WeekSelection = ReadonlySet<string>;

/**
 * Weeks to show on a topic: its current range plus weeks it covered under
 * earlier dates. A week is "missed" once it has ended while the topic stayed
 * open; a slipped week (earlier dates) stays missed even after the topic is
 * closed, because it was not closed in that week.
 */
export function topicWeeks(topic: ReportTopic, today: string): TopicWeek[] {
  const current = weeksInRange(topic.start, topic.end);
  const currentKeys = new Set(current.map((week) => week.key));
  const history = (topic.weekHistory || [])
    .filter((key) => !currentKeys.has(key))
    .flatMap((key) => weekFromKey(key) || []);
  return [
    ...current.map((week) => ({ week, inCurrent: true })),
    ...history.map((week) => ({ week, inCurrent: false })),
  ]
    .sort((a, b) => a.week.key.localeCompare(b.week.key))
    .map(({ week, inCurrent }) => ({
      week,
      state:
        week.end < today && (!topic.completed || !inCurrent)
          ? "missed"
          : inCurrent
            ? "current"
            : "history",
    }));
}

/** A topic belongs to every week it covers now or covered before. */
export function topicInWeeks(topic: ReportTopic, selected: WeekSelection) {
  if (!selected.size) return true;
  if (topic.weekHistory?.some((key) => selected.has(key))) return true;
  return weeksInRange(topic.start, topic.end).some((week) =>
    selected.has(week.key),
  );
}

/** Weeks that hold at least one topic, with their topic counts. */
export function reportWeeks(groups: ReportProject[]) {
  const weeks = new Map<string, { week: IsoWeek; count: number }>();
  for (const project of groups)
    for (const info of project.infos)
      for (const topic of info.topics) {
        const keys = new Map(
          weeksInRange(topic.start, topic.end).map((week) => [week.key, week]),
        );
        for (const key of topic.weekHistory || []) {
          const week = weekFromKey(key);
          if (week) keys.set(key, week);
        }
        for (const week of keys.values()) {
          const entry = weeks.get(week.key) || { week, count: 0 };
          entry.count++;
          weeks.set(week.key, entry);
        }
      }
  return [...weeks.values()].sort((a, b) =>
    a.week.key.localeCompare(b.week.key),
  );
}

export function topicFilterCounts(
  groups: ReportProject[],
  today: string,
  selected: WeekSelection = new Set(),
) {
  const counts: Record<TopicFilter, number> = {
    all: 0,
    open: 0,
    late: 0,
    done: 0,
  };
  for (const project of groups)
    for (const info of project.infos)
      for (const topic of info.topics) {
        if (!topicInWeeks(topic, selected)) continue;
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
  selected: WeekSelection = new Set(),
) {
  const narrowed = filter !== "all" || selected.size > 0;
  return groups
    .map((project) => ({
      ...project,
      infos: project.infos
        .map((info, index) => ({
          ...info,
          index,
          topics: info.topics.filter(
            (topic) =>
              topicInWeeks(topic, selected) &&
              matchesTopicFilter(topicStatus(topic, today), filter),
          ),
        }))
        .filter((info) => !narrowed || info.topics.length),
    }))
    .filter((project) => !narrowed || project.infos.length);
}
