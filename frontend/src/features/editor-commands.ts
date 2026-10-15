import { directoryEmployeeName } from "./access/employee-access-draft.ts";
import {
  resourceRole,
  assertUniqueResourceResponsibilities,
} from "../../../shared/resource-roles.ts";
import { ownValue } from "../../../shared/records.ts";
import type {
  Change,
  ChangeKind,
  ChangeValues,
} from "../../../shared/commands.ts";
import {
  withVersion,
  type Resource,
  type Data,
  type Milestone,
} from "../../../shared/model.ts";
import {
  assertMilestoneDateRanges,
  cleanMilestoneRanges,
  milestoneRanges,
  withMilestoneRanges,
  withoutCriticalTopics,
} from "../../../shared/milestone-ranges.ts";
import {
  resourceVersionForEdit,
  resourceVersionForSave,
} from "../../../shared/resource-version-edit.ts";
import { assertResourceDates } from "../../../shared/resource-policy.ts";
import type { PortalEditor } from "./editor-state.ts";
import type { EditorRevisions } from "./editor-state.ts";
import { editorRevision } from "./editor-revisions.ts";

type EditorContext = { start: string; resourceIds: readonly string[] };

function command<K extends ChangeKind>(
  base: EditorRevisions,
  kind: K,
  id: string,
  value: ChangeValues[K],
): Change<K> {
  return { kind, id, value, revision: editorRevision(base, kind, id) };
}

function milestoneChanges(
  data: Data,
  editor: Extract<PortalEditor, { kind: "milestone" }>,
): Change[] {
  const changes: Change[] = [];

  const project = data.projects.find((p) => p.id === editor.projectId);
  if (!project) throw Error("Proje bulunamadı.");
  const draft: Milestone = {
    ...editor.value,
    name: String(editor.value.name).trim(),
    barText: String(editor.value.barText || "").trim(),
  };
  if (!draft.name) throw Error("Başlık girin.");
  if (draft.name.length > 200) throw Error("Başlık 200 karakteri geçemez.");
  let milestone: Milestone;
  if (editor.draftEmpty) milestone = withoutCriticalTopics(draft);
  else {
    const ranges = milestoneRanges(draft).sort(
      (a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end),
    );
    assertMilestoneDateRanges(project, ranges);
    milestone = withMilestoneRanges(draft, cleanMilestoneRanges(ranges));
  }
  const existing = project.milestones || [];
  if (!editor.isNew && !existing.some((m) => m.id === milestone.id))
    throw Error("Kritik konu bulunamadı. Verileri yenileyip tekrar deneyin.");
  const milestones = existing.some((m) => m.id === milestone.id)
    ? existing.map((m) => (m.id === milestone.id ? milestone : m))
    : [...existing, milestone];
  changes.push(
    command(editor.baseRevisions, "project", project.id, {
      ...project,
      milestones,
    }),
  );

  return changes;
}

function projectChanges(
  editor: Extract<PortalEditor, { kind: "project" | "projectPhase" }>,
): Change[] {
  const changes: Change[] = [];

  if (
    editor.kind === "projectPhase" &&
    (editor.phaseMonth < editor.value.start ||
      editor.phaseMonth > editor.value.end)
  )
    throw Error("Aşama ayı proje dönemi içinde olmalı.");
  changes.push(
    command(editor.baseRevisions, "project", editor.value.id, editor.value),
  );

  return changes;
}

