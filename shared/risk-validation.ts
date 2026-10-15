import type { Risk } from "./model.ts";
import { riskAssessment } from "./risk-score.ts";

export function riskValidationError(risk: Risk): string | null {
  if (!risk.description.trim() || !risk.reportedBy.trim() || !risk.reportedAt)
    return "Risk tanımı, bildirim yapan birim/sorumlu ve bildirim tarihi zorunludur.";
  if (!riskAssessment(risk.likelihood, risk.impact))
    return "İlk değerlendirme için 1–5 arası olasılık ve etki seçin.";
  if ((risk.residualLikelihood === null) !== (risk.residualImpact === null))
    return "Aksiyon sonrası olasılık ve etki birlikte girilmeli.";
  if (risk.residualLikelihood !== null && !risk.implementedAt)
    return "Aksiyon sonrası değerlendirme için devreye alınma tarihi girin.";
  return null;
}
