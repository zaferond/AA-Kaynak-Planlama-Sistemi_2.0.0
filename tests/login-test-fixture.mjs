import http from "node:http";
import { createApp } from "../backend/app.mjs";
import { hashPassword } from "../backend/auth.mjs";

export async function application(
  t,
  trustedProxies = [],
  options = {},
  suppliedStore,
) {
  const password = "Only-for-login-test-284!";
  const user = {
    _id: "u",
    username: "test.user",
    name: "User",
    role: "normal",
    leaders: [],
    active: true,
    version: 1,
    password: await hashPassword(password),
  };
  const store = suppliedStore || {
    cleanupSessions: async () => {},
    findUser: async ({ username }) =>
      username === user.username ? user : null,
    createSession: async () => {},
  };
  const server = http.createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = "http://127.0.0.1:" + server.address().port;
  const app = createApp(store, { origin, trustedProxies, ...options });
  server.on("request", app);
  t.after(async () => {
    app.locals.close();
    await new Promise((resolve) => server.close(resolve));
  });
  const request = (body, ip = "192.0.2.1", url = "/auth/login", headers = {}) =>
    fetch(origin + "/api" + url, {
      method: "POST",
      headers: {
        Origin: origin,
        "Content-Type": "application/json",
        "X-Requested-With": "KaynakPortal",
        "X-Forwarded-For": ip,
        ...headers,
      },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }).then(async (response) => ({
      status: response.status,
      retryAfter: response.headers.get("retry-after"),
      body: await response.json(),
    }));
  return { request, password, store };
}
