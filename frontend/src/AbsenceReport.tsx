import type { Data } from "./model";
import { useMemo, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { absenceRangeRows } from "./features/work-calendar/absence-range-report";
import type { PersonalCalendarRange } from "./features/work-calendar/calendar-ranges";
import { preparePersonalRangeRemoval } from "./features/calendar-commands";
import { writeBatch } from "./storage";
import WorkCalendarDialog from "./WorkCalendarDialog";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";

const dateFormat = new Intl.DateTimeFormat("tr-TR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});
export default function AbsenceReport({
  data,
  teamIds,
  months,
  canEdit = false,
  onSaved,
}: {
  data: Data;
  teamIds: string[];
  months: string[];
  canEdit?: boolean;
  onSaved?: (data: Data) => void;
}) {
  const rows = useMemo(
    () => absenceRangeRows(data, teamIds, months),
    [data, teamIds, months],
  );
  const total = rows.reduce((sum, row) => sum + row.hours, 0);
  const [editing, setEditing] = useState<{
    resourceId: string;
    range: PersonalCalendarRange;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const editable = canEdit && !!onSaved;
  const selectedResource =
    data.resources.find((resource) => resource.id === editing?.resourceId) ||
    null;
  async function removeRange(row: (typeof rows)[number]) {
    if (!editable || busy) return;
    setBusy(true);
    setError("");
    try {
      onSaved!(
        await writeBatch(
          preparePersonalRangeRemoval(data, row.resource.id, row.range),
        ),
      );
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel absence-report">
      <div className="panelhead">
        <div>
          <h2>Çalışan İzin ve Eğitim Kayıtları</h2>
        </div>
        <div className="absence-report-summary">
          <strong>{rows.length}</strong> kayıt <span>·</span>{" "}
          <strong>{total.toLocaleString("tr-TR")}</strong> saat
        </div>
      </div>
      {rows.length ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ayrılış / Başlangıç</TableHead>
              <TableHead>Dönüş (Hariç)</TableHead>
              <TableHead>Çalışan</TableHead>
              <TableHead>Takım</TableHead>
              <TableHead>Tür</TableHead>
              <TableHead>Çalışma Günü</TableHead>
              <TableHead>Toplam Saat</TableHead>
              <TableHead>Açıklama</TableHead>
              {editable && <TableHead>İşlemler</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.key}>
                <TableCell>
                  {dateFormat.format(new Date(row.range.from + "T12:00:00"))}
                </TableCell>
                <TableCell>
                  {dateFormat.format(new Date(row.range.to + "T12:00:00"))}
                  {row.partial && (
                    <small className="absence-filtered-part">
                      Filtredeki günler hesaplandı
                    </small>
                  )}
                </TableCell>
                <TableCell>
                  <strong>{row.resource.name}</strong>
                </TableCell>
                <TableCell>{row.teamNames.join(", ")}</TableCell>
                <TableCell>
                  <span className={"absence-type " + row.range.entry.type}>
                    {row.range.entry.type === "leave" ? "İzin" : "Eğitim"}
                  </span>
                </TableCell>
                <TableCell>{row.days}</TableCell>
                <TableCell>{row.hours.toLocaleString("tr-TR")}</TableCell>
                <TableCell>{row.range.entry.label || "—"}</TableCell>
                {editable && (
                  <TableCell>
                    <div className="absence-range-actions">
                      <button
                        type="button"
                        className="button"
                        disabled={busy}
                        onClick={() => {
                          setError("");
                          setEditing({
                            resourceId: row.resource.id,
                            range: row.range,
                          });
                        }}
                        title="Aralığın tamamını düzenle"
                      >
                        <Pencil size={13} />
                        Düzenle
                      </button>
                      <button
                        type="button"
                        className="button danger"
                        disabled={busy}
                        onClick={() => void removeRange(row)}
                        title="Aralığın tamamını sil"
                      >
                        <Trash2 size={13} />
                        Sil
                      </button>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <p className="emptymsg">Seçili dönemde izin veya eğitim kaydı yok.</p>
      )}
      {error && (
        <p role="alert" className="work-calendar-error">
          {error}
        </p>
      )}
      {editing && selectedResource && (
        <WorkCalendarDialog
          open={true}
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
          data={data}
          mode="personal"
          resource={selectedResource}
          canEdit={false}
          canEditPersonal={editable}
          onSaved={(next) => onSaved?.(next)}
          initialYear={Number(editing.range.from.slice(0, 4))}
          initialPersonalRange={editing.range}
        />
      )}
    </section>
  );
}
