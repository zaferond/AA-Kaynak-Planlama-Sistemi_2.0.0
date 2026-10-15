import { fail } from "./auth.mjs";
import { riskSystemSchema } from "../shared/server-domain.ts";
import {
  assertUniqueRiskSystemName,
  riskUsesSystem,
} from "../shared/risk-system-policy.ts";

// Draft-only handlers. The batch orchestrator checks permissions and the current
// revision before calling; Store validates/persists/audits the final transaction.
export function stageRiskSystemChange(d, { id, value, operation }) {
  d.riskSystems ??= [];
  const previous = d.riskSystems.find((item) => item.id === id);
  if (operation) {
    if (!previous) fail(404, "Sistem / alt sistem bulunamadı.");
    if ((d.risks || []).some((risk) => riskUsesSystem(risk, previous)))
      fail(
        409,
        "Risk kayıtlarında kullanılan sistem / alt sistem silinemez. Önce ilgili risklerin seçimini değiştirin.",
      );
    d.riskSystems = d.riskSystems.filter((item) => item.id !== id);
  } else {
    const next = riskSystemSchema.parse(value);
    if (next.id !== id) fail(400, "Sistem / alt sistem kimliği eşleşmiyor.");
    try {
      assertUniqueRiskSystemName(d.riskSystems, next);
    } catch (error) {
      fail(400, error.message);
    }
    if (previous && previous.name !== next.name) {
      for (const risk of d.risks || [])
        if (riskUsesSystem(risk, previous)) {
          risk.system = next.name;
          risk.systemId = id;
          risk.updatedAt = new Date().toISOString();
          d.revisions["risk:" + risk.id] =
            (d.revisions["risk:" + risk.id] || 0) + 1;
        }
    }
    d.riskSystems = [...d.riskSystems.filter((item) => item.id !== id), next];
  }
}

// existingRisk is the record read by the orchestrator for this command's access
// check, never a caller-supplied value. Creation metadata remains server-owned.
export function stageRiskChange(d, u, { id, value, operation }, existingRisk) {
  d.risks ??= [];
  if (operation) {
    if (!existingRisk) fail(404, "Risk kaydı bulunamadı.");
    d.risks = d.risks.filter((item) => item.id !== id);
  } else {
    if (!value || value.id !== id) fail(400, "Risk kimliği eşleşmiyor.");
    if (existingRisk && value.projectId !== existingRisk.projectId)
      fail(400, "Risk başka projeye taşınamaz.");
    if (!d.projects.some((item) => item.id === value.projectId))
      fail(404, "Proje bulunamadı.");
    const now = new Date().toISOString();
    const next = {
      ...value,
      createdBy: existingRisk?.createdBy || u._id,
      createdByName: existingRisk?.createdByName || u.name,
      createdAt: existingRisk?.createdAt || now,
      updatedAt: now,
    };
    d.risks = [...d.risks.filter((item) => item.id !== id), next];
  }
}
