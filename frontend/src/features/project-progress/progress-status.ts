import type { ProjectProgress } from "../../../../shared/project-progress.ts";

export type PlanStatus = "pending" | "draft" | "new" | "approved";
export type EntryStatus = "needsPlan" | "closed" | "waiting" | "entered";

export const PLAN_STATUS_TITLE = "Hedef Plan Durumu";
export const ENTRY_STATUS_TITLE = "Gerçekleşen Plan Durumu";

export const PLAN_LABELS: Record<PlanStatus, string> = {
  pending: "Proje Ekibi Onayında",
  draft: "Taslak",
  new: "Yönetici Girişi Bekleniyor",
  approved: "Proje Ekibi Onayladı",
};
export const PLAN_HELP: Record<PlanStatus, string> = {
  pending:
    "Hedefler proje ekibi onayına gönderildi. Düzenlemek için önce onay talebini geri çekin.",
  draft:
    "Taslak kaydedildi; hedefler düzenlenebilir. Tamamlandığında proje ekibi onayına gönderin.",
  new: "Yönetici henüz hedef planını kaydetmedi. Başlangıç yüzdesini ve aylık hedefleri hazırlayıp proje ekibi onayına gönderin.",
  approved:
    "Proje ekibi hedef planını onayladı. Takip dönemindeki mevcut ve geçmiş ayların gerçekleşen yüzdesi girilebilir.",
};
export const ENTRY_LABELS: Record<Exclude<EntryStatus, "needsPlan">, string> = {
  closed: "Henüz girişe açık değil",
  waiting: "Yönetici Girişi Bekleniyor",
  entered: "Tamamlandı",
};
const ENTRY_HELP: Record<Exclude<EntryStatus, "needsPlan">, string> = {
  closed:
    "Seçili ay planın takip döneminden önce veya gelecekte; bu aya gerçekleşen girilemez.",
  waiting:
    "Seçili ayın kümülatif gerçekleşen yüzdesi ve açıklaması henüz kaydedilmedi.",
  entered:
    "Seçili ayın gerçekleşen yüzdesi ve açıklaması kaydedildi. Ay kilitlenene kadar Gerçekleşen Oran Revize Et düğmesiyle düzenlenebilir. Gerçekleşen için ayrıca onay süreci yoktur.",
};

/** Show actual progress only after plan approval; include editing availability. */
export function entryPresentation(status: EntryStatus, locked: boolean) {
  if (status === "needsPlan") return null;
  const tracked = status === "waiting" || status === "entered";
  const suffix =
    status === "entered"
      ? ` - Değişikliğe ${locked ? "Kapalı" : "Açık"}`
      : status === "waiting" && locked
        ? " - Değişikliğe Kapalı"
        : "";
  return {
    label: ENTRY_LABELS[status] + suffix,
    status: locked && tracked ? "locked" : status,
    help:
      locked && tracked
        ? (status === "entered"
            ? "Seçili ayın gerçekleşen yüzdesi ve açıklaması kaydedildi."
            : "Seçili ayın gerçekleşen yüzdesi ve açıklaması henüz kaydedilmedi.") +
          " Seçili ay değişikliğe kapalı; giriş veya revizyon yapılamaz. Kilidi yalnız sistem yöneticisi açabilir."
        : ENTRY_HELP[status],
  };
}

/** An existing approved plan stays valid while its revision is prepared. */
export function baselineStatus(record?: ProjectProgress): PlanStatus {
  if (record?.proposal)
    return record.proposal.status === "pending" ? "pending" : "draft";
  return record?.baselines.length ? "approved" : "new";
}

/** Entry completeness and month locking are independent. */
export function entryStatus(
  record: ProjectProgress | undefined,
  month: string,
  currentMonth: string,
): EntryStatus {
  if (!record?.baselines.length) return "needsPlan";
  if (
    !month ||
    month <= record.baselines[0].openingMonth ||
    month > currentMonth
  )
    return "closed";
  return record.actuals[month] ? "entered" : "waiting";
}

export const entryIsEditable = (status: EntryStatus, locked: boolean) =>
  !locked && (status === "waiting" || status === "entered");
