import type { ProjectProgress } from "../../../../shared/project-progress.ts";

export type PlanStatus = "pending" | "draft" | "new" | "approved";
export type EntryStatus = "needsPlan" | "closed" | "waiting" | "entered";

export const PLAN_STATUS_TITLE = "Hedef Plan Giriş Durumu";
export const ENTRY_STATUS_TITLE = "Geçekleşme Giriş Durumu";

export const PLAN_LABELS: Record<PlanStatus, string> = {
  pending: "Proje Ekibi Onayında",
  draft: "Taslak",
  new: "Hedef Plan Girişi Bekliyor",
  approved: "Onaylandı",
};
export const PLAN_HELP: Record<PlanStatus, string> = {
  pending:
    "Hedefler proje ekibi onayına gönderildi. Düzenlemek için önce onay talebini geri çekin.",
  draft:
    "Taslak kaydedildi; hedefler düzenlenebilir. Tamamlandığında proje ekibi onayına gönderin.",
  new: "Henüz kaydedilmiş bir hedef planı yok. Başlangıç yüzdesini ve aylık hedefleri hazırlayın.",
  approved:
    "Hedefler onaylandı ve gerçekleşen ilerlemenin karşılaştırılacağı plan oldu.",
};
export const ENTRY_LABELS: Record<EntryStatus, string> = {
  needsPlan: "Hedef Plan Proje Onayı Bekleniyor",
  closed: "Henüz girişe açık değil",
  waiting: "Gerçekleşen Durum Girişi Bekleniyor",
  entered: "Kaydedildi",
};
export const ENTRY_HELP: Record<EntryStatus, string> = {
  needsPlan:
    "Gerçekleşen girişi için önce hedef planının proje onayı tamamlanmalı.",
  closed:
    "Seçili ay planın takip döneminden önce veya gelecekte; bu aya gerçekleşen girilemez.",
  waiting:
    "Seçili ayın kümülatif gerçekleşen yüzdesi ve açıklaması henüz kaydedilmedi.",
  entered:
    "Seçili ayın gerçekleşen yüzdesi ve açıklaması kaydedildi. Ay kilitlenene kadar Gerçekleşen Oran Revize Et düğmesiyle düzenlenebilir. Gerçekleşen için ayrıca onay süreci yoktur.",
};

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