function resourceChanges(
  data: Data,
  editor: Extract<PortalEditor, { kind: "resource" }>,
  start: string,
): Change[] {
  const changes: Change[] = [];

  const posting =
    editor.version.status === "Aktif İlan" ||
    editor.version.status === "Pasif İlan";
  const passivePosting = editor.version.status === "Pasif İlan";
  const assignmentKind = posting
    ? "member"
    : editor.assignmentKind || resourceRole(data, editor.version);
  const selectedTeam = data.teams.find(
    (team) => team.id === editor.version.team,
  );
  const selectedVersion = {
    ...editor.version,
    lead:
      assignmentKind === "leader"
        ? editor.version.lead || ""
        : selectedTeam?.lead || "",
    assignmentRole: posting ? undefined : assignmentKind,
    ...(passivePosting ? { start: "", end: "", included: false } : {}),
    team:
      assignmentKind === "leader"
        ? ownValue(data.leadershipUnits, editor.version.lead || "") || ""
        : editor.version.team,
  };
  if (
    assignmentKind === "leader" &&
    (!selectedVersion.lead || !selectedVersion.team)
  )
    throw Error(
      "Liderlik seçin. Liderlik kaynak satırı yoksa güncel listeyi yükleyin.",
    );
  if (
    !posting &&
    assignmentKind !== "leader" &&
    data.teams.find((team) => team.id === selectedVersion.team)?.kind ===
      "leadership"
  )
    throw Error("Product Owner, Team Member ve CoE için bir takım seçin.");
  const directoryName = directoryEmployeeName(data, editor.account?.form);
  if (directoryName === "") throw Error("Active Directory kullanıcısı seçin.");
  const namedResource =
    directoryName === undefined
      ? editor.value
      : { ...editor.value, name: directoryName };
  const { resource: resourceForSave, version: v } = resourceVersionForSave(
    posting && !namedResource.name.trim()
      ? { ...namedResource, name: editor.version.status }
      : namedResource,
    selectedVersion,
    editor.isNew,
    start,
  );
  assertResourceDates(v);
  if (!v.team) throw Error("Takım seçin.");
  const t = data.teams.find((t) => t.id === v.team);
  if (!t)
    throw Error("Seçilen takım bulunamadı. Verileri yenileyip tekrar deneyin.");
  if (t.lead && t.lead !== v.lead)
    throw Error("Seçilen takım bu liderliğe bağlı değil.");
  changes.push(
    command(
      editor.baseRevisions,
      "resource",
      editor.value.id,
      withVersion(resourceForSave, v),
    ),
  );

  return changes;
}

function bulkResourceChanges(
  data: Data,
  editor: Extract<PortalEditor, { kind: "bulkResources" }>,
  resourceIds: readonly string[],
): Change[] {
  const changes: Change[] = [];

  if (!resourceIds.length) throw Error("En az bir kayıt seçin.");
  if (!editor.team && !editor.status && editor.included === "keep")
    throw Error("Değiştirilecek en az bir alan seçin.");
  const t = editor.team ? data.teams.find((t) => t.id === editor.team) : null;
  if (editor.team && !t)
    throw Error("Seçilen takım bulunamadı. Verileri yenileyip tekrar deneyin.");
  const leader = t ? t.lead || editor.lead : "";
  if (t && !t.lead && leader)
    changes.push(
      command(editor.baseRevisions, "team", t.id, { ...t, lead: leader }),
    );
  for (const id of new Set(resourceIds)) {
    const r = data.resources.find((x) => x.id === id);
    if (!r)
      throw Error(
        "Seçilen kaynak bulunamadı. Verileri yenileyip tekrar deneyin.",
      );
    const old = resourceVersionForEdit(r, editor.effective);
    const v = {
      ...old,
      ...(t
        ? {
            team: t.id,
            lead: leader,
            assignmentRole:
              t.kind === "leadership"
                ? ("leader" as const)
                : resourceRole(data, old) === "leader"
                  ? ("member" as const)
                  : resourceRole(data, old),
          }
        : {}),
      ...(editor.status ? { status: editor.status } : {}),
      ...(editor.included !== "keep"
        ? { included: editor.included === "yes" }
        : {}),
    };
    try {
      assertResourceDates(v);
    } catch (error) {
      throw Error(r.name + ": " + (error as Error).message);
    }
    changes.push(
      command(editor.baseRevisions, "resource", id, withVersion(r, v)),
    );
  }

  return changes;
}

/** Prepare a complete, revision-aware batch without mutating data or performing I/O.
 * Server authorization and validation remain authoritative when the batch is saved.
 */
export function prepareEditorChanges(
  data: Data,
  editor: PortalEditor,
  context: EditorContext,
): Change[] {
  let changes: Change[];
  switch (editor.kind) {
    case "milestone":
      changes = milestoneChanges(data, editor);
      break;
    case "project":
    case "projectPhase":
      changes = projectChanges(editor);
      break;
    case "resource":
      changes = resourceChanges(data, editor, context.start);
      break;
    case "bulkResources":
      changes = bulkResourceChanges(data, editor, context.resourceIds);
      break;
  }
  const updates = changes.filter((change) => change.kind === "resource");
  if (updates.length) {
    const resources = new Map(
      data.resources.map((person) => [person.id, person]),
    );
    for (const update of updates)
      resources.set(update.id, update.value as Resource);
    assertUniqueResourceResponsibilities(
      { teams: data.teams, resources: [...resources.values()] },
      new Map(
        data.resources.map((person) => [
          person.id,
          new Map(
            person.versions.map((version) => [version.effective, version]),
          ),
        ]),
      ),
    );
  }
  return changes;
}
