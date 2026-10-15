import type { Dispatch, SetStateAction } from "react";
import type { PortalEditor } from "../editor-state";

export type EditorFieldProps<K extends PortalEditor["kind"]> = {
  editor: Extract<PortalEditor, { kind: K }>;
  setEditor: Dispatch<SetStateAction<PortalEditor | null>>;
};
