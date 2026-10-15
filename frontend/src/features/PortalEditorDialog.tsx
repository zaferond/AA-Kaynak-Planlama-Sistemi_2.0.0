import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import type { Data, Team } from "../model";
import type { PortalEditor } from "./editor-state";
import ProjectEditorFields from "./editors/ProjectEditorFields";
import ProjectPhaseEditorFields from "./editors/ProjectPhaseEditorFields";
import MilestoneEditorFields from "./editors/MilestoneEditorFields";
import ResourceAccessFields from "./access/ResourceAccessFields";
import ResourceEditorFields from "./editors/ResourceEditorFields";
import BulkResourceEditorFields from "./editors/BulkResourceEditorFields";
type Props = {
  editor: PortalEditor | null;
  setEditor: Dispatch<SetStateAction<PortalEditor | null>>;
  saving: boolean;
  data: Data | null;
  setFormError: Dispatch<SetStateAction<string>>;
  leaderItems: { id: string; name: string }[];
  editTeams: Team[];
  chooseResourceStatus: (status: string) => void;
  resourceIds: string[];
  formError: string;
  deleteEditedMilestone: () => void;
  submit: () => Promise<void>;
  deleteProject: () => Promise<void>;
};
export default function PortalEditorDialog({
  editor,
  setEditor,
  saving,
  data,
  setFormError,
  leaderItems,
  editTeams,
  chooseResourceStatus,
  resourceIds,
  formError,
  deleteEditedMilestone,
  submit,
  deleteProject,
}: Props) {
  const returnFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (editor) return;
    const remember = (target: EventTarget | null) => {
      if (
        target instanceof HTMLElement &&
        target !== document.body &&
        target !== document.documentElement &&
        !target.closest('[role="dialog"]')
      )
        returnFocus.current = target;
    };
    remember(document.activeElement);
    const capture = (event: FocusEvent) => remember(event.target);
    document.addEventListener("focusin", capture);
    return () => document.removeEventListener("focusin", capture);
  }, [!!editor]);
  return (
    <Dialog
      open={!!editor}
      onOpenChange={(v) => {
        if (!v && !saving) setEditor(null);
      }}
    >
      <DialogContent
        {...(editor?.kind === "resource"
          ? { "aria-describedby": undefined }
          : {})}
        showCloseButton={!saving}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (returnFocus.current?.isConnected) returnFocus.current.focus();
        }}
        onEscapeKeyDown={(event) => {
          if (saving) event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          if (saving) event.preventDefault();
        }}
        className={
          "editor" +
          (editor?.kind === "projectPhase" || editor?.kind === "milestone"
            ? " timeline-editor"
            : "") +
          (editor?.kind === "bulkResources" ? " bulk-resource-editor" : "") +
          (editor?.kind === "resource" ? " employee-access-editor" : "")
        }
      >
        <DialogHeader>
          <DialogTitle>
            {editor?.kind === "project"
              ? editor.isNew
                ? "Proje Ekle"
                : "Proje Bilgilerini Düzenle"
              : editor?.kind === "projectPhase"
                ? "Aşamayı Düzenle"
                : editor?.kind === "milestone"
                  ? editor.isNew
                    ? "Başlık Ekle"
                    : "Başlık Düzenle"
                  : editor?.kind === "resource"
                    ? editor.isNew
                      ? "Kaynak Ekle"
                      : "Kaynağı Düzenle"
                    : "Seçilen Kaynakları Toplu Düzenle"}
          </DialogTitle>
          {editor?.kind !== "resource" && (
            <DialogDescription>
              {editor?.kind === "project"
                ? "Proje adını, sorumlusunu ve çalışma dönemini belirleyin."
                : editor?.kind === "projectPhase"
                  ? "Aşama metnini ve takvim rengini güncelleyin."
                  : editor?.kind === "milestone"
                    ? "Kritik detay konulara tarih aralığı veya tek tarihli Milestone ekleyin."
                    : editor?.kind === "bulkResources"
                      ? "Seçili kayıtların takımını, statüsünü ve planlama durumunu birlikte güncelleyin."
                      : "Düzenlemeler seçili planlama ayından itibaren uygulanır."}
            </DialogDescription>
          )}
        </DialogHeader>
        {editor && (
          <div
            className={
              "form" +
              (editor.kind === "resource" ? " resource-editor-form" : "") +
              (editor.kind === "bulkResources" ? " bulk-resource-form" : "") +
              (editor.kind === "projectPhase" || editor.kind === "milestone"
                ? " timeline-editor-form"
                : "")
            }
          >
            {editor.kind === "project" && (
              <ProjectEditorFields editor={editor} setEditor={setEditor} />
            )}
            {editor.kind === "projectPhase" && (
              <ProjectPhaseEditorFields editor={editor} setEditor={setEditor} />
            )}
            {editor.kind === "milestone" && (
              <MilestoneEditorFields
                editor={editor}
                setEditor={setEditor}
                data={data}
                setFormError={setFormError}
              />
            )}
            {editor.kind === "resource" && (
              <>
                <div className="employee-resource-fields">
                  <ResourceEditorFields
                    editor={editor}
                    setEditor={setEditor}
                    data={data}
                    leaderItems={leaderItems}
                    editTeams={editTeams}
                    chooseResourceStatus={chooseResourceStatus}
                  />
                </div>
                {data && (
                  <ResourceAccessFields
                    key={editor.value.id}
                    data={data}
                    editor={editor}
                    setEditor={setEditor}
                    busy={saving}
                  />
                )}
              </>
            )}
            {editor.kind === "bulkResources" && (
              <BulkResourceEditorFields
                editor={editor}
                setEditor={setEditor}
                data={data}
                leaderItems={leaderItems}
                editTeams={editTeams}
                resourceIds={resourceIds}
              />
            )}
            {formError && editor.kind !== "milestone" && (
              <p role="alert" className="negative">
                {formError}
              </p>
            )}
            {editor.kind === "projectPhase" ||
            editor.kind === "milestone" ||
            editor.kind === "bulkResources" ? (
              <div
                className={
                  editor.kind === "bulkResources"
                    ? "bulk-edit-actions"
                    : "timeline-editor-actions"
                }
              >
                {editor.kind === "milestone" && formError && (
                  <p role="alert" className="negative timeline-save-error">
                    {formError}
                  </p>
                )}
                {editor.kind === "milestone" && !editor.isNew && (
                  <button
                    type="button"
                    className="button deletebutton milestone-delete-button"
                    disabled={saving}
                    onClick={deleteEditedMilestone}
                  >
                    Kritik Konuyu Sil
                  </button>
                )}
                <button
                  type="button"
                  className="button"
                  disabled={saving}
                  onClick={() => setEditor(null)}
                >
                  Vazgeç
                </button>
                <button
                  type="button"
                  className="button primary"
                  disabled={saving}
                  onClick={submit}
                >
                  {saving ? "Kaydediliyor…" : "Kaydet"}
                </button>
              </div>
            ) : editor.kind === "resource" ? (
              <div className="resource-editor-actions">
                <button
                  type="button"
                  className="button"
                  disabled={saving}
                  onClick={() => setEditor(null)}
                >
                  Vazgeç
                </button>
                <button
                  type="button"
                  className="button primary"
                  disabled={saving}
                  onClick={submit}
                >
                  {saving ? "Kaydediliyor…" : "Kaydet"}
                </button>
              </div>
            ) : editor.kind === "project" && !editor.isNew ? (
              <div className="project-editor-actions">
                <button
                  type="button"
                  className="button deletebutton"
                  disabled={saving}
                  onClick={deleteProject}
                >
                  Projeyi Sil
                </button>
                <button
                  type="button"
                  className="button primary"
                  disabled={saving}
                  onClick={submit}
                >
                  {saving ? "Kaydediliyor…" : "Kaydet"}
                </button>
              </div>
            ) : (
              <button
                className="button primary"
                disabled={saving}
                onClick={submit}
              >
                {saving ? "Kaydediliyor…" : "Kaydet"}
              </button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
