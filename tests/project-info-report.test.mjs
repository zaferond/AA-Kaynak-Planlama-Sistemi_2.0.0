import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  buildProjectInfoReport,
  updateReportedTopic,
} from "../frontend/src/project-info-report.ts";
import { projectInfoReportWorkbook } from "../frontend/src/project-info-report-export.ts";
import { Store } from "../backend/store.mjs";
import { validate } from "../backend/domain/index.mjs";

function zipEntry(bytes, name) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();
  for (let offset = 0; offset < bytes.length;) {
    if (view.getUint32(offset, true) !== 0x04034b50) break;
    const size = view.getUint32(offset + 18, true);
    const filenameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const start = offset + 30 + filenameLength + extraLength;
    const filename = decoder.decode(
      bytes.subarray(offset + 30, offset + 30 + filenameLength),
    );
    if (filename === name)
      return decoder.decode(bytes.subarray(start, start + size));
    offset = start + size;
  }
  throw Error(`${name} bulunamadı`);
}

test("report groups only selected notes by project and info across date ranges", () => {
  const projects = [
    {
      id: "p1",
      name: "Proje A",
      responsibleName: "Ayşe",
      start: "2026-01",
      end: "2026-12",
      phases: {},
      milestones: [
        {
          id: "i1",
          name: "Tasarım",
          start: "2026-02-01",
          end: "2026-02-15",
          barNotes: [
            { text: " İlk konu ", includeInReport: true, completed: true },
            { text: "Gizli konu", includeInReport: false },
          ],
          additionalRanges: [
            {
              start: "2026-03-01",
              end: "2026-03-20",
              notes: [
                { text: "İkinci konu", includeInReport: true },
                { text: "Üçüncü konu", includeInReport: true },
              ],
            },
          ],
        },
        {
          id: "i2",
          name: "Üretim",
          start: "2026-04-01",
          end: "2026-04-30",
          barText: "Eski açıklama",
          additionalRanges: [
            {
              start: "2026-05-01",
              end: "2026-05-15",
              notes: [{ text: "Üretim raporu", includeInReport: true }],
            },
          ],
        },
        {
          id: "i3",
          name: "Boş Bilgi",
          start: "2026-06-01",
          end: "2026-06-30",
          barNotes: [{ text: "Seçilmedi", includeInReport: false }],
        },
      ],
    },
    {
      id: "p2",
      name: "Proje B",
      start: "2026-01",
      end: "2026-12",
      phases: {},
      milestones: [
        {
          id: "i4",
          name: "Kontrol",
          start: "2026-07-01",
          end: "2026-07-15",
          barNotes: [{ text: "Son konu", includeInReport: true }],
        },
      ],
    },
    {
      id: "p3",
      name: "Seçimsiz Proje",
      start: "2026-01",
      end: "2026-12",
      phases: {},
      milestones: [],
    },
  ];
  const report = buildProjectInfoReport(projects);
  assert.deepEqual(
    report.map((project) => project.name),
    ["Proje A", "Proje B"],
  );
  assert.deepEqual(
    report[0].infos.map((info) => info.name),
    ["Tasarım", "Üretim"],
  );
  assert.deepEqual(
    report[0].infos[0].topics.map((topic) => topic.text),
    ["İlk konu", "İkinci konu", "Üçüncü konu"],
  );
  assert.equal(report[0].infos[0].topics[0].completed, true);
  assert.deepEqual(report[0].infos[1].topics, [
    {
      text: "Üretim raporu",
      start: "2026-05-01",
      end: "2026-05-15",
      rangeIndex: 1,
      noteIndex: 0,
    },
  ]);
  assert.equal(report[1].infos[0].topics[0].text, "Son konu");

  const workbook = projectInfoReportWorkbook(report);
  const sheet = zipEntry(workbook, "xl/worksheets/sheet1.xml");
  assert.match(sheet, /<autoFilter ref="A3:E6"\/>/);
  assert.equal((sheet.match(/<row r="/g) || []).length, 6);
  assert.match(sheet, /• \[Tamamlandı\] İlk konu/);
  assert.match(sheet, /• İkinci konu/);
  assert.ok(
    sheet.indexOf("<autoFilter") < sheet.indexOf("<mergeCells"),
    "Excel requires autoFilter before mergeCells",
  );
  for (const value of [
    "Proje A",
    "Proje B",
    "Tasarım",
    "Üretim",
    "İlk konu",
    "İkinci konu",
    "Üçüncü konu",
    "Üretim raporu",
    "Son konu",
    "01.05.2026",
  ])
    assert.ok(sheet.includes(value), value);
  for (const value of [
    "Gizli konu",
    "Eski açıklama",
    "Seçilmedi",
    "Seçimsiz Proje",
  ])
    assert.ok(!sheet.includes(value), value);
  assert.match(zipEntry(workbook, "xl/workbook.xml"), /Kritik Proje Konuları/);
});

test("Excel export treats special text as strings and rejects empty report", () => {
  const report = [
    {
      id: "p",
      name: "=SUM(1,2)",
      responsibleName: "A&B",
      infos: [
        {
          id: "i",
          name: "Plan <B>",
          topics: [
            {
              text: "@Bilgi & sonuç",
              start: "2026-01-01",
              end: "2026-01-03",
              rangeIndex: 0,
              noteIndex: 0,
            },
          ],
        },
      ],
    },
  ];
  const sheet = zipEntry(
    projectInfoReportWorkbook(report),
    "xl/worksheets/sheet1.xml",
  );
  assert.match(sheet, /t="inlineStr"/);
  assert.match(sheet, /=SUM\(1,2\)/);
  assert.doesNotMatch(sheet, /A&amp;B/);
  assert.match(sheet, /Plan &lt;B&gt;/);
  assert.match(sheet, /@Bilgi &amp; sonuç/);
  assert.doesNotMatch(sheet, /<f>/);
  assert.throws(() => projectInfoReportWorkbook([]), /bulunamadı/);
});

test("editing or removing a report topic updates the same project bar note", () => {
  const project = {
    id: "p",
    name: "Proje",
    start: "2026-01",
    end: "2026-12",
    phases: {},
    milestones: [
      {
        id: "i",
        name: "Analizler",
        start: "2026-02-01",
        end: "2026-02-15",
        barNotes: [
          { text: "İlk not", includeInReport: true },
          { text: "Diğer not", includeInReport: false },
        ],
        additionalRanges: [
          {
            start: "2026-03-01",
            end: "2026-03-12",
            notes: [{ text: "Ek not", includeInReport: true }],
          },
        ],
      },
    ],
  };
  const original = buildProjectInfoReport([project])[0].infos[0].topics;
  const edited = updateReportedTopic(project, "i", original[1], {
    text: "Güncellenen ek not",
  });
  assert.equal(
    edited.milestones[0].additionalRanges[0].notes[0].text,
    "Güncellenen ek not",
  );
  assert.equal(
    edited.milestones[0].additionalRanges[0].notes[0].includeInReport,
    true,
  );
  assert.equal(
    project.milestones[0].additionalRanges[0].notes[0].text,
    "Ek not",
  );
  assert.deepEqual(
    buildProjectInfoReport([edited])[0].infos[0].topics.map(
      (topic) => topic.text,
    ),
    ["İlk not", "Güncellenen ek not"],
  );

  const completed = updateReportedTopic(
    edited,
    "i",
    buildProjectInfoReport([edited])[0].infos[0].topics[0],
    { completed: true },
  );
  assert.equal(completed.milestones[0].barNotes[0].completed, true);
  const reopened = updateReportedTopic(
    completed,
    "i",
    buildProjectInfoReport([completed])[0].infos[0].topics[0],
    { completed: false },
  );
  assert.equal(
    buildProjectInfoReport([reopened])[0].infos[0].topics[0].completed,
    undefined,
  );

  const removed = updateReportedTopic(
    edited,
    "i",
    buildProjectInfoReport([edited])[0].infos[0].topics[0],
    { includeInReport: false },
  );
  assert.equal(removed.milestones[0].barNotes[0].text, "İlk not");
  assert.equal(removed.milestones[0].barNotes[0].includeInReport, false);
  assert.deepEqual(
    buildProjectInfoReport([removed])[0].infos[0].topics.map(
      (topic) => topic.text,
    ),
    ["Güncellenen ek not"],
  );
  assert.throws(
    () => updateReportedTopic(removed, "i", original[0], { text: "Eski" }),
    /değişmiş/,
  );
  assert.throws(
    () =>
      updateReportedTopic(
        removed,
        "i",
        buildProjectInfoReport([removed])[0].infos[0].topics[0],
        { text: " " },
      ),
    /boş olamaz/,
  );
});

test("report edits persist as project notes across a database restart", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "aa-critical-report-"));
  const store = new Store({
    env: { DB_PROVIDER: "sqljs", SQLJS_FILE: path.join(dir, "plan.sqlite") },
  });
  const initial = {
    id: "report-project",
    name: "Proje",
    start: "2026-01",
    end: "2026-12",
    phases: {},
    milestones: [
      {
        id: "info",
        name: "Analizler",
        start: "2026-03-01",
        end: "2026-03-10",
        barNotes: [
          {
            text: "İlk açıklama",
            includeInReport: true,
            start: "2026-03-02",
            end: "2026-03-04",
          },
          {
            text: "İkinci açıklama",
            includeInReport: true,
            start: "2026-03-06",
            end: "2026-03-08",
          },
        ],
      },
    ],
  };
  async function persist(project) {
    await store.transaction(async (connection) => {
      const { data } = await store.read(connection);
      await store.persist(
        data,
        validate({
          ...data,
          projects: [
            ...data.projects.filter((item) => item.id !== project.id),
            project,
          ],
        }),
        connection,
      );
    });
  }
  try {
    await store.connect();
    await persist(initial);
    const first = buildProjectInfoReport([initial])[0].infos[0].topics;
    const edited = updateReportedTopic(initial, "info", first[0], {
      text: "Düzenlenen açıklama",
      start: "2026-03-03",
      end: "2026-03-05",
    });
    const marked = updateReportedTopic(
      edited,
      "info",
      buildProjectInfoReport([edited])[0].infos[0].topics[0],
      { completed: true },
    );
    const removed = updateReportedTopic(
      marked,
      "info",
      buildProjectInfoReport([marked])[0].infos[0].topics[1],
      { includeInReport: false },
    );
    await persist(removed);
    await store.close();
    await store.connect();
    const loaded = (await store.read()).data.projects.find(
      (project) => project.id === initial.id,
    );
    assert.deepEqual(
      [loaded.milestones[0].start, loaded.milestones[0].end],
      ["2026-03-01", "2026-03-10"],
    );
    assert.deepEqual(loaded.milestones[0].barNotes, [
      {
        text: "Düzenlenen açıklama",
        includeInReport: true,
        completed: true,
        start: "2026-03-03",
        end: "2026-03-05",
      },
      {
        text: "İkinci açıklama",
        includeInReport: false,
        start: "2026-03-06",
        end: "2026-03-08",
      },
    ]);
    assert.deepEqual(
      buildProjectInfoReport([loaded])[0].infos[0].topics.map((topic) => [
        topic.text,
        topic.start,
        topic.end,
        topic.completed,
      ]),
      [["Düzenlenen açıklama", "2026-03-03", "2026-03-05", true]],
    );
  } finally {
    await store.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("long and multi-line critical details export losslessly as bounded continuation rows", () => {
  for (const text of [
    "A".repeat(40000),
    "😀 <&>\n".repeat(900),
    "line\r\n".repeat(400),
  ]) {
    const report = [
      {
        id: "p",
        name: "=Untrusted",
        infos: [
          {
            id: "i",
            name: "Title",
            topics: [
              {
                text,
                start: "2026-01-01",
                end: "2026-01-02",
                rangeIndex: 0,
                noteIndex: 0,
              },
            ],
          },
        ],
      },
    ];
    const sheet = zipEntry(
      projectInfoReportWorkbook(report),
      "xl/worksheets/sheet1.xml",
    );
    const cells = [
      ...sheet.matchAll(/<c r="C(\d+)"[^>]*><is><t[^>]*>([\s\S]*?)<\/t>/g),
    ]
      .filter((m) => Number(m[1]) >= 4)
      .map((m) =>
        m[2]
          .replaceAll("&lt;", "<")
          .replaceAll("&gt;", ">")
          .replaceAll("&quot;", '"')
          .replaceAll("&apos;", "'")
          .replaceAll("&amp;", "&")
          .replaceAll("&#13;", "\r"),
      );
    assert(cells.length > 1);
    assert.equal(cells.join(""), `• ${text} (01.01.2026 – 02.01.2026)`);
    for (const content of cells) {
      assert(content.length <= 32767);
      assert((content.match(/\n/g) || []).length <= 253);
      assert(!/[\ud800-\udbff]$/.test(content));
      assert(!/^[\udc00-\udfff]/.test(content));
    }
    for (const row of sheet.matchAll(/<row[^>]*ht="(\d+)"/g))
      assert(Number(row[1]) <= 409);
    assert.doesNotMatch(sheet, /<f[ >]/);
  }
});
