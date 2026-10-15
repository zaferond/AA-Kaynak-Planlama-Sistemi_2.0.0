import test from "node:test";
import assert from "node:assert/strict";
import {
  createWorkbook,
  downloadWorkbook,
  XLSX_MIME,
} from "../frontend/src/xlsx-workbook.ts";
import { resourceTemplate } from "../frontend/src/resource-template.ts";
import { resourceReportWorkbook } from "../frontend/src/resource-report-export.ts";
import { projectWorkbook } from "../frontend/src/project-export.ts";
import { projectInfoReportWorkbook } from "../frontend/src/project-info-report-export.ts";
import { buildProjectInfoReport } from "../frontend/src/project-info-report.ts";
import { riskWorkbook } from "../frontend/src/risk-export.ts";
import { riskWorkbooks } from "../frontend/src/risk-export.ts";
import {
  plannedAllocationWorkbook,
  actualAllocationWorkbook,
} from "../frontend/src/allocation-export.ts";

function entries(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder(),
    files = new Map();
  for (let offset = 0; view.getUint32(offset, true) === 0x04034b50;) {
    const size = view.getUint32(offset + 18, true),
      nameLength = view.getUint16(offset + 26, true);
    const start = offset + 30 + nameLength + view.getUint16(offset + 28, true);
    const name = decoder.decode(
      bytes.subarray(offset + 30, offset + 30 + nameLength),
    );
    assert(!files.has(name));
    files.set(name, decoder.decode(bytes.subarray(start, start + size)));
    offset = start + size;
  }
  return files;
}
const xml =
  '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData/></worksheet>';
const styles =
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"/>';
test("common workbook packages every sheet, style and optional property through internal relationships", () => {
  const files = entries(
    createWorkbook({
      sheets: [
        { name: "A & B", xml, printTitleRows: 5 },
        { name: "O'Brien", xml },
      ],
      styles,
      properties: {
        title: "<Title>",
        creator: "&Creator",
        created: new Date("2026-10-03T00:00:00Z"),
      },
      activeTab: 1,
      recalculate: true,
    }),
  );
  assert.equal(files.size, 8);
  assert.match(files.get("xl/workbook.xml"), /name="A &amp; B"/);
  assert.match(files.get("xl/workbook.xml"), /&apos;A &amp; B&apos;!\$1:\$5/);
  assert.match(files.get("xl/workbook.xml"), /activeTab="1"/);
  assert.match(files.get("xl/workbook.xml"), /forceFullCalc="1"/);
  assert.match(files.get("docProps/core.xml"), /&lt;Title&gt;/);
  assert.match(
    files.get("xl/_rels/workbook.xml.rels"),
    /Id="rId3"[^>]*Target="styles.xml"/,
  );
  for (const content of files.values())
    assert.equal((content.match(/<\?xml/g) || []).length, 1);
});
test("workbook rejects ambiguous or invalid sheets and print scopes before producing an archive", () => {
  for (const name of [
    "",
    " ",
    "A/B",
    "A:B",
    "'Name",
    "Name'",
    "A".repeat(32),
    "A\u0000B",
  ])
    assert.throws(
      () => createWorkbook({ sheets: [{ name, xml }], styles }),
      /sayfa adları/,
    );
  assert.throws(
    () =>
      createWorkbook({
        sheets: [
          { name: "A", xml },
          { name: "a", xml },
        ],
        styles,
      }),
    /benzersiz/,
  );
  assert.throws(() => createWorkbook({ sheets: [], styles }), /sayfa sayısı/);
  assert.throws(
    () =>
      createWorkbook({ sheets: [{ name: "A", xml }], styles, activeTab: 1 }),
    /aktif/,
  );
  assert.throws(
    () =>
      createWorkbook({
        sheets: [{ name: "A", xml, printTitleRows: 1048577 }],
        styles,
      }),
    /başlığı/,
  );
  assert.throws(
    () =>
      createWorkbook({
        sheets: [{ name: "A", xml }],
        styles,
        definedNames: [{ name: "Test", formula: "A1", localSheetId: 1 }],
      }),
    /aralığı/,
  );
});

test("multi-project risk sheets resolve both ASCII and Turkish case collisions", () => {
  const projects = ["I", "i", "İ", "ı"].map((name, i) => ({
    id: "p" + i,
    name,
    start: "2026-01",
    end: "2026-12",
    phases: {},
  }));
  const workbook = entries(riskWorkbooks(projects, [])).get("xl/workbook.xml");
  const names = [...workbook.matchAll(/<sheet name="([^"]+)"/g)].map(
    (m) => m[1],
  );
  assert.equal(new Set(names.map((name) => name.toUpperCase())).size, 5);
  assert.equal(
    new Set(names.map((name) => name.toLocaleLowerCase("tr-TR"))).size,
    5,
  );
});

