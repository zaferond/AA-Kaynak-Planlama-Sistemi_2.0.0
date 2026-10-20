import { z } from "zod";
import { fail } from "./auth.mjs";
import { warningConfigSchema } from "../shared/scenario-warning-schema.ts";

export function stageWarningConfigChange(
  data,
  user,
  { id, value, operation },
  now = new Date(),
) {
  if (user.role !== "admin")
    fail(403, "Uyarı ayarlarını yalnız sistem yöneticisi değiştirebilir.");
  if (operation || id !== "global")
    fail(400, "Uyarı ayarları silinemez; geçerli ayarları kaydedin.");
  const parsed = warningConfigSchema.safeParse(value);
  if (!parsed.success)
    fail(400, parsed.error.issues[0]?.message || "Uyarı ayarları geçersiz.");
  if (parsed.data.id !== id) fail(400, "Uyarı ayarı kimliği eşleşmiyor.");
  data.warningConfigs = [
    {
      ...parsed.data,
      updatedAt: now.toISOString(),
      updatedById: user._id,
      updatedByName: user.name || user.username || user._id,
    },
  ];
}

export function stageScenarioWarningChange(
  data,
  user,
  { id, value, operation },
  canSeeProject,
  now = new Date(),
) {
  if (!["admin", "manager"].includes(user.role))
    fail(403, "Uyarı durumunu değiştirme yetkiniz yok.");
  const existing = data.scenarioWarnings?.find((w) => w.id === id);
  if (!existing) fail(404, "Senaryo uyarısı bulunamadı.");
  if (!canSeeProject(existing.projectId))
    fail(403, "Bu projeyi görüntüleme yetkiniz yok.");
  if (operation) fail(400, "Uyarı geçmişi silinemez.");
  const parsed = z
    .object({
      status: z.enum(["seen", "acted"]),
      explanation: z.string().trim().max(3000),
    })
    .strict()
    .safeParse(value);
  if (!parsed.success) fail(400, "Uyarı durumu veya açıklaması geçersiz.");
  const { status, explanation } = parsed.data;
  if (
    (existing.status !== "open" || status !== "seen") &&
    (existing.status !== "seen" || status !== "acted")
  )
    fail(
      409,
      "Uyarı sırasıyla Açık → Görüldü → Aksiyon Alındı durumlarına geçirilebilir.",
    );
  if (status === "acted" && !explanation)
    fail(400, "Aksiyon alındığında açıklama zorunludur.");
  const at = now.toISOString();
  data.scenarioWarnings = data.scenarioWarnings.map((w) =>
    w.id === id
      ? {
          ...w,
          status,
          updatedAt: at,
          history: [
            ...w.history,
            {
              status,
              explanation,
              at,
              byId: user._id,
              byName: user.name || user.username || user._id,
            },
          ],
        }
      : w,
  );
}
