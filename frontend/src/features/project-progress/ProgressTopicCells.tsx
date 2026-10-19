import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Project } from "../../model";
import { monthLabel } from "../../format";
import { phaseChipPalette } from "../../phase-chip";
import { positionPointerTooltip } from "../position-pointer-tooltip";
import { topicsIn, type Topic } from "./progress-topics";

const day = (date: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(date)
    ? `${date.slice(8, 10)}.${date.slice(5, 7)}.${date.slice(0, 4)}`
    : date;
const accent = (color: string) =>
  phaseChipPalette.find((item) => item.id === color)?.accent || "#7b8794";

/** The same critical-topic cells and accessible tooltip in both progress views. */
export default function ProgressTopicCells({
  project,
  months,
  currentMonth,
  selectedMonth,
}: {
  project: Project;
  months: string[];
  currentMonth?: string;
  selectedMonth?: string;
}) {
  const tipRef = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<Topic[] | null>(null);
  const showTip = (topics: Topic[], x: number, y: number) => {
    setTip(topics);
    requestAnimationFrame(() => positionPointerTooltip(tipRef.current, x, y));
  };
  const mark = (month: string) => ({
    "data-month": month,
    "data-now": month === currentMonth ? "true" : undefined,
    "data-selected": month === selectedMonth ? "true" : undefined,
  });
  return (
    <>
      {months.map((m) => {
        const topics = topicsIn(project, m);
        const bars = topics.filter((t) => !t.point);
        const points = topics.filter((t) => t.point);
        return (
          <td
            key={m}
            {...mark(m)}
            data-has-topics={topics.length ? "true" : undefined}
            tabIndex={topics.length ? 0 : undefined}
            aria-label={
              topics.length
                ? `${monthLabel(m)}: ${topics.map((t) => t.name).join(", ")}`
                : undefined
            }
            onMouseEnter={(e) =>
              topics.length && showTip(topics, e.clientX, e.clientY)
            }
            onMouseMove={(e) =>
              tip &&
              positionPointerTooltip(tipRef.current, e.clientX, e.clientY)
            }
            onMouseLeave={() => setTip(null)}
            onFocus={(e) => {
              const box = e.currentTarget.getBoundingClientRect();
              if (topics.length) showTip(topics, box.left, box.bottom);
            }}
            onBlur={() => setTip(null)}
          >
            {bars.slice(0, 3).map((t, i) => (
              <i
                key={i}
                className="progress-topic-bar"
                style={{ background: accent(t.color) }}
              />
            ))}
            {points.length > 0 && (
              <b style={{ color: accent(points[0].color) }} aria-hidden="true">
                ◆
              </b>
            )}
          </td>
        );
      })}
      {tip &&
        createPortal(
          <div
            ref={tipRef}
            className="project-phase-tooltip progress-topic-tip"
            role="tooltip"
          >
            {tip.map((t, i) => (
              <div key={i}>
                <strong>
                  {t.point ? "◆ " : "▬ "}
                  {t.name}
                </strong>
                <span>
                  {t.point || t.start === t.end
                    ? day(t.start)
                    : `${day(t.start)} – ${day(t.end)}`}
                </span>
                {t.note && t.note !== t.name && <small>{t.note}</small>}
              </div>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
