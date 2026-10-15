import test from "node:test";
import assert from "node:assert/strict";
import {
  employeeAccountRows,
  employeeSearchField,
} from "../frontend/src/features/access/employee-account-rows.ts";
const account = (id, resourceId = "", patch = {}) => ({
  id,
  resourceId,
  name: "Synthetic " + id,
  username: "qa." + id,
  email: id + "@example.invalid",
  role: "normal",
  leaders: [],
  active: true,
  ...patch,
});
const data = () => ({
  teams: [
    { id: "a", name: "Team A", lead: "A" },
    { id: "b", name: "Team B", lead: "B" },
  ],
  resources: ["a", "b"].map((id) => ({
    id,
    name: "Worker " + id,
    note: "",
    versions: [
      {
        team: id,
        lead: id.toUpperCase(),
        effective: "2026-01",
        status: "Aktif Çalışan",
        included: true,
        start: "2026-01-01",
        end: "",
        amount: 1,
      },
    ],
  })),
  users: [
    account("root-admin", "", { role: "admin" }),
    account("linked", "a"),
    account("inactive", "", { active: false }),
    account("orphan", "deleted"),
  ],
});
const filter = {
  start: "2026-10",
  ids: ["a", "b"],
  teamIds: [],
  leads: [],
  search: "",
};
test("joined administration rows retain unlinked, revoked and orphan accounts; linked employees appear once", () => {
  const rows = employeeAccountRows(data(), filter);
  assert.equal(rows.length, 5);
  assert.equal(rows[0].account.id, "root-admin");
  assert.equal(rows.filter((r) => r.resource?.id === "a").length, 1);
  assert.equal(rows.find((r) => r.resource?.id === "a").account.id, "linked");
  for (const id of ["root-admin", "inactive", "orphan"])
    assert(rows.some((r) => r.account?.id === id && !r.resource));
});
test("organisational filters retain system/unlinked accounts and account search matches username/mail without duplicating links", () => {
  const d = data();
  let rows = employeeAccountRows(d, {
    ...filter,
    ids: ["b"],
    teamIds: ["b"],
    leads: ["B"],
  });
  assert(!rows.some((r) => r.resource?.id === "a"));
  assert(rows.some((r) => r.account?.id === "root-admin"));
  for (const search of ["qa.linked", "linked@example.invalid", "Worker a"]) {
    rows = employeeAccountRows(d, { ...filter, search });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].resource.id, "a");
  }
  d.users[0].resourceId = "a";
  rows = employeeAccountRows(d, {
    ...filter,
    ids: ["b"],
    teamIds: ["b"],
    leads: ["B"],
  });
  assert.equal(rows.filter((r) => r.account?.id === "root-admin").length, 1);
});

test("root leadership filters retain authorized descendant employees without admitting other leaderships", () => {
  const d = data();
  d.leaders = ["Root", "A", "B"];
  d.leaderParents = { A: "Root" };
  const rows = employeeAccountRows(d, {
    ...filter,
    ids: ["a"],
    leads: ["Root"],
  });
  assert(rows.some((r) => r.resource?.id === "a"));
  assert(!rows.some((r) => r.resource?.id === "b"));
  assert(rows.some((r) => r.account?.id === "root-admin"));
});

test("quick search matches team names, actual team leadership and ancestor leadership without mutating records", () => {
  const d = data();
  d.leaders = ["Engineering", "A", "B"];
  d.leaderParents = { A: "Engineering" };
  d.teams[0].name = "Yapısal Tasarım";
  d.resources[0].versions[0].lead = "";
  const before = structuredClone(d);
  for (const search of ["yapisal tasarim", " Engineering ", "A"]) {
    const rows = employeeAccountRows(d, { ...filter, search });
    assert(rows.some((r) => r.resource?.id === "a"));
  }
  assert(
    !employeeAccountRows(d, { ...filter, search: "Engineering" }).some(
      (r) => r.resource?.id === "b",
    ),
  );
  assert.equal(employeeSearchField(d, "yapisal"), "team");
  assert.equal(employeeSearchField(d, "Engineering"), "leader");
  assert.equal(employeeSearchField(d, "Worker a"), "search");
  assert.deepEqual(d, before);
});
