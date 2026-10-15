import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { applyChanges } from "../backend/operations.mjs";
import { Store } from "../backend/store.mjs";
import {
  activeTeamMembers,
  buildCapacityIndex,
  validate,
} from "../backend/domain/index.mjs";
import { buildHeadcountTrend } from "../frontend/src/headcount-trend.ts";
import {
  resourceVersionForEdit,
  resourceVersionForSave,
} from "../frontend/src/resource-version-edit.ts";

const admin = { _id: "root-admin", role: "admin", leaders: [] };
const months = [
  "2026-08",
  "2026-09",
  "2026-10",
  "2026-11",
  "2026-12",
  "2027-01",
];
const fixture = () => ({
  teams: [
    { id: "t", name: "Takım", lead: "L", excelCapacity: 0, catalog: true },
    { id: "other", name: "Diğer", lead: "M", excelCapacity: 0, catalog: true },
  ],
  projects: [
    { id: "p", name: "Proje", start: "2026-01", end: "2027-12", phases: {} },
  ],
  resources: [],
  allocations: { "t|p|2026-09": 0.25 },
  revisions: {},
  leaders: ["L", "M"],
  catalogVersion: 2,
});
const version = (status, effective = "2026-09", values = {}) => ({
  effective,
  team: "t",
  lead: "L",
  status,
  included: true,
  start: "2026-09-01",
  end: "",
  amount: 1,
  ...values,
});
const resource = (id, ...versions) => ({ id, name: id, note: "", versions });
function save(d, r) {
  applyChanges(d, admin, [
    {
      kind: "resource",
      id: r.id,
      value: r,
      revision: d.revisions["resource:" + r.id] || 0,
    },
  ]);
  return d.resources.find((item) => item.id === r.id);
}
function values(d, team = "t") {
  const index = buildCapacityIndex(d, months);
  return months.map((month) => index[team + "|" + month].current);
}
function close(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`);
}

test("included active posting enters Active Resource at its start date and leaves when inclusion is switched off", () => {
  const d = fixture();
  let r = save(
    d,
    resource(
      "ilan",
      version("Aktif İlan", "2026-09", {
        included: false,
        start: "2026-09-16",
        amount: 1.5,
      }),
    ),
  );
  assert.deepEqual(values(d).slice(0, 3), [0, 0, 0]);
  const excludedForecast = buildHeadcountTrend(
    d,
    ["t"],
    [],
    ["2026-10"],
    "2026-09",
  );
  assert.equal(excludedForecast[0].postings, 1);
  assert.equal(excludedForecast[0].actualCount, 0);
  r = save(d, { ...r, versions: [{ ...r.versions[0], included: true }] });
  close(values(d)[1], (1.5 * 15) / 30);
  close(values(d)[2], 1.5);
  assert.equal(buildCapacityIndex(d, ["2026-09"])["t|2026-09"].total, 0.25);
  assert.deepEqual(activeTeamMembers(d, "2026-09"), {});
  assert.equal(
    buildHeadcountTrend(d, ["t"], [], ["2026-10"], "2026-09")[0].postings,
    1,
  );
  r = save(d, { ...r, versions: [{ ...r.versions[0], included: false }] });
  assert.deepEqual(values(d).slice(0, 3), [0, 0, 0]);
  assert.deepEqual(
    buildHeadcountTrend(d, ["t"], [], ["2026-10"], "2026-09"),
    excludedForecast,
  );
  assert.equal(buildCapacityIndex(d, ["2026-09"])["t|2026-09"].total, 0.25);
  r = save(d, { ...r, versions: [{ ...r.versions[0], included: true }] });
  close(values(d)[1], 0.75);
  assert.equal(r.versions.length, 1);
});

test("passive posting stays out even if marked included; a later active posting counts only from its effective month", () => {
  const d = fixture();
  const passive = version("Pasif İlan", "2026-09", {
    included: true,
    start: "2026-09-11",
    amount: 2,
  });
  let r = save(d, resource("ilan", passive));
  assert.deepEqual(values(d).slice(0, 3), [0, 0, 0]);
  r = save(d, {
    ...r,
    versions: [
      passive,
      version("Aktif İlan", "2026-10", {
        included: true,
        start: "2026-10-16",
        amount: 2,
      }),
    ],
  });
  close(values(d)[1], 0);
  close(values(d)[2], (2 * 16) / 31);
  close(values(d)[3], 2);
  r = save(d, {
    ...r,
    versions: [
      ...r.versions,
      version("Pasif İlan", "2026-11", {
        included: true,
        start: "",
        amount: 2,
      }),
    ],
  });
  close(values(d)[2], (2 * 16) / 31);
  close(values(d)[3], 0);
  assert.deepEqual(activeTeamMembers(d, "2026-10"), {});
});

test("working statuses follow inclusion and partial dates; team changes move Active Resource without duplication", () => {
  for (const status of ["Aktif Çalışan", "Gear Up", "SAAT Ücretli Ofis Ç."]) {
    const d = fixture();
    let r = save(
      d,
      resource(
        "person",
        version(status, "2026-09", {
          start: "2026-09-16",
          end: "2026-10-10",
          amount: 0.8,
        }),
      ),
    );
    close(values(d)[1], (0.8 * 15) / 30);
    close(values(d)[2], (0.8 * 10) / 31);
    assert.deepEqual(activeTeamMembers(d, "2026-09"), { t: ["person"] });
    r = save(d, { ...r, versions: [{ ...r.versions[0], included: false }] });
    assert.deepEqual(values(d).slice(0, 4), [0, 0, 0, 0]);
    assert.deepEqual(activeTeamMembers(d, "2026-09"), {});
    r = save(d, {
      ...r,
      versions: [
        { ...r.versions[0], included: true, team: "other", lead: "M" },
      ],
    });
    close(values(d)[1], 0);
    close(values(d, "other")[1], (0.8 * 15) / 30);
  }
});

test("departure ends capacity on its date and does not remain in the active member badge", () => {
  const d = fixture();
  const before = version("Aktif Çalışan", "2026-01", {
    start: "2026-01-01",
    end: "",
  });
  const after = version("İşten Ayrıldı", "2026-10", {
    start: "2026-01-01",
    end: "2026-10-10",
  });
  save(d, resource("person", before, after));
  const index = buildCapacityIndex(d, months);
  close(index["t|2026-09"].current, 1);
  close(index["t|2026-10"].current, 10 / 31);
  close(index["t|2026-11"].current, 0);
  assert.deepEqual(activeTeamMembers(d, "2026-09"), { t: ["person"] });
  assert.deepEqual(activeTeamMembers(d, "2026-10"), {});
  const trend = buildHeadcountTrend(
    d,
    ["t"],
    [],
    ["2026-09", "2026-10", "2026-11"],
    "2026-11",
  );
  close(trend[1].active, 10 / 31);
  close(trend[2].active, 0);
});

test("editing a future first posting before its month updates that record instead of creating an earlier false version", () => {
  const d = fixture();
  const first = version("Aktif İlan", "2026-12", {
    start: "2026-12-16",
    included: true,
  });
  let r = save(d, resource("future", first));
  const draft = resourceVersionForEdit(r, "2026-09");
  assert.equal(draft.effective, "2026-12");
  const off = resourceVersionForSave(
    r,
    { ...draft, included: false },
    false,
    "2026-09",
  );
  r = save(d, {
    ...off.resource,
    versions: [
      ...off.resource.versions.filter(
        (item) => item.effective !== off.version.effective,
      ),
      off.version,
    ],
  });
  assert.deepEqual(
    r.versions.map((item) => item.effective),
    ["2026-12"],
  );
  close(values(d)[4], 0);
  const on = resourceVersionForSave(
    r,
    { ...resourceVersionForEdit(r, "2026-09"), included: true },
    false,
    "2026-09",
  );
  r = save(d, { ...on.resource, versions: [on.version] });
  close(values(d)[4], 16 / 31);
  assert.equal(r.versions.length, 1);
});

test("moving the first work start earlier also moves its effective month", () => {
  const d = fixture();
  let r = save(
    d,
    resource(
      "future",
      version("Aktif İlan", "2026-12", { start: "2026-12-16" }),
    ),
  );
  const draft = {
    ...resourceVersionForEdit(r, "2026-09"),
    start: "2026-11-16",
  };
  const moved = resourceVersionForSave(r, draft, false, "2026-09");
  r = save(d, {
    ...moved.resource,
    versions: [...moved.resource.versions, moved.version],
  });
  assert.deepEqual(
    r.versions.map((item) => item.effective),
    ["2026-11"],
  );
  close(values(d)[3], 15 / 30);
  close(values(d)[4], 1);
});

test("moving a start date later does not rewrite the first effective month", () => {
  const r = resource(
    "person",
    version("Aktif Çalışan", "2026-09", { start: "2026-01-01" }),
  );
  const draft = {
    ...resourceVersionForEdit(r, "2026-09"),
    start: "2026-02-01",
  };
  const prepared = resourceVersionForSave(r, draft, false, "2026-09");
  assert.equal(prepared.version.effective, "2026-09");
  assert.equal(prepared.resource.versions.length, 1);
});

test("editing a later month preserves earlier inclusion and capacity", () => {
  const d = fixture();
  const first = version("Aktif İlan", "2026-09", {
    start: "2026-09-16",
    included: true,
  });
  let r = save(d, resource("ilan", first));
  const draft = resourceVersionForEdit(r, "2026-11");
  assert.equal(draft.effective, "2026-11");
  r = save(d, {
    ...r,
    versions: [...r.versions, { ...draft, included: false }],
  });
  close(values(d)[1], 15 / 30);
  close(values(d)[2], 1);
  close(values(d)[3], 0);
  close(values(d)[4], 0);
  assert.deepEqual(
    r.versions.map((item) => item.effective),
    ["2026-09", "2026-11"],
  );
});

test("active posting inclusion persists through a database restart", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "aa-active-resource-"));
  const file = path.join(dir, "plan.sqlite");
  let store = new Store({ env: { DB_PROVIDER: "sqljs", SQLJS_FILE: file } });
  try {
    await store.connect();
    let before = (await store.read()).data;
    const team = before.teams[0];
    const id = "scenario-posting";
    const entry = resource(
      id,
      version("Aktif İlan", "2026-09", {
        team: team.id,
        lead: team.lead,
        start: "2026-09-16",
        included: true,
      }),
    );
    async function persist(nextEntry) {
      const next = validate({
        ...before,
        resources: [
          ...before.resources.filter((item) => item.id !== id),
          nextEntry,
        ],
      });
      await store.transaction((c) => store.persist(before, next, c));
      before = (await store.read()).data;
      return before.resources.find((item) => item.id === id);
    }
    let saved = await persist(entry);
    close(
      buildCapacityIndex(before, ["2026-09"])[team.id + "|2026-09"].current,
      0.5,
    );
    saved = await persist({
      ...saved,
      versions: [{ ...saved.versions[0], included: false }],
    });
    close(
      buildCapacityIndex(before, ["2026-09"])[team.id + "|2026-09"].current,
      0,
    );
    await store.close();
    store = new Store({ env: { DB_PROVIDER: "sqljs", SQLJS_FILE: file } });
    await store.connect();
    const reloaded = (await store.read()).data;
    assert.equal(
      reloaded.resources.find((item) => item.id === id).versions[0].included,
      false,
    );
    close(
      buildCapacityIndex(reloaded, ["2026-09"])[team.id + "|2026-09"].current,
      0,
    );
  } finally {
    await store.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("invalid inclusion and departure dates are rejected", () => {
  const d = fixture();
  d.resources = [
    resource(
      "posting",
      version("Aktif İlan", "2026-09", { included: true, start: "" }),
    ),
  ];
  assert.throws(() => validate(d), /İşbaşı Tarihi/);
  d.resources = [
    resource(
      "former",
      version("İşten Ayrıldı", "2026-09", { start: "2026-01-01", end: "" }),
    ),
  ];
  assert.throws(() => validate(d), /işten ayrılış tarihleri zorunludur/);
});
