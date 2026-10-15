import test from "node:test";
import { application } from "./login-test-fixture.mjs";
import assert from "node:assert/strict";
import { trustedProxyAddresses } from "../backend/trusted-proxies.mjs";

test("proxy configuration accepts explicit addresses and rejects broad trust shortcuts", () => {
  assert.deepEqual(trustedProxyAddresses(), []);
  assert.deepEqual(
    trustedProxyAddresses("loopback, 192.0.2.10, 10.0.0.0/24, ::1"),
    ["loopback", "192.0.2.10", "10.0.0.0/24", "::1"],
  );
  for (const value of [
    "true",
    "1",
    "0.0.0.0/0",
    "::/0",
    "192.0.2.1/33",
    "::1/129",
    "loopback,",
    "example.com",
  ])
    assert.throws(() => trustedProxyAddresses(value), /TRUST_PROXY/);
});

test("trusted proxy keeps client login failure budgets separate", async (t) => {
  const { request } = await application(t, ["loopback"]);
  for (let i = 0; i < 60; i++) assert.equal((await request({})).status, 400);
  assert.equal((await request({})).status, 429);
  assert.equal((await request({}, "192.0.2.2")).status, 400);
});

test("untrusted forwarded headers cannot bypass the connection IP limit", async (t) => {
  const { request } = await application(t);
  for (let i = 0; i < 60; i++)
    assert.equal((await request({}, "192.0.2." + (i + 1))).status, 400);
  assert.equal((await request({}, "192.0.2.200")).status, 429);
});

test("successful logins do not spend IP or account failure budgets", async (t) => {
  const { request, password } = await application(t, ["loopback"]);
  for (let i = 0; i < 59; i++) assert.equal((await request({})).status, 400);
  for (let i = 0; i < 17; i++)
    assert.equal(
      (await request({ username: "test.user", password })).status,
      200,
    );
  assert.equal((await request({})).status, 400);
  assert.equal(
    (await request({ username: "test.user", password })).status,
    429,
  );
});

test("account failure limit remains effective across different client IPs", async (t) => {
  const { request } = await application(t, ["loopback"]);
  for (let i = 0; i < 15; i++)
    assert.equal(
      (
        await request(
          { username: "test.user", password: "wrong" },
          "192.0.2." + (i + 1),
        )
      ).status,
      401,
    );
  assert.equal(
    (await request({ username: "test.user", password: "wrong" }, "192.0.2.200"))
      .status,
    429,
  );
});

test("origin and authentication are checked before large application bodies; login body is bounded", async (t) => {
  const { request } = await application(t);
  assert.equal((await request("{", "192.0.2.1", "/changes")).status, 401);
  assert.equal(
    (
      await request("{", "192.0.2.1", "/changes", {
        Origin: "https://invalid.example",
      })
    ).status,
    403,
  );
  assert.equal(
    (await request({ username: "test.user", password: "x".repeat(5000) }))
      .status,
    413,
  );
});
