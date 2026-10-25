const test = require("node:test");
const assert = require("node:assert");
const D = require("../discovery.js");
const POOL = ["phone", "cellphone", "android", "128gb", "256gb"];
const mk = (id, local, device = true) => ({ id, local, device });

test("computeYield credits a listing only to the first keyword that returned it", () => {
  const y = D.computeYield([
    { k: "cellphone", raw: 48, listings: [mk(1, true), mk(2, true), mk(3, false)] },
    { k: "phone",     raw: 48, listings: [mk(2, true), mk(3, false), mk(4, true)] },
  ]);
  assert.deepStrictEqual([y[0].unique, y[0].localUnique, y[0].duplicates], [3, 2, 0]);
  assert.deepStrictEqual([y[1].unique, y[1].localUnique, y[1].duplicates], [1, 1, 2]);
});

test("computeYield counts devices separately from other local listings", () => {
  const y = D.computeYield([{ k: "x", raw: 10, listings: [mk(1, true, true), mk(2, true, false), mk(3, true, true)] }]);
  assert.strictEqual(y[0].localUnique, 3);
  assert.strictEqual(y[0].deviceLocalUnique, 2);
});

test("untried terms are explored first, in pool order", () => {
  assert.deepStrictEqual(D.pickDiscoveryTerms({}, POOL, 3), ["phone", "cellphone", "android"]);
});

test("after a scan the best proven term keeps one slot and the rest explore untried terms", () => {
  let h = D.recordScan({}, D.computeYield([
    { k: "phone", raw: 48, listings: [mk(1, false)] },
    { k: "cellphone", raw: 48, listings: [mk(2, true), mk(3, true), mk(4, true)] },
  ]));
  const picks = D.pickDiscoveryTerms(h, POOL, 3);
  assert.deepStrictEqual(picks, ["cellphone", "android", "128gb"]);  // best proven term keeps a slot, then untried terms explore
  h = D.recordScan(h, D.computeYield([{ k: "android", raw: 1, listings: [] }, { k: "128gb", raw: 1, listings: [] }, { k: "256gb", raw: 1, listings: [] }]));
  const next = D.pickDiscoveryTerms(h, POOL, 1);
  assert.deepStrictEqual(next, ["cellphone"]);                       // best devices per run
});

test("a term with zero local devices over 3 runs rests, then is retried later", () => {
  let h = {};
  for (let i = 0; i < 3; i++) h = D.recordScan(h, D.computeYield([{ k: "android", raw: 48, listings: [mk(100 + i, false)] }]));
  assert.ok(!D.pickDiscoveryTerms(h, ["android", "phone"], 2).includes("android"));
  for (let i = 0; i < 5; i++) h = D.recordScan(h, D.computeYield([{ k: "phone", raw: 48, listings: [mk(200 + i, true)] }]));
  assert.ok(D.pickDiscoveryTerms(h, ["android", "phone"], 2).includes("android"), "should be revisited after resting");
});

test("one scan alone never retires a keyword", () => {
  const h = D.recordScan({}, D.computeYield([{ k: "256gb", raw: 48, listings: [mk(1, false)] }]));
  assert.ok(D.pickDiscoveryTerms(h, POOL, 5).includes("256gb"));
});

test("history is not mutated by recordScan", () => {
  const h = { __scans: 1, phone: { runs: 1, raw: 1, unique: 1, localUnique: 0, deviceLocalUnique: 0, lastScan: 1 } };
  const snapshot = JSON.stringify(h);
  D.recordScan(h, D.computeYield([{ k: "phone", raw: 1, listings: [] }]));
  assert.strictEqual(JSON.stringify(h), snapshot);
});

test("cost estimate: 8 runs x 48 items is about 19 US cents, labelled estimate only", () => {
  assert.strictEqual(D.estimateCostUsd(384, 8), 0.1924);
});

test("summarizeHistory reports devices per run and flags proven-zero terms", () => {
  let h = {};
  for (let i = 0; i < 3; i++) h = D.recordScan(h, D.computeYield([{ k: "256gb", raw: 48, listings: [] }, { k: "cellphone", raw: 48, listings: [mk(i, true)] }]));
  const s = D.summarizeHistory(h);
  assert.strictEqual(s[0].k, "cellphone");
  assert.strictEqual(s.find(r => r.k === "256gb").provenZero, true);
});

test("one slot explores; two or more slots always protect the proven winner", () => {
  const h = D.recordScan({}, D.computeYield([{ k: "cellphone", raw: 48, listings: [mk(1, true), mk(2, true)] }]));
  assert.deepStrictEqual(D.pickDiscoveryTerms(h, POOL, 1), ["phone"], "first untried term in pool order");
  assert.strictEqual(D.pickDiscoveryTerms(h, POOL, 2)[0], "cellphone");
});
