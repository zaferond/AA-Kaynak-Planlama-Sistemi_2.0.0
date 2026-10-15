import test from "node:test";
import assert from "node:assert/strict";
import { riskCreationOrder } from "../frontend/src/risk-order.ts";

test("risk rows keep creation order when report dates or edits differ", () => {
  const first = {
    id: "first",
    createdAt: "2026-09-29T08:00:00.000Z",
    reportedAt: "2026-10-15",
    updatedAt: "2026-09-30T08:00:00.000Z",
  };
  const second = {
    id: "second",
    createdAt: "2026-09-30T08:00:00.000Z",
    reportedAt: "2026-09-01",
    updatedAt: "2026-09-30T08:00:00.000Z",
  };
  const source = [second, first];
  assert.deepEqual(
    riskCreationOrder(source).map((risk) => risk.id),
    ["first", "second"],
  );
  assert.deepEqual(
    source.map((risk) => risk.id),
    ["second", "first"],
  );
});
