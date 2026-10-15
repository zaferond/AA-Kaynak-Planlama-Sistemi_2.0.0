import type { EditorFieldProps } from "./editor-field-props";
type Props = EditorFieldProps<"project">;
export default function ProjectEditorFields({ editor, setEditor }: Props) {
  return (
    <>
      <label>
        Proje Adı
        <input
          value={editor.value.name}
          onChange={(e) =>
            setEditor({
              ...editor,
              value: { ...editor.value, name: e.target.value },
            })
          }
        />
      </label>
      <label>
        Proje Kodu
        <input
          maxLength={100}
          value={editor.value.code || ""}
          onChange={(e) =>
            setEditor({
              ...editor,
              value: { ...editor.value, code: e.target.value },
            })
          }
        />
      </label>
      <label>
        Proje Sorumlusu
        <input
          maxLength={200}
          value={editor.value.responsibleName || ""}
          onChange={(e) =>
            setEditor({
              ...editor,
              value: {
                ...editor.value,
                responsibleName: e.target.value,
              },
            })
          }
        />
      </label>
      <div className="formrow">
        {(["start", "end"] as const).map((k) => (
          <label key={k}>
            {k === "start" ? "Başlangıç Ayı" : "Bitiş Ayı"}
            <input
              type="month"
              value={editor.value[k]}
              onChange={(e) =>
                setEditor({
                  ...editor,
                  value: { ...editor.value, [k]: e.target.value },
                })
              }
            />
          </label>
        ))}
      </div>
    </>
  );
}
