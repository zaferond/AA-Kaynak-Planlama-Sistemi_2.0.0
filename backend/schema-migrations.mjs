import { ensureLeadershipUnits } from "../shared/leadership-units.ts";
import catalog from "../shared/catalog.json" with { type: "json" };
import { initialRiskSystems } from "../shared/risk-system-seed.ts";
import {
  workdaysInMonth,
  calendarHoursInMonth,
  effectivePersonHoursInMonth,
  DEFAULT_MONTHLY_HOURS,
  HOURS_PER_WORKDAY,
} from "../shared/actual-units.ts";
import {
  executeSqlMigration,
  migrationSql,
  validateMigrationCatalog,
  assertKnownMigrationVersions,
  assertMigrationHistory,
} from "./migration-catalog.mjs";

// Called inside Store's single migration transaction. Source is included in backup fingerprints.
export async function prepareSchema(c, { provider, auto }) {
  await validateMigrationCatalog(provider);
  const found =
    provider === "sqljs"
      ? (
          await c.query(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='kp_schema_migrations'",
          )
        ).rows.length
      : (await c.query("SELECT OBJECT_ID(N'kp_schema_migrations',N'U') AS id"))
          .rows[0]?.id;
  if (!found) {
    if (!auto)
      throw Error(
        "MSSQL şeması hazır değil. IT şema kurulumu için npm run db:migrate çalıştırmalı.",
      );
    await executeSqlMigration(c, provider, 1);
  }
  const versions = (
    await c.query("SELECT version FROM kp_schema_migrations")
  ).rows.map((r) => Number(r.version));
  // Refuse newer/foreign databases before any upgrading or catalog seeding.
  assertKnownMigrationVersions(versions);
  if (!versions.includes(1))
    throw Error("Desteklenmeyen veritabanı şema sürümü.");
  if (!versions.includes(3)) {
    if (!auto)
      throw Error(
        "Takım bazlı kaynak şeması için IT npm run db:migrate çalıştırmalı.",
      );
    if (versions.includes(2)) {
      const personRows = (await c.query("SELECT * FROM kp_person_allocations"))
        .rows;
      const resourceVersions = (
        await c.query(
          "SELECT * FROM kp_resource_versions ORDER BY effective_month DESC",
        )
      ).rows;
      const teamRows = (await c.query("SELECT * FROM kp_allocations")).rows;
      const totals = new Map(
        teamRows.map((r) => [
          r.team_id + "|" + r.project_id + "|" + r.month,
          Number(r.amount),
        ]),
      );
      for (const row of personRows) {
        const version = resourceVersions.find(
          (v) =>
            v.resource_id === row.resource_id && v.effective_month <= row.month,
        );
        if (!version?.team_id)
          throw Error(
            "Kişi tahsisi takımına eşlenemedi: " +
              row.resource_id +
              " / " +
              row.month,
          );
        const key = version.team_id + "|" + row.project_id + "|" + row.month;
        totals.set(key, (totals.get(key) || 0) + Number(row.amount));
      }
      await c.upsert(
        "allocations",
        [...totals].map(([key, amount]) => {
          const [team_id, project_id, month] = key.split("|");
          return { team_id, project_id, month, amount };
        }),
      );
      await c.remove("person_allocations", personRows);
      await c.query("DELETE FROM kp_revisions WHERE kind='allocation'");
      await c.upsert(
        "revisions",
        [...totals.keys()].map((key) => ({
          kind: "allocation",
          record_id: key,
          revision: 1,
        })),
      );
      if (personRows.length)
        await c.query(
          "UPDATE kp_settings SET generation=generation+1 WHERE id=1",
        );
    }
    await c.query("INSERT INTO kp_schema_migrations(version) VALUES(3)");
  }
  if (!versions.includes(4)) {
    if (!auto)
      throw Error(
        "Kilometre taşı şeması için IT npm run db:migrate çalıştırmalı.",
      );
    await executeSqlMigration(c, provider, 4);
  }
  if (!versions.includes(5)) {
    if (!auto)
      throw Error(
        "Gün bazlı kilometre taşı şeması için IT npm run db:migrate çalıştırmalı.",
      );
    const script = await migrationSql(provider, 5);
    for (const batch of script.split(/^GO\s*$/gim).filter((x) => x.trim()))
      await c.batch(batch);
  }
  if (!versions.includes(6)) {
    if (!auto)
      throw Error(
        "Gün bazlı çalışan tarihleri için IT npm run db:migrate çalıştırmalı.",
      );
    const script = await migrationSql(provider, 6);
    for (const batch of script.split(/^GO\s*$/gim).filter((x) => x.trim()))
      await c.batch(batch);
  }
  if (!versions.includes(7)) {
    if (!auto)
      throw Error(
        "Gerçekleşen kişi dağılımı şeması için IT npm run db:migrate çalıştırmalı.",
      );
    await executeSqlMigration(c, provider, 7);
  }
  if (!versions.includes(8)) {
    if (!auto)
      throw Error(
        "Takım yöneticisi şeması için IT npm run db:migrate çalıştırmalı.",
      );
    await executeSqlMigration(c, provider, 8);
  }
  if (!versions.includes(9)) {
    if (!auto)
      throw Error(
        "Liderlik yöneticisi şeması için IT npm run db:migrate çalıştırmalı.",
      );
    await executeSqlMigration(c, provider, 9);
  }
  if (!versions.includes(10)) {
    if (!auto)
      throw Error(
        "Kilometre taşı bar yazısı şeması için IT npm run db:migrate çalıştırmalı.",
      );
    await executeSqlMigration(c, provider, 10);
  }
  if (!versions.includes(11)) {
    if (!auto)
      throw Error(
        "Gerçekleşen çalışma saatleri şeması için IT npm run db:migrate çalıştırmalı.",
      );
    await executeSqlMigration(c, provider, 11);
  }
  if (!versions.includes(12)) {
    if (!auto)
      throw Error(
        "180 saatlik gerçekleşen dağılım dönüşümü için IT npm run db:migrate çalıştırmalı.",
      );
    const previous = (await c.query("SELECT * FROM kp_actual_allocations"))
      .rows;
    if (previous.length) {
      await c.upsert(
        "actual_allocations",
        previous.map((row) => ({
          resource_id: row.resource_id,
          project_id: row.project_id,
          month: row.month,
          amount:
            (row.amount * workdaysInMonth(row.month) * HOURS_PER_WORKDAY) /
            DEFAULT_MONTHLY_HOURS,
        })),
      );
      await c.query(
        "UPDATE kp_revisions SET revision=revision+1 WHERE kind='allocation' AND record_id LIKE '@actual:%'",
      );
      await c.query(
        "UPDATE kp_settings SET generation=generation+1 WHERE id=1",
      );
    }
    await c.query("INSERT INTO kp_schema_migrations(version) VALUES(12)");
  }
  if (!versions.includes(13)) {
    if (!auto)
      throw Error(
        "Yetkilendirme ve çalışan eşleştirme şeması için IT npm run db:migrate çalıştırmalı.",
      );
    await executeSqlMigration(c, provider, 13);
  }
  if (!versions.includes(14)) {
    if (!auto)
      throw Error(
        "İşten Ayrıldı statüsü için IT npm run db:migrate çalıştırmalı.",
      );
    await executeSqlMigration(c, provider, 14);
  }
  if (!versions.includes(15)) {
    if (!auto)
      throw Error(
        "Proje sorumlusu alanı için IT npm run db:migrate çalıştırmalı.",
      );
    await executeSqlMigration(c, provider, 15);
  }
  if (!versions.includes(16)) {
    if (!auto)
      throw Error(
        "Çoklu bilgi tarihleri için IT npm run db:migrate çalıştırmalı.",
      );
    await executeSqlMigration(c, provider, 16);
  }
  if (!versions.includes(17)) {
    if (!auto)
      throw Error(
        "Bilgi aralığı renkleri için IT npm run db:migrate çalıştırmalı.",
      );
    await executeSqlMigration(c, provider, 17);
  }
  if (!versions.includes(18)) {
    if (!auto)
      throw Error(
        "Çoklu bilgi açıklamaları için IT npm run db:migrate çalıştırmalı.",
      );
    await executeSqlMigration(c, provider, 18);
  }
  if (!versions.includes(19)) {
    if (!auto)
      throw Error(
        "Uzun bilgi açıklamaları için IT npm run db:migrate çalıştırmalı.",
      );
    await executeSqlMigration(c, provider, 19);
  }
  if (!versions.includes(20)) {
    if (!auto)
      throw Error(
        "Otokar çalışma takvimi şeması için IT npm run db:migrate çalıştırmalı.",
      );
    await executeSqlMigration(c, provider, 20);
    const actual = (await c.query("SELECT * FROM kp_actual_allocations")).rows;
    const amounts = new Map(
      actual.map((row) => [
        row.resource_id + "|" + row.project_id + "|" + row.month,
        Number(row.amount),
      ]),
    );
    const overrides = new Set(
      (await c.query("SELECT * FROM kp_actual_worked_hours")).rows.map(
        (row) => row.resource_id + "|" + row.month,
      ),
    );
    const percentages = (
      await c.query("SELECT * FROM kp_actual_percent_entries")
    ).rows.filter((row) => !overrides.has(row.resource_id + "|" + row.month));
    if (percentages.length) {
      await c.upsert(
        "actual_percent_entries",
        percentages.map((row) => {
          const hours = calendarHoursInMonth(row.month);
          return {
            ...row,
            percent: hours
              ? (((amounts.get(
                  row.resource_id + "|" + row.project_id + "|" + row.month,
                ) || 0) *
                  DEFAULT_MONTHLY_HOURS) /
                  hours) *
                100
              : 0,
          };
        }),
      );
      const existing = (
        await c.query("SELECT * FROM kp_revisions WHERE kind='allocation'")
      ).rows;
      const revisions = new Map(
        existing.map((row) => [row.record_id, Number(row.revision)]),
      );
      await c.upsert(
        "revisions",
        percentages.map((row) => {
          const record_id =
            "@actual:" +
            row.resource_id +
            "|" +
            row.project_id +
            "|" +
            row.month;
          return {
            kind: "allocation",
            record_id,
            revision: (revisions.get(record_id) || 0) + 1,
          };
        }),
      );
      await c.query(
        "UPDATE kp_settings SET generation=generation+1 WHERE id=1",
      );
    }
  }
  if (!versions.includes(21)) {
    if (!auto)
      throw Error(
        "Kişisel izin ve eğitim takvimi için IT npm run db:migrate çalıştırmalı.",
      );
    await executeSqlMigration(c, provider, 21);
  }
  if (!versions.includes(22)) {
    if (!auto)
      throw Error(
        "İzin ve eğitim saat hesapları için IT npm run db:migrate çalıştırmalı.",
      );
    await executeSqlMigration(c, provider, 22);
    const settings = (
      await c.query(
        "SELECT calendar_days,person_calendar FROM kp_settings WHERE id=1",
      )
    ).rows[0];
    if (settings) {
      const shared = settings.calendar_days
        ? JSON.parse(settings.calendar_days)
        : {};
      const personal = settings.person_calendar
        ? JSON.parse(settings.person_calendar)
        : {};
      const amounts = new Map(
        (await c.query("SELECT * FROM kp_actual_allocations")).rows.map(
          (row) => [
            row.resource_id + "|" + row.project_id + "|" + row.month,
            Number(row.amount),
          ],
        ),
      );
      const overrides = new Map(
        (await c.query("SELECT * FROM kp_actual_worked_hours")).rows.map(
          (row) => [row.resource_id + "|" + row.month, Number(row.hours)],
        ),
      );
      const rows = (await c.query("SELECT * FROM kp_actual_percent_entries"))
        .rows;
      const updates = [],
        removals = [];
      for (const row of rows) {
        const key = row.resource_id + "|" + row.project_id + "|" + row.month,
          manual = overrides.get(row.resource_id + "|" + row.month);
        const hours = effectivePersonHoursInMonth(
          row.month,
          row.resource_id,
          manual,
          shared,
          personal,
        );
        const amount = amounts.get(key) || 0;
        if (hours === 0 && amount > 0) {
          removals.push({
            resource_id: row.resource_id,
            project_id: row.project_id,
            month: row.month,
          });
          continue;
        }
        const percent = hours
          ? ((amount * DEFAULT_MONTHLY_HOURS) / hours) * 100
          : 0;
        if (Math.abs(Number(row.percent) - percent) > 1e-10)
          updates.push({ ...row, percent });
      }
      if (updates.length || removals.length) {
        await c.upsert("actual_percent_entries", updates);
        await c.remove("actual_percent_entries", removals);
        const existing = (
          await c.query("SELECT * FROM kp_revisions WHERE kind='allocation'")
        ).rows;
        const revisions = new Map(
          existing.map((row) => [row.record_id, Number(row.revision)]),
        );
        await c.upsert(
          "revisions",
          [...updates, ...removals].map((row) => {
            const record_id =
              "@actual:" +
              row.resource_id +
              "|" +
              row.project_id +
              "|" +
              row.month;
            return {
              kind: "allocation",
              record_id,
              revision: (revisions.get(record_id) || 0) + 1,
            };
          }),
        );
        await c.query(
          "UPDATE kp_settings SET generation=generation+1 WHERE id=1",
        );
      }
    }
  }
  if (!versions.includes(24)) {
    if (!auto)
      throw Error(
        "Risk yönetimi şeması için IT npm run db:migrate çalıştırmalı.",
      );
    await executeSqlMigration(c, provider, 24);
  }
  if (!versions.includes(23)) {
    if (!auto)
      throw Error(
        "Kritik konu olmadan bilgi kaydı için IT npm run db:migrate çalıştırmalı.",
      );
    await executeSqlMigration(c, provider, 23);
  }
  if (!versions.includes(25)) {
    if (!auto)
      throw Error(
        "Değişiklik geçmişi için IT npm run db:migrate çalıştırmalı.",
      );
    await executeSqlMigration(c, provider, 25);
  }
  if (!versions.includes(26)) {
    if (!auto)
      throw Error(
        "Kritik konu sıralaması için IT npm run db:migrate çalıştırmalı.",
      );
    await executeSqlMigration(c, provider, 26);
    // Keep the order previously displayed by the project screen. All
    // further reads/writes use the persisted array positions instead.
    const rows = (
      await c.query(
        "SELECT project_id,id,name,start_date,end_date,start_month,end_month FROM kp_project_milestones ORDER BY project_id,id",
      )
    ).rows
      .map((row) => ({
        ...row,
        start_date: row.start_date || row.start_month + "-01",
        end_date:
          row.end_date ||
          new Date(
            Date.UTC(
              Number(row.end_month.slice(0, 4)),
              Number(row.end_month.slice(5, 7)),
              0,
            ),
          )
            .toISOString()
            .slice(0, 10),
      }))
      .sort(
        (a, b) =>
          a.project_id.localeCompare(b.project_id) ||
          a.start_date.localeCompare(b.start_date) ||
          a.end_date.localeCompare(b.end_date) ||
          a.name.localeCompare(b.name, "tr"),
      );
    let previousProject,
      position = 0;
    for (const row of rows) {
      if (row.project_id !== previousProject) position = 0;
      previousProject = row.project_id;
      await c.query(
        "UPDATE kp_project_milestones SET sort_order=@p0 WHERE project_id=@p1 AND id=@p2",
        [position++, row.project_id, row.id],
      );
    }
    if (rows.length)
      await c.query(
        "UPDATE kp_settings SET generation=generation+1 WHERE id=1",
      );
  }
  if (!versions.includes(27)) {
    if (!auto)
      throw Error(
        "Milestone görünümü için IT npm run db:migrate çalıştırmalı.",
      );
    await executeSqlMigration(c, provider, 27);
  }
  if (!versions.includes(28)) {
    if (!auto)
      throw Error(
        "Milestone baklava görünümü için IT npm run db:migrate çalıştırmalı.",
      );
    await executeSqlMigration(c, provider, 28);
  }
  if (!versions.includes(29)) {
    if (!auto)
      throw Error(
        "Ortak giriş koruması için IT npm run db:migrate çalıştırmalı.",
      );
    await executeSqlMigration(c, provider, 29);
  }
  if (!versions.includes(30)) {
    if (!auto)
      throw Error("Proje sıralaması için IT npm run db:migrate çalıştırmalı.");
    await executeSqlMigration(c, provider, 30);
  }
  if (!versions.includes(31)) {
    if (!auto)
      throw Error(
        "Sistem / alt sistem kataloğu için IT npm run db:migrate çalıştırmalı.",
      );
    await executeSqlMigration(c, provider, 31);
    await c.upsert("risk_systems", initialRiskSystems);
    await c.query("UPDATE kp_settings SET generation=generation+1 WHERE id=1");
  }
  if (!versions.includes(32)) {
    if (!auto)
      throw Error(
        "Active Directory kimlik eşleştirmesi için IT npm run db:migrate çalıştırmalı.",
      );
    await executeSqlMigration(c, provider, 32);
  }
  if (!versions.includes(33)) {
    if (!auto)
      throw Error(
        "Liderlik hiyerarşisi için IT npm run db:migrate çalıştırmalı.",
      );
    await executeSqlMigration(c, provider, 33);
  }
  if (!versions.includes(34)) {
    if (!auto)
      throw Error(
        "Çalışan kaynak rolleri için IT npm run db:migrate çalıştırmalı.",
      );
    await executeSqlMigration(c, provider, 34);
  }
  if (!versions.includes(35)) {
    if (!auto)
      throw Error("Proje kodları için IT npm run db:migrate çalıştırmalı.");
    await executeSqlMigration(c, provider, 35);
  }
  if (!versions.includes(36)) {
    if (!auto)
      throw Error("CoE kaynak rolü için IT npm run db:migrate çalıştırmalı.");
    await executeSqlMigration(c, provider, 36);
  }
  if (!versions.includes(37)) {
    if (!auto)
      throw Error(
        "Takım bazlı planlama yetkisi için IT npm run db:migrate çalıştırmalı.",
      );
    await executeSqlMigration(c, provider, 37);
  }
  assertMigrationHistory(
    (await c.query("SELECT version FROM kp_schema_migrations")).rows.map(
      (row) => Number(row.version),
    ),
  );
  if (!(await c.query("SELECT id FROM kp_settings WHERE id=1")).rows.length) {
    if (!auto)
      throw Error(
        "Başlangıç listeleri yok. Önce npm run db:migrate çalıştırın.",
      );
    await c.upsert("settings", [
      {
        id: 1,
        generation: 0,
        legacy_archive: null,
        calendar_days: "{}",
        person_calendar: "{}",
        leader_parents: "{}",
        leadership_units: "{}",
      },
    ]);
    await c.upsert(
      "leaders",
      catalog.leaders.map((name) => ({ name, manager_name: "" })),
    );
    await c.upsert(
      "teams",
      catalog.teams.map((t) => ({
        id: t.id,
        name: t.name,
        leader_name: t.lead || null,
        manager_name: "",
        excel_capacity: t.excelCapacity,
        catalog: true,
      })),
    );
  }
  if (!versions.includes(33)) {
    const leaders = (
      await c.query("SELECT name,manager_name FROM kp_leaders ORDER BY name")
    ).rows;
    const rows = (await c.query("SELECT * FROM kp_teams ORDER BY id")).rows;
    const data = {
      leaders: leaders.map((row) => row.name),
      leaderManagers: Object.fromEntries(
        leaders.map((row) => [row.name, row.manager_name || ""]),
      ),
      leadershipUnits: {},
      revisions: {},
      teams: rows.map((row) => ({
        id: row.id,
        name: row.name,
        lead: row.leader_name || "",
        excelCapacity: row.excel_capacity,
      })),
    };
    ensureLeadershipUnits(data);
    await c.upsert(
      "teams",
      data.teams
        .filter((team) => team.kind === "leadership")
        .map((team) => ({
          id: team.id,
          name: team.name,
          leader_name: team.lead,
          excel_capacity: 0,
          catalog: true,
          manager_name: team.managerName || "",
        })),
    );
    await c.upsert(
      "revisions",
      Object.entries(data.revisions).map(([key, revision]) => ({
        kind: "team",
        record_id: key.slice(5),
        revision,
      })),
    );
    await c.query(
      "UPDATE kp_settings SET leadership_units=@p0,generation=generation+1 WHERE id=1",
      [JSON.stringify(data.leadershipUnits)],
    );
  }
}
