import type { Data } from "../../../shared/model.ts";
import type { EditorRevisions } from "./editor-state.ts";

/** A draft owns its opening revisions. Allocation/risk maps are not copied. */
export function captureEditorRevisions(data: Data): EditorRevisions {
  return Object.fromEntries(
    Object.entries(data.revisions).filter(([key]) =>
      /^(project|resource|team):/.test(key),
    ),
  );
}

export function editorRevision(
  base: EditorRevisions,
  kind: string,
  id: string,
) {
  return base[kind + ":" + id] || 0;
}
