import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_WARNING_SETTINGS,
  SCENARIO_WARNING_RULES,
  matchWarningRule,
  warningProgressStates,
  warningResourceStates,
  warningSettingsSchema,
} from "../shared/scenario-warning-policy.ts";

test("senaryo tablosu dokuz benzersiz kural içerir ve her birleşim en fazla bir kuralla eşleşir", () => {
  assert.equal(SCENARIO_WARNING_RULES.length, 9);
  assert.equal(new Set(SCENARIO_WARNING_RULES.map((r) => r.kod)).size, 9);
  for (const progress of warningProgressStates)
    for (const resource of warningResourceStates) {
      const matches = SCENARIO_WARNING_RULES.filter(
        (r) =>
          r.aktif && r.ilerleme.includes(progress) && r.kaynak === resource,
      );
      assert.ok(matches.length <= 1, `${progress} / ${resource}`);
      assert.equal(matchWarningRule(progress, resource), matches[0]);
    }
});

test("matris eşleşmeleri istenen kodları ve aynen verilen aksiyonları korur", () => {
  const cases = [
    ["behind", "unplanned", "S-01", "Kaynak Planlama Durumu Değerlendirilmeli"],
    [
      "behind",
      "insufficient",
      "S-02",
      "Ek kaynak gerekli veya bitiş tarihi revize edilmeli",
    ],
    [
      "behind",
      "sufficient",
      "S-03",
      "Kaynak var ama ilerleme yok, verimlilik/engel analizi yapılmalı",
    ],
    ["behind", "excess", "S-04", "Kaynak dağılımı öne çekilmeli"],
    ["onTrack", "unplanned", "S-05", "Gelecek ay kaynak planı eksik"],
    [
      "onTrack",
      "insufficient",
      "S-06",
      "Mevcut kaynakla hedefe ulaşılamayacak, risk",
    ],
    ["onTrack", "excess", "S-07", "Fazla kaynak başka projeye aktarılabilir"],
    ["ahead", "excess", "S-08", "Kaynak serbest bırakılabilir"],
    ["ahead", "insufficient", "S-09", "Bilgi amaçlı, plan güncellenebilir"],
  ];
  for (const [progress, resource, code, action] of cases) {
    const rule = matchWarningRule(progress, resource);
    assert.equal(rule?.kod, code);
    assert.equal(rule?.uyari2, action);
  }
  for (const [resource, code] of [
    ["unplanned", "S-01"],
    ["insufficient", "S-02"],
    ["sufficient", "S-03"],
  ])
    assert.equal(matchWarningRule("critical", resource)?.kod, code);
});

test("matriste yer almayan birleşimler aksiyon kuralı üretmez", () => {
  for (const [progress, resource] of [
    ["critical", "excess"],
    ["onTrack", "sufficient"],
    ["ahead", "unplanned"],
    ["ahead", "sufficient"],
  ])
    assert.equal(matchWarningRule(progress, resource), undefined);
});

test("pasif kural eşleşmez; kurallar yapılandırmadan okunur", () => {
  const custom = SCENARIO_WARNING_RULES.map((r) => ({ ...r, aktif: false }));
  assert.equal(matchWarningRule("behind", "unplanned", custom), undefined);
});

test("varsayılan eşikler geçerlidir; çelişkili, eksik veya sınırsız ayarlar reddedilir", () => {
  assert.deepEqual(
    warningSettingsSchema.parse(DEFAULT_WARNING_SETTINGS),
    DEFAULT_WARNING_SETTINGS,
  );
  for (const patch of [
    { criticalThreshold: -4 },
    { aheadThreshold: -5 },
    { coverageMinimum: 121, coverageMaximum: 120 },
    { resourceHorizonMonths: 0 },
    { resourceHorizonMonths: 1.5 },
    { trendMonths: 1 },
    { coverageMaximum: Infinity },
    { unknown: true },
  ])
    assert.equal(
      warningSettingsSchema.safeParse({ ...DEFAULT_WARNING_SETTINGS, ...patch })
        .success,
      false,
    );
  assert.equal(warningSettingsSchema.safeParse({}).success, false);
});
