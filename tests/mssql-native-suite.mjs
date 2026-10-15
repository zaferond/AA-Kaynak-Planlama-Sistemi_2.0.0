import assert from "node:assert/strict";
import sql from "mssql";
import fs from "node:fs/promises";
import { hashPassword } from "../backend/auth.mjs";
import { applyChanges, reset } from "../backend/operations.mjs";
import { readCompositeMap, readRevisionMap } from "../backend/read-records.mjs";
import { tables } from "../backend/tables.mjs";
import { seedBenchmarkStore } from "../scripts/benchmark-fixture.mjs";
import { createAttemptLimiter } from "../backend/rate-limits.mjs";
import { migrationSql, schemaVersion } from "../backend/migration-catalog.mjs";

function deferred() {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
const lockProbe =
  "DECLARE @r int; EXEC @r=sys.sp_getapplock @Resource=N'aa_kaynak_data', @LockMode=@p0, @LockOwner=N'Transaction', @LockTimeout=0; SELECT @r AS result;";

// node:test records a failing subtest without rejecting its returned promise.
// Propagate the failure so a later profile cannot produce a success report.
export function checkedNativeContext(t) {
  return {
    diagnostic: (message) => t.diagnostic(message),
    async test(name, fn) {
      let error;
      await t.test(name, async (sub) => {
        try {
          return await fn(sub);
        } catch (e) {
          error = e;
          throw e;
        }
      });
      if (error) throw error;
    },
  };
}

async function assertNativeLongTextUpgrade(c) {
  // A minimal historical column fixture isolates the default-constraint dependency.
  // The enclosing native-test lease owns this empty synthetic database only.
  await c.batch(`
    CREATE TABLE dbo.kp_project_milestones (
      id int NOT NULL PRIMARY KEY,
      bar_text nvarchar(200) NOT NULL CONSTRAINT [DF_legacy_bar_text]]name] DEFAULT N'Özel varsayılan'
    );
  `);
  const previous = "Eski Türkçe açıklama • 'alıntı' 😀";
  await c.query(
    "INSERT INTO dbo.kp_project_milestones(id,bar_text) VALUES(1,@p0)",
    [previous],
  );
  await c.batch(await migrationSql("mssql", 19));
  await c.query("INSERT INTO dbo.kp_project_milestones(id) VALUES(2)");
  const longer = "Yeni uzun açıklama 😀\n".repeat(2000);
  await c.query(
    "INSERT INTO dbo.kp_project_milestones(id,bar_text) VALUES(3,@p0)",
    [longer],
  );
  const rows = (
    await c.query(
      "SELECT id,bar_text FROM dbo.kp_project_milestones ORDER BY id",
    )
  ).rows;
  assert.deepEqual(rows, [
    { id: 1, bar_text: previous },
    { id: 2, bar_text: "Özel varsayılan" },
    { id: 3, bar_text: longer },
  ]);
  assert.equal(
    (
      await c.query(
        "SELECT name FROM sys.default_constraints WHERE parent_object_id=OBJECT_ID(N'dbo.kp_project_milestones')",
      )
    ).rows[0].name,
    "DF_legacy_bar_text]name",
  );
  // Restore the v2 fixture before the normal complete legacy upgrade.
  await c.batch(
    "DROP TABLE dbo.kp_project_milestones; DELETE FROM dbo.kp_schema_migrations WHERE version=19;",
  );
}

export async function nativeUpgradeSuite(store) {
  await store.db.open();
  await store.db.transaction(async (c) => {
    for (const version of ["001", "002"])
      await c.batch(
        await fs.readFile(
          new URL(
            `../backend/migrations/${version}_mssql.sql`,
            import.meta.url,
          ),
          "utf8",
        ),
      );
    await assertNativeLongTextUpgrade(c);
    await c.batch(`
      INSERT INTO kp_settings VALUES(1,4,NULL);
      INSERT INTO kp_teams VALUES(N'legacy-t',N'Takım',NULL,0,1);
      INSERT INTO kp_projects VALUES(N'legacy-p',N'Proje','2026-01','2026-12');
      INSERT INTO kp_resources VALUES(N'legacy-a',N'Ali',N'',NULL),(N'legacy-b',N'Ayşe',N'',NULL);
      INSERT INTO kp_resource_versions VALUES(N'legacy-a','2026-01',N'legacy-t',NULL,N'Aktif Çalışan',1,NULL,NULL,1),(N'legacy-b','2026-01',N'legacy-t',NULL,N'Gear Up',1,NULL,NULL,1);
      INSERT INTO kp_person_allocations VALUES(N'legacy-a',N'legacy-p','2026-09',0.5),(N'legacy-b',N'legacy-p','2026-09',0.25);
    `);
  });
  await store.connect();
  const before = await store.read();
  assert.equal(before.data.allocations["legacy-t|legacy-p|2026-09"], 0.75);
  assert.equal(
    before.data.resources.find((r) => r.id === "legacy-b").name,
    "Ayşe",
  );
  assert.equal(
    Number(
      (await store.db.query("SELECT COUNT(*) AS n FROM kp_person_allocations"))
        .rows[0].n,
    ),
    0,
  );
  assert.equal(
    Number(
      (
        await store.db.query(
          "SELECT MAX(version) AS n FROM kp_schema_migrations",
        )
      ).rows[0].n,
    ),
    schemaVersion,
  );
  await store.close();
  await store.connect();
  assert.deepEqual(await store.read(), before);
}

// This suite requires separate native connection pools, not mock SQL strings.
export async function nativePoolSuite(stores, t) {
  const [first, second] = stores;
  assert.notEqual(first.db.pool, second.db.pool);
  await t.test(
    "native authentication counters do not wait for the business-data lock",
    async () => {
      const holding = new sql.Transaction(first.db.pool);
      await holding.begin(sql.ISOLATION_LEVEL.READ_COMMITTED);
      let timer;
      try {
        const lock = await first.db.request(holding, lockProbe, ["Exclusive"]);
        assert(Number(lock.rows[0].result) >= 0);
        await Promise.race([
          createAttemptLimiter(second).reserve(
            "native-lock-probe",
            "independent",
            15,
          ),
          new Promise((_resolve, reject) => {
            timer = setTimeout(
              () => reject(Error("Counter waited for business-data lock")),
              5000,
            );
          }),
        ]);
      } finally {
        clearTimeout(timer);
        await holding.rollback();
      }
    },
  );
  const metadata = await first.db.query(
    "SELECT t.name AS table_name,c.name AS column_name FROM sys.tables t JOIN sys.columns c ON c.object_id=t.object_id WHERE SCHEMA_NAME(t.schema_id)='dbo'",
  );
  for (const [name, spec] of Object.entries(tables)) {
    if (name === "person_allocations") continue; // Optional legacy v2 table.
    for (const column of Object.keys(spec.columns))
      assert(
        metadata.rows.some(
          (r) => r.table_name === "kp_" + name && r.column_name === column,
        ),
        name + "." + column,
      );
  }
  assert.equal(
    Number(
      (
        await first.db.query(
          "SELECT MAX(version) AS version FROM kp_schema_migrations",
        )
      ).rows[0].version,
    ),
    schemaVersion,
  );

  await seedBenchmarkStore(first, 1000, {
    resources: 20,
    actuals: 100,
    percentages: 100,
    calendarDays: 10,
  });
  const password = await hashPassword("Native-test-only-284!");
  await first.bootstrapUser({
    _id: "native-admin",
    username: "native.admin",
    name: "Synthetic admin",
    role: "admin",
    leaders: [],
    active: true,
    password,
    revision: 1,
    version: 1,
  });
  const admin = await first.findUser({ id: "native-admin" });
  const change = (store, edits) =>
    store.mutate(admin, (d, u) => applyChanges(d, u, edits), {
      returnView: true,
    });
  const key = Object.keys((await first.read()).data.allocations)[0];

  await t.test(
    "native nonexistent deletes cannot grow revisions; real deletion keeps stale-write protection",
    async () => {
      const before = await first.read();
      const resourceId = before.data.resources[0].id;
      const projectId = before.data.projects[0].id;
      const revisionRows = async () =>
        (
          await second.db.query(
            "SELECT * FROM kp_revisions ORDER BY kind,record_id",
          )
        ).rows;
      const revisions = await revisionRows();
      await first.bootstrapUser({
        _id: "native-delete-owner",
        username: "native.delete.owner",
        name: "Synthetic owner",
        role: "normal",
        leaders: [],
        resourceId,
        active: true,
        password,
        revision: 1,
        version: 1,
      });
      const owner = await first.findUser({ id: "native-delete-owner" });
      const ids = [
        ...Array.from(
          { length: 30 },
          (_, i) => `${resourceId}|ghost-${i}|2026-01`,
        ),
        `${resourceId}|ghost-missing-month`,
        `${resourceId}|ghost-extra|2026-01|extra`,
      ];
      await assert.rejects(
        first.mutate(owner, (d, u) =>
          applyChanges(
            d,
            u,
            ids.map((id) => ({
              kind: "actual",
              id,
              operation: "delete",
              revision: 0,
            })),
          ),
        ),
        { status: 404 },
      );
      for (const id of [
        `${resourceId}|${projectId}`,
        `${resourceId}|${projectId}|2026-01|extra`,
      ])
        await assert.rejects(
          change(first, [
            { kind: "actual", id, operation: "delete", revision: 0 },
          ]),
          { status: 400 },
        );
      assert.deepEqual(await second.read(), before);
      assert.deepEqual(await revisionRows(), revisions);

      const emptyId = `${resourceId}|${projectId}|2000-01`;
      await change(first, [
        { kind: "actual", id: emptyId, operation: "delete", revision: 0 },
      ]);
      assert.deepEqual((await second.read()).data, before.data);
      assert.deepEqual(await revisionRows(), revisions);

      const value = before.data.allocations[key],
        revision = before.data.revisions["allocation:" + key] || 0;
      await change(first, [
        { kind: "allocation", id: key, operation: "delete", revision },
      ]);
      const removed = await second.read();
      assert.equal(Object.hasOwn(removed.data.allocations, key), false);
      assert.equal(removed.data.revisions["allocation:" + key], revision + 1);
      await assert.rejects(
        change(second, [{ kind: "allocation", id: key, value, revision }]),
        { status: 409 },
      );
      await change(second, [
        {
          kind: "allocation",
          id: key,
          operation: "delete",
          revision: revision + 1,
        },
      ]);
      assert.equal(
        (await first.read()).data.revisions["allocation:" + key],
        revision + 1,
      );
      await change(first, [
        { kind: "allocation", id: key, value, revision: revision + 1 },
      ]);
      const restored = await second.read();
      assert.equal(restored.data.allocations[key], value);
      const restoredRows = await revisionRows();
      await assert.rejects(
        change(first, [
          { kind: "allocation", id: key, value: 0, revision: revision + 2 },
          {
            kind: "actual",
            id: `${resourceId}|missing|2026-01`,
            operation: "delete",
            revision: 0,
          },
        ]),
        { status: 404 },
      );
      assert.deepEqual(await second.read(), restored);
      assert.deepEqual(await revisionRows(), restoredRows);
    },
  );

  await t.test(
    "separate native pools racing on one revision commit once",
    async () => {
      const before = await first.read();
      const replies = await Promise.allSettled(
        Array.from({ length: 12 }, (_, i) =>
          change(stores[i % stores.length], [
            {
              kind: "allocation",
              id: key,
              value: (i + 1) / 10,
              revision: before.data.revisions["allocation:" + key],
            },
          ]),
        ),
      );
      const winners = replies.filter((r) => r.status === "fulfilled");
      assert.equal(winners.length, 1);
      assert(
        replies
          .filter((r) => r.status === "rejected")
          .every((r) => r.reason.status === 409),
      );
      const after = await second.read();
      assert.equal(after.generation, before.generation + 1);
      assert.equal(
        after.data.revisions["allocation:" + key],
        before.data.revisions["allocation:" + key] + 1,
      );
      assert.equal(
        after.data.allocations[key],
        winners[0].value.data.allocations[key],
      );
    },
  );

  await t.test(
    "native shared readers coexist and exclude writes across pools",
    async () => {
      const entered = deferred(),
        release = deferred();
      const holder = first.transaction(async () => {
        entered.resolve();
        await release.promise;
      }, true);
      try {
        await Promise.race([
          entered.promise,
          holder.then(() => {
            throw Error("Reader did not reach the barrier");
          }),
        ]);
        const probe = await second.transaction(async (c) => {
          // This transaction already owns Shared. Exclusive upgrade must fail
          // while the other connection holds Shared on the same resource.
          return Number(
            (await c.query(lockProbe, ["Exclusive"])).rows[0].result,
          );
        }, true);
        assert.equal(probe, -1);
      } finally {
        release.resolve();
        await holder;
      }
    },
  );

  await t.test(
    "a reader on another pool cannot see half of a native two-cell write",
    async () => {
      const keys = Object.keys((await first.read()).data.allocations).slice(
        1,
        3,
      );
      const entered = deferred(),
        release = deferred();
      const writer = first.mutate(
        admin,
        async (d, u, c) => {
          applyChanges(
            d,
            u,
            keys.map((id) => ({
              kind: "allocation",
              id,
              value: 2.5,
              revision: d.revisions["allocation:" + id],
            })),
          );
          // Persist one SQL cell early to make an unprotected reader observe half.
          const [team, project, month] = keys[0].split("|");
          await c.query(
            "UPDATE kp_allocations SET amount=@p0 WHERE team_id=@p1 AND project_id=@p2 AND month=@p3",
            [2.5, team, project, month],
          );
          entered.resolve();
          await release.promise;
        },
        { returnView: true },
      );
      let reader;
      try {
        await Promise.race([
          entered.promise,
          writer.then(() => {
            throw Error("Writer did not reach the barrier");
          }),
        ]);
        const probe = new sql.Transaction(second.db.pool);
        await probe.begin(sql.ISOLATION_LEVEL.READ_COMMITTED);
        try {
          assert.equal(
            Number(
              (await second.db.request(probe, lockProbe, ["Shared"])).rows[0]
                .result,
            ),
            -1,
          );
        } finally {
          await probe.rollback();
        }
        reader = second.view(admin);
        release.resolve();
        const [written, read] = await Promise.all([writer, reader]);
        for (const id of keys) {
          assert.equal(read.data.allocations[id], 2.5);
          assert.equal(written.data.allocations[id], 2.5);
          assert.equal(
            read.data.revisions["allocation:" + id],
            written.data.revisions["allocation:" + id],
          );
        }
        assert.equal(read.generation, written.generation);
      } finally {
        release.resolve();
        await Promise.allSettled([writer, reader]);
      }
    },
  );

  await t.test(
    "native projection errors roll back reset, revisions, generation and audit",
    async () => {
      const before = await first.read();
      const audit = (
        await first.db.query("SELECT COUNT(*) AS n FROM kp_audit_events")
      ).rows[0].n;
      const original = first.projectView;
      first.projectView = () => {
        throw Error("Synthetic projection failure");
      };
      try {
        await assert.rejects(
          first.mutate(
            admin,
            (d, u) =>
              reset(
                d,
                u,
                Object.fromEntries(
                  Object.entries(d.revisions).filter(([k]) =>
                    k.startsWith("allocation:"),
                  ),
                ),
              ),
            { returnView: true },
          ),
          /Synthetic projection/,
        );
      } finally {
        first.projectView = original;
      }
      assert.deepEqual(await second.read(), before);
      assert.equal(
        (await second.db.query("SELECT COUNT(*) AS n FROM kp_audit_events"))
          .rows[0].n,
        audit,
      );
    },
  );

  await t.test(
    "native OPENJSON retains Unicode, long notes, mixed bars and outline milestones",
    async () => {
      const before = await first.read(),
        project = before.data.projects[0];
      const note = "İı Şş Ğğ Çç Öö Üü — ".repeat(1000).trim();
      const milestones = [
        {
          id: "native-topic",
          name: "Başlık",
          start: "2026-03-10",
          end: "2026-03-10",
          displayKind: "milestone",
          diamondStyle: "outline",
          barColor: "green",
          barStyle: "outline",
          barText: note,
          barNotes: [{ text: note, includeInReport: true, completed: true }],
          additionalRanges: [
            {
              start: "2026-04-10",
              end: "2026-04-12",
              description: "Aralık",
              color: "purple",
              notes: [{ text: "Detay", includeInReport: false }],
            },
          ],
        },
      ];
      await change(first, [
        {
          kind: "project",
          id: project.id,
          value: { ...project, milestones },
          revision: before.data.revisions["project:" + project.id] || 0,
        },
      ]);
      const actual = (await second.read()).data.projects.find(
        (p) => p.id === project.id,
      ).milestones[0];
      assert.equal(actual.barText, note);
      assert.equal(actual.barNotes[0].completed, true);
      assert.equal(actual.diamondStyle, "outline");
      assert.equal(actual.additionalRanges[0].notes[0].text, "Detay");
      for (const [column, invalid] of [
        ["diamond_style", "invalid"],
        ["display_kind", "invalid"],
      ])
        await assert.rejects(
          first.db.query(
            `UPDATE kp_project_milestones SET [${column}]=@p0 WHERE project_id=@p1 AND id=@p2`,
            [invalid, project.id, "native-topic"],
          ),
          (e) => e.number === 547,
        );
      assert.equal(
        (await second.read()).data.projects.find((p) => p.id === project.id)
          .milestones[0].diamondStyle,
        "outline",
      );
    },
  );

  await t.test(
    "native BIN2 scoped revisions handle case, Unicode, literal wildcards and 900/901 binds",
    async () => {
      const ids = [
        "A_%[",
        "a_%[",
        "İstanbul",
        "__proto__",
        "constructor",
        "x'); DROP TABLE kp_revisions;--",
      ];
      await first.transaction((c) =>
        c.upsert("revisions", [
          ...ids.map((id, i) => ({
            kind: "allocation",
            record_id: id + "|p|2026-01",
            revision: i,
          })),
          {
            kind: "allocation",
            record_id: "@risk:native-deleted",
            revision: 7,
          },
        ]),
      );
      const selected = ids.filter((_, i) => i !== 1);
      await first.transaction(async (c) => {
        const full = await readRevisionMap(c, "mssql");
        for (const scope of [
          [],
          selected,
          Array.from({ length: 900 }, (_, i) =>
            i < selected.length ? selected[i] : "absent" + i,
          ),
          Array.from({ length: 901 }, (_, i) => "absent" + i),
          ["legacy|team"],
        ]) {
          const filtered =
            scope.length <= 900 && !scope.some((id) => id.includes("|"));
          const expected = Object.fromEntries(
            Object.entries(full).filter(
              ([key]) =>
                !filtered ||
                !key.startsWith("allocation:") ||
                scope.includes(key.slice(11).split("|")[0]),
            ),
          );
          assert.deepEqual(await readRevisionMap(c, "mssql", scope), expected);
        }
        const composite = await readCompositeMap(
          c,
          "mssql",
          "allocations",
          "amount",
        );
        assert.deepEqual(
          await readCompositeMap(c, "mssql", "allocations", "amount", []),
          {},
        );
        assert.deepEqual(
          await readCompositeMap(
            c,
            "mssql",
            "allocations",
            "amount",
            Array.from({ length: 901 }, (_, i) => "absent" + i),
          ),
          composite,
        );
      }, true);
    },
  );
}

export async function nativeLoadProfile(stores, t, { size, samples }) {
  assert(Number.isInteger(size) && size >= 24 && size <= 100000);
  assert(Number.isInteger(samples) && samples >= 1 && samples <= 10);
  const [store] = stores;
  await seedBenchmarkStore(store, size, {
    resources: 80,
    actuals: 200,
    percentages: 200,
    calendarDays: 20,
  });
  const team = (await store.read()).data.teams.find((x) => x.lead);
  const password = await hashPassword("Native-profile-only-284!");
  const users = {};
  for (const role of ["admin", "manager", "normal"]) {
    await store.bootstrapUser({
      _id: "native-profile-" + role,
      username: "native.profile." + role,
      name: "Synthetic " + role,
      role,
      leaders: role === "admin" ? [] : [team.lead],
      resourceId: role === "normal" ? "bench-r0" : "",
      active: true,
      password,
      revision: 1,
      version: 1,
    });
    users[role] = await store.findUser({ id: "native-profile-" + role });
  }
  const measurements = [];
  for (const [role, user] of Object.entries(users)) {
    const reference = await store.transaction(async (c) => {
      const { data, generation } = await store.read(c);
      return store.projectView(
        data,
        generation,
        await store.findUser({ id: user._id }, c),
        c,
      );
    }, true);
    const observations = [],
      request = store.db.request,
      scan = store.db.scanRequest;
    const record = (text, rows) => {
      if (
        /^SELECT\b/.test(text) &&
        /FROM (?:\[kp_allocations\]|kp_revisions)/.test(text)
      )
        observations.push({
          kind: text.includes("kp_revisions") ? "revisions" : "allocations",
          rows,
        });
    };
    store.db.request = async function (owner, text, values, ...options) {
      const result = await request.call(this, owner, text, values, ...options);
      record(text, result.rows.length);
      return result;
    };
    store.db.scanRequest = async function (...args) {
      const result = await scan.apply(this, args);
      record(args[1], result.rowCount);
      return result;
    };
    const timings = [];
    let allocationRows, revisionRows;
    try {
      for (let i = 0; i <= samples; i++) {
        observations.length = 0;
        const start = performance.now(),
          view = await store.view(user);
        const elapsed = performance.now() - start;
        assert.deepEqual(view, reference);
        allocationRows = observations
          .filter((x) => x.kind === "allocations")
          .reduce((n, x) => n + x.rows, 0);
        revisionRows = observations
          .filter((x) => x.kind === "revisions")
          .reduce((n, x) => n + x.rows, 0);
        if (i) timings.push(elapsed);
      }
    } finally {
      store.db.request = request;
      store.db.scanRequest = scan;
    }
    timings.sort((a, b) => a - b);
    measurements.push({
      role,
      medianMs:
        (timings[Math.floor((timings.length - 1) / 2)] +
          timings[Math.floor(timings.length / 2)]) /
        2,
      maxMs: timings.at(-1),
      allocationRows,
      revisionRows,
      jsonBytes: Buffer.byteLength(JSON.stringify(reference)),
    });
  }
  const before = await store.read(),
    keys = Object.keys(before.data.allocations).slice(0, 24);
  const start = performance.now();
  const replies = await Promise.allSettled(
    keys.map((id, i) =>
      stores[i % stores.length].mutate(
        users.admin,
        (d, u) =>
          applyChanges(d, u, [
            {
              kind: "allocation",
              id,
              value: 0.5,
              revision: before.data.revisions["allocation:" + id],
            },
          ]),
        { returnView: true },
      ),
    ),
  );
  assert(
    replies.every((r) => r.status === "fulfilled"),
    "Every independent write must succeed",
  );
  const elapsed = performance.now() - start,
    views = replies.map((r) => r.value);
  assert.deepEqual(
    views.map((v) => v.generation).sort((a, b) => a - b),
    keys.map((_, i) => before.generation + i + 1),
  );
  for (let i = 0; i < keys.length; i++) {
    assert.equal(views[i].data.allocations[keys[i]], 0.5);
    assert.equal(
      keys.filter((id) => views[i].data.allocations[id] === 0.5).length,
      views[i].generation - before.generation,
    );
  }
  const after = await store.read();
  for (const id of keys) {
    assert.equal(after.data.allocations[id], 0.5);
    assert.equal(
      after.data.revisions["allocation:" + id],
      before.data.revisions["allocation:" + id] + 1,
    );
  }
  assert.equal(after.generation, before.generation + 24);
  t.diagnostic(
    `Native SQL profile: ${size} allocations, ${samples} samples, ${stores.length} pools. No HTTP/browser/production capacity claim.`,
  );
  return {
    size,
    samples,
    pools: stores.length,
    measurements,
    parallelWrites: { requests: 24, elapsedMs: elapsed },
    scope:
      "Synthetic native SQL Store pipeline, including global application lock. No HTTP/browser or production p95/capacity claim.",
  };
}

export async function nativeMetadataBatchSuite(stores, t) {
  const first = stores[0],
    second = stores[1];
  const request = first.db.request;
  const scan = first.db.scanRequest;
  let calls = [];
  t.mock.method(first.db, "request", async function (...args) {
    if (/^SELECT\b/.test(args[1]))
      calls.push({ batch: args[3] === true, text: args[1] });
    return request.apply(this, args);
  });
  t.mock.method(first.db, "scanRequest", async function (...args) {
    calls.push({ batch: false, text: args[1] });
    return scan.apply(this, args);
  });
  const before = await first.transaction(async (c) => {
    calls = [];
    const ordinary = await first.read({
      ...c,
      queryMany: undefined,
      scanMany: undefined,
    });
    const ordinaryCalls = [...calls];
    calls = [];
    const batched = await first.read({ ...c, scanMany: undefined });
    assert.deepEqual(batched, ordinary);
    assert.equal(JSON.stringify(batched), JSON.stringify(ordinary));
    assert.equal(ordinaryCalls.length, 15);
    assert.equal(calls.length, 6);
    assert.equal(calls.filter((call) => call.batch).length, 1);
    assert.deepEqual(
      calls.find((call) => call.batch).text.split(";\n"),
      ordinaryCalls.slice(0, 10).map((call) => call.text),
    );
    return batched;
  }, true);
  assert.deepEqual(
    await second.transaction((c) => second.read(c), true),
    before,
  );
  const admin = (await first.users()).find((u) => u.role === "admin");
  const audit = (await first.auditLog(admin)).total;
  let ranCommand = false;
  const readMany = first.db.readMany;
  const mock = t.mock.method(first.db, "readMany", function (owner) {
    return readMany.call(this, owner, [
      "SELECT 1 AS ok",
      "SELECT CONVERT(int,N'not-an-integer') AS invalid",
    ]);
  });
  try {
    await assert.rejects(
      first.mutate(admin, () => {
        ranCommand = true;
      }),
      (e) => e.number === 245,
    );
  } finally {
    mock.mock.restore();
  }
  assert.equal(ranCommand, false);
  assert.deepEqual(
    await second.transaction((c) => second.read(c), true),
    before,
  );
  assert.equal((await first.auditLog(admin)).total, audit);
}

export async function nativeScanSuite(stores, t) {
  const [first, second] = stores;
  let scannedRows = {},
    scans = 0;
  const scan = first.db.scanRequest;
  const mock = t.mock.method(first.db, "scanRequest", async function (...args) {
    const result = await scan.apply(this, args);
    scans++;
    const table = /\bkp_([a-z_]+)/.exec(args[1])?.[1];
    scannedRows[table] = result.rowCount;
    return result;
  });
  const scanMany = first.db.scanManyRequest;
  let batches = 0,
    batchRows = {};
  const batchMock = t.mock.method(
    first.db,
    "scanManyRequest",
    async function (...args) {
      const result = await scanMany.apply(this, args);
      batches++;
      args[1].forEach((query, index) => {
        batchRows[/\bkp_([a-z_]+)/.exec(query)[1]] = result[index].rowCount;
      });
      return result;
    },
  );
  const before = await first.transaction(async (c) => {
    const buffered = await first.read({
      ...c,
      scan: undefined,
      scanMany: undefined,
    });
    const streamed = await first.read({ ...c, scanMany: undefined });
    assert.deepEqual(streamed, buffered);
    assert.equal(JSON.stringify(streamed), JSON.stringify(buffered));
    assert.equal(scans, 5);
    assert.deepEqual(scannedRows, {
      allocations: Object.keys(buffered.data.allocations).length,
      actual_allocations: Object.keys(buffered.data.actualAllocations).length,
      actual_worked_hours: Object.keys(buffered.data.actualWorkedHours).length,
      actual_percent_entries: Object.keys(buffered.data.actualPercentEntries)
        .length,
      revisions: Object.keys(buffered.data.revisions).length,
    });
    const batched = await first.read(c);
    assert.deepEqual(batched, buffered);
    assert.equal(JSON.stringify(batched), JSON.stringify(buffered));
    assert.equal(batches, 1);
    assert.deepEqual(batchRows, scannedRows);
    assert.equal(
      scans,
      5,
      "batch must use one separate request, not five scans",
    );
    return batched;
  }, true);
  mock.mock.restore();
  batchMock.mock.restore();
  await first.transaction(async (c) => {
    const params = [
      "Türkçe 😀 '",
      0,
      0.25,
      true,
      null,
      new Date("2026-10-08T00:00:00Z"),
    ];
    const query =
      "SELECT @p0 AS text,@p1 AS zero,@p2 AS fraction,@p3 AS flag,@p4 AS empty,@p5 AS date";
    const buffered = await c.query(query, params),
      rows = [];
    const result = await c.scan(query, params, (row) => rows.push(row));
    assert.equal(result.rowCount, 1);
    assert.deepEqual(
      rows,
      buffered.rows.map((r) => [
        r.text,
        r.zero,
        r.fraction,
        r.flag,
        r.empty,
        r.date,
      ]),
    );
  }, true);
  let consumed = 0;
  const failure = Error("synthetic native mapper failure");
  await assert.rejects(
    first.transaction(
      (c) =>
        c.scan(
          "SELECT TOP (10000) a.object_id FROM sys.all_objects a CROSS JOIN sys.all_objects b",
          [],
          () => {
            consumed++;
            throw failure;
          },
        ),
      true,
    ),
    (e) => e === failure,
  );
  assert.equal(consumed, 1);
  // XACT_ABORT can abort the cancelled transaction. Never continue its partial
  // snapshot; a fresh locked transaction must be usable after the query drains.
  assert.equal(
    await first.transaction(
      async (c) => (await c.query("SELECT 1 AS ok")).rows[0].ok,
      true,
    ),
    1,
  );
  await assert.rejects(
    first.transaction(
      (c) =>
        c.scan(
          "SELECT CONVERT(int,N'not-an-integer') AS invalid",
          [],
          () => {},
        ),
      true,
    ),
    (e) => e.number === 245,
  );
  let firstRows = 0,
    middleRows = 0,
    lastRows = 0;
  await assert.rejects(
    first.transaction(
      (c) =>
        c.scanMany(
          [
            "SELECT 1 AS first_value",
            "SELECT TOP (10000) a.object_id FROM sys.all_objects a CROSS JOIN sys.all_objects b",
            "SELECT 3 AS last_value",
          ],
          [
            () => firstRows++,
            () => {
              middleRows++;
              throw failure;
            },
            () => lastRows++,
          ],
        ),
      true,
    ),
    (e) => e === failure,
  );
  assert.equal(firstRows, 1);
  assert.equal(middleRows, 1);
  assert.equal(lastRows, 0);
  await assert.rejects(
    first.transaction(
      (c) =>
        c.scanMany(
          [
            "SELECT 1 AS first_value",
            "SELECT CONVERT(int,N'not-an-integer') AS invalid",
            "SELECT 3 AS last_value",
          ],
          [() => {}, () => {}, () => {}],
        ),
      true,
    ),
    (e) => e.number === 245,
  );
  assert.equal(
    await first.transaction(
      async (c) => (await c.query("SELECT 1 AS ok")).rows[0].ok,
      true,
    ),
    1,
  );
  const admin = (await first.users()).find((u) => u.role === "admin");
  const audit = (await first.auditLog(admin)).total;
  let ranCommand = false;
  const broken = t.mock.method(
    first.db,
    "scanManyRequest",
    function (owner, queries, consumers) {
      return scanMany.call(
        this,
        owner,
        queries.map((text) =>
          text.includes("kp_allocations")
            ? "SELECT CONVERT(int,N'not-an-integer') AS invalid"
            : text,
        ),
        consumers,
      );
    },
  );
  try {
    await assert.rejects(
      first.mutate(admin, () => {
        ranCommand = true;
      }),
      (e) => e.number === 245,
    );
  } finally {
    broken.mock.restore();
  }
  assert.equal(ranCommand, false);
  assert.deepEqual(
    await second.transaction((c) => second.read(c), true),
    before,
  );
  assert.equal((await first.auditLog(admin)).total, audit);
}
