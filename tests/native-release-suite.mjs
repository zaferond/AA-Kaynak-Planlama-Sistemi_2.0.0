import { allowedPlanningTeam, allowedActualTeam } from "../shared/access.ts";
import assert from "node:assert/strict";
import http from "node:http";
import { hashPassword, publicUser, digest } from "../backend/auth.mjs";
import { createApp } from "../backend/app.mjs";
import { validate, scopeData } from "../shared/server-domain.ts";
import { actualView } from "../backend/actual-view.mjs";
import { activityReport } from "../backend/activity-report.mjs";
import { requiredVersions } from "../backend/migration-catalog.mjs";
import { seedBenchmarkStore } from "../scripts/benchmark-fixture.mjs";
import { syntheticDirectory } from "./directory-fixture.mjs";
import {
  legacyValidationProjection,
  compareSnapshotValidation,
} from "./snapshot-validation-suite.mjs";

// Caller owns a fresh, disposable synthetic database. Native callers must hold
// withMssqlTestDatabase's exclusive test lease. SQL.js runs cannot attest TLS.
export async function nativeReleaseSuite(stores, checked) {
  const [store, peerStore] = stores;
  const checks = {};
  const password = "Synthetic-native-release-only-284!";
  const hashed = await hashPassword(password);
  const users = {};
  const bootstrap = async (id, role, resourceId = "", leaders = []) => {
    await store.bootstrapUser({
      _id: id,
      username: "release." + id,
      name: "Synthetic " + id,
      role,
      resourceId,
      leaders,
      active: true,
      password: hashed,
      version: 1,
      revision: 1,
    });
    users[id] = await store.findUser({ id });
  };
  await checked.test(
    "current schema preserves hierarchy, responsibilities and atomic conflict rejection",
    async () => {
      const versions = (
        await store.db.query("SELECT version FROM kp_schema_migrations")
      ).rows.map((r) => Number(r.version));
      assert(requiredVersions.every((v) => versions.includes(v)));
      await seedBenchmarkStore(store, 1000, {
        resources: 80,
        actuals: 400,
        calendarDays: 0,
      });
      const initial = (await store.read()).data;
      const legacy = legacyValidationProjection(initial);
      assert(
        compareSnapshotValidation(legacy, {
          previousResources: legacy.resources,
        }).data,
      );
      const team = initial.teams.find((t) => t.lead && t.kind !== "leadership");
      const child = initial.teams.find(
        (t) => t.lead && t.lead !== team.lead && t.kind !== "leadership",
      );
      assert(team && child);
      const own = initial.resources.find((r) => r.versions[0].team === team.id);
      await bootstrap("admin", "admin");
      await bootstrap("normal", "normal", own.id);
      await bootstrap("manager", "manager", "", [team.lead]);
      await bootstrap("team-planner", "manager");
      await store.transaction((c) =>
        store.saveUser(
          { ...users["team-planner"], planningTeams: [child.id] },
          c,
        ),
      );
      users["team-planner"] = await peerStore.findUser({ id: "team-planner" });
      assert.deepEqual(users["team-planner"].planningTeams, [child.id]);
      assert(
        allowedPlanningTeam(
          initial,
          publicUser(users["team-planner"]),
          child.id,
        ),
      );
      assert(
        !allowedPlanningTeam(
          initial,
          publicUser(users["team-planner"]),
          team.id,
        ),
      );
      assert(
        !allowedActualTeam(
          initial,
          publicUser(users["team-planner"]),
          child.id,
        ),
      );
      await store.mutate(users.admin, (data) => {
        data.leaderParents[child.lead] = team.lead;
        data.resources.find((r) => r.id === own.id).versions[0].assignmentRole =
          "productOwner";
        const unit = data.teams.find(
          (t) => t.kind === "leadership" && t.lead === team.lead,
        );
        assert(unit);
        data.resources.push({
          id: "release-leader",
          name: "Synthetic leader",
          note: "",
          versions: [
            {
              ...own.versions[0],
              team: unit.id,
              lead: unit.lead,
              assignmentRole: "leader",
            },
          ],
        });
      });
      await store.mutate(users.admin, (data) => {
        data.resources.push({
          ...structuredClone(own),
          id: "release-coe",
          name: "Synthetic CoE",
          versions: own.versions.map((v) => ({ ...v, assignmentRole: "coe" })),
        });
      });
      const before = await store.read();
      assert.equal(
        before.data.resources.find((r) => r.id === "release-coe").versions[0]
          .assignmentRole,
        "coe",
      );
      assert.equal(before.data.leaderParents[child.lead], team.lead);
      assert.equal(
        before.data.resources.find((r) => r.id === own.id).versions[0]
          .assignmentRole,
        "productOwner",
      );
      for (const id of [own.id, "release-leader"]) {
        await assert.rejects(
          store.mutate(users.admin, (data) => {
            data.resources.push({
              ...structuredClone(data.resources.find((r) => r.id === id)),
              id: "release-conflict",
            });
          }),
          { status: 400 },
        );
        assert.deepEqual(await store.read(), before);
      }
      assert.deepEqual(validate(validate(before.data)), validate(before.data));
      checks.currentSchemaAndHierarchy = true;
    },
  );
  await checked.test(
    "native privacy separates private days from authorized monthly aggregates",
    async () => {
      await store.mutate(users.admin, (data) => {
        const own = users.normal.resourceId;
        const team = data.resources.find((r) => r.id === own).versions[0].team;
        const peer = data.resources.find(
          (r) => r.id !== own && r.versions[0].team === team,
        );
        assert(peer);
        for (const id of [own, peer.id]) {
          data.personCalendar[id + "|2026-01-05|leave"] = {
            type: "leave",
            hours: 2,
            label: "PRIVATE_RELEASE_LEAVE",
          };
          data.personCalendar[id + "|2026-01-06|training"] = {
            type: "training",
            hours: 1,
            label: "PRIVATE_RELEASE_TRAINING",
          };
          data.revisions["personDay:" + id + "|2026-01-05|leave"] = 2;
        }
        data.revisions["actual:" + own + "|bench-p0|2026-02"] = 7;
      });
      const data = (await store.read()).data;
      for (const user of [users.normal, users.manager]) {
        for (const scoped of [
          scopeData(data, publicUser(user)),
          (await store.actualView(user, { start: "2026-01", count: 3 })).data,
        ]) {
          assert(
            Object.keys(scoped.personCalendar).every((key) =>
              key.startsWith((user.resourceId || "NO_OWNER") + "|"),
            ),
          );
          assert(
            Object.keys(scoped.revisions)
              .filter((key) => key.startsWith("personDay:"))
              .every((key) =>
                key.startsWith(
                  "personDay:" + (user.resourceId || "NO_OWNER") + "|",
                ),
              ),
          );
        }
      }
      const normal = await store.actualView(users.normal, {
        start: "2026-01",
        count: 3,
      });
      assert.equal(
        normal.data.revisions[
          "actual:" + users.normal.resourceId + "|bench-p0|2026-02"
        ],
        7,
      );
      assert(Object.keys(normal.monthSummaries).length > 3);
      assert.equal(
        JSON.stringify(
          await store.activityReport(users.manager, {
            start: "2026-01",
            count: 3,
            projects: [],
          }),
        ).includes("PRIVATE_RELEASE_"),
        false,
      );
      assert.deepEqual(
        (await store.view(users.admin)).data.personCalendar,
        data.personCalendar,
      );
      checks.personalCalendarPrivacy = true;
    },
  );
  await checked.test(
    "native scoped report reads equal full snapshots for roles, periods and project filters",
    async () => {
      const before = await store.read();
      for (const user of Object.values(users))
        for (const start of ["2026-01", "2030-01"])
          for (const projects of [[], ["bench-p0"], ["unknown' OR 1=1--"]]) {
            const query = { start, count: 3, projects };
            assert.deepEqual(
              await store.actualView(user, query),
              actualView(before.data, publicUser(user), query),
            );
            assert.deepEqual(
              await store.activityReport(user, query),
              activityReport(before.data, publicUser(user), query),
            );
          }
      assert.deepEqual(await store.read(), before);
      checks.actualReportProjection = true;
    },
  );
  await checked.test(
    "native shared session storage durably revokes AD sessions and retains them on outages",
    async () => {
      const directory = syntheticDirectory(password);
      const id = "d".repeat(32);
      directory.add({
        id,
        username: "release.ldap",
        name: "Synthetic LDAP",
        email: "synthetic@example.test",
      });
      await store.bootstrapUser({
        _id: "release-ldap",
        username: "release.ldap",
        name: "Synthetic LDAP",
        email: "synthetic@example.test",
        authSource: "ldap",
        directoryId: id,
        role: "manager",
        leaders: [],
        active: true,
        password: hashed,
        version: 1,
        revision: 1,
      });
      const servers = [];
      try {
        for (const instance of [store, peerStore]) {
          const server = http.createServer();
          await new Promise((resolve) =>
            server.listen(0, "127.0.0.1", resolve),
          );
          const origin = "http://127.0.0.1:" + server.address().port;
          const app = createApp(instance, { origin, directory });
          server.on("request", app);
          servers.push({ server, app, origin });
        }
        async function request(index, url, auth = {}, body) {
          const { origin } = servers[index];
          const response = await fetch(origin + "/api" + url, {
            method: body === undefined ? "GET" : "POST",
            headers: {
              Cookie: auth.cookie || "",
              ...(body === undefined
                ? {}
                : {
                    Origin: origin,
                    "X-Requested-With": "KaynakPortal",
                    "X-CSRF-Token": auth.csrf || "",
                    "Content-Type": "application/json",
                  }),
            },
            body: body === undefined ? undefined : JSON.stringify(body),
          });
          return {
            status: response.status,
            json: await response.json(),
            response,
          };
        }
        async function login(index) {
          const result = await request(
            index,
            "/auth/login",
            {},
            { username: "release.ldap", password },
          );
          assert.equal(result.status, 200);
          const cookie = result.response.headers
            .get("set-cookie")
            .split(";")[0];
          return {
            cookie,
            csrf: result.json.csrf,
            id: digest(cookie.slice("kp_session=".length)),
          };
        }
        const before = await store.findUser({ id: "release-ldap" });
        const first = await login(0),
          second = await login(1);
        directory.disable(id);
        assert.equal((await request(0, "/data", first)).status, 401);
        for (const session of [first, second])
          assert.equal(await peerStore.session(session.id), undefined);
        directory.enable(id);
        assert.equal((await request(1, "/auth/me", second)).status, 401);
        const fresh = await login(1);
        directory.setUnavailable(true);
        assert.equal((await request(0, "/data", fresh)).status, 503);
        assert(await store.session(fresh.id));
        directory.setUnavailable(false);
        assert.equal((await request(0, "/auth/me", fresh)).status, 200);
        assert.deepEqual(await store.findUser({ id: "release-ldap" }), before);
        checks.adSessionLifecycle = true;
      } finally {
        for (const { server, app } of servers) {
          app.locals.close();
          server.closeAllConnections();
          if (server.listening)
            await new Promise((resolve) => server.close(resolve));
        }
      }
    },
  );
  await checked.test(
    "native connection encryption is observed on SQL Server, never inferred from SQL.js",
    async () => {
      checks.encryptedNativeConnection = false;
      if (store.provider === "mssql") {
        for (const instance of stores) {
          const row = (
            await instance.db.query(
              "SELECT encrypt_option FROM sys.dm_exec_connections WHERE session_id=@@SPID",
            )
          ).rows[0];
          assert.equal(String(row?.encrypt_option).toUpperCase(), "TRUE");
        }
        checks.encryptedNativeConnection = true;
      }
    },
  );
  return checks;
}