const team = { id: "t", name: "=Team & <synthetic>", lead: "Synthetic Lead" };
const project = {
  id: "p",
  name: "=Project & <synthetic>",
  start: "2026-01",
  end: "2026-12",
  phases: { "2026-01": "=Phase" },
  milestones: [
    {
      id: "m",
      name: "=Heading",
      start: "2026-01-01",
      end: "2026-01-31",
      barNotes: [{ text: "=Detail & <synthetic>", includeInReport: true }],
    },
  ],
};
const data = {
  teams: [team],
  leaders: [team.lead],
  projects: [project],
  risks: [],
  revisions: {},
  resources: [
    {
      id: "r",
      name: "=Person & <synthetic>",
      note: "",
      versions: [
        {
          effective: "2026-01",
          start: "2026-01-01",
          end: "",
          status: "Gear Up",
          included: true,
          team: "t",
          lead: team.lead,
          amount: 1,
        },
      ],
    },
  ],
  allocations: { "t|p|2026-01": 0.5 },
  actualAllocations: { "r|p|2026-01": 0.5 },
  workCalendar: {},
  personCalendar: {},
};
test("distribution writers reject overflowing project/person products before constructing the grid", () => {
  const projects = Array.from({ length: 1100 }, (_, i) => ({
    ...project,
    id: "p" + i,
  }));
  const teams = Array.from({ length: 1000 }, (_, i) => ({
    ...team,
    id: "t" + i,
  }));
  assert.throws(
    () => plannedAllocationWorkbook(data, teams, projects, ["2026-01"]),
    /satır sınırı/,
  );
  const resources = Array.from({ length: 1000 }, (_, i) => ({
    ...data.resources[0],
    id: "r" + i,
  }));
  assert.throws(
    () =>
      actualAllocationWorkbook(
        { ...data, resources },
        [team],
        projects,
        ["2026-01"],
        "2026-10",
        [],
      ),
    /satır sınırı/,
  );
});
test("all six report writers retain sheet relationships, styles and formula-like text as inline strings", () => {
  const group = {
    name: team.name,
    manager: "",
    personnel: 1,
    months: [{ remaining: 0.5, status: "normal" }],
  };
  const reports = [
    [resourceTemplate(data), 2],
    [resourceReportWorkbook(["2026-01"], [group], [group]), 2],
    [projectWorkbook([project], ["2026-01"]), 1],
    [projectInfoReportWorkbook(buildProjectInfoReport([project])), 1],
    [riskWorkbook(project, []), 2],
    [plannedAllocationWorkbook(data, [team], [project], ["2026-01"]), 1],
    [
      actualAllocationWorkbook(
        data,
        [team],
        [project],
        ["2026-01"],
        "2026-10",
        ["r"],
      ),
      1,
    ],
  ];
  for (const [bytes, count] of reports) {
    const files = entries(bytes),
      rels = files.get("xl/_rels/workbook.xml.rels");
    const names = [...rels.matchAll(/Target="([^"]+)"/g)].map(
      (match) => match[1],
    );
    assert.equal(names.length, count + 1);
    for (const name of names) assert(files.has("xl/" + name), name);
    assert(!rels.includes('TargetMode="External"'));
    assert.equal(
      (files.get("xl/workbook.xml").match(/<sheet /g) || []).length,
      count,
    );
    for (const [name, content] of files) {
      assert.equal((content.match(/<\?xml/g) || []).length, 1, name);
      if (name.startsWith("xl/worksheets/"))
        assert(!/<f[^>]*>=/.test(content), name);
    }
  }
});
test("resource template help follows the longest option list and empty lists have forward ranges", () => {
  for (const d of [
    { ...data, leaders: Array.from({ length: 20 }, (_, i) => "Leader " + i) },
    { ...data, teams: [], leaders: [] },
  ]) {
    const files = entries(resourceTemplate(d)),
      sheet = files.get("xl/worksheets/sheet2.xml");
    const rows = [...sheet.matchAll(/<row r="(\d+)"/g)].map((m) =>
      Number(m[1]),
    );
    assert.equal(new Set(rows).size, rows.length);
    assert.deepEqual(
      rows,
      [...rows].sort((a, b) => a - b),
    );
    assert(!files.get("xl/workbook.xml").includes("$2:$D$1"));
    assert(!files.get("xl/workbook.xml").includes("$2:$A$1"));
  }
});
test("download uses the workbook MIME and releases its URL even when a browser click fails", () => {
  const saved = {
    create: URL.createObjectURL,
    revoke: URL.revokeObjectURL,
    document: globalThis.document,
    timeout: globalThis.setTimeout,
  };
  const released = [];
  let anchor, blob;
  URL.createObjectURL = (value) => {
    blob = value;
    return "blob:synthetic";
  };
  URL.revokeObjectURL = (url) => released.push(url);
  globalThis.document = { createElement: () => (anchor = { click() {} }) };
  globalThis.setTimeout = (callback) => {
    callback();
    return 0;
  };
  try {
    downloadWorkbook(new Uint8Array([1, 2]), "synthetic.xlsx");
    assert.equal(blob.type, XLSX_MIME);
    assert.equal(anchor.href, "blob:synthetic");
    assert.equal(anchor.download, "synthetic.xlsx");
    globalThis.document = {
      createElement: () => ({
        click() {
          throw Error("blocked click");
        },
      }),
    };
    assert.throws(
      () => downloadWorkbook(new Uint8Array(), "test.xlsx"),
      /blocked click/,
    );
    assert.deepEqual(released, ["blob:synthetic", "blob:synthetic"]);
  } finally {
    URL.createObjectURL = saved.create;
    URL.revokeObjectURL = saved.revoke;
    globalThis.setTimeout = saved.timeout;
    if (saved.document === undefined) delete globalThis.document;
    else globalThis.document = saved.document;
  }
});

