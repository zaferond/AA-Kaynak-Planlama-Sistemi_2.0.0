import test from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { validate } from "../shared/server-domain.ts";
import {
  validPlanningMonth,
  validPlanningDate,
} from "../shared/planning-dates.ts";

const fixture = () => ({
  teams: [{ id: "t", name: "Team", lead: "A", excelCapacity: 0 }],
  projects: [
    { id: "p", name: "Project", start: "2000-01", end: "2199-12", phases: {} },
  ],
  resources: [
    {
      id: "r",
      name: "Person",
      note: "",
      versions: [
        {
          effective: "2026-01",
          team: "t",
          lead: "A",
          status: "Aktif Çalışan",
          included: true,
          start: "2026-01-01",
          end: "",
          amount: 1,
        },
      ],
    },
  ],
  leaders: ["A"],
  allocations: {},
  actualAllocations: {},
  actualWorkedHours: {},
  actualPercentEntries: {},
  workCalendar: {},
  personCalendar: {},
  revisions: {},
});
const routes = [
  (d, month) => {
    d.allocations["t|p|" + month] = 0;
  },
  (d, month) => {
    d.actualAllocations["r|p|" + month] = 0;
  },
  (d, month) => {
    d.actualWorkedHours["r|" + month] = 0;
  },
  (d, month) => {
    d.actualAllocations["r|p|" + month] = 0;
    d.actualPercentEntries["r|p|" + month] = 0;
    d.actualWorkedHours["r|" + month] = 0;
  },
  (d, month) => {
    d.projects[0].phases[month] = "Stage";
  },
];

test("all month-key validation paths retain the previous schema predicate and domain limits", () => {
  const previous = z.string().refine(validPlanningMonth);
  const months = [
    "2000-01",
    "2020-02",
    "2026-09",
    "2199-12",
    "",
    "1999-12",
    "2200-01",
    "2026-00",
    "2026-13",
    "2026-1",
    "2026-01-01",
    " 2026-01",
    "2026-01 ",
  ];
  for (const month of months)
    for (const route of routes) {
      const data = fixture();
      route(data, month);
      if (previous.safeParse(month).success)
        assert.doesNotThrow(() => validate(data));
      else
        assert.throws(
          () => validate(data),
          (e) => e.status === 400,
        );
    }
  for (const [field, key] of [
    ["allocations", "t|p"],
    ["actualAllocations", "r|p"],
    ["actualWorkedHours", "r"],
    ["actualPercentEntries", "r|p"],
    ["allocations", "t|p|2026-09|extra"],
  ]) {
    const data = fixture();
    data[field][key] = 0;
    assert.throws(
      () => validate(data),
      (e) => e.status === 400,
    );
  }
});

test("shared and personal calendar keys still reject impossible, malformed and out-of-range dates", () => {
  const previous = z.string().refine(validPlanningDate);
  for (const date of [
    "2000-01-01",
    "2020-02-29",
    "2199-12-31",
    "2026-02-29",
    "2026-04-31",
    "1999-12-31",
    "2200-01-01",
    "2026-1-1",
    "",
    "2026-01-01 ",
  ])
    for (const personal of [false, true]) {
      const data = fixture();
      if (personal)
        data.personCalendar["r|" + date + "|leave"] = {
          type: "leave",
          hours: 1,
          label: "",
        };
      else
        data.workCalendar[date] = {
          type: "company",
          label: "Closed",
          fraction: 1,
        };
      if (previous.safeParse(date).success)
        assert.doesNotThrow(() => validate(data));
      else
        assert.throws(
          () => validate(data),
          (e) => e.status === 400,
        );
    }
});

test("complete numeric, relationship and hour consistency validation remains independent of key validation", () => {
  for (const change of [
    (d) => {
      d.allocations["t|p|2026-09"] = "1";
    },
    (d) => {
      d.allocations["t|p|2026-09"] = -1;
    },
    (d) => {
      d.actualAllocations["r|p|2026-09"] = Infinity;
    },
    (d) => {
      d.actualWorkedHours["r|2026-09"] = NaN;
    },
    (d) => {
      d.allocations["missing|p|2026-09"] = 0;
    },
    (d) => {
      d.actualAllocations["missing|p|2026-09"] = 0;
    },
    (d) => {
      d.actualWorkedHours["missing|2026-09"] = 0;
    },
    (d) => {
      d.actualPercentEntries["r|p|2026-09"] = 25;
    },
    (d) => {
      d.actualAllocations["r|p|2026-09"] = 0;
      d.actualWorkedHours["r|2026-09"] = 160;
      d.actualPercentEntries["r|p|2026-09"] = 25;
    },
    (d) => {
      d.personCalendar["r|2026-09-01|leave"] = {
        type: "leave",
        hours: 10,
        label: "",
      };
    },
  ]) {
    const data = fixture();
    change(data);
    const before = structuredClone(data);
    assert.throws(() => validate(data));
    assert.deepEqual(data, before);
  }
});
