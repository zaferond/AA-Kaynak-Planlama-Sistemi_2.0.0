import ProjectResponsible from "../../ProjectResponsible";
import type { CSSProperties, Dispatch, SetStateAction } from "react";
import { fullDateLabel } from "../../format";
import {
  milestoneRanges,
  rangeNotes,
  visibleMilestoneBarStyle,
} from "../../milestone-ranges";
import MilestoneDateEditor from "../../MilestoneDateEditor";
import MilestoneDiamond from "../../MilestoneDiamond";
import { phasePalette, type Data } from "../../model";
import type { EditorFieldProps } from "./editor-field-props";
type Props = EditorFieldProps<"milestone"> & {
  data: Data | null;
  setFormError: Dispatch<SetStateAction<string>>;
};
export default function MilestoneEditorFields({
  editor,
  setEditor,
  data,
  setFormError,
}: Props) {
  return (
    <>
      <div className="phasecontext">
        <div>
          <small>PROJE</small>
          <strong>
            {data?.projects.find((p) => p.id === editor.projectId)?.name}
          </strong>
          <ProjectResponsible
            project={data?.projects.find((p) => p.id === editor.projectId)}
          />
        </div>
        <span>
          {data?.projects.find((p) => p.id === editor.projectId)?.start} –{" "}
          {data?.projects.find((p) => p.id === editor.projectId)?.end}
        </span>
      </div>
      <label>
        Başlık
        <input
          maxLength={200}
          autoFocus
          value={editor.value.name}
          onChange={(e) =>
            setEditor({
              ...editor,
              value: { ...editor.value, name: e.target.value },
            })
          }
        />
      </label>
      <MilestoneDateEditor
        value={editor.value}
        isEmpty={!!editor.draftEmpty}
        projectStart={
          data!.projects.find((p) => p.id === editor.projectId)!.start
        }
        projectEnd={data!.projects.find((p) => p.id === editor.projectId)!.end}
        onChange={(value, draftEmpty = false) => {
          setFormError("");
          setEditor({ ...editor, value, draftEmpty });
        }}
      />
      <fieldset className="milestone-style">
        <legend>Bar Görünümü</legend>
        <div className="milestone-bar-options">
          {(
            [
              ["solid", "Düz"],
              ["outline", "Çerçeveli"],
            ] as const
          ).map(([id, label]) => (
            <button
              type="button"
              key={id}
              className={
                visibleMilestoneBarStyle(editor.value.barStyle) === id
                  ? "selected"
                  : ""
              }
              aria-pressed={
                visibleMilestoneBarStyle(editor.value.barStyle) === id
              }
              onClick={() =>
                setEditor({
                  ...editor,
                  value: { ...editor.value, barStyle: id },
                })
              }
            >
              <span className={"sample " + id} />
              {label}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="timeline-live-preview">
        <span>TAKVİM ÖNİZLEMESİ</span>
        <div className="milestone-preview-list">
          {editor.draftEmpty && (
            <p className="milestone-preview-empty">
              Kritik detay konu eklenmedi. Başlığı bu haliyle kaydedebilirsiniz.
            </p>
          )}
          {(editor.draftEmpty ? [] : milestoneRanges(editor.value)).map(
            (range, index) => {
              const color =
                phasePalette.find((c) => c.id === range.color) ||
                phasePalette[3];
              return (
                <div key={index}>
                  <small>
                    {index + 1}.{" "}
                    {range.displayKind === "milestone"
                      ? "Milestone"
                      : "Tarih Aralığı"}
                  </small>
                  {range.displayKind === "milestone" ? (
                    <div className="milestone-point-preview">
                      <MilestoneDiamond
                        color={color.border}
                        style={range.diamondStyle}
                      />
                      <strong>
                        {rangeNotes(range)[0]?.text || editor.value.name}
                      </strong>
                      <small>{fullDateLabel(range.start)}</small>
                    </div>
                  ) : (
                    <div
                      className={
                        "timeline-milestone-preview " +
                        visibleMilestoneBarStyle(editor.value.barStyle)
                      }
                      style={
                        {
                          "--preview-color": color.border,
                          "--preview-soft": color.bg,
                          "--preview-ink": color.ink,
                        } as CSSProperties
                      }
                    >
                      <ul className="milestone-preview-notes">
                        {(rangeNotes(range).filter((note) => note.text.trim())
                          .length
                          ? rangeNotes(range)
                              .filter((note) => note.text.trim())
                              .map((note) => note.text)
                          : [editor.value.name || "Kritik Konu"]
                        ).map((text, noteIndex) => (
                          <li key={noteIndex}>{text}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              );
            },
          )}
        </div>
        <small>
          Her açıklama ve renk kendi tarih aralığının barında gösterilir.
        </small>
      </div>
    </>
  );
}
