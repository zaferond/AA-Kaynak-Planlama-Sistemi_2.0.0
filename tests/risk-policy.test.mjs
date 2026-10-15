import test from "node:test";
import assert from "node:assert/strict";
import {
  riskCategories,
  riskStatuses,
  riskStrategyKeys,
  riskStrategies,
} from "../shared/risk-policy.ts";
import { riskWorkbook } from "../frontend/src/risk-export.ts";

test("Excel validation and strategy columns use the shared risk policy", () => {
  const sheet = new TextDecoder().decode(
    riskWorkbook(
      {
        id: "p",
        name: "Synthetic",
        phases: {},
        start: "2026-01",
        end: "2026-12",
      },
      [],
    ),
  );
  assert(sheet.includes('"' + riskCategories.join(",") + '"'));
  assert(sheet.includes('"' + riskStatuses.join(",") + '"'));
  assert.deepEqual(riskStrategies, ["", ...Object.values(riskStrategyKeys)]);
});
