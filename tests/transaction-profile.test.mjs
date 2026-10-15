import test from "node:test";
import assert from "node:assert/strict";
import {
  latencySummary,
  profileWorkers,
  memorySampler,
  transactionProbe,
} from "../scripts/transaction-profile.mjs";
import {
  nativeProfileOptions,
  nativeContentionProfile,
} from "../scripts/native-contention-profile.mjs";

import { planningCommand, isPlanningCommand } from "../backend/operations.mjs";

const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
class SyntheticStore {
  provider = "mssql";
  env = { NODE_ENV: "test", DB_DATABASE: "synthetic_test" };
  requests = [];
  db = {
    request: async (_owner, text, values) => {
      this.requests.push({ text, values });
      if (text.includes("profileLockAcquireMs"))
        return { rows: [{ profileLockAcquireMs: 3 }], rowCount: 1 };
      return { rows: [{ value: 1 }, { value: 2 }], rowCount: 2 };
    },
    transaction: async (fn, readOnly) => {
      const lock = await this.db.request(
        {},
        "DECLARE @r int; EXEC @r=sys.sp_getapplock @Resource=@p0, @LockMode=@p1, @LockOwner=N'Transaction', @LockTimeout=@p2; IF @r<0 THROW 50001, 'Application lock timeout',1;",
        ["aa_kaynak_data", readOnly ? "Shared" : "Exclusive", 15000],
      );
      if (lock.rows.length) throw Error("Instrumentation changed lock result");
      return fn({ query: (q, v) => this.db.request({}, q, v) });
    },
  };
  async read(c) {
    return c.query(
      "SELECT * FROM kp_actual_allocations WHERE resource_id=@p0",
      ["not-for-the-report"],
    );
  }
  copySnapshot(d) {
    return structuredClone(d);
  }
  async persist(_before, _after, c) {
    return c.query("UPDATE kp_actual_allocations SET amount=@p0", [1]);
  }
  async projectView(data) {
    return data;
  }
  async mutate(u, fn, options) {
    return this.db.transaction(async (c) => {
      const data = await this.read(c),
        before = this.copySnapshot(data);
      await fn(data, u, c);
      await this.persist(before, data, c);
      return options?.returnView ? this.projectView(data) : data;
    });
  }
}

test("profile percentiles report explicit sample count without mutating samples", () => {
  const samples = [20, 1, 5, 3];
  assert.deepEqual(latencySummary(samples), {
    count: 4,
    median: 3,
    sampleP95: 20,
    sampleP99: 20,
    max: 20,
  });
  assert.deepEqual(samples, [20, 1, 5, 3]);
  for (const values of [[], [NaN], [Infinity], [-1]])
    assert.throws(() => latencySummary(values));
});

test("bounded workers cap concurrency, preserve indices and record queue latency", async () => {
  let active = 0,
    peak = 0,
    clock = 0;
  const results = await profileWorkers(
    12,
    3,
    async (index, queueMs) => {
      active++;
      peak = Math.max(active, peak);
      await new Promise((r) => setTimeout(r, index % 2));
      active--;
      return { index, queueMs };
    },
    () => ++clock,
  );
  assert.equal(peak, 3);
  assert.equal(active, 0);
  assert.deepEqual(
    results.map((r) => r.index),
    Array.from({ length: 12 }, (_, i) => i),
  );
  assert(results.at(-1).queueMs > results[0].queueMs);
  await assert.rejects(profileWorkers(201, 1, () => {}));
  await assert.rejects(profileWorkers(1, 21, () => {}));
});

test("worker failure drains owned in-flight operations before hooks can be restored", async () => {
  const gate = deferred(),
    entered = deferred();
  let complete = false,
    settled = false;
  const run = profileWorkers(2, 2, async (i) => {
    if (i === 0) throw Error("synthetic worker failure");
    entered.resolve();
    await gate.promise;
    complete = true;
  });
  run.catch(() => {
    settled = true;
  });
  await entered.promise;
  await new Promise((r) => setImmediate(r));
  assert.equal(settled, false);
  gate.resolve();
  await assert.rejects(run, AggregateError);
  assert(complete);
});

