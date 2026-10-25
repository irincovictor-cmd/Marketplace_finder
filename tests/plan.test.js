const test = require("node:test");
const assert = require("node:assert");
const P = require("../plan.js");
const D = require("../discovery.js");
const KW = { Phones: ["iphone", "samsung", "redmi"], Laptops: ["laptop"], Consoles: ["ps5", "ps4", "switch"] };

test("Phones all-brand plan: 3 broad + 3 brand searches, all without a title-keyword gate, cost shown", () => {
  const p = P.buildScanPlan({ category: "Phones", kw: KW, allBrand: true, includeBrands: true, history: {}, maxSearches: 6, discMax: 3 });
  assert.strictEqual(p.requests, 6);
  assert.deepStrictEqual(p.terms.map(t => t.source), ["broad", "broad", "broad", "brand", "brand", "brand"]);
  assert.ok(p.terms.every(t => t.disc === true), "no search may require its keyword in the title");
  assert.strictEqual(p.estimatedCostUsd, D.estimateCostUsd(6 * 48, 6));
  assert.ok(/ESTIMATE/.test(p.note) && /not a billing limit/.test(p.note));
});

test("the request count never exceeds the user's limit and brand searches are trimmed first", () => {
  const p = P.buildScanPlan({ category: "Phones", kw: KW, allBrand: true, includeBrands: true, history: {}, maxSearches: 4, discMax: 3 });
  assert.strictEqual(p.requests, 4);
  assert.deepStrictEqual(p.terms.map(t => t.k), ["phone", "cellphone", "android", "iphone"]);
  assert.deepStrictEqual(p.trimmed, ["samsung", "redmi"]);
  assert.ok(/skipped: samsung, redmi/.test(P.planSummary(p)));
});

test("hard ceiling applies even if a huge limit is requested", () => {
  const p = P.buildScanPlan({ category: "Phones", kw: KW, allBrand: true, includeBrands: true, history: {}, maxSearches: 500, discMax: 500 });
  assert.ok(p.requests <= P.HARD_MAX_SEARCHES);
});

test("brand searches can be turned off; adaptive history changes which broad terms run", () => {
  let h = D.recordScan({}, D.computeYield([{ k: "phone", raw: 48, listings: [] }, { k: "cellphone", raw: 48, listings: [{ id: 1, local: true, device: true }] }]));
  const p = P.buildScanPlan({ category: "Phones", kw: KW, allBrand: true, includeBrands: false, history: h, maxSearches: 6, discMax: 3 });
  assert.ok(p.terms.every(t => t.source === "broad"));
  assert.strictEqual(p.terms.length, 3);
  assert.ok(p.terms.map(t => t.k).includes("cellphone"));
});

test("other categories keep their legacy keyword plan; 'All' is de-duplicated and costed", () => {
  const lap = P.buildScanPlan({ category: "Laptops", kw: KW, history: {}, maxSearches: 6 });
  assert.deepStrictEqual(lap.terms.map(t => [t.k, t.disc]), [["laptop", false]]);
  const all = P.buildScanPlan({ category: "", kw: KW, history: {}, maxSearches: 12 });
  assert.strictEqual(all.requests, 7);
  assert.strictEqual(all.category, "All");
});

test("all-brand can be switched off to restore the old three-brand scan", () => {
  const p = P.buildScanPlan({ category: "Phones", kw: KW, allBrand: false, history: {}, maxSearches: 6 });
  assert.deepStrictEqual(p.terms.map(t => t.k), ["iphone", "samsung", "redmi"]);
  assert.ok(p.terms.every(t => t.disc === false));
});

test("category URL builder: accepts valid ids, uses documented radius_in_km, rejects injection", () => {
  const u = P.buildCategoryUrl({ locationId: "108424279189115", category: "electronics", radiusKm: 60, sortBy: "distance_ascend", days: 7 });
  assert.strictEqual(u, "https://www.facebook.com/marketplace/108424279189115/electronics?sortBy=distance_ascend&radius_in_km=60&daysSinceListed=7");
  assert.throws(() => P.buildCategoryUrl({ locationId: "evil.com/../x", category: "electronics" }));
  assert.throws(() => P.buildCategoryUrl({ locationId: "ok", category: "a b" }));
  assert.throws(() => P.buildCategoryUrl({ locationId: "", category: "electronics" }));
  assert.throws(() => P.buildCategoryUrl({ locationId: "nyc", category: "electronics", sortBy: "x&y=1" }));
  const c = P.buildCategoryUrl({ locationId: "nyc", category: "electronics", includeCoords: true, lat: 9.6625, lon: 123.8663 });
  assert.ok(c.includes("latitude=9.66250") && c.includes("longitude=123.86630"));
  assert.ok(!P.buildCategoryUrl({ locationId: "nyc", category: "electronics", lat: 9.66, lon: 123.86 }).includes("latitude"), "coordinates only when explicitly requested");
});

test("learnLocationIds records the most common Facebook location id for local towns only", () => {
  const isLocal = l => l.local;
  let m = P.learnLocationIds({}, [
    { c: "Tagbilaran City", lv: "tagbilaran", cp: "111", local: true }, { c: "Tagbilaran City", lv: "tagbilaran", cp: "111", local: true },
    { c: "Tagbilaran City", lv: "other", cp: "222", local: true }, { c: "Cebu City", lv: "cebu", cp: "999", local: false },
    { c: "Baclayon", local: true },
  ], isLocal);
  assert.deepStrictEqual(Object.keys(m), ["tagbilaran city"]);
  assert.deepStrictEqual([m["tagbilaran city"].vanity, m["tagbilaran city"].cityPageId, m["tagbilaran city"].n], ["tagbilaran", "111", 3]);
});
