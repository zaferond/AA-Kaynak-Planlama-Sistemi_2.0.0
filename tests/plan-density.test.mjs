import test from "node:test";
import assert from "node:assert/strict";
import {
  planDensity,
  planDensityTitle,
} from "../frontend/src/features/planned-allocation/plan-density.ts";

test("planned cell density follows the share of the unit's capacity", () => {
  assert.equal(planDensity(0, 10).level, 0);
  assert.equal(planDensity(-1, 10).level, 0);
  assert.equal(planDensity(0.5, 10).level, 1); // %5
  assert.equal(planDensity(1, 10).level, 2); // %10 starts level 2
  assert.equal(planDensity(2.5, 10).level, 3); // %25 starts level 3
  assert.equal(planDensity(5, 10).level, 4); // %50 and above
  assert.equal(planDensity(30, 10).level, 4);
  // Planning without any active capacity is the heaviest load.
  assert.equal(planDensity(0.25, 0).level, 4);
});

test("density title states the share without a Turkish suffix", () => {
  assert.equal(planDensityTitle(0, 4), undefined);
  assert.equal(planDensityTitle(1, 4), "Takımın aktif kaynağına oranı: %25");
  assert.equal(planDensityTitle(1, 0), "Bu ay takımın aktif kaynağı yok");
});
