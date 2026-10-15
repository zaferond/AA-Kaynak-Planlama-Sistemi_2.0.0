import { useEffect, useRef, useState } from "react";
import type { DragEvent, KeyboardEvent } from "react";
import type { Project } from "../model";

export function useProjectRowOrder(
  projects: readonly Project[],
  enabled: boolean,
  saving: boolean,
  reorder: (
    sourceId: string,
    targetId: string,
    after: boolean,
    expected: string[],
  ) => void,
) {
  const [sourceId, setSourceId] = useState("");
  const [target, setTarget] = useState<{ id: string; after: boolean } | null>(
    null,
  );
  const expected = useRef<string[]>([]);
  const orderKey = projects.map((p) => p.id).join("|");
  function clear() {
    setSourceId("");
    setTarget(null);
    expected.current = [];
  }
  useEffect(clear, [orderKey, enabled, saving]);
  function rowProps(id: string) {
    return {
      dragging: sourceId === id,
      dropPosition:
        target?.id === id ? (target.after ? "after" : "before") : null,
      onDragStart(event: DragEvent<HTMLButtonElement>) {
        if (!enabled || saving) {
          event.preventDefault();
          return;
        }
        expected.current = projects.map((p) => p.id);
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("application/x-aa-project", id);
        setSourceId(id);
      },
      onDragEnd: clear,
      onDragOver(event: DragEvent<HTMLTableRowElement>) {
        if (!enabled || saving || !sourceId) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        if (sourceId === id) {
          setTarget(null);
          return;
        }
        const rect = event.currentTarget.getBoundingClientRect();
        setTarget({ id, after: event.clientY > rect.top + rect.height / 2 });
      },
      onDrop(event: DragEvent<HTMLTableRowElement>) {
        if (!enabled || saving || !sourceId) return;
        event.preventDefault();
        const rect = event.currentTarget.getBoundingClientRect();
        reorder(
          sourceId,
          id,
          event.clientY > rect.top + rect.height / 2,
          expected.current,
        );
        clear();
      },
      onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
        if (!enabled || saving || !event.altKey) return;
        const offset =
          event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;
        if (!offset) return;
        event.preventDefault();
        const next = projects[projects.findIndex((p) => p.id === id) + offset];
        if (next)
          reorder(
            id,
            next.id,
            offset > 0,
            projects.map((p) => p.id),
          );
      },
    };
  }
  return { rowProps };
}
