import type { Data, Resource } from "../../model";
import type {
  addCalendarDates,
  preparePersonalRangeChanges,
} from "../calendar-commands";
import type { PersonalCalendarRange } from "./calendar-ranges";

export type WorkCalendarDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: Data;
  mode: "shared" | "personal";
  resource: Resource | null;
  canEdit: boolean;
  canEditPersonal: boolean;
  onSaved: (data: Data) => void;
  initialYear: number;
  initialPersonalRange?: PersonalCalendarRange;
};
export type SharedCalendarForm = Parameters<typeof addCalendarDates>[1];
export type PersonalCalendarForm = Parameters<
  typeof preparePersonalRangeChanges
>[2];
