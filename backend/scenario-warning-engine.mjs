import { assessProjectWarning } from "../shared/scenario-warnings.ts";
import {
  warningAssessmentSchema,
  scenarioWarningSchema,
} from "../shared/scenario-warning-schema.ts";
import { leaderResourceByMonth } from "../shared/project-progress.ts";

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const automaticEvent = (status, explanation, at) => ({
  status,
  explanation,
  at,
  byId: "system",
  byName: "Sistem",
});

/** Legacy approvals have no resource history. Capture once, visibly marked. */
export function captureLegacyResourceReferences(
  data,
  { referenceData = data, now = new Date() } = {},
) {
  let changed = 0;
  const records = (data.projectProgress || []).map((record) => {
    if (record.baselines.every((b) => b.resourceReference)) return record;
    const old = referenceData.projectProgress?.find((r) => r.id === record.id);
    const baselines = record.baselines.map((baseline) => {
      if (baseline.resourceReference) return baseline;
      const original = old?.baselines.find(
        (b) => b.version === baseline.version,
      );
      const source = original ? referenceData : data;
      const project = source.projects.find((p) => p.id === record.projectId);
      const reference = original || baseline;
      const planned =
        leaderResourceByMonth(
          source.teams,
          source.allocations || {},
          record.projectId,
        ).get(record.leader) || {};
      const resourceTotal = Object.entries(planned).reduce(
        (n, [month, value]) =>
          n +
          (month > reference.openingMonth && (!project || month <= project.end)
            ? value
            : 0),
        0,
      );
      return {
        ...baseline,
        resourceReference: {
          resourceTotal,
          workPct: 100 - reference.openingPct,
          capturedAt: now.toISOString(),
          source: "migration",
        },
      };
    });
    const key = "progress:" + record.id;
    data.revisions[key] = (data.revisions[key] || 0) + 1;
    changed++;
    return { ...record, baselines };
  });
  if (changed) data.projectProgress = records;
  return changed;
}

/** Server-owned assessments/history; replace arrays immutably for planning drafts. */
export function synchronizeScenarioWarnings(data, now = new Date()) {
  if (
    !data.progressLocks?.length &&
    !data.warningAssessments?.length &&
    !data.scenarioWarnings?.length
  )
    return 0;
  const at = now.toISOString();
  let changed = 0;
  const bump = (kind, id) => {
    const key = kind + ":" + id;
    data.revisions[key] = (data.revisions[key] || 0) + 1;
    changed++;
  };
  const previous = new Map(
    (data.warningAssessments || []).map((a) => [a.id, a]),
  );
  const sources = new Map(
    data.projects.map((p) => [p.id, { planned: new Map(), records: [] }]),
  );
  const teamLeaders = new Map(data.teams.map((t) => [t.id, t.lead]));
  for (const [key, amount] of Object.entries(data.allocations || {})) {
    const [team, project, month] = key.split("|"),
      leader = teamLeaders.get(team),
      source = sources.get(project);
    if (!source || !leader || !amount) continue;
    const values = source.planned.get(leader) || {};
    values[month] = (values[month] || 0) + amount;
    source.planned.set(leader, values);
  }
  for (const record of data.projectProgress || [])
    sources.get(record.projectId)?.records.push(record);
  const assessments = data.projects.map((project) =>
    warningAssessmentSchema.parse(
      assessProjectWarning(data, project, undefined, sources.get(project.id)),
    ),
  );
  for (const value of assessments)
    if (!same(value, previous.get(value.id)))
      bump("warningAssessment", value.id);
  const validProjectIds = new Set(data.projects.map((p) => p.id));
  for (const old of previous.values())
    if (!validProjectIds.has(old.id)) bump("warningAssessment", old.id);
  if (changed) data.warningAssessments = assessments;
  const active = new Map(
    assessments
      .filter((a) => a.status === "ready" && a.month)
      .map((a) => {
        const ruleKey = a.code || "P-" + a.progressState;
        return [
          a.id,
          { assessment: a, ruleKey, id: `${a.id}|${ruleKey}|${a.month}` },
        ];
      }),
  );
  const warnings = (data.scenarioWarnings || []).map((old) => {
    const current = active.get(old.projectId);
    if (old.status !== "closed" && current?.id !== old.id) {
      bump("scenarioWarning", old.id);
      return {
        ...old,
        status: "closed",
        updatedAt: at,
        history: [
          ...old.history,
          automaticEvent(
            "closed",
            current
              ? "Senaryo veya değerlendirme ayı değişti."
              : "Proje tamamlandı veya değerlendirme koşulları artık sağlanmıyor.",
            at,
          ),
        ],
      };
    }
    return old;
  });
  const index = new Map(warnings.map((w, i) => [w.id, i]));
  for (const { assessment, ruleKey, id } of active.values()) {
    const i = index.get(id),
      old = i === undefined ? undefined : warnings[i];
    if (old) {
      const reopen =
        old.status === "closed" ||
        old.assessment.progressState !== assessment.progressState;
      const next = {
        ...old,
        code: assessment.code,
        warning1: assessment.warning1,
        warning2: assessment.warning2,
        assessment,
        ...(reopen
          ? {
              status: "open",
              history: [
                ...old.history,
                automaticEvent("open", "Değerlendirme yeniden açıldı.", at),
              ],
            }
          : {}),
      };
      if (!same(old, next)) {
        next.updatedAt = at;
        warnings[i] = next;
        bump("scenarioWarning", id);
      }
    } else {
      warnings.push({
        id,
        projectId: assessment.id,
        ruleKey,
        code: assessment.code,
        month: assessment.month,
        warning1: assessment.warning1,
        warning2: assessment.warning2,
        status: "open",
        assessment,
        createdAt: at,
        updatedAt: at,
        history: [
          automaticEvent("open", "Son kilitli aya göre oluşturuldu.", at),
        ],
      });
      bump("scenarioWarning", id);
    }
  }
  if (changed)
    data.scenarioWarnings = warnings.map((w) => scenarioWarningSchema.parse(w));
  return changed;
}
