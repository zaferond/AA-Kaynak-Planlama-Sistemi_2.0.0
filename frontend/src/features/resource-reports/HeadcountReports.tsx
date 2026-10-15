import { useMemo, type CSSProperties } from "react";
import { CornerDownRight, Users } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableFooter,
  TableRow,
} from "@/components/ui/table";
import type { Data, Team } from "../../model";
import { fmt, fullDateLabel } from "../../format";
import type { ReportGroup } from "../resource-report-groups";
import {
  buildHeadcountReport,
  HEADCOUNT_COLUMNS,
  HEADCOUNT_REPORTS,
  HEADCOUNT_TOTAL_HEADER_COLOR,
  HEADCOUNT_TOTAL_CELL_COLOR,
  headcountColumnTotal,
  headcountWithPostings,
} from "./headcount-report-data";

export default function HeadcountReports({
  data,
  teams,
  groups,
  date,
}: {
  data: Data;
  teams: Team[];
  groups: ReportGroup[];
  date: string;
}) {
  const report = useMemo(
    () => buildHeadcountReport(data, teams, groups, date),
    [data, teams, groups, date],
  );
  return (
    <div className="headcount-reports">
      {HEADCOUNT_REPORTS.map((definition) => {
        const columns = definition.keys.map((key) =>
          HEADCOUNT_COLUMNS.find((column) => column.key === key)!,
        );
        return (
          <section className="panel headcount-panel" key={definition.id}>
            <div className="panelhead">
              <div>
                <h2>
                  <Users size={16} aria-hidden="true" />
                  {definition.title}
                </h2>
                <p className="headcount-report-date">
                  {fullDateLabel(date)} itibarıyla · Kişi / adet
                </p>
              </div>
            </div>
            <Table
              className="headcount-table"
              aria-label={definition.title}
              style={
                {
                  "--headcount-total-background": HEADCOUNT_TOTAL_CELL_COLOR,
                } as CSSProperties
              }
            >
              <colgroup>
                <col className="headcount-lead-column" />
                {columns.map((column) => (
                  <col key={column.key} />
                ))}
                {definition.showTotal && <col />}
              </colgroup>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Liderlik / Birim</TableHead>
                  {columns.map((column) => (
                    <TableHead
                      scope="col"
                      key={column.key}
                      style={
                        {
                          "--headcount-header-color": column.headerColor,
                        } as CSSProperties
                      }
                    >
                      {column.label}
                    </TableHead>
                  ))}
                  {definition.showTotal && (
                    <TableHead
                      scope="col"
                      className="headcount-row-total"
                      style={
                        {
                          "--headcount-header-color":
                            HEADCOUNT_TOTAL_HEADER_COLOR,
                        } as CSSProperties
                      }
                    >
                      Toplam
                    </TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.rows.map((row) => (
                  <TableRow
                    key={row.unitId || row.leader || row.name}
                    data-headcount-leader={row.leader || row.unitId}
                    data-headcount-depth={row.depth || 0}
                    title={
                      row.parentLeader
                        ? "Üst liderlik: " + row.parentLeader
                        : undefined
                    }
                  >
                    <TableCell>
                      <span
                        className="headcount-unit"
                        style={{
                          paddingInlineStart: Math.min(row.depth || 0, 8) * 16,
                        }}
                      >
                        {!!row.depth && (
                          <CornerDownRight size={13} aria-hidden="true" />
                        )}
                        <span>{row.name}</span>
                      </span>
                    </TableCell>
                    {columns.map((column) => (
                      <TableCell
                        key={column.key}
                        data-headcount-status={column.key}
                      >
                        {fmt(row.counts[column.key])}
                      </TableCell>
                    ))}
                    {definition.showTotal && (
                      <TableCell className="headcount-row-total">
                        {fmt(headcountColumnTotal(row.counts, definition.keys))}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
                {!report.rows.length && (
                  <TableRow>
                    <TableCell
                      className="headcount-empty"
                      colSpan={columns.length + (definition.showTotal ? 2 : 1)}
                    >
                      Bu filtrelere uygun birim yok.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
              <TableFooter>
                <TableRow className="headcount-grand-total">
                  <TableCell>
                    <span className="headcount-total-label">
                      <span aria-hidden="true">Σ</span>Toplam Head Count
                    </span>
                  </TableCell>
                  {columns.map((column) => (
                    <TableCell
                      key={column.key}
                      data-headcount-total={column.key}
                    >
                      {fmt(report.totals[column.key])}
                    </TableCell>
                  ))}
                  {definition.showTotal && (
                    <TableCell
                      className="headcount-row-total"
                      data-headcount-total={
                        definition.id === "engineering" ? "working" : "combined"
                      }
                    >
                      {fmt(
                        headcountColumnTotal(report.totals, definition.keys),
                      )}
                    </TableCell>
                  )}
                </TableRow>
                {definition.showWithPostings && (
                  <TableRow className="headcount-with-postings">
                    <TableCell
                      colSpan={columns.length + (definition.showTotal ? 1 : 0)}
                    >
                      <span className="headcount-total-label">
                        <span aria-hidden="true">+</span>
                        Aktif İlan Dahil Head Count
                      </span>
                    </TableCell>
                    <TableCell
                      className="headcount-row-total"
                      data-headcount-with-postings
                    >
                      {fmt(headcountWithPostings(report.totals))}
                    </TableCell>
                  </TableRow>
                )}
              </TableFooter>
            </Table>
          </section>
        );
      })}
    </div>
  );
}