test("probe refuses non-test stores and validates every store before installing hooks", () => {
  const first = new SyntheticStore(),
    bad = new SyntheticStore();
  bad.env.NODE_ENV = "production";
  assert.throws(() => transactionProbe([first, bad]));
  assert.equal(Object.hasOwn(first, "read"), false);
  bad.env.NODE_ENV = "test";
  bad.persist = null;
  assert.throws(() => transactionProbe([first, bad]));
  assert.equal(Object.hasOwn(first, "read"), false);
  assert.throws(() => transactionProbe([first, first]));
  first.env.DB_DATABASE = "application";
  assert.throws(() => transactionProbe([first]));
});

test("probe preserves lock mode, timeout, SQL parameters, values and property descriptors", async () => {
  const store = new SyntheticStore(),
    request = store.db.request;
  const probe = transactionProbe([store]);
  try {
    const result = await probe.measure("write-actual", () =>
      store.mutate(
        {},
        (d) => {
          d.changed = true;
        },
        { returnView: true },
      ),
    );
    assert(result.value.changed);
    assert.equal(result.observation.lockCalls, 1);
    assert.equal(result.observation.lockAcquireServerMs, 3);
    assert.equal(result.observation.readCalls, 1);
    assert.equal(result.observation.copySnapshotCalls, 1);
    assert.equal(result.observation.persistCalls, 1);
    assert.equal(result.observation.sqlRows.actual_allocations, 2);
    assert.deepEqual(store.requests[0].values, [
      "aa_kaynak_data",
      "Exclusive",
      15000,
    ]);
    assert.match(store.requests[0].text, /IF @r<0 THROW 50001/);
    assert.deepEqual(store.requests[1].values, ["not-for-the-report"]);
    assert(!JSON.stringify(result.observation).includes("not-for-the-report"));
  } finally {
    probe.restore();
  }
  assert.equal(Object.hasOwn(store, "read"), false);
  assert.equal(store.db.request, request);
  probe.restore();
  await assert.rejects(probe.measure("read", async () => {}));
});

test("concurrent probes keep SQL attribution local and refuse restoration while active", async () => {
  const a = new SyntheticStore(),
    b = new SyntheticStore();
  const probe = transactionProbe([a, b]);
  const gate = deferred();
  const first = probe.measure("read-admin", () =>
    a.db.transaction(async (c) => {
      await gate.promise;
      await c.query("SELECT * FROM kp_allocations");
      await c.query("SELECT * FROM kp_revisions");
    }, true),
  );
  try {
    assert.throws(() => probe.restore(), /active/);
    const second = await probe.measure("read-normal", () =>
      b.db.transaction(
        (c) => c.query("SELECT * FROM kp_actual_allocations"),
        true,
      ),
    );
    gate.resolve();
    const one = await first;
    assert.deepEqual(one.observation.sqlRows, { allocations: 2, revisions: 2 });
    assert.deepEqual(second.observation.sqlRows, { actual_allocations: 2 });
    assert.equal(one.observation.lockCalls, 1);
    assert.equal(second.observation.lockCalls, 1);
    assert.deepEqual(b.requests[0].values, ["aa_kaynak_data", "Shared", 15000]);
  } finally {
    gate.resolve();
    await first;
    probe.restore();
  }
});

test("probe retains original errors and rejects missing server timings", async () => {
  const store = new SyntheticStore(),
    error = new Error("synthetic failure"),
    probe = transactionProbe([store]);
  try {
    await assert.rejects(
      probe.measure("failed", () =>
        store.mutate({}, () => {
          throw error;
        }),
      ),
      (e) => e === error,
    );
  } finally {
    probe.restore();
  }
  store.db.request = async () => ({ rows: [], rowCount: 0 });
  const invalid = transactionProbe([store]);
  try {
    await assert.rejects(
      invalid.measure("read", () => store.db.transaction(() => {})),
      /timing result/,
    );
  } finally {
    invalid.restore();
  }
});

