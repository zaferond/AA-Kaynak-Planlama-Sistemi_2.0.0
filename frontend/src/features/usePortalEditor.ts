import {
  accountForm,
  employeePermission,
} from "./access/employee-access-draft";
import type { EmployeePermission } from "../../../shared/employee-account";
import { isResponsibilityConflict } from "../../../shared/resource-roles";
import { useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { Change } from "../../../shared/commands";
import {
  monthsFrom,
  isWorkingStatus,
  type Data,
  type Project,
  type Milestone,
  type Resource,
} from "../model";
import { visibleMilestoneBarStyle } from "../milestone-ranges";
import { currentYearStartDate } from "../resource-dates";
import { resourceVersionForEdit } from "../resource-version-edit";
import { prepareEditorChanges } from "./editor-commands";
import type { PortalEditor } from "./editor-state";
import { captureEditorRevisions, editorRevision } from "./editor-revisions";

type Props = {
  data: Data | null;
  isAdmin: boolean;
  saving: boolean;
  start: string;
  count: number;
  leads: string[];
  resourceIds: string[];
  batch: (changes: Change[]) => Promise<void>;
  saveEmployee: (
    changes: Change[],
    permission: EmployeePermission,
  ) => Promise<void>;
  onProjectDeleted: (id: string) => void;
  onSubmitted: () => void;
  setError: Dispatch<SetStateAction<string>>;
  setNotice: Dispatch<SetStateAction<string>>;
};

/** Own draft state and editor actions; persistence remains in the workspace batch service. */
export function usePortalEditor({
  data,
  isAdmin,
  saving,
  start,
  count,
  leads,
  resourceIds,
  batch,
  saveEmployee,
  onProjectDeleted,
  onSubmitted,
  setError,
  setNotice,
}: Props) {
  const [editor, setEditor] = useState<PortalEditor | null>(null);
  const [formError, setFormError] = useState("");
  const months = useMemo(() => monthsFrom(start, count), [start, count]);
  function openProject(p?: Project, m?: string) {
    if (!isAdmin || !data) return;
    const baseRevisions = captureEditorRevisions(data);
    setFormError("");
    if (p && m)
      setEditor({
        kind: "projectPhase",
        baseRevisions,
        value: structuredClone(p),
        phaseMonth: m,
      });
    else
      setEditor({
        kind: "project",
        baseRevisions,
        isNew: !p,
        value: p
          ? structuredClone(p)
          : {
              id: crypto.randomUUID(),
              name: "",
              responsibleName: "",
              start,
              end: monthsFrom(start, count)[count - 1],
              phases: {},
              phaseColors: {},
              milestones: [],
            },
      });
  }
  async function deleteProject() {
    if (
      !data ||
      !isAdmin ||
      saving ||
      editor?.kind !== "project" ||
      editor.isNew
    )
      return;
    const project = data.projects.find((p) => p.id === editor.value.id);
    if (!project) {
      setFormError("Proje bulunamadı. Verileri yenileyip tekrar deneyin.");
      return;
    }
    const planned = Object.keys(data.allocations).filter(
      (key) => key.split("|")[1] === project.id,
    ).length;
    const actual = Object.keys(data.actualAllocations || {}).filter(
      (key) => key.split("|")[1] === project.id,
    ).length;
    if (
      !confirm(
        `“${project.name}” projesi silinsin mi?\n\nBu projeye bağlı ${planned} planlanan ve ${actual} gerçekleşen kaynak dağılımı kaydı, yüzde girişleri, aşamalar ve kritik proje konuları da kalıcı olarak silinecek.\n\nDiğer projelerin kayıtları korunur. İşlemi geri almak için silme öncesi veri yedeği gerekir.`,
      )
    )
      return;
    setFormError("");
    try {
      await batch([
        {
          kind: "project",
          id: project.id,
          value: null,
          revision: editorRevision(editor.baseRevisions, "project", project.id),
          operation: "delete",
        },
      ]);
      setEditor(null);
      onProjectDeleted(project.id);
      setNotice(
        `“${project.name}” projesi ve bağlı kaynak dağılımları silindi.`,
      );
    } catch (e) {
      setFormError((e as Error).message);
    }
  }
  function openMilestone(project: Project, milestone?: Milestone) {
    if (!isAdmin || !data) return;
    setFormError("");
    const first =
      months.find((month) => month >= project.start && month <= project.end) ||
      project.start;
    setEditor({
      kind: "milestone",
      baseRevisions: captureEditorRevisions(data),
      projectId: project.id,
      isNew: !milestone,
      draftEmpty: !milestone || milestone.hasCriticalTopics === false,
      value: milestone
        ? {
            ...structuredClone(milestone),
            barStyle: visibleMilestoneBarStyle(milestone.barStyle),
          }
        : {
            id: crypto.randomUUID(),
            name: "",
            start: first + "-01",
            end: first + "-01",
            barColor: "red",
            barStyle: "outline",
            barText: "",
          },
    });
  }
  async function deleteMilestone(project: Project, milestone: Milestone) {
    if (!data || !isAdmin || saving) return;
    const current = data.projects.find((item) => item.id === project.id);
    if (!current?.milestones?.some((item) => item.id === milestone.id)) {
      const message =
        "Kritik konu bulunamadı. Verileri yenileyip tekrar deneyin.";
      if (editor?.kind === "milestone" && editor.value?.id === milestone.id)
        setFormError(message);
      else setError(message);
      return;
    }
    if (
      !confirm(
        "“" +
          milestone.name +
          "” kritik konusu tüm tarih aralıkları ve açıklamalarıyla silinsin mi?",
      )
    )
      return;
    try {
      await batch([
        {
          kind: "project",
          id: current.id,
          revision:
            editor?.kind === "milestone" && editor.projectId === current.id
              ? editorRevision(editor.baseRevisions, "project", current.id)
              : data.revisions["project:" + current.id] || 0,
          value: {
            ...current,
            milestones: current.milestones.filter(
              (item) => item.id !== milestone.id,
            ),
          },
        },
      ]);
      setEditor((active: PortalEditor | null) =>
        active?.kind === "milestone" && active.value?.id === milestone.id
          ? null
          : active,
      );
      setNotice("Kritik konu ve bağlı açıklamaları silindi.");
    } catch (e) {
      if (editor?.kind === "milestone" && editor.value?.id === milestone.id)
        setFormError((e as Error).message);
      else setError((e as Error).message);
    }
  }
  function deleteEditedMilestone() {
    if (!data || editor?.kind !== "milestone" || editor.isNew) return;
    const project = data.projects.find((item) => item.id === editor.projectId);
    const milestone = project?.milestones?.find(
      (item) => item.id === editor.value.id,
    );
    if (!project || !milestone) {
      setFormError(
        "Kritik konu bulunamadı. Verileri yenileyip tekrar deneyin.",
      );
      return;
    }
    void deleteMilestone(project, milestone);
  }
  function openResource(r?: Resource) {
    if (!isAdmin || !data) return;
    setFormError("");
    const v = r
      ? resourceVersionForEdit(r, start)
      : {
          effective: start,
          team: "",
          lead: leads.length === 1 ? leads[0] : "",
          status: "Aktif Çalışan",
          included: true,
          start: currentYearStartDate(),
          end: "",
          amount: 1,
        };
    const workStart =
      !v.start && isWorkingStatus(v.status) ? currentYearStartDate() : v.start;
    setEditor({
      kind: "resource",
      account: {
        form: r
          ? accountForm(
              data,
              data.users?.find((u) => u.resourceId === r.id)?.id || "",
            )
          : null,
        changed: false,
      },
      baseRevisions: captureEditorRevisions(data),
      isNew: !r,
      value: r
        ? structuredClone(r)
        : { id: crypto.randomUUID(), name: "", note: "", versions: [] },
      version: {
        ...v,
        start: workStart,
        lead: v.lead || data?.teams.find((t) => t.id === v.team)?.lead || "",
      },
    });
  }
  function chooseResourceStatus(status: string) {
    if (
      editor?.kind !== "resource" ||
      !status ||
      status === editor.version.status
    )
      return;
    const posting = status === "Aktif İlan" || status === "Pasif İlan";
    const previousPosting =
      editor.version.status === "Aktif İlan" ||
      editor.version.status === "Pasif İlan";
    setEditor({
      ...editor,
      version: {
        ...editor.version,
        status,
        included: !posting,
        start: posting
          ? ""
          : previousPosting || !editor.version.start
            ? currentYearStartDate()
            : editor.version.start,
        end:
          editor.version.status === "İşten Ayrıldı" ? "" : editor.version.end,
      },
    });
  }
  function openBulk() {
    if (!isAdmin || !data) return;
    setFormError("");
    setEditor({
      kind: "bulkResources",
      baseRevisions: captureEditorRevisions(data),
      effective: start,
      team: "",
      lead: "",
      status: "",
      included: "keep",
    });
  }
  async function submit() {
    if (!data || !editor) return;
    setFormError("");
    try {
      const changes = prepareEditorChanges(data, editor, {
        start,
        resourceIds,
      });
      const permission =
        editor.kind === "resource"
          ? employeePermission(editor.account, editor.value.id, data)
          : undefined;
      if (permission) await saveEmployee(changes, permission);
      else await batch(changes);
      setEditor(null);
      onSubmitted();
    } catch (e) {
      setFormError((e as Error).message);
      if (isResponsibilityConflict(e)) window.alert(e.message);
    }
  }
  return {
    editor,
    setEditor,
    formError,
    setFormError,
    openProject,
    deleteProject,
    openMilestone,
    deleteMilestone,
    deleteEditedMilestone,
    openResource,
    chooseResourceStatus,
    openBulk,
    submit,
  };
}
