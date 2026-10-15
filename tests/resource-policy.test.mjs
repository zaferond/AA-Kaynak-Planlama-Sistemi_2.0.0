import test from "node:test";
import assert from "node:assert/strict";
import { validate } from "../shared/server-domain.ts";
import { applyChanges, restore } from "../backend/operations.mjs";
import { assertResourceDates } from "../shared/resource-policy.ts";

const admin = { _id: "root-admin", role: "admin", leaders: [] };
const fixture = (status = "Aktif Çalışan", included = true) => ({
  teams: [
    { id: "t", name: "Team", lead: "L", excelCapacity: 0, catalog: true },
  ],
  catalogVersion: 2,
  leaders: ["L"],
  projects: [],
  allocations: {},
  revisions: {},
  resources: [
    {
      id: "r",
      name: "Synthetic",
      note: "",
      versions: [
        {
          effective: "2026-01",
          team: "t",
          lead: "L",
          status,
          included,
          start: "",
          end: "",
          amount: 1,
        },
      ],
    },
  ],
});

test("server and editor share mandatory start dates for new working versions and included postings", () => {
  for (const status of [
    "Aktif Çalışan",
    "Gear Up",
    "SAAT Ücretli Ofis Ç.",
    "Aktif İlan",
  ]) {
    const data = fixture(status);
    assert.throws(() => validate(data), /İşbaşı Tarihi/, status);
    assert.throws(
      () => assertResourceDates(data.resources[0].versions[0]),
      /İşbaşı Tarihi/,
      status,
    );
    const empty = { ...data, resources: [] };
    assert.throws(
      () =>
        applyChanges(empty, admin, [
          { kind: "resource", id: "r", revision: 0, value: data.resources[0] },
        ]),
      /İşbaşı Tarihi/,
      status,
    );
    data.resources[0].versions[0].start = "2026-01-01";
    assert.doesNotThrow(() => validate(data), status);
  }
  for (const status of ["Aktif İlan", "Pasif İlan"])
    assert.doesNotThrow(() => validate(fixture(status, false)));
});

test("unchanged legacy undated working history survives unrelated changes; new periods cannot inherit the exception", () => {
  const data = fixture();
  const old = structuredClone(data.resources);
  applyChanges(data, admin, [
    {
      kind: "project",
      id: "p",
      revision: 0,
      value: {
        id: "p",
        name: "Synthetic",
        start: "2026-01",
        end: "2026-12",
        phases: {},
      },
    },
  ]);
  assert.deepEqual(data.resources, old);
  const resource = structuredClone(data.resources[0]);
  resource.versions.push({ ...resource.versions[0], effective: "2026-02" });
  assert.throws(
    () =>
      applyChanges(data, admin, [
        { kind: "resource", id: "r", revision: 0, value: resource },
      ]),
    /İşbaşı Tarihi/,
  );
  const changed = fixture();
  changed.resources[0].versions[0].amount = 2;
  assert.throws(
    () => validate(changed, { previousResources: old }),
    /İşbaşı Tarihi/,
  );
  assert.doesNotThrow(() => validate(fixture(), { previousResources: old }));
});

test("JSON restores cannot introduce new undated working resources", () => {
  const target = { ...fixture(), resources: [] };
  assert.throws(() => restore(target, admin, fixture()), /İşbaşı Tarihi/);
  assert.deepEqual(target.resources, []);
});

test("JSON restore preserves the same legacy undated period without inventing a historical date", () => {
  const target = fixture();
  const before = structuredClone(target.resources);
  assert.doesNotThrow(() => restore(target, admin, structuredClone(target)));
  assert.deepEqual(target.resources, before);
  const changed = structuredClone(target);
  changed.resources[0].versions[0].status = "Gear Up";
  assert.throws(() => restore(target, admin, changed), /İşbaşı Tarihi/);
  assert.deepEqual(target.resources, before);
});
