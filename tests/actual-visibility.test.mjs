import test from "node:test";
import assert from "node:assert/strict";
import { visibleActualInScope } from "../shared/actual-visibility.ts";
import { actualAllocationWorkbook } from "../frontend/src/allocation-export.ts";
import { scopeData } from "../shared/access.ts";

test("own resource display and Excel follow the same policy after a leadership transfer", () => {
  const resource = (id) => ({
    id,
    name: id,
    note: "Private HR",
    versions: [
      {
        team: "b",
        lead: "B",
        effective: "2026-01",
        status: "Aktif Çalışan",
        included: true,
        start: "2026-01-01",
        end: "",
        amount: 1,
      },
    ],
  });
  const data = {
    teams: ["a", "b"].map((id) => ({
      id,
      name: id,
      lead: id.toUpperCase(),
      excelCapacity: 0,
    })),
    leaders: ["A", "B"],
    projects: [
      {
        id: "p",
        name: "Synthetic project",
        start: "2026-01",
        end: "2026-12",
        phases: {},
      },
    ],
    resources: [resource("own"), resource("private-b")],
    allocations: {},
    revisions: {},
    actualAllocations: { "own|p|2026-01": 0.5, "private-b|p|2026-01": 0.25 },
  };
  const view = scopeData(data, {
    role: "normal",
    resourceId: "own",
    leaders: ["A"],
  });
  const teamIds = new Set(["a"]),
    own = view.resources[0];
  assert(visibleActualInScope(own, "2026-01", "2026-10", teamIds, "own"));
  assert.equal(
    visibleActualInScope(own, "2026-01", "2026-10", teamIds),
    undefined,
  );
  assert.equal(
    visibleActualInScope(own, "2026-11", "2026-10", teamIds, "own"),
    undefined,
  );
  const bytes = actualAllocationWorkbook(
    view,
    view.teams,
    view.projects,
    ["2026-01"],
    "2026-10",
    ["own"],
    "own",
  );
  const workbook = new TextDecoder().decode(bytes);
  assert(workbook.includes(">own</t>"));
  assert(!workbook.includes("private-b"));
  assert(!workbook.includes("Private HR"));
  assert.throws(
    () =>
      actualAllocationWorkbook(
        view,
        view.teams,
        view.projects,
        ["2026-01"],
        "2026-10",
        ["own"],
      ),
    /kayıt bulunamadı/,
  );
});