test("remaining resource workbooks use the requested headings and preserve standalone unit rows", () => {
  const group = {
    name: "Standalone PO",
    manager: "Synthetic owner",
    personnel: 1,
    months: [{ remaining: 0.75, status: "within-capacity" }],
  };
  const files = entries(resourceReportWorkbook(["2026-01"], [group], [group]));
  const leadership = files.get("xl/worksheets/sheet1.xml"),
    team = files.get("xl/worksheets/sheet2.xml");
  assert.match(leadership, /Liderlik Bazında Eksik Raporu/);
  assert.match(leadership, /Liderlik \/ Birim/);
  assert.match(leadership, /Standalone PO/);
  assert.match(team, /Takım Bazında Eksik Kaynak Raporu/);
});

test("actual Excel uses authorized monthly capacity and training summaries without peer calendar details", () => {
  const team = {
    id: "peer-team",
    name: "Peer Team",
    lead: "L",
    excelCapacity: 0,
  };
  const project = {
    id: "peer-project",
    name: "Project",
    start: "2026-01",
    end: "2026-12",
    phases: {},
  };
  const peer = {
    id: "peer",
    name: "Peer",
    note: "",
    versions: [
      {
        effective: "2026-01",
        team: team.id,
        lead: "L",
        status: "Aktif Çalışan",
        included: true,
        amount: 1,
        start: "2026-01-01",
        end: "",
      },
    ],
  };
  const snapshot = {
    teams: [team],
    projects: [project],
    resources: [peer],
    allocations: {},
    revisions: {},
    actualAllocations: { "peer|peer-project|2026-09": 0.25 },
    personCalendar: {},
  };
  const sheets = entries(
    actualAllocationWorkbook(
      snapshot,
      [team],
      [project],
      ["2026-09"],
      "2026-10",
      [],
      undefined,
      { "peer|2026-09": { capacityFte: 0.5, trainingHours: 9 } },
    ),
  );
  const sheet = sheets.get("xl/worksheets/sheet1.xml");
  assert.match(sheet, /r="E5"[^>]*><v>0\.5<\/v>/);
  assert.match(sheet, /Eğitim/);
  assert.match(sheet, /r="E6"[^>]*><v>0\.1<\/v>/);
});

test("leadership workbook shows indented subtotal rows without double counting personnel or monthly totals", () => {
  const group = (name, personnel, remaining, depth = 0) => ({
    name,
    manager: "Synthetic owner",
    personnel,
    months: [{ remaining, status: "within-capacity" }],
    ...(depth ? { depth } : {}),
  });
  const files = entries(
    resourceReportWorkbook(
      ["2026-01"],
      [
        group("Root", 4, -5),
        group("Child", 3, -6, 1),
        group("Grand", 1, -3, 2),
        group("Other", 2, 0),
      ],
      [],
    ),
  );
  const sheet = files.get("xl/worksheets/sheet1.xml");
  assert.match(sheet, /↳ Child/);
  assert.match(sheet, /↳ Grand/);
  assert.match(sheet, /<c r="C10"[^>]*><v>6<\/v><\/c>/);
  assert.match(sheet, /<c r="D10"[^>]*><v>-5<\/v><\/c>/);
});
