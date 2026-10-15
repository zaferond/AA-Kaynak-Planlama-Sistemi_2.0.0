import assert from "node:assert/strict";
import { validate } from "../shared/server-domain.ts";
import { validate as referenceValidate } from "./snapshot-validation-reference.mjs";

export const validationFixture = () => ({
  teams: [{ id: "t", name: " Team ", lead: "A", excelCapacity: 0 }],
  projects: [
    {
      id: "p",
      name: " Project ",
      start: "2026-01",
      end: "2026-12",
      phases: {},
    },
  ],
  resources: [
    {
      id: "r",
      name: " Person ",
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
  riskSystems: [{ id: "s", name: " System " }],
  risks: [
    {
      id: "risk",
      projectId: "p",
      reportedBy: " Reporter ",
      category: "Teknik",
      reportedAt: "2026-01-01",
      system: "Old name",
      systemId: "s",
      description: " Risk ",
      cause: "",
      actionPlan: "",
      targetAt: "",
      status: "Açık",
      owner: "",
      likelihood: 3,
      impact: 3,
      strategy: "",
      implementedAt: "",
      actionResult: "",
      residualLikelihood: null,
      residualImpact: null,
      createdBy: "synthetic",
      createdByName: "Synthetic",
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
    },
  ],
  allocations: {},
  actualAllocations: {},
  actualWorkedHours: {},
  actualPercentEntries: {},
  workCalendar: {},
  personCalendar: {},
  revisions: {},
});

const outcome = (fn, input, options) => {
  try {
    return { data: fn(input, options) };
  } catch (error) {
    return {
      error: {
        name: error.name,
        message: error.message,
        status: error.status,
        issues: error.issues,
      },
    };
  }
};

// The frozen oracle predates hierarchy and responsibility roles. Compare only
// its legacy schema, while the current complete model is validated separately.
// Never claim that removing these fields independently tests their new rules.
export function legacyValidationProjection(input) {
  const legacy = structuredClone(input);
  delete legacy.leaderParents;
  delete legacy.leadershipUnits;
  for (const team of legacy.teams) delete team.kind;
  for (const resource of legacy.resources)
    for (const version of resource.versions) {
      assert(
        version.assignmentRole === undefined ||
          version.assignmentRole === "member",
        "Legacy oracle cannot validate leadership/PO responsibilities",
      );
      delete version.assignmentRole;
    }
  return legacy;
}
/** Compare complete results, including property order, Zod issues and first error. */
export function compareSnapshotValidation(input, options) {
  const before = JSON.stringify(input),
    beforeOptions = JSON.stringify(options);
  const expected = outcome(referenceValidate, input, options);
  assert.equal(JSON.stringify(input), before, "reference mutated input");
  const actual = outcome(validate, input, options);
  assert.deepEqual(actual, expected);
  assert.equal(JSON.stringify(actual), JSON.stringify(expected));
  assert.equal(JSON.stringify(input), before, "validator mutated input");
  assert.equal(
    JSON.stringify(options),
    beforeOptions,
    "validator mutated previous resources",
  );
  return actual;
}
