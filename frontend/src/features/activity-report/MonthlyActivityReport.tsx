import { useEffect, useMemo, useRef, useState } from "react";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import type { Team } from "../../model";
import { DEFAULT_MONTHLY_HOURS, type ActualUnit } from "../../actual-units";
import { fmt, fullDateLabel, monthLabel, shortDateFormat } from "../../format";
import {
  activityValue,
  type ActivityRow,
  type ActivityMonth,
} from "./activity-report-data";

const PAGE_SIZE = 100;
const PERSON_COLUMN_WIDTH = 112;
const LABEL_COLUMNS_WIDTH = 124 + 124 + PERSON_COLUMN_WIDTH;
const states = {
  working: "",
  "before-start": "İşbaşı öncesi",
  departed: "İşten Ayrıldı",
  "other-team": "Bu ay başka takımda",
  future: "Gelecek ay",
};
function cellTitle(cell: ActivityMonth) {
  return [
    monthLabel(cell.month),
    states[cell.state],
    cell.start ? "İşbaşı: " + fullDateLabel(cell.start) : "",
    cell.end ? "Ayrılış: " + fullDateLabel(cell.end) : "",
    "Proje aktiviteleri: " +
      fmt(cell.projectFte * DEFAULT_MONTHLY_HOURS) +
      " saat",
    "Eğitim: " + fmt(cell.trainingHours) + " saat",
    "Çalışma kapasitesi: " + fmt(cell.effectiveHours) + " saat",
    cell.totalFte > 0 && cell.effectiveHours === 0
      ? "Çalışma kapasitesi sıfır; yüzde hesaplanamaz. Saat/gün görünümünü kullanın."
      : "",
  ]
    .filter(Boolean)
    .join(" · ");
}
export default function MonthlyActivityReport({
  rows: allRows,
  teams,
  months,
  todayDate,
}: {
  rows: ActivityRow[];
  teams: Team[];
  months: string[];
  todayDate: string;
}) {
  const [unit, setUnit] = useState<ActualUnit>("percent");
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [teams, months, allRows]);
  const rows = useMemo(() => {
    const ids = new Set(teams.map((team) => team.id));
    return allRows.filter((row) => ids.has(row.teamId));
  }, [allRows, teams]);
  const years = [...new Set(months.map((month) => month.slice(0, 4)))];
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const activePage = Math.min(page, pages - 1);
  const people = new Set(rows.map((row) => row.resourceId)).size;
  const visibleRows = rows.slice(
    activePage * PAGE_SIZE,
    (activePage + 1) * PAGE_SIZE,
  );
  const reportRef = useRef<HTMLElement>(null);
  const [monthWidth, setMonthWidth] = useState(64);
  useEffect(() => {
    const panel = reportRef.current;
    if (!panel) return;
    const update = () =>
      setMonthWidth(
        Math.max(
          42,
          Math.floor(
            (panel.clientWidth - LABEL_COLUMNS_WIDTH - 18) /
              Math.min(months.length || 12, 12),
          ),
        ),
      );
    update();
    const observer = new ResizeObserver(update);
    observer.observe(panel);
    return () => observer.disconnect();
  }, [months.length]);
  return (
    <section
      ref={reportRef}
      className="panel monthly-activity-report"
      aria-label="Aylık Aktivite Raporu"
    >
      <div className="activity-toolbar">
        <div>
          <h2>Aylık Aktivite Raporu</h2>
          <span>
            {people} çalışan · {new Set(rows.map((row) => row.teamId)).size}{" "}
            takım
          </span>
        </div>
        <label>
          Gösterim{" "}
          <select
            aria-label="Aktivite raporu birimi"
            value={unit}
            onChange={(e) => setUnit(e.target.value as ActualUnit)}
          >
            <option value="percent">Yüzde (%)</option>
            <option value="hours">Saat</option>
          </select>
        </label>
      </div>
      <Table
        className="activity-matrix"
        aria-label="Çalışanların aylık aktiviteleri"
        todayDate={todayDate}
        todayMonthsKey={months.join("|")}
        style={{ width: LABEL_COLUMNS_WIDTH + months.length * monthWidth }}
      >
        <colgroup>
          <col style={{ width: 124 }} />
          <col style={{ width: 124 }} />
          <col style={{ width: PERSON_COLUMN_WIDTH }} />
          {months.map((month) => (
            <col key={month} style={{ width: monthWidth }} />
          ))}
        </colgroup>
        <TableHeader>
          <TableRow className="activity-year-row">
            <TableHead colSpan={3} className="activity-year-label">
              Çalışan / Dönem
            </TableHead>
            {years.map((year, index) => (
              <TableHead
                key={year}
                colSpan={months.filter((m) => m.startsWith(year)).length}
                className={"year-band-" + (index % 6)}
              >
                {year}
              </TableHead>
            ))}
          </TableRow>
          <TableRow className="activity-month-row">
            <TableHead className="activity-lead">Liderlik</TableHead>
            <TableHead className="activity-team">Takım</TableHead>
            <TableHead className="activity-person">Çalışan</TableHead>
            {months.map((month) => (
              <TableHead
                key={month}
                data-month={month}
                title={monthLabel(month)}
                className={
                  "year-band-" + (years.indexOf(month.slice(0, 4)) % 6)
                }
              >
                {shortDateFormat.format(new Date(month + "-01T12:00:00"))}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {visibleRows.map((row, index) => {
            const previous = rows[activePage * PAGE_SIZE + index - 1];
            return (
              <TableRow
                key={row.key}
                data-activity-resource={row.resourceId}
                className={
                  !previous || previous.lead !== row.lead
                    ? "activity-lead-start"
                    : previous.teamId !== row.teamId
                      ? "activity-team-start"
                      : ""
                }
              >
                <TableCell className="activity-lead" title={row.lead}>
                  {row.lead}
                </TableCell>
                <TableCell className="activity-team" title={row.team}>
                  {row.team}
                </TableCell>
                <TableCell className="activity-person" title={row.name}>
                  {row.name}
                </TableCell>
                {row.cells.map((cell) => {
                  const value = activityValue(cell, unit);
                  return (
                    <TableCell
                      key={cell.month}
                      data-activity-month={cell.month}
                      data-employment-state={cell.state}
                      className={
                        "activity-value " +
                        (cell.totalFte > 0 ? "has-activity " : "") +
                        "activity-" +
                        cell.state
                      }
                      title={cellTitle(cell)}
                    >
                      <strong>
                        {value === null
                          ? "—"
                          : (unit === "percent" ? "%" : "") + fmt(value)}
                      </strong>
                      {(cell.state === "before-start" ||
                        cell.state === "departed") && (
                        <span className="activity-employment-label">
                          {states[cell.state]}
                        </span>
                      )}
                    </TableCell>
                  );
                })}
              </TableRow>
            );
          })}
          {!rows.length && (
            <TableRow>
              <TableCell colSpan={3 + months.length} className="activity-empty">
                Seçilen filtrelerde görüntülenebilen çalışan kaydı bulunmuyor.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      <div className="activity-footnote">
        <span>
          Değerler: seçili projelerde girilen aktiviteler + eğitim. Yüzde
          hesabında izin ve çalışma takvimi sonrası çalışma saati kullanılır.
        </span>
        <span className="activity-legend">
          <i className="activity-before-start" /> İşbaşı öncesi{" "}
          <i className="activity-departed" /> İşten ayrıldı
        </span>
      </div>
      {pages > 1 && (
        <div className="activity-pagination">
          <button
            className="button"
            disabled={activePage === 0}
            onClick={() => setPage(activePage - 1)}
          >
            Önceki
          </button>
          <span>
            {activePage + 1} / {pages} · Sayfa başına {PAGE_SIZE} satır
          </span>
          <button
            className="button"
            disabled={activePage + 1 >= pages}
            onClick={() => setPage(activePage + 1)}
          >
            Sonraki
          </button>
        </div>
      )}
    </section>
  );
}
