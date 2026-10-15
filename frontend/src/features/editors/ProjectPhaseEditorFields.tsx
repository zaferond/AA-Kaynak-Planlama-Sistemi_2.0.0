import { monthLabel } from "../../format";
import {
  phaseChipPalette as phasePalette,
  phaseChipStyle,
} from "../../phase-chip";
import ProjectResponsible from "../../ProjectResponsible";
import type { EditorFieldProps } from "./editor-field-props";
type Props = EditorFieldProps<"projectPhase">;
export default function ProjectPhaseEditorFields({ editor, setEditor }: Props) {
  return (
    <>
      <div className="phasecontext">
        <div>
          <small>PROJE</small>
          <strong>{editor.value.name}</strong>
          <ProjectResponsible project={editor.value} />
        </div>
        <span>{monthLabel(editor.phaseMonth)}</span>
      </div>
      <label>
        Aşama Metni
        <textarea
          rows={4}
          autoFocus
          placeholder="Bu ayın proje aşamasını yazın"
          value={editor.value.phases[editor.phaseMonth] || ""}
          onChange={(e) =>
            setEditor({
              ...editor,
              value: {
                ...editor.value,
                phases: {
                  ...editor.value.phases,
                  [editor.phaseMonth]: e.target.value,
                },
              },
            })
          }
        />
      </label>
      <fieldset className="timeline-fieldset">
        <legend>Aşama Rengi</legend>
        <div className="palette">
          {phasePalette.map((c) => (
            <label
              key={c.id}
              style={{
                background: c.bg,
                color: c.ink,
                borderColor: c.border,
              }}
            >
              <input
                type="radio"
                name="phasecolor"
                checked={
                  (editor.value.phaseColors?.[editor.phaseMonth] ||
                    (editor.value.phases[editor.phaseMonth]?.trim()
                      ? "blue"
                      : "gray")) === c.id
                }
                onChange={() =>
                  setEditor({
                    ...editor,
                    value: {
                      ...editor.value,
                      phaseColors: {
                        ...editor.value.phaseColors,
                        [editor.phaseMonth]: c.id,
                      },
                    },
                  })
                }
              />
              {c.name}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="timeline-live-preview">
        <span>TAKVİM ÖNİZLEMESİ</span>
        <div
          className="timeline-phase-preview phase-chip phase-chip-preview"
          style={phaseChipStyle(editor.value, editor.phaseMonth)}
        >
          {editor.value.phases[editor.phaseMonth] ||
            "Aşama metni burada görünecek"}
        </div>
      </div>
    </>
  );
}
