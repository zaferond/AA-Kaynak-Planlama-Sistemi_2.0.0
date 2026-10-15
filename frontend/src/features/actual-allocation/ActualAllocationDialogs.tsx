import type { Data, Resource } from "../../model";
import { phaseChipStyle } from "../../phase-chip";
import ProjectResponsible from "../../ProjectResponsible";
import WorkCalendarDialog from "../../WorkCalendarDialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type {
  ActualCalendarMode,
  ActualCellSelection,
  ActualPhaseDetail,
} from "./types";
import type { ActualCapacityDialog } from "./useActualCapacityDialog";
import { fullMonthFormat } from "./format";

const limitMessage =
  "Girdiğiniz değer kişinin çalışma süresinin %100'ünü aşılmasına neden olmaktadır. Lütfen çalışma süresini tekrar değerlendirerek düşürünüz.";
const hoursLimitMessage =
  "Girdiğiniz yeni aylık çalışma saati kaydedilemez. Mevcut proje dağılımları yeni girilen çalışma saatinin %100'ünü aşmaktadır. Yeni girmek istediğiniz çalışma saatine güncellenebilmesi için öncelikle kaynak dağılımını azaltmanız, sonrasında çalışma saatini güncellemeniz gerekmektedir.";

export default function ActualAllocationDialogs({
  data,
  calendarMode,
  calendarPerson,
  canEditCalendar,
  ownResourceId,
  onSaved,
  selectedCell,
  currentMonth,
  onCalendarClose,
  limit,
  phaseDetail,
  onPhaseClose,
}: {
  data: Data;
  calendarMode: ActualCalendarMode;
  calendarPerson: Resource | null;
  canEditCalendar: boolean;
  ownResourceId?: string;
  onSaved: (data: Data) => void;
  selectedCell: ActualCellSelection | null;
  currentMonth: string;
  onCalendarClose: () => void;
  limit: ActualCapacityDialog;
  phaseDetail: ActualPhaseDetail | null;
  onPhaseClose: () => void;
}) {
  return (
    <>
      <WorkCalendarDialog
        open={calendarMode !== null}
        onOpenChange={(open) => {
          if (!open) {
            onCalendarClose();
          }
        }}
        data={data}
        mode={calendarMode || "personal"}
        resource={calendarPerson}
        canEdit={canEditCalendar}
        canEditPersonal={
          !!calendarPerson &&
          (canEditCalendar || calendarPerson.id === ownResourceId)
        }
        onSaved={onSaved}
        initialYear={Number((selectedCell?.month || currentMonth).slice(0, 4))}
      />
      <Dialog open={limit.open} onOpenChange={limit.onOpenChange}>
        <DialogContent
          className="actual-limit-dialog"
          onCloseAutoFocus={limit.onCloseAutoFocus}
        >
          <DialogHeader>
            <DialogTitle>
              {limit.kind === "hours"
                ? "Çalışma Saati Sınırı"
                : "Kaynak Dağılımı Sınırı"}
            </DialogTitle>
            <DialogDescription>
              {limit.kind === "hours" ? hoursLimitMessage : limitMessage}
            </DialogDescription>
          </DialogHeader>
          <div className="actual-limit-actions">
            <button
              type="button"
              className="button primary"
              onClick={limit.close}
            >
              Tamam
            </button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!phaseDetail}
        onOpenChange={(open) => {
          if (!open) onPhaseClose();
        }}
      >
        <DialogContent className="editor phasedetail">
          <DialogHeader>
            <DialogTitle>
              {phaseDetail?.project.name}
              <ProjectResponsible project={phaseDetail?.project} />
            </DialogTitle>
            <DialogDescription>
              {phaseDetail &&
                fullMonthFormat.format(
                  new Date(phaseDetail.month + "-01T12:00:00"),
                ) +
                  " " +
                  phaseDetail.month.slice(0, 4)}
            </DialogDescription>
          </DialogHeader>
          {phaseDetail && (
            <div
              className="phasedetailtext phase-chip phase-chip-detail"
              style={phaseChipStyle(phaseDetail.project, phaseDetail.month)}
            >
              {phaseDetail.project.phases[phaseDetail.month]}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
