import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createApp } from "../backend/app.mjs";

async function fixture(
  t,
  { origin = "https://synthetic.invalid/", trustedProxies = [] } = {},
) {
  const calls = { reserve: 0, session: 0 };
  const app = createApp(
    {
      cleanupSessions: async () => {},
      session: async () => {
        calls.session++;
        return null;
      },
    },
    {
      origin,
      trustedProxies,
      attemptLimiter: {
        cleanup: async () => {},
        reserve: async () => {
          calls.reserve++;
          return async () => {};
        },
      },
    },
  );
  const server = http.createServer(app);
  t.after(async () => {
    app.locals.close();
    server.closeAllConnections();
    if (server.listening) await new Promise((resolve) => server.close(resolve));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  // Use node:http so deliberately supplied Host headers reach the server.
  const request = (headers = {}, { method = "POST", body = "{}" } = {}) =>
    new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: "127.0.0.1",
          port: server.address().port,
          method,
          path: method === "GET" ? "/api/auth/me" : "/api/auth/login",
          headers: {
            Host: "synthetic.invalid",
            Origin: new URL(origin).origin,
            "X-Requested-With": "KaynakPortal",
            "Content-Type": "application/json",
            ...headers,
          },
        },
        (res) => {
          let text = "";
          res.on("data", (chunk) => (text += chunk));
          res.on("end", () =>
            resolve({
              status: res.statusCode,
              headers: res.headers,
              body: JSON.parse(text),
            }),
          );
        },
      );
      req.on("error", reject);
      req.end(method === "GET" ? undefined : body);
    });
  return { calls, request };
}

test("HTTPS deployment rejects direct HTTP and untrusted protocol claims before parsing or store access", async (t) => {
  for (const trustedProxies of [[], ["192.0.2.10/32"], ["loopback"]]) {
    const { request, calls } = await fixture(t, { trustedProxies });
    const values =
      trustedProxies[0] === "loopback"
        ? [undefined, "http", "invalid"]
        : [undefined, "http", "https"];
    for (const value of values) {
      const response = await request(
        value ? { "X-Forwarded-Proto": value } : {},
        { body: "not JSON" },
      );
      assert.equal(response.status, 403);
      assert.match(response.body.error, /HTTPS/);
      assert.equal(response.headers["cache-control"], "no-store");
    }
    assert.equal(
      (
        await request(
          { Cookie: "kp_session=synthetic_token" },
          { method: "GET" },
        )
      ).status,
      403,
    );
    assert.deepEqual(calls, { reserve: 0, session: 0 });
  }
});

test("trusted HTTPS forwarding accepts normalized origin while Host and Origin remain independent checks", async (t) => {
  const { request, calls } = await fixture(t, { trustedProxies: ["loopback"] });
  const headers = { "X-Forwarded-Proto": "https" };
  assert.equal((await request(headers)).status, 400); // Reaches the login body validator.
  assert.equal(calls.reserve, 1);
  assert.equal(
    (
      await request({
        ...headers,
        Host: "wrong.invalid",
        "X-Forwarded-Host": "synthetic.invalid",
      })
    ).status,
    403,
  );
  assert.equal(
    (await request({ ...headers, Origin: "https://wrong.invalid" })).status,
    403,
  );
  assert.equal(calls.reserve, 1);
  assert.equal((await request(headers, { method: "GET" })).status, 401);
});

test("local HTTP mode remains usable and ignores untrusted forwarded HTTPS claims", async (t) => {
  const { request, calls } = await fixture(t, {
    origin: "http://synthetic.invalid/",
  });
  for (const headers of [{}, { "X-Forwarded-Proto": "https" }]) {
    const response = await request(headers);
    assert.equal(response.status, 400);
    assert.equal(response.headers["strict-transport-security"], undefined);
  }
  assert.equal(calls.reserve, 2);
});
