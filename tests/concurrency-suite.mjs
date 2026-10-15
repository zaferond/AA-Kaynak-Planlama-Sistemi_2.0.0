import assert from "node:assert/strict";
import http from "node:http";
import { createApp } from "../backend/app.mjs";
import { hashPassword } from "../backend/auth.mjs";
import { effectivePersonHoursInMonth } from "../shared/actual-units.ts";
import {
  startCalendarDraft,
  addCalendarDates,
  prepareCalendarChange,
} from "../frontend/src/features/calendar-commands.ts";
import {
  prepareActualAllocationChange,
  prepareWorkedHoursChange,
} from "../frontend/src/features/actual-allocation-commands.ts";
import { preparePersonalDayChange } from "../frontend/src/features/calendar-commands.ts";
import { createActualMonthIndex } from "../shared/actual-months.ts";

// Both adapters run this suite against a disposable, explicitly selected test DB.
export async function concurrencySuite(store, t) {
  assert.equal(store.env.NODE_ENV, "test", "Ayrı test ortamı gerekli.");
  const password = "Concurrency-test-only-284!";
  await store.bootstrapUser({
    _id: "concurrency-admin",
    username: "concurrency.admin",
    name: "Test",
    role: "admin",
    leaders: [],
    active: true,
    password: await hashPassword(password),
    revision: 1,
    version: 1,
  });
  const server = http.createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = "http://127.0.0.1:" + server.address().port;
  // This suite verifies all 24 accepted writes and revision conflicts. The
  // default admission overload/rejection contract has its own HTTP suite.
  const app = createApp(store, {
    origin,
    mutationLimits: { pendingLimit: 32, waitMs: 10000 },
  });
  server.on("request", app);
  async function request(url, body, auth = {}) {
    const response = await fetch(origin + "/api" + url, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        ...(auth.cookie ? { Cookie: auth.cookie } : {}),
        ...(body === undefined
          ? {}
          : {
              Origin: origin,
              "Content-Type": "application/json",
              "X-Requested-With": "KaynakPortal",
              "X-CSRF-Token": auth.csrf || "",
            }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, json: await response.json(), response };
  }
  async function login() {
    const result = await request("/auth/login", {
      username: "concurrency.admin",
      password,
    });
    assert.equal(result.status, 200);
    return {
      cookie: result.response.headers.get("set-cookie").split(";")[0],
      csrf: result.json.csrf,
    };
  }
  try {
    const clients = await Promise.all([login(), login()]);
    assert.notEqual(clients[0].cookie, clients[1].cookie);
    const state = async () => {
      const result = await request("/data", undefined, clients[0]);
      assert.equal(result.status, 200);
      return result.json;
    };
    const history = async () => {
      const result = await request("/audit", undefined, clients[0]);
      assert.equal(result.status, 200);
      return result.json;
    };
    const write = (changes, index = 0) =>
      request("/changes", { changes }, clients[index % 2]);
    const base = await state();
    const team = base.data.teams.find((item) => item.lead);
    assert(team);
    const projects = [0, 1, 2].map((i) => ({
      id: "concurrent-p" + i,
      name: "Test Projesi " + i,
      start: "2025-01",
      end: "2030-12",
      phases: {},
    }));
    const resources = [0, 1].map((i) => ({
      id: "concurrent-r" + i,
      name: "Test Çalışanı " + i,
      note: "",
      versions: [
        {
          effective: "2025-01",
          team: team.id,
          lead: team.lead,
          status: "Aktif Çalışan",
          included: true,
          amount: 1,
          start: "2025-01-01",
          end: "",
        },
      ],
    }));
    assert.equal(
      (
        await write([
          ...projects.map((value) => ({
            kind: "project",
            id: value.id,
            value,
            revision: 0,
          })),
          ...resources.map((value) => ({
            kind: "resource",
            id: value.id,
            value,
            revision: 0,
          })),
        ])
      ).status,
      200,
    );
    const allocation = (id, value, revision = 0) => ({
      kind: "allocation",
      id,
      value,
      revision,
    });
    const shared = team.id + "|concurrent-p2|2026-01";

    await t.test(
      "independent sessions racing on one cell produce exactly one commit",
      async () => {
        const before = await state(),
          audit = await history();
        const results = await Promise.all(
          Array.from({ length: 12 }, (_, i) =>
            write([allocation(shared, (i + 1) / 10)], i),
          ),
        );
        assert.equal(results.filter((r) => r.status === 200).length, 1);
        assert.equal(results.filter((r) => r.status === 409).length, 11);
        const winner = results.findIndex((r) => r.status === 200);
        const after = await state();
        assert.equal(after.data.allocations[shared], (winner + 1) / 10);
        assert.equal(after.data.revisions["allocation:" + shared], 1);
        assert.equal(after.generation, before.generation + 1);
        assert.equal((await history()).total, audit.total + 1);
      },
    );

    await t.test(
      "24 parallel writes to different cells preserve every value and revision",
      async () => {
        const before = await state(),
          audit = await history();
        const edits = Array.from({ length: 24 }, (_, i) =>
          allocation(
            team.id +
              "|concurrent-p" +
              (i % 2) +
              "|2026-" +
              String(Math.floor(i / 2) + 1).padStart(2, "0"),
            (i + 1) / 10,
          ),
        );
        const responses = await Promise.all(
          edits.map(async (edit, i) => {
            const start = performance.now();
            const result = await write([edit], i);
            return {
              edit,
              status: result.status,
              view: result.json,
              elapsed: performance.now() - start,
            };
          }),
        );
        for (const { status, view } of responses)
          assert.equal(status, 200, JSON.stringify(view));
        assert.deepEqual(
          responses.map(({ view }) => view.generation).sort((a, b) => a - b),
          edits.map((_, i) => before.generation + i + 1),
        );
        for (const { edit, view } of responses) {
          assert.equal(view.data.allocations[edit.id], edit.value);
          assert.equal(view.data.revisions["allocation:" + edit.id], 1);
          // Each full snapshot describes this commit, not a later queued write.
          assert.equal(
            edits.filter((item) =>
              Object.hasOwn(view.data.allocations, item.id),
            ).length,
            view.generation - before.generation,
          );
        }
        const after = await state();
        for (const edit of edits) {
          assert.equal(after.data.allocations[edit.id], edit.value);
          assert.equal(after.data.revisions["allocation:" + edit.id], 1);
        }
        assert.equal(after.generation, before.generation + edits.length);
        assert.equal((await history()).total, audit.total + edits.length);
        const elapsed = responses
          .map((item) => item.elapsed)
          .sort((a, b) => a - b);
        t.diagnostic(
          "Local client latency, 24 requests: median=" +
            Math.round(elapsed[11]) +
            " ms, p95=" +
            Math.round(elapsed[22]) +
            " ms. No production throughput claim.",
        );
      },
    );

    await t.test(
      "overlapping batches roll back the loser's other cells, audit and generation",
      async () => {
        const before = await state(),
          audit = await history();
        const markers = ["2026-02", "2026-03"].map(
          (m) => team.id + "|concurrent-p2|" + m,
        );
        const results = await Promise.all(
          markers.map((id, i) =>
            write([allocation(id, 2 + i), allocation(shared, 4 + i, 1)], i),
          ),
        );
        assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
        const winner = results.findIndex((r) => r.status === 200),
          loser = 1 - winner;
        const after = await state();
        assert.equal(after.data.allocations[markers[winner]], 2 + winner);
        assert.equal(after.data.allocations[markers[loser]], undefined);
        assert.equal(
          after.data.revisions["allocation:" + markers[loser]],
          undefined,
        );
        assert.equal(after.data.allocations[shared], 4 + winner);
        assert.equal(after.data.revisions["allocation:" + shared], 2);
        assert.equal(after.generation, before.generation + 1);
        assert.equal((await history()).total, audit.total + 2);
      },
    );

    await t.test(
      "concurrent allocations to separate projects cannot overbook one person's month",
      async () => {
        const before = await state(),
          audit = await history();
        const edits = [0, 1].map((i) => ({
          kind: "actual",
          id: "concurrent-r0|concurrent-p" + i + "|2026-01",
          value: { unit: "percent", value: 70 },
          revision: 0,
        }));
        const results = await Promise.all(
          edits.map((edit, i) => write([edit], i)),
        );
        assert.deepEqual(results.map((r) => r.status).sort(), [200, 400]);
        const winner = results.findIndex((r) => r.status === 200),
          after = await state();
        assert.equal(after.data.actualPercentEntries[edits[winner].id], 70);
        assert.equal(
          after.data.actualAllocations[edits[1 - winner].id],
          undefined,
        );
        assert.equal(
          after.data.revisions["actual:" + edits[1 - winner].id],
          undefined,
        );
        assert.equal(after.generation, before.generation + 1);
        assert.equal((await history()).total, audit.total + 1);
      },
    );

    await t.test(
      "calendar changes racing with actual entry preserve hours and the monthly limit",
      async () => {
        const before = await state(),
          audit = await history();
        const actualKey = "concurrent-r1|concurrent-p0|2026-02",
          date = "2026-02-02";
        assert.equal(before.data.workCalendar?.[date], undefined);
        const edits = [
          {
            kind: "actual",
            id: actualKey,
            value: { unit: "percent", value: 100 },
            revision: 0,
          },
          {
            kind: "calendar",
            id: "shared",
            value: {
              ...before.data.workCalendar,
              [date]: {
                type: "company",
                label: "Test çalışma dışı günü",
                fraction: 1,
              },
            },
            revision: before.data.revisions["calendar:shared"] || 0,
          },
        ];
        const results = await Promise.all(
          edits.map((edit, i) => write([edit], i)),
        );
        assert.equal(results[0].status, 200, JSON.stringify(results[0].json));
        assert(
          [200, 400].includes(results[1].status),
          JSON.stringify(results[1].json),
        );
        const after = await state();
        const hours = effectivePersonHoursInMonth(
          "2026-02",
          "concurrent-r1",
          undefined,
          after.data.workCalendar,
          after.data.personCalendar,
        );
        assert(
          Math.abs(after.data.actualAllocations[actualKey] * 180 - hours) <
            1e-8,
        );
        assert.equal(after.data.actualPercentEntries[actualKey], 100);
        assert.equal(
          !!after.data.workCalendar[date],
          results[1].status === 200,
        );
        assert.equal(
          after.generation,
          before.generation + results.filter((r) => r.status === 200).length,
        );
        const delta = (await history()).total - audit.total;
        assert.equal(delta, results[1].status === 200 ? 2 : 1);
      },
    );
    await t.test(
      "an open calendar draft cannot overwrite a newer calendar after background refresh",
      async () => {
        const before = await state();
        const input = (date) => ({
          from: date,
          to: "",
          type: "official",
          label: "Test",
          fraction: 1,
        });
        const pendingDraft = addCalendarDates(
          startCalendarDraft(before.data),
          input("2026-12-01"),
        );
        const otherDraft = addCalendarDates(
          startCalendarDraft(before.data),
          input("2026-12-02"),
        );
        const saved = await write([prepareCalendarChange(otherDraft)], 1);
        assert.equal(saved.status, 200, JSON.stringify(saved.json));
        const refreshed = await state(),
          audit = await history();
        assert.equal(
          refreshed.data.revisions["calendar:shared"],
          pendingDraft.revision + 1,
        );
        const result = await write([prepareCalendarChange(pendingDraft)]);
        assert.equal(result.status, 409, JSON.stringify(result.json));
        assert.deepEqual(await state(), refreshed);
        assert.equal((await history()).total, audit.total);
        assert.equal(refreshed.data.workCalendar["2026-12-01"], undefined);
        assert.equal(refreshed.data.workCalendar["2026-12-02"].label, "Test");
        // Reopening takes the current snapshot; both administrators' dates can then be retained.
        const reopened = addCalendarDates(
          startCalendarDraft(refreshed.data),
          input("2026-12-01"),
        );
        const retry = await write([prepareCalendarChange(reopened)]);
        assert.equal(retry.status, 200, JSON.stringify(retry.json));
        const after = await state();
        assert.equal(after.data.workCalendar["2026-12-01"].label, "Test");
        assert.equal(after.data.workCalendar["2026-12-02"].label, "Test");
        assert.equal(after.generation, refreshed.generation + 1);
        assert.equal((await history()).total, audit.total + 1);
      },
    );
    await t.test(
      "net-hour and allocation commands preserve server totals and automatic-hour reset",
      async () => {
        const before = await state(),
          audit = await history();
        const resourceId = "concurrent-r0",
          month = "2026-09";
        const calendar = addCalendarDates(startCalendarDraft(before.data), {
          from: "2026-09-01",
          to: "",
          type: "company",
          label: "Yarım gün",
          fraction: 0.5,
        });
        const setup = await write([
          prepareCalendarChange(calendar),
          preparePersonalDayChange(before.data, resourceId, {
            date: "2026-09-03",
            type: "leave",
            hours: "2,5",
            label: "",
          }),
          preparePersonalDayChange(before.data, resourceId, {
            date: "2026-09-04",
            type: "training",
            hours: "3",
            label: "",
          }),
        ]);
        assert.equal(setup.status, 200, JSON.stringify(setup.json));
        let current = await state();
        const hours = await write([
          prepareWorkedHoursChange(current.data, resourceId, month, 129),
        ]);
        assert.equal(hours.status, 200, JSON.stringify(hours.json));
        current = await state();
        assert.equal(
          current.data.actualWorkedHours[resourceId + "|" + month],
          136,
        );
        assert.equal(
          createActualMonthIndex(current.data).get(resourceId, month)
            .effectiveHours,
          129,
        );
        const entry = prepareActualAllocationChange(
          current.data,
          resourceId,
          "concurrent-p0",
          month,
          { unit: "percent", value: 50 },
        );
        const allocated = await write([entry]);
        assert.equal(allocated.status, 200, JSON.stringify(allocated.json));
        current = await state();
        assert.equal(current.data.actualAllocations[entry.id] * 180, 64.5);
        assert.equal(current.data.actualPercentEntries[entry.id], 50);
        assert.equal(
          createActualMonthIndex(current.data).get(resourceId, month)
            .trainingHours,
          3,
        );
        const reset = await write([
          prepareWorkedHoursChange(current.data, resourceId, month, null),
        ]);
        assert.equal(reset.status, 200, JSON.stringify(reset.json));
        const after = await state();
        assert.equal(
          after.data.actualWorkedHours[resourceId + "|" + month],
          undefined,
        );
        assert.equal(
          createActualMonthIndex(after.data).get(resourceId, month)
            .effectiveHours,
          191,
        );
        assert.equal(after.data.actualAllocations[entry.id] * 180, 64.5);
        assert(
          Math.abs(
            after.data.actualPercentEntries[entry.id] - (64.5 / 191) * 100,
          ) < 1e-9,
        );
        assert.equal(after.generation, before.generation + 4);
        assert.equal((await history()).total, audit.total + 6);
      },
    );
    await t.test(
      "readers never observe half of a committed two-cell batch",
      async () => {
        const keys = ["2026-04", "2026-05"].map(
          (month) => team.id + "|concurrent-p2|" + month,
        );
        const before = await state(),
          audit = await history();
        const writer = async () => {
          for (let i = 0; i < 8; i++) {
            const result = await write(
              keys.map((key) => allocation(key, i + 1, i)),
              i,
            );
            assert.equal(result.status, 200, JSON.stringify(result.json));
          }
        };
        const reader = async () => {
          for (let i = 0; i < 8; i++) {
            const snapshot = await state();
            assert.equal(
              snapshot.data.allocations[keys[0]],
              snapshot.data.allocations[keys[1]],
            );
            assert.equal(
              snapshot.data.revisions["allocation:" + keys[0]],
              snapshot.data.revisions["allocation:" + keys[1]],
            );
          }
        };
        await Promise.all([writer(), reader(), reader()]);
        const after = await state();
        for (const key of keys) {
          assert.equal(after.data.allocations[key], 8);
          assert.equal(after.data.revisions["allocation:" + key], 8);
        }
        assert.equal(after.generation, before.generation + 8);
        assert.equal((await history()).total, audit.total + 16);
      },
    );
    const final = await state();
    return {
      data: final.data,
      generation: final.generation,
      auditTotal: (await history()).total,
    };
  } finally {
    app.locals.close();
    await new Promise((resolve) => server.close(resolve));
  }
}
