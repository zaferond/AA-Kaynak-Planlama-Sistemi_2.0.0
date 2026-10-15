import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Store } from "../backend/store.mjs";
import { applyChanges } from "../backend/operations.mjs";
import { scopeData, validate } from "../backend/domain/index.mjs";
import { riskAssessment } from "../frontend/src/risk-score.ts";

const admin = { _id: "admin", name: "Admin", role: "admin", leaders: [] };
const owner = { _id: "person-a", name: "Ayşe", role: "normal", leaders: [] };
const other = { _id: "person-b", name: "Bora", role: "normal", leaders: [] };
const manager = {
  _id: "manager",
  name: "Yönetici",
  role: "manager",
  leaders: [],
};
const risk = {
  id: "risk1",
  projectId: "risk_project",
  reportedBy: "Sistem ekibi",
  category: "Teknik",
  reportedAt: "2026-09-29",
  system: "Alt sistem",
  description: "Tedarik gecikmesi testi",
  cause: "Parça tedariki",
  actionPlan: "İkinci tedarikçi",
  targetAt: "2026-12-01",
  status: "Açık",
  owner: "Ayşe",
  likelihood: 3,
  impact: 4,
  strategy: "Kontrol",
  implementedAt: "",
  actionResult: "",
  residualLikelihood: null,
  residualImpact: null,
  createdBy: "forged",
  createdByName: "forged",
  createdAt: "forged",
  updatedAt: "forged",
};

test("Excel risk matrix thresholds and colors cover every probability-impact pair", () => {
  for (let probability = 1; probability <= 5; probability++)
    for (let impact = 1; impact <= 5; impact++) {
      const result = riskAssessment(probability, impact),
        score = probability * impact;
      assert.equal(result.score, score);
      assert.equal(
        result.level,
        score === 1
          ? "Anlamsız"
          : score <= 6
            ? "Düşük"
            : score <= 14
              ? "Orta"
              : score <= 24
                ? "Yüksek"
                : "Tolere Edilemez",
      );
    }
  assert.equal(riskAssessment(null, 4), null);
  assert.equal(riskAssessment(0, 4), null);
});

test("all users can create and view risks, only owner or management can edit; records persist and follow project deletion", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "aa-risk-"));
  const env = {
    DB_PROVIDER: "sqljs",
    SQLJS_FILE: path.join(dir, "risk.sqlite"),
  };
  let store = new Store({ env });
  async function change(user, item) {
    await store.transaction(async (c) => {
      const { data } = await store.read(c),
        before = structuredClone(data);
      applyChanges(data, user, [
        { ...item, revision: data.revisions[item.kind + ":" + item.id] || 0 },
      ]);
      await store.persist(before, validate(data), c);
    });
  }
  try {
    await store.connect();
    await change(admin, {
      kind: "project",
      id: "risk_project",
      value: {
        id: "risk_project",
        name: "Risk Projesi",
        start: "2026-01",
        end: "2027-12",
        phases: {},
      },
    });
    await change(owner, { kind: "risk", id: risk.id, value: risk });
    let data = (await store.read()).data;
    assert.equal(data.risks.length, 1);
    assert.equal(data.risks[0].createdBy, owner._id);
    assert.equal(data.risks[0].createdByName, owner.name);
    assert.equal(scopeData(data, { ...other, id: other._id }).risks.length, 1);
    assert.equal(
      scopeData(data, { ...other, id: other._id }).revisions["risk:risk1"],
      1,
    );
    assert.throws(
      () =>
        applyChanges(structuredClone(data), other, [
          {
            kind: "risk",
            id: risk.id,
            value: { ...risk, description: "Yabancı düzenleme" },
            revision: 1,
          },
        ]),
      (e) => e.status === 403,
    );
    assert.throws(
      () =>
        applyChanges(structuredClone(data), owner, [
          { kind: "risk", id: risk.id, operation: "delete", revision: 1 },
        ]),
      (e) => e.status === 403,
    );
    await change(owner, {
      kind: "risk",
      id: risk.id,
      value: { ...data.risks[0], description: "Sahibi güncelledi" },
    });
    data = (await store.read()).data;
    await change(manager, {
      kind: "risk",
      id: risk.id,
      value: {
        ...data.risks[0],
        status: "Takipte",
        implementedAt: "2026-10-01",
        residualLikelihood: 1,
        residualImpact: 2,
      },
    });
    await store.close();
    store = new Store({ env });
    await store.connect();
    data = (await store.read()).data;
    assert.equal(data.risks[0].status, "Takipte");
    assert.equal(data.risks[0].residualLikelihood, 1);
    assert.equal(data.risks[0].createdBy, owner._id);
    await change(admin, {
      kind: "project",
      id: "risk_project",
      operation: "delete",
    });
    assert.equal((await store.read()).data.risks.length, 0);
    assert.equal(
      (await store.db.query("SELECT count(*) AS count FROM kp_project_risks"))
        .rows[0].count,
      0,
    );
  } finally {
    await store.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});