test("memory samples track process-level boundaries without claiming per-request allocation", () => {
  const readings = [
    { rss: 100, heapUsed: 20 },
    { rss: 300, heapUsed: 80 },
    { rss: 200, heapUsed: 40 },
  ];
  const sampler = memorySampler({
    sample: () => readings.shift(),
    intervalMs: 1000,
  });
  sampler.capture();
  const result = sampler.stop();
  assert.deepEqual(result, {
    before: { rss: 100, heapUsed: 20 },
    after: { rss: 200, heapUsed: 40 },
    sampledPeak: { rss: 300, heapUsed: 80 },
  });
});

test("native profile options bound data, requests and independent worker levels", () => {
  assert.deepEqual(nativeProfileOptions(), {
    requests: 40,
    actuals: 4000,
    concurrency: [1, 4, 12],
  });
  for (const options of [
    { requests: 201 },
    { requests: 19 },
    { actuals: 50001 },
    { concurrency: "1,1" },
    { concurrency: "0,4" },
    { concurrency: "21" },
    { concurrency: "1,2,3,4,5" },
    { concurrency: "1;write" },
  ])
    assert.throws(() => nativeProfileOptions(options));
});

test("contention entry refuses a non-test Store before seeding or reading data", async () => {
  const a = new SyntheticStore(),
    b = new SyntheticStore();
  b.env.NODE_ENV = "production";
  let touched = false;
  a.read = async () => {
    touched = true;
    throw Error("Unexpected read");
  };
  await assert.rejects(
    nativeContentionProfile([a, b], {
      size: 1000,
      requests: 40,
      actuals: 4000,
      concurrency: [1, 4, 12],
    }),
    /synthetic test Store/,
  );
  assert.equal(touched, false);
});

test("profiling preserves owned planning callback identity and synchronous delta results", async () => {
  const store = new SyntheticStore();
  const command = planningCommand([
    { kind: "allocation", id: "t|p|2026-09", value: 1, revision: 0 },
  ]);
  const delta = { responseMode: "planning-delta-v1" };
  store.projectPlanningDelta = () => delta;
  store.mutate = async function (_u, callback) {
    assert.equal(callback, command);
    assert(isPlanningCommand(callback));
    this.copySnapshot({}, { planningOnly: true });
    await this.persist({}, {}, { query: async () => ({ rows: [] }) });
    const result = this.projectPlanningDelta({});
    assert.equal(result, delta); // A promise here would change Store behavior.
    return result;
  };
  const probe = transactionProbe([store]);
  try {
    const result = await probe.measure("write-allocation", () =>
      store.mutate({}, command),
    );
    assert.equal(result.value, delta);
    assert.equal(result.observation.commandTimingMode, "combined");
    assert.equal(result.observation.planningDraftCopies, 1);
    assert.equal(result.observation.fullSnapshotCopies, 0);
    assert.equal(result.observation.planningDeltaProjectionCalls, 1);
    assert(!Object.hasOwn(result.observation, "copyEnd"));
    assert(!Object.hasOwn(result.observation, "commandEnd"));
  } finally {
    probe.restore();
  }
});

