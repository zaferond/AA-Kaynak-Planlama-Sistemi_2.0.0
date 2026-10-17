import { actualViewQuery } from "./actual-view.mjs";
import { saveEmployeeRecord } from "./employee-account-command.mjs";
import { isResponsibilityConflictCode } from "../shared/resource-roles.ts";
import { activityQuery } from "./activity-report.mjs";
import { ReportReadAdmission } from "./report-read-admission.mjs";
import express from "express";
import { randomUUID } from "node:crypto";
import { assertAdminPassword } from "./admin-credentials.mjs";
import { z } from "zod";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  hashPassword,
  verifyPassword,
  token,
  digest,
  publicUser,
  admin,
  fail,
} from "./auth.mjs";
import {
  applyLeaderChange,
  reset,
  importRows,
  restore,
} from "./operations.mjs";
import {
  permissionInput,
  revokePermissionInput,
  revokePermissions,
  accountInput,
  updatePermissions,
  createEmployeeAccount,
} from "./user-commands.mjs";
import { disabledDirectory } from "./active-directory.mjs";
import { authenticateDirectoryAccount } from "./directory-auth.mjs";
import { changeAndView } from "./change-service.mjs";
import { sendDataSnapshot } from "./data-response.mjs";
import { applicationAddress } from "./http-config.mjs";
import {
  createAttemptLimiter,
  clientAddressKey,
  ATTEMPT_LIMITS,
} from "./rate-limits.mjs";
import {
  MutationAdmission,
  mutationAdmissionMiddleware,
} from "./mutation-admission.mjs";
export function createApp(
  store,
  {
    origin = "http://localhost:3000",
    trustedProxies = [],
    directory = disabledDirectory,
    mutationLimits,
    // API requests slower than this are logged (method, path, status, time).
    slowRequestMs = 2000,
    log = console.warn,
    mutationGate = new MutationAdmission(mutationLimits),
    attemptLimiter = createAttemptLimiter(store),
    reportReadGate = new ReportReadAdmission(),
    // Full snapshot reads queue briefly instead of exhausting the DB pool
    // (10 connections: writes 2 + reports 4 + these 4).
    dataReadGate = new MutationAdmission(
      { activeLimit: 4, pendingLimit: 32, waitMs: 10000, perUserLimit: 2 },
      {
        unavailable:
          "Sistem şu anda yoğun; veriler yüklenemedi. Birkaç saniye sonra Tekrar Dene ile yeniden yükleyin.",
        userBusy:
          "Önceki yükleme henüz tamamlanmadı. Birkaç saniye sonra yeniden deneyin.",
      },
    ),
  } = {},
) {
  const address = applicationAddress(origin);
  origin = address.origin;
  const secure = address.secure;
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", trustedProxies);
  app.use((req, res, next) => {
    res.set({
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "same-origin",
      "Content-Security-Policy":
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
    });
    if (secure) res.set("Strict-Transport-Security", "max-age=31536000");
    // req.secure consults forwarding headers only for a trusted socket peer.
    // Network restrictions and the proxy's header overwrite are still required.
    if (secure && !req.secure)
      return res.set("Cache-Control", "no-store").status(403).json({
        error: "HTTPS bağlantısı doğrulanamadı. Proxy ayarlarını kontrol edin.",
      });
    if (req.headers.host !== address.authority)
      return res.status(403).json({ error: "APP_ORIGIN adresini kullanın." });
    next();
  });
  app.use("/api", (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  // One line per slow request. The path never includes the query string
  // (search text) and the body is never logged.
  app.use("/api", (req, res, next) => {
    const start = performance.now();
    res.on("finish", () => {
      const ms = Math.round(performance.now() - start);
      if (ms >= slowRequestMs)
        log(
          "Slow request",
          req.method,
          req.originalUrl.split("?")[0],
          res.statusCode,
          ms + "ms",
        );
    });
    next();
  });
  app.use("/api", (req, res, next) => {
    if (
      !["GET", "HEAD"].includes(req.method) &&
      (req.headers.origin !== origin ||
        req.headers["x-requested-with"] !== "KaynakPortal")
    )
      return res.status(403).json({ error: "İstek kaynağı doğrulanamadı." });
    next();
  });
  const timer = setInterval(() => {
    attemptLimiter
      .cleanup()
      .catch(() => console.error("Giriş sayacı temizliği tamamlanamadı."));
  }, 60000);
  timer.unref();
  const cleanup = setInterval(
    () =>
      store
        .cleanupSessions()
        .catch(() => console.error("Oturum temizliği tamamlanamadı.")),
    3600000,
  );
  cleanup.unref();
  app.locals.close = () => {
    mutationGate.close();
    dataReadGate.close();
    clearInterval(timer);
    clearInterval(cleanup);
  };
  const cookieOptions = {
    httpOnly: true,
    sameSite: "strict",
    secure,
    path: "/",
  };
  // This opaque marker is not the cookie/session ID and cannot authenticate.
  const sessionIdentity = (id) => digest("aa-session-view-v1:" + id);
  const cookie = (req) => {
    const m = (req.headers.cookie || "").match(
      /(?:^|;\s*)kp_session=([a-zA-Z0-9_-]+)/,
    );
    return m?.[1];
  };
  // For IT monitoring and service restarts: no session, no details. 503 when
  // the database does not answer within 5 seconds.
  app.get("/api/health", async (_req, res) => {
    let timeout;
    try {
      await Promise.race([
        store.generation(),
        new Promise((_, reject) => {
          timeout = setTimeout(() => reject(Error("timeout")), 5000);
        }),
      ]);
      res.json({ status: "ok" });
    } catch {
      res.status(503).json({ status: "unavailable" });
    } finally {
      clearTimeout(timeout);
    }
  });
  const dummy = hashPassword(token());
  app.post(
    "/api/auth/login",
    async (req, _res, next) => {
      req.releaseIpAttempt = await attemptLimiter.reserve(
        "ip",
        clientAddressKey(req.ip),
        ATTEMPT_LIMITS.ip,
      );
      next();
    },
    express.json({ limit: "4kb" }),
    async (req, res) => {
      const body = z
        .object({
          username: z.string().trim().toLowerCase().min(1).max(100),
          password: z.string().max(256),
          remember: z.boolean().default(false),
        })
        .parse(req.body);
      const username = body.username;
      const releaseName = await attemptLimiter.reserve(
        "account",
        username,
        ATTEMPT_LIMITS.account,
      );
      let u = await store.findUser({ username });
      if (u?.authSource === "ldap" || (!u && directory.configured)) {
        u = await authenticateDirectoryAccount(
          store,
          directory,
          username,
          body.password,
          (id) =>
            attemptLimiter.reserve(
              "directory-account",
              id,
              ATTEMPT_LIMITS.account,
            ),
        );
        if (!u) {
          await verifyPassword(body.password, await dummy);
          fail(401, "Kullanıcı adı veya şifre hatalı ya da hesap pasif.");
        }
      } else if (
        !(await verifyPassword(body.password, u?.password || (await dummy))) ||
        !u?.active
      ) {
        fail(401, "Kullanıcı adı veya şifre hatalı ya da hesap pasif.");
      }
      await req.releaseIpAttempt();
      await releaseName();
      res.json(await issueSession(res, u, body.remember));
    },
  );
  /** New session cookie + CSRF token for `u` (login, password change). */
  async function issueSession(res, u, remember) {
    const raw = token(),
      csrf = token(),
      age =
        u.authSource === "ldap"
          ? 12 * 3600000
          : (remember ? 30 * 24 : 12) * 3600000;
    await store.createSession({
      _id: digest(raw),
      userId: u._id,
      userVersion: u.version,
      csrf,
      expiresAt: new Date(Date.now() + age),
    });
    res.cookie("kp_session", raw, {
      ...cookieOptions,
      ...(remember ? { maxAge: age } : {}),
    });
    const identity = sessionIdentity(digest(raw));
    res.set("X-Session-Identity", identity);
    return { user: publicUser(u), csrf, sessionIdentity: identity };
  }
  const authenticate = async (req, res) => {
    const raw = cookie(req);
    if (!raw) fail(401, "Giriş yapın.");
    const s = await store.session(digest(raw));
    const u = s && (await store.findUser({ id: s.userId }));
    if (!u?.active || u.version !== s.userVersion)
      fail(401, "Oturum sona erdi. Yeniden giriş yapın.");
    if (u.authSource === "ldap") {
      try {
        await directory.ensureActive(u.directoryId);
      } catch (error) {
        // ensureActive uses 401 for denied directory access, 503 for outages.
        // Persist revocation before returning 401; clearing one browser cookie
        // alone would allow another session to resume after AD reactivation.
        if (error.status === 401) {
          await store.transaction((c) => store.revokeUser(u._id, c));
          res.clearCookie("kp_session", cookieOptions);
        }
        throw error;
      }
      // LDAP may finish after another request has revoked this session.
      if (!(await store.session(s._id)))
        fail(401, "Oturum sona erdi. Yeniden giriş yapın.");
    }
    req.user = u;
    req.session = s;
    req.sessionIdentity = sessionIdentity(s._id);
    res.set("X-Session-Identity", req.sessionIdentity);
    if (
      !["GET", "HEAD"].includes(req.method) &&
      req.headers["x-csrf-token"] !== s.csrf
    )
      fail(403, "Oturum doğrulaması başarısız.");
  };
  // Paths an account that must replace its password may still use.
  const passwordChangePaths = new Set([
    "/auth/me",
    "/auth/logout",
    "/auth/password",
  ]);
  app.use("/api", async (req, res, next) => {
    await authenticate(req, res);
    if (req.user.mustChangePassword && !passwordChangePaths.has(req.path))
      throw Object.assign(Error("Devam etmeden önce şifrenizi değiştirin."), {
        status: 403,
        code: "PASSWORD_CHANGE_REQUIRED",
      });
    next();
  });
  const admission = mutationAdmissionMiddleware(mutationGate, authenticate);
  app.use("/api", admission.middleware);
  // Large imports/backups keep their existing allowance, after authentication.
  const normalJson = express.json({ limit: "2mb" });
  const bulkJson = express.json({ limit: "20mb" });
  app.use("/api", (req, res, next) => {
    const parser = [
      "/changes",
      "/resources/import",
      "/restore",
      "/allocations/reset",
    ].includes(req.path)
      ? bulkJson
      : normalJson;
    parser(req, res, next);
  });
  app.get("/api/auth/me", (req, res) =>
    res.json({
      user: publicUser(req.user),
      csrf: req.session.csrf,
      sessionIdentity: req.sessionIdentity,
    }),
  );
  app.post(
    "/api/auth/password",
    admission.handler(async (req, res) => {
      const body = z
        .object({
          currentPassword: z.string().max(256),
          newPassword: z.string().max(256),
        })
        .parse(req.body);
      const u = req.user;
      if (u.authSource === "ldap")
        fail(400, "AD hesabının şifresi Active Directory'de değiştirilir.");
      // Same per-account budget as login: guessing the current password here
      // is no cheaper than at the login form.
      const release = await attemptLimiter.reserve(
        "password-change",
        u._id,
        ATTEMPT_LIMITS.account,
      );
      if (!(await verifyPassword(body.currentPassword, u.password)))
        fail(400, "Mevcut şifre hatalı.");
      const next = body.newPassword;
      if (next.length < 10 || next.includes("'"))
        fail(400, "Yeni şifre en az 10 karakter olmalı; tek tırnak içeremez.");
      if (next === body.currentPassword)
        fail(400, "Yeni şifre mevcut şifreyle aynı olamaz.");
      try {
        assertAdminPassword(next, u.username, "Yeni şifre");
      } catch (error) {
        fail(400, error.message);
      }
      const password = await hashPassword(next);
      // One transaction: new password, flag cleared, every session of the
      // account closed (version bump). The change is audited as a user edit.
      await store.mutate(
        u,
        async (_d, active, c) => {
          await store.saveUser(
            {
              ...active,
              password,
              mustChangePassword: false,
              revision: active.revision + 1,
              version: active.version + 1,
            },
            c,
          );
          await store.revokeUser(active._id, c);
        },
        { auditUsers: true },
      );
      await release();
      const updated = await store.findUser({ id: u._id });
      // Keep "Beni Hatırla": only remembered sessions outlive 12 hours.
      const remembered = req.session.expiresAt - Date.now() > 12 * 3600000;
      res.json(await issueSession(res, updated, remembered));
    }),
  );
  app.post("/api/auth/logout", async (req, res) => {
    await store.deleteSession(req.session._id);
    res.clearCookie("kp_session", cookieOptions);
    res.json({ ok: true });
  });
  app.get("/api/data", async (req, res) => {
    const controller = new AbortController();
    const abort = () => controller.abort();
    req.once("aborted", abort);
    let release;
    try {
      release = await dataReadGate.acquire(controller.signal, req.user._id);
    } finally {
      req.off("aborted", abort);
    }
    try {
      sendDataSnapshot(req, res, await store.view(req.user));
    } finally {
      release();
    }
  });
  app.get(
    "/api/actual-view",
    reportReadGate.handler(async (req, res) => {
      const query = actualViewQuery.parse(req.query);
      res.json(await store.actualView(req.user, query));
    }),
  );
  app.get(
    "/api/activity-report",
    reportReadGate.handler(async (req, res) => {
      const query = activityQuery.parse(req.query);
      res.json(await store.activityReport(req.user, query));
    }),
  );
  app.get("/api/version", async (req, res) => {
    res.json({
      generation: await store.generation(),
      sessionIdentity: req.sessionIdentity,
    });
  });
  app.post(
    "/api/changes",
    admission.handler(async (req, res) => {
      res.json(
        await changeAndView(store, req.user, req.body.changes, req.body),
      );
    }),
  );
  app.post(
    "/api/leaders/change",
    admission.handler(async (req, res) => {
      admin(req.user);
      res.json(
        await store.mutate(
          req.user,
          (d, u, c, generation) =>
            applyLeaderChange(d, u, req.body, c, generation),
          { auditUsers: true, returnView: true },
        ),
      );
    }),
  );
  app.post(
    "/api/allocations/reset",
    admission.handler(async (req, res) => {
      admin(req.user);
      res.json(
        await store.mutate(
          req.user,
          (d, u) => reset(d, u, req.body.revisions),
          {
            returnView: true,
          },
        ),
      );
    }),
  );
  app.post(
    "/api/resources/import",
    admission.handler(async (req, res) => {
      admin(req.user);
      const { view, result } = await store.mutate(
        req.user,
        (d, u) => importRows(d, u, req.body.rows),
        { returnView: true, returnResult: true },
      );
      res.json({ ...view, ...result });
    }),
  );
  app.get("/api/audit", async (req, res) => {
    admin(req.user);
    const page = z
      .object({
        offset: z.coerce.number().int().min(0).max(1000000).default(0),
        limit: z.coerce.number().int().min(1).max(100).default(50),
        kind: z
          .string()
          .regex(/^[a-zA-Z]{1,40}$/)
          .optional(),
        q: z.string().trim().max(100).optional(),
      })
      .parse(req.query);
    res.json(await store.auditLog(req.user, page));
  });
  app.get("/api/backup", async (req, res) => {
    admin(req.user);
    const { data } = await store.view(req.user);
    delete data.users;
    data.revisions = Object.fromEntries(
      Object.entries(data.revisions).filter(([k]) => !k.startsWith("user:")),
    );
    res.json({
      format: "aa-planning-data-v1",
      createdAt: new Date().toISOString(),
      data,
    });
  });
  app.post(
    "/api/restore",
    admission.handler(async (req, res) => {
      admin(req.user);
      res.json(
        await store.mutate(
          req.user,
          (d, u, _s, generation) => {
            if (req.body.generation !== generation)
              fail(409, "Veriler değişti. Yenileyip yedeği tekrar yükleyin.");
            return restore(d, u, req.body.data);
          },
          { returnView: true },
        ),
      );
    }),
  );
  app.post(
    "/api/employees/save",
    admission.handler(async (req, res) => {
      admin(req.user);
      await attemptLimiter.reserve(
        "user-edit",
        req.user._id,
        ATTEMPT_LIMITS.userEdit,
      );
      const view = await saveEmployeeRecord(
        store,
        req.user,
        req.body,
        directory,
      );
      // A linked AD administrator may edit their own role. The mutation commits
      // and revokes the session before requiring reauthentication, without a snapshot.
      if (
        req.body.permission?.action !== "create" &&
        req.body.permission?.id === req.user._id
      )
        fail(401, "Oturum yenilenmeli.");
      res.json(view);
    }),
  );
  app.post(
    "/api/users",
    admission.handler(async (req, res) => {
      admin(req.user);
      await attemptLimiter.reserve(
        "user-edit",
        req.user._id,
        ATTEMPT_LIMITS.userEdit,
      );
      const input = permissionInput.parse(req.body);
      const view = await store.mutate(
        req.user,
        (d, u, session) => updatePermissions(store, d, u, session, input),
        { auditUsers: true, returnView: input.id !== req.user._id },
      );
      // Editing your own permissions invalidates your session. Commit the change
      // first, then return the existing reauthentication response without a snapshot.
      if (input.id === req.user._id) fail(401, "Oturum yenilenmeli.");
      res.json(view);
    }),
  );
  app.post(
    "/api/users/revoke",
    admission.handler(async (req, res) => {
      admin(req.user);
      await attemptLimiter.reserve(
        "user-edit",
        req.user._id,
        ATTEMPT_LIMITS.userEdit,
      );
      const input = revokePermissionInput.parse(req.body);
      const view = await store.mutate(
        req.user,
        (_d, u, session) => revokePermissions(store, u, session, input),
        { auditUsers: true, returnView: input.id !== req.user._id },
      );
      if (input.id === req.user._id) fail(401, "Oturum yenilenmeli.");
      res.json(view);
    }),
  );
  app.get("/api/directory/users", async (req, res) => {
    admin(req.user);
    const { q } = z
      .object({ q: z.string().trim().max(100).default("") })
      .strict()
      .parse(req.query);
    if (!directory.configured)
      return res.json({ configured: false, users: [], hasMore: false });
    await attemptLimiter.reserve("directory-search", req.user._id, 120);
    res.json({ configured: true, ...(await directory.listUsers(q)) });
  });
  app.post(
    "/api/users/create",
    admission.handler(async (req, res) => {
      admin(req.user);
      await attemptLimiter.reserve(
        "user-edit",
        req.user._id,
        ATTEMPT_LIMITS.userEdit,
      );
      const input = accountInput.parse(req.body);
      const person = await directory.getUser(input.directoryId);
      if (!person)
        fail(
          400,
          "AD kullanıcısı bulunamadı, pasif veya izin verilen kapsam dışında.",
        );
      const password = await hashPassword(token());
      res.json(
        await store.mutate(
          req.user,
          (d, u, session) =>
            createEmployeeAccount(
              store,
              d,
              u,
              session,
              input,
              person,
              password,
            ),
          { auditUsers: true, returnView: true },
        ),
      );
    }),
  );
  app.use("/api", (_req, res) =>
    res.status(404).json({ error: "API bulunamadı." }),
  );
  const site = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../site",
  );
  app.use(
    express.static(site, {
      index: "index.html",
      dotfiles: "deny",
      setHeaders: (res, p) =>
        res.setHeader(
          "Cache-Control",
          p.endsWith(".html")
            ? "no-cache"
            : "public, max-age=31536000, immutable",
        ),
    }),
  );
  app.use((err, req, res, _next) => {
    admission.releaseUnstarted(req);
    if (res.destroyed) return;
    if (res.headersSent) return res.destroy();
    const status =
      err.status ||
      (err instanceof z.ZodError
        ? 400
        : [2601, 2627, 547, 2628, 8152, 515].includes(err.number) ||
            err.code?.startsWith("SQLITE_CONSTRAINT") ||
            err.message?.includes("constraint failed")
          ? 409
          : 500);
    // A short reference ties the user's message to the server log line. The
    // log keeps the cause (e.g. MSSQL 50001 = data lock timeout) but never the
    // request body.
    const reference = status === 500 ? randomUUID().slice(0, 8) : "";
    if (reference) {
      res.set("X-Request-Id", reference);
      console.error(
        "Request failed",
        reference,
        req.method,
        req.path,
        err.name,
        err.code ?? "",
        err.number ?? "",
        String(err.message || "").slice(0, 300),
      );
    }
    if (err.retryAfter) res.set("Retry-After", String(err.retryAfter));
    res.status(status).json({
      ...(isResponsibilityConflictCode(err.code) ? { code: err.code } : {}),
      error:
        err instanceof z.ZodError
          ? "Veri biçimi geçersiz: " + err.issues[0]?.path.join(".")
          : [2601, 2627, 547, 2628, 8152, 515].includes(err.number) ||
              err.code?.startsWith("SQLITE_CONSTRAINT") ||
              err.message?.includes("constraint failed")
            ? "Kayıt benzersizlik, ilişki veya değer kuralına uymuyor. Bağlı kayıtları kontrol edin."
            : status === 500
              ? `İşlem tamamlanamadı. Sunucu bağlantısını ve günlüklerini kontrol edin (hata kodu: ${reference}).`
              : err.message,
    });
  });
  return app;
}
