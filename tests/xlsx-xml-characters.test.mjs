import test from "node:test";
import assert from "node:assert/strict";
import {
  excelCellText,
  escapeXml,
  splitExcelText,
} from "../frontend/src/xlsx-cells.ts";
import { createWorkbook } from "../frontend/src/xlsx-workbook.ts";
import { resourceTemplate } from "../frontend/src/resource-template.ts";
import { resourceReportWorkbook } from "../frontend/src/resource-report-export.ts";
import { projectWorkbook } from "../frontend/src/project-export.ts";
import { buildProjectInfoReport } from "../frontend/src/project-info-report.ts";
import { projectInfoReportWorkbook } from "../frontend/src/project-info-report-export.ts";
import { riskWorkbook, riskWorkbooks } from "../frontend/src/risk-export.ts";
import {
  plannedAllocationWorkbook,
  actualAllocationWorkbook,
} from "../frontend/src/allocation-export.ts";

const forbidden = [
  ...Array.from({ length: 32 }, (_, index) => index).filter(
    (code) => ![9, 10, 13].includes(code),
  ),
  0xd800,
  0xdbff,
  0xdc00,
  0xdfff,
  0xfffe,
  0xffff,
];
function invalidCharacterError(code) {
  return (error) => {
    assert.match(error.message, /Excel'e aktarılamayan karakter/);
    assert(
      error.message.includes(
        "U+" + code.toString(16).toUpperCase().padStart(4, "0"),
      ),
    );
    assert.match(error.message, /metni düzeltip tekrar aktarın/);
    assert(!error.message.includes("SYNTHETIC_PRIVATE_TEXT"));
    return true;
  };
}
test("XML-forbidden controls, noncharacters and lone surrogates are rejected without stripping or echoing source text", () => {
  for (const code of forbidden) {
    const source =
      "SYNTHETIC_PRIVATE_TEXT" + String.fromCodePoint(code) + " end";
    for (const write of [escapeXml, excelCellText]) {
      assert.throws(() => write(source), invalidCharacterError(code));
      assert.throws(() => write(source), invalidCharacterError(code));
    }
  }
  assert.throws(
    () => escapeXml("\ud800X\udc00"),
    invalidCharacterError(0xd800),
  );
});

test("valid Unicode boundaries, paired supplementary characters, whitespace and XML delimiters remain lossless", () => {
  const text =
    "Türkçe İıŞşĞğ😀\t\r\n" +
    String.fromCodePoint(
      0x20,
      0xd7ff,
      0xe000,
      0xfffd,
      0x10000,
      0x10ffff,
      0x7f,
      0x85,
      0x9f,
      0xfdd0,
    ) +
    "<&>\"' end";
  const escaped = text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;")
    .replaceAll("\r", "&#13;");
  assert.equal(escapeXml(text), escaped);
  assert.equal(excelCellText(text), escaped);
  assert.equal(excelCellText(undefined), "");
  assert.equal(excelCellText(0), "0");
  const long = text.repeat(1000);
  const chunks = splitExcelText(long);
  assert.equal(chunks.join(""), long);
  for (const chunk of chunks) assert.doesNotThrow(() => excelCellText(chunk));
});

const team = { id: "t", name: "Synthetic team", lead: "Synthetic lead" };
const project = {
  id: "p",
  name: "Synthetic project",
  start: "2026-01",
  end: "2026-12",
  phases: { "2026-01": "Synthetic phase" },
};
const resource = {
  id: "r",
  name: "Synthetic employee",
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
};
const data = {
  teams: [team],
  leaders: [team.lead],
  projects: [project],
  resources: [resource],
  allocations: { "t|p|2026-01": 0.5 },
  actualAllocations: { "r|p|2026-01": 0.5 },
  workCalendar: {},
  personCalendar: {},
  revisions: {},
};
const risk = {
  id: "risk",
  projectId: "p",
  reportedBy: "Synthetic reporter",
  category: "Teknik",
  reportedAt: "2026-10-05",
  system: "",
  description: "Synthetic risk",
  cause: "",
  actionPlan: "",
  targetAt: "",
  status: "Açık",
  owner: "",
  likelihood: 2,
  impact: 3,
  strategy: "",
  implementedAt: "",
  actionResult: "",
  residualLikelihood: null,
  residualImpact: null,
  createdBy: "u",
  createdByName: "Synthetic reporter",
  createdAt: "",
  updatedAt: "",
};
test("all report writers reject invalid cell text before returning workbook bytes and preserve their inputs", () => {
  for (const code of [0, 0xb, 0xd800, 0xdc00, 0xfffe, 0xffff]) {
    const text = "Synthetic " + String.fromCodePoint(code) + " text";
    const badTeam = { ...team, name: text },
      badProject = { ...project, name: text },
      badResource = { ...resource, name: text };
    const infoProject = {
      ...project,
      milestones: [
        {
          id: "m",
          name: "Heading",
          start: "2026-01-01",
          end: "2026-01-02",
          barNotes: [{ text, includeInReport: true }],
        },
      ],
    };
    const group = {
      name: text,
      manager: "",
      personnel: 1,
      months: [{ remaining: 0.5, status: "normal" }],
    };
    const badRisk = { ...risk, description: text };
    const before = structuredClone({
      data,
      badTeam,
      badProject,
      badResource,
      infoProject,
      group,
      badRisk,
    });
    const writers = [
      () => resourceTemplate({ ...data, teams: [badTeam] }),
      () => resourceReportWorkbook(["2026-01"], [group], [group]),
      () => projectWorkbook([badProject], ["2026-01"]),
      () =>
        projectWorkbook(
          [{ ...project, phases: { "2026-01": text } }],
          ["2026-01"],
        ),
      () => projectInfoReportWorkbook(buildProjectInfoReport([infoProject])),
      () => riskWorkbook(project, [badRisk]),
      () => riskWorkbooks([badProject, { ...project, id: "p2" }], []),
      () => plannedAllocationWorkbook(data, [badTeam], [project], ["2026-01"]),
      () =>
        actualAllocationWorkbook(
          { ...data, resources: [badResource] },
          [team],
          [project],
          ["2026-01"],
          "2026-10",
          ["r"],
        ),
    ];
    for (const write of writers)
      assert.throws(write, invalidCharacterError(code));
    assert.deepEqual(
      { data, badTeam, badProject, badResource, infoProject, group, badRisk },
      before,
    );
  }
});

test("workbook sheet names, defined names and core properties use the same XML character guard", () => {
  const ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
  const options = {
    sheets: [
      {
        name: "Sheet",
        xml: `<worksheet xmlns="${ns}"><sheetData/></worksheet>`,
      },
    ],
    styles: `<styleSheet xmlns="${ns}"/>`,
  };
  for (const code of [0xd800, 0xdc00, 0xfffe, 0xffff]) {
    const text = "Synthetic" + String.fromCodePoint(code);
    for (const modified of [
      { ...options, sheets: [{ ...options.sheets[0], name: text }] },
      { ...options, definedNames: [{ name: text, formula: "Sheet!A1" }] },
      { ...options, definedNames: [{ name: "Named", formula: text }] },
      { ...options, properties: { creator: text, title: "Title" } },
      { ...options, properties: { creator: "Creator", title: text } },
    ])
      assert.throws(
        () => createWorkbook(modified),
        invalidCharacterError(code),
      );
  }
});