test("profile counts one metadata roundtrip and every rowset without losing request options", async () => {
  const store = new SyntheticStore();
  const rows = [
    [{ privateMarker: "not in observation" }],
    [{ name: "a" }, { name: "b" }],
  ];
  store.db.request = async (_owner, text, values, allRecordsets) => {
    assert.equal(text, "SELECT * FROM kp_settings;\nSELECT * FROM kp_leaders");
    assert.deepEqual(values, []);
    assert.equal(allRecordsets, true);
    return { rows: rows[0], rowCount: 1, recordsets: rows };
  };
  const probe = transactionProbe([store]);
  try {
    const result = await probe.measure("write-allocation", () =>
      store.db.request(
        {},
        "SELECT * FROM kp_settings;\nSELECT * FROM kp_leaders",
        [],
        true,
      ),
    );
    assert.equal(result.value.recordsets, rows);
    assert.equal(result.observation.sqlCalls, 1);
    assert.equal(result.observation.metadataBatchCalls, 1);
    assert.equal(result.observation.metadataBatchStatements, 2);
    assert.deepEqual(result.observation.sqlRows, { settings: 1, leaders: 2 });
    assert(!JSON.stringify(result.observation).includes("privateMarker"));
  } finally {
    probe.restore();
  }
});

test("profile counts native scans once without replacing their consumer or retaining values", async () => {
  const store = new SyntheticStore(),
    owner = {},
    consume = () => {};
  const original = (store.db.scanRequest = async (
    tx,
    text,
    values,
    callback,
  ) => {
    assert.equal(tx, owner);
    assert.equal(text, "SELECT amount FROM kp_allocations");
    assert.deepEqual(values, ["private synthetic parameter"]);
    assert.equal(callback, consume);
    return { rowCount: 12 };
  });
  const probe = transactionProbe([store]);
  try {
    const { value, observation } = await probe.measure("read-admin", () =>
      store.db.scanRequest(
        owner,
        "SELECT amount FROM kp_allocations",
        ["private synthetic parameter"],
        consume,
      ),
    );
    assert.deepEqual(value, { rowCount: 12 });
    assert.equal(observation.sqlCalls, 1);
    assert.equal(observation.scanCalls, 1);
    assert.deepEqual(observation.sqlRows, { allocations: 12 });
    assert(
      !JSON.stringify(observation).includes("private synthetic parameter"),
    );
  } finally {
    probe.restore();
  }
  assert.equal(store.db.scanRequest, original);
});

test("profile counts a streamed numeric batch as one request and retains no row values", async () => {
  const store = new SyntheticStore(),
    owner = {},
    callbacks = [() => {}, () => {}];
  const queries = [
    "SELECT amount FROM kp_allocations",
    "SELECT revision FROM kp_revisions",
  ];
  const counts = [{ rowCount: 12 }, { rowCount: 20 }];
  const original = (store.db.scanManyRequest = async (tx, sql, consumers) => {
    assert.equal(tx, owner);
    assert.equal(sql, queries);
    assert.equal(consumers, callbacks);
    return counts;
  });
  const probe = transactionProbe([store]);
  try {
    const { value, observation } = await probe.measure("write-allocation", () =>
      store.db.scanManyRequest(owner, queries, callbacks),
    );
    assert.equal(value, counts);
    assert.equal(observation.sqlCalls, 1);
    assert.equal(observation.scanCalls, 0);
    assert.equal(observation.numericBatchCalls, 1);
    assert.equal(observation.numericBatchStatements, 2);
    assert.deepEqual(observation.sqlRows, { allocations: 12, revisions: 20 });
  } finally {
    probe.restore();
  }
  assert.equal(store.db.scanManyRequest, original);
});

