import test from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { numericRecordSchema } from "../shared/numeric-record-schema.ts";
const policies = [
  { max: 10000 },
  { max: 100 },
  { max: 1000 },
  { integer: true },
];
function reference(policy) {
  let number = z.number();
  if (policy.integer) number = number.int();
  number = number.min(0);
  if (policy.max !== undefined) number = number.max(policy.max);
  return z.record(number);
}
function compare(policy, value) {
  const old = reference(policy).safeParse(value),
    current = numericRecordSchema(policy).safeParse(value);
  assert.equal(current.success, old.success);
  if (old.success) assert.deepEqual(current.data, old.data);
  else assert.deepEqual(current.error.issues, old.error.issues);
  return current;
}
test("numeric dictionary parsing retains every boundary, invalid type and original Zod issue", () => {
  const values = [
    undefined,
    null,
    true,
    false,
    "",
    [],
    [1],
    new Date(),
    new Map(),
    new Set(),
    0,
    {},
    { a: 0, b: -0, c: 0.5, d: 100 },
    ...[
      -1,
      -0.5,
      NaN,
      Infinity,
      -Infinity,
      0,
      0.5,
      100,
      100.01,
      1000,
      1000.01,
      10000,
      10000.01,
      Number.MAX_SAFE_INTEGER,
      Number.MAX_VALUE,
      "1",
      null,
      undefined,
      true,
      {},
      [],
    ].map((a) => ({ a })),
    { first: -1.5, second: "x", third: NaN },
  ];
  for (const policy of policies)
    for (const value of values) compare(policy, value);
});
test("numeric dictionaries retain own/inherited keys, prototype-like keys, symbols and Zod __proto__ semantics", () => {
  const nullMap = Object.assign(Object.create(null), {
    a: 1,
    constructor: 2,
    toString: 3,
  });
  const inherited = Object.create({ inherited: 4 });
  inherited.own = 2;
  const hidden = { a: 1 };
  Object.defineProperty(hidden, "hidden", { value: -1, enumerable: false });
  hidden[Symbol("ignored")] = -1;
  for (const policy of policies)
    for (const value of [
      nullMap,
      inherited,
      hidden,
      JSON.parse('{"__proto__":2,"constructor":3,"toString":4}'),
      JSON.parse('{"__proto__":-1,"good":1}'),
    ])
      compare(policy, value);
  assert.equal(
    Object.hasOwn(
      numericRecordSchema({ max: 100 }).parse(JSON.parse('{"__proto__":2}')),
      "__proto__",
    ),
    false,
  );
  assert.equal(Object.hasOwn(Object.prototype, "good"), false);
});
test("numeric dictionaries always copy valid maps without changing frozen input or signed zero", () => {
  for (const policy of policies) {
    const value = Object.freeze({ a: 0, b: -0, c: 1 });
    const result = compare(policy, value);
    assert.notEqual(result.data, value);
    result.data.c = 2;
    assert.equal(value.c, 1);
    assert(Object.is(result.data.b, -0));
    assert.equal(Object.getPrototypeOf(result.data), Object.prototype);
  }
});
test("numeric dictionary fallback reads accessors once and retains thrown accessor behavior", () => {
  for (const policy of policies)
    for (const result of [1, -1, "bad"]) {
      let oldCalls = 0,
        newCalls = 0;
      const oldValue = {},
        newValue = {};
      Object.defineProperty(oldValue, "a", {
        enumerable: true,
        get() {
          oldCalls++;
          return result;
        },
      });
      Object.defineProperty(newValue, "a", {
        enumerable: true,
        get() {
          newCalls++;
          return result;
        },
      });
      const old = reference(policy).safeParse(oldValue),
        current = numericRecordSchema(policy).safeParse(newValue);
      assert.equal(oldCalls, 1);
      assert.equal(newCalls, 1);
      assert.equal(current.success, old.success);
      if (old.success) assert.deepEqual(current.data, old.data);
      else assert.deepEqual(current.error.issues, old.error.issues);
    }
  const value = {};
  const error = Error("Synthetic accessor failure");
  Object.defineProperty(value, "a", {
    enumerable: true,
    get() {
      throw error;
    },
  });
  assert.throws(
    () => numericRecordSchema({ max: 100 }).parse(value),
    (e) => e === error,
  );
});
test("numeric dictionary nested errors retain path, order, optional/default and omitted-key behavior", () => {
  for (const policy of policies) {
    const wrap = (record) =>
      z.object({
        rows: z.array(
          z.object({
            values: record,
            optional: record.optional(),
            defaults: record.default({}),
          }),
        ),
      });
    for (const value of [
      {
        rows: [
          { values: { first: -1.5, second: "bad" }, optional: { c: NaN } },
        ],
      },
      { rows: [{ values: { a: 1 } }] },
      { rows: [{ values: {}, optional: undefined }] },
      { rows: [{}] },
    ]) {
      const old = wrap(reference(policy)).safeParse(value),
        current = wrap(numericRecordSchema(policy)).safeParse(value);
      assert.equal(current.success, old.success);
      if (old.success) assert.deepEqual(current.data, old.data);
      else assert.deepEqual(current.error.issues, old.error.issues);
    }
  }
});
test("numeric dictionary seeded combinations match the original validator", () => {
  let state = 3719;
  const next = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state;
  };
  const candidates = [
    -1,
    -0.5,
    -0,
    0,
    0.5,
    1,
    100,
    1000,
    10000,
    NaN,
    Infinity,
    undefined,
    "3",
    null,
  ];
  for (let i = 0; i < 250; i++) {
    const entries = Array.from({ length: next() % 12 }, (_, j) => [
      "key" + j,
      candidates[next() % candidates.length],
    ]);
    for (const policy of policies) compare(policy, Object.fromEntries(entries));
  }
});
