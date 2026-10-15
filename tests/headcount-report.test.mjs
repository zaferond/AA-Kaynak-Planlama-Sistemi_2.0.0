import test from "node:test";
import assert from "node:assert/strict";
import {
  buildHeadcountReport,
  workingHeadcount,
  headcountWithPostings,
} from "../frontend/src/features/resource-reports/headcount-report-data.ts";
import { topLevelReportGroups } from "../frontend/src/features/resource-report-groups.ts";
import { buildHeadcountWorkbook } from "../frontend/src/headcount-report-export.ts";

const date = "2026-10-02";
const version = (team, status, extra = {}) => ({
  effective: "2026-01",
  start: "2026-01-01",
  end: "",
  team,
  lead: "Child",
  status,
  included: false,
  amount: 0.5,
  ...extra,
});
const resource = (id, ...versions) => ({ id, name: id, versions });
const fixture = () => ({
  leaders: ["Root", "Child", "Grand", "Other"],
  leaderParents: { Child: "Root", Grand: "Child" },
  teams: [
    { id: "root", lead: "Root", name: "Root", kind: "leadership" },
    { id: "child", lead: "Child", name: "Child", kind: "leadership" },
    { id: "ct", lead: "Child", name: "Child team" },
    { id: "gt", lead: "Grand", name: "Grand team" },
    { id: "other", lead: "Other", name: "Other team" },
    { id: "solo", lead: "", name: "Independent team" },
  ],
  resources: [
    resource("leader", version("root", "Aktif Çalışan")),
    resource("active", version("ct", "Aktif Çalışan", { amount: 3 })),
    resource("gear", version("ct", "Gear Up")),
    resource("hourly", version("gt", "SAAT Ücretli Ofis Ç.", { amount: 2 })),
    resource("posting", version("ct", "Aktif İlan", { start: "2027-02-01" })),
    resource("passive", version("child", "Pasif İlan", { start: "" })),
    resource("solo", version("solo", "Aktif Çalışan")),
    resource("other", version("other", "Gear Up")),
    resource("left", version("ct", "İşten Ayrıldı")),
    resource(
      "not-started",
      version("ct", "Aktif Çalışan", { start: "2026-10-03" }),
    ),
    resource("ended", version("ct", "Aktif Çalışan", { end: "2026-10-01" })),
    resource(
      "future-version",
      version("ct", "Aktif Çalışan", { effective: "2026-11" }),
    ),
    resource(
      "history",
      version("ct", "Gear Up", { effective: "2026-09" }),
      version("ct", "Aktif Çalışan"),
    ),
  ],
});
const reportFor = (data, teams = data.teams) =>
  buildHeadcountReport(data, teams, topLevelReportGroups(data, teams), date);

test("headcount counts people/vacancies rather than FTE and ignores planning inclusion", () => {
  const report = reportFor(fixture());
  assert.deepEqual(report.totals, {
    active: 3,
    gearUp: 3,
    hourly: 1,
    activePosting: 1,
    passivePosting: 1,
  });
  assert.equal(workingHeadcount(report.totals), 7);
  assert.equal(headcountWithPostings(report.totals), 4);
});
test("headcount hierarchy includes direct leaders and child subtotals without duplicating grand totals", () => {
  const report = reportFor(fixture());
  assert.deepEqual(
    report.rows.map((r) => [r.name, r.depth || 0]),
    [
      ["Root", 0],
      ["Child", 1],
      ["Grand", 2],
      ["Other", 0],
      ["Independent team", 0],
    ],
  );
  assert.equal(workingHeadcount(report.rows[0].counts), 5);
  assert.equal(workingHeadcount(report.rows[1].counts), 4);
  assert.equal(workingHeadcount(report.rows[2].counts), 1);
  assert.equal(workingHeadcount(report.totals), 7);
});
test("filtered headcount retains parent context but cannot count excluded units", () => {
  const data = fixture();
  const report = reportFor(
    data,
    data.teams.filter((t) => t.id === "gt"),
  );
  assert.deepEqual(
    report.rows.map((r) => [r.name, r.counts.hourly]),
    [
      ["Root", 1],
      ["Child", 1],
      ["Grand", 1],
    ],
  );
  assert.equal(workingHeadcount(report.totals), 1);
  assert.equal(headcountWithPostings(report.totals), 0);
});
test("current employment dates include boundaries; undated/future-dated vacancies still count", () => {
  const data = fixture();
  data.resources = [
    resource("start", version("ct", "Aktif Çalışan", { start: date })),
    resource("end", version("ct", "Aktif Çalışan", { end: date })),
    resource(
      "legacy",
      version("ct", "Gear Up", { start: "2026-10", end: "2026-10" }),
    ),
    resource("blank-posting", version("ct", "Aktif İlan", { start: "" })),
    resource(
      "future-posting",
      version("ct", "Aktif İlan", { start: "2027-01-01" }),
    ),
    resource("passive", version("ct", "Pasif İlan", { start: "" })),
  ];
  assert.deepEqual(reportFor(data).totals, {
    active: 2,
    gearUp: 1,
    hourly: 0,
    activePosting: 2,
    passivePosting: 1,
  });
});
test("headcount is read only, handles empty scopes and counts latest version once", () => {
  const data = fixture(),
    before = structuredClone(data);
  reportFor(data);
  assert.deepEqual(data, before);
  const empty = reportFor(data, []);
  assert.deepEqual(empty.rows, []);
  assert.equal(workingHeadcount(empty.totals), 0);
  const teams = data.teams.filter((t) => t.id === "ct");
  const roots = topLevelReportGroups(data, teams);
  roots[0].ids.push("ct");
  assert.equal(buildHeadcountReport(data, teams, roots, date).totals.gearUp, 2);
});
test("headcount workbook contains two sheets, correct column coordinates, literal text and computed totals", () => {
  const data = fixture();
  data.leaders[0] = "=1+1 <Root>";
  data.teams[0].lead = data.leaders[0];
  data.leaderParents.Child = data.leaders[0];
  const bytes = buildHeadcountWorkbook(reportFor(data), "All units");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const files = new Map(),
    decoder = new TextDecoder();
  for (let offset = 0; view.getUint32(offset, true) === 0x04034b50;) {
    const length = view.getUint16(offset + 26, true),
      size = view.getUint32(offset + 18, true);
    const start = offset + 30 + length + view.getUint16(offset + 28, true);
    files.set(
      decoder.decode(bytes.subarray(offset + 30, offset + 30 + length)),
      decoder.decode(bytes.subarray(start, start + size)),
    );
    offset = start + size;
  }
  assert.match(files.get("xl/workbook.xml"), /Mühendislik Head Count/);
  assert.match(files.get("xl/workbook.xml"), /İKD Head Count/);
  const first = files.get("xl/worksheets/sheet1.xml"),
    second = files.get("xl/worksheets/sheet2.xml");
  assert.match(first, /<dimension ref="A1:E9"/);
  assert.match(
    first,
    /<c r="A4"[^>]*t="inlineStr"[^>]*><is><t[^>]*>=1\+1 &lt;Root&gt;/,
  );
  assert.match(first, /<c r="E9"[^>]*><v>7<\/v>/);
  assert.match(second, /<dimension ref="A1:E10"/);
  assert.match(second, /<c r="E9"[^>]*><v>5<\/v>/);
  assert.match(second, /<c r="E10"[^>]*><v>4<\/v>/);
  assert.match(second, /mergeCell ref="A10:D10"/);
  assert(!first.includes("<f>") && !second.includes("<f>"));
});