test("snapshot metrics separate metadata, numeric and unknown reads without counting auth, preflight or projection", async () => {
  const store = new SyntheticStore();
  let now = 0;
  const privateRow = { privateMarker: "synthetic private content" };
  store.db.request = async (_owner, sql, _values, all) => {
    now += all ? 7 : 3;
    return all
      ? { rows: [privateRow], recordsets: [[privateRow], []], rowCount: 1 }
      : { rows: [privateRow], rowCount: 1 };
  };
  store.db.scanManyRequest = async () => {
    now += 11;
    return [{ rowCount: 20 }, { rowCount: 30 }];
  };
  store.db.scanRequest = async () => {
    now += 5;
    return { rowCount: 4 };
  };
  store.read = async () => {
    await store.db.request(
      {},
      "SELECT * FROM kp_settings;\nSELECT * FROM kp_leaders",
      [],
      true,
    );
    await store.db.scanManyRequest(
      {},
      [
        "SELECT amount FROM kp_allocations",
        "SELECT revision FROM kp_revisions",
      ],
      [() => {}, () => {}],
    );
    await store.db.scanRequest(
      {},
      "SELECT hours FROM kp_actual_worked_hours",
      [],
      () => {},
    );
    await store.db.request({}, "SELECT * FROM kp_future_metadata");
    return privateRow;
  };
  const probe = transactionProbe([store], { clock: () => now });
  try {
    const { value, observation } = await probe.measure(
      "snapshot-breakdown",
      async () => {
        await store.db.request({}, "SELECT * FROM kp_users");
        await store.db.request({}, "SELECT * FROM kp_teams WHERE id=@p0", [
          "synthetic private parameter",
        ]);
        const result = await store.read();
        await store.db.request({}, "SELECT * FROM kp_users");
        return result;
      },
    );
    assert.equal(value, privateRow);
    assert.equal(observation.readMs, 26);
    assert.equal(observation.snapshotMetadataMs, 7);
    assert.equal(observation.snapshotNumericMs, 16);
    assert.equal(observation.snapshotOtherSqlMs, 3);
    assert.equal(observation.snapshotSqlCalls, 4);
    assert.equal(observation.snapshotBufferedRows, 2);
    assert.equal(observation.snapshotStreamedRows, 54);
    assert.equal(observation.sqlCalls, 7);
    assert.equal(observation.sqlMs, 35);
    assert(!JSON.stringify(observation).includes("synthetic private"));
    assert(!JSON.stringify(observation).includes("privateMarker"));
  } finally {
    probe.restore();
  }
});

test("concurrent snapshot scopes and transaction-local rereads retain independent row counts", async () => {
  const a = new SyntheticStore(),
    b = new SyntheticStore(),
    gate = deferred(),
    entered = deferred();
  a.read = async () => {
    await a.db.request({}, "SELECT * FROM kp_projects");
    entered.resolve();
    await gate.promise;
    return a.db.request({}, "SELECT * FROM kp_allocations");
  };
  b.read = async () => b.db.request({}, "SELECT * FROM kp_resources");
  const probe = transactionProbe([a, b]);
  const first = probe.measure("one", () => a.read());
  try {
    await entered.promise;
    const second = await probe.measure("two", async () => {
      await b.read();
      await b.db.request({}, "SELECT * FROM kp_resources");
      await b.read();
    });
    gate.resolve();
    const one = await first;
    assert.equal(one.observation.snapshotSqlCalls, 2);
    assert.equal(one.observation.snapshotBufferedRows, 4);
    assert.equal(one.observation.readCalls, 1);
    assert.equal(second.observation.snapshotSqlCalls, 2);
    assert.equal(second.observation.snapshotBufferedRows, 4);
    assert.equal(second.observation.readCalls, 2);
    assert.equal(second.observation.sqlCalls, 3);
  } finally {
    gate.resolve();
    await first;
    probe.restore();
  }
});

test("failed snapshot reads preserve the original error and close attribution before later SQL", async () => {
  const store = new SyntheticStore(),
    error = new Error("synthetic snapshot failure");
  store.read = async () => {
    await store.db.request({}, "SELECT * FROM kp_settings");
    throw error;
  };
  const original = store.read;
  const probe = transactionProbe([store]);
  try {
    const { observation } = await probe.measure("caught-error", async () => {
      await assert.rejects(store.read(), (e) => e === error);
      await store.db.request({}, "SELECT * FROM kp_settings");
    });
    assert.equal(observation.readCalls, 1);
    assert.equal(observation.snapshotSqlCalls, 1);
    assert.equal(observation.snapshotBufferedRows, 2);
    assert.equal(observation.sqlCalls, 2);
  } finally {
    probe.restore();
  }
  assert.equal(store.read, original);
});
