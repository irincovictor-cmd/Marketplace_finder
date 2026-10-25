const test = require("node:test");
const assert = require("node:assert");
const { loadApp } = require("./harness.js");

const raw = (id, title, price, city, state = "PH-07", hoursAgo = 2) => ({
  id, marketplace_listing_title: title, listing_price: { amount: String(price) }, creation_time: Date.now() / 1000 - hoursAgo * 3600,
  location: { reverse_geocode: { city, state } }, listingUrl: "https://www.facebook.com/marketplace/item/" + id + "/",
});

test("app script loads in the harness and geography is ready", async () => {
  const { run } = await loadApp();
  assert.ok(run("typeof clean === 'function' && typeof FRClassify === 'object' && typeof FRDiscovery === 'object'"));
  assert.ok(run("Object.keys(TOWNS).length >= 40"), "Bohol towns loaded");
});

test("category: monitors, fridges, tablets and RAM are not Phones; real phones still are", async () => {
  const { run } = await loadApp();
  assert.strictEqual(run('cg("SAMSUNG ODYSSEY G5 MONITOR BRANDNEW")'), "PC Parts");
  assert.strictEqual(run('cg("FROST FREE SAMSUNG REFRIGERATOR")'), "Electronics");
  assert.strictEqual(run('cg("Samsung Galaxy Tab S3 9.7inch")'), "Electronics");
  assert.strictEqual(run('cg("FOR SALE: RAM DDR5 5600mhz 8GB (SAMSUNG)")'), "PC Parts");
  assert.strictEqual(run('cg("Redmi note 14")'), "Phones");
  assert.strictEqual(run('cg("iPhone 13 pro 256gb")'), "Phones");
});

test("clean() tags listings and keeps repair/wanted ads inspectable instead of silently deleting them", async () => {
  const { run, ctx } = await loadApp();
  ctx.__raw = [
    raw(1, "Redmi Note 13 Pro 8/256", 9000, "Tagbilaran City"),
    raw(2, "B&J IPhone Repair/Center", 3500, "Cebu City"),
    raw(3, "CELLPHONE GUBA PALITON", 1500, "Cebu City"),
    raw(4, "Cellphone", 5000, "Dumaguete City", "NIR"),
    raw(5, "iPhone 13 case", 400, "Cebu City"),
  ];
  const out = run("clean(__raw,'cellphone',null,true)");
  const byId = Object.fromEntries(out.map(l => [l.id, l]));
  assert.ok(byId.f1 && byId.f1.cls === "device" && byId.f1.g === "Phones");
  assert.strictEqual(byId.f2.cls, "repair");
  assert.strictEqual(byId.f3.cls, "wanted");
  assert.strictEqual(byId.f4.cls, "review");
  assert.strictEqual(byId.f5.cls, "accessory", "phone searches keep accessories as tagged, inspectable rows instead of silently deleting them");
  assert.strictEqual(run("clean(__raw,'iphone',null,false)").some(l => l.id === "f5"), false, "non-phone categories keep the legacy accessory-word prefilter");
  assert.deepStrictEqual(run("[notDevice({cls:'repair'}),notDevice({cls:'review'}),notDevice({cls:'device'}),notDevice({})]"), [true, false, false, false]);
});

test("rejection reasons: buying requests are excluded with an explicit, inspectable reason; unclear ones are kept", async () => {
  const { run } = await loadApp();
  run("S.cat='Phones';S.province='All';S.radius=500");
  const wanted = run("rejectionReasons({t:'CELLPHONE GUBA PALITON',p:1500,g:'Phones',cls:'wanted',c:'Tagbilaran City',province:'PH-07'},[],1e12)");
  assert.ok(wanted.includes("Not a device for sale"));
  const review = run("rejectionReasons({t:'Cellphone',p:1500,g:'Phones',cls:'review',c:'Tagbilaran City',province:'PH-07'},[],1e12)");
  assert.ok(!review.includes("Not a device for sale"));
});

test("filterAudit has a device stage between category and province", async () => {
  const { run, ctx } = await loadApp();
  ctx.__live = [
    { id: "a", t: "Redmi A7 Pro 64GB", p: 3700, g: "Phones", cls: "device", c: "Baclayon", province: "PH-07", h: 2 },
    { id: "b", t: "B&J IPhone Repair/Center", p: 3500, g: "Phones", cls: "repair", c: "Baclayon", province: "PH-07", h: 2 },
  ];
  run("S.live=__live;S.cat='Phones';S.province='Bohol';S.radius=60;S.max='20000';S.q=''");
  const counts = run("filterAudit().counts");
  assert.deepStrictEqual([counts.total, counts.category, counts.device, counts.province], [2, 2, 1, 1]);
});

test("filterAudit splits multi-word queries correctly (double-backslash regex bug fixed)", async () => {
  const { run, ctx } = await loadApp();
  ctx.__live = [{ id: "a", t: "Redmi Note 14 Pro 256gb", p: 9000, g: "Phones", cls: "device", c: "Baclayon", province: "PH-07", h: 2 }];
  run("S.live=__live;S.cat='';S.province='All';S.radius=500;S.max='20000';S.q='note 14 256gb'");
  assert.strictEqual(run("filterAudit().counts.keyword"), 1);
});

test("variantKey reads storage written as 8+256 or 12/512 as well as 256GB", async () => {
  const { run } = await loadApp();
  assert.strictEqual(run("variantKey('Redmi note 15 5g 8+256').storage"), 256);
  assert.strictEqual(run("variantKey('Poco X6 Pro 12/512 5G').storage"), 512);
  assert.strictEqual(run("variantKey('REDMI A7 PRO 4GB RAM 64GB ROM').storage"), 64);
  assert.strictEqual(run("variantKey('iPhone 13 128gb').network"), "unknown");
});

const mkPhone = (id, title, p, c, extra = {}) => Object.assign({ id, t: title, p, g: "Phones", cls: "device", c, province: "PH-07", h: 3, fl: [] }, extra);

test("comparables: needs 3 distinct listings; reposts and the listing's own duplicates are not counted", async () => {
  const { run, ctx } = await loadApp();
  ctx.__live = [
    mkPhone("t", "Redmi Note 14 256gb", 7000, "Tagbilaran City"),
    mkPhone("c1", "Redmi Note 14 256gb", 9000, "Cebu City"),
    mkPhone("c2", "Redmi Note 14 256gb", 9000, "Cebu City"),          // repost of c1: same title, price, city
    mkPhone("c3", "Redmi Note 14 256gb", 9500, "Mandaue City"),
    mkPhone("t2", "Redmi Note 14 256gb", 7000, "Tagbilaran City"),    // repost of the target itself
  ];
  run("S.live=__live");
  assert.strictEqual(run("resaleEvidence(S.live[0])"), null, "only 2 distinct comparables -> insufficient");
  ctx.__live.push(mkPhone("c4", "Redmi Note 14 256gb", 10000, "Lapu-Lapu City"));
  run("S.live=__live");
  const e = run("resaleEvidence(S.live[0])");
  assert.strictEqual(e.n, 3);
});

test("comparables: local vs wider-area counts are reported and wider-only evidence is labelled", async () => {
  const { run, ctx } = await loadApp();
  ctx.__live = [
    mkPhone("t", "Redmi Note 14 256gb", 7000, "Tagbilaran City"),
    mkPhone("c1", "Redmi Note 14 256gb", 9000, "Cebu City"),
    mkPhone("c2", "Redmi Note 14 256gb", 9500, "Mandaue City"),
    mkPhone("c3", "Redmi Note 14 256gb", 10000, "Lapu-Lapu City"),
  ];
  run("S.live=__live");
  let e = run("resaleEvidence(S.live[0])");
  assert.deepStrictEqual([e.n, e.localN, e.confidence], [3, 0, "Wider-area only"]);
  ctx.__live.push(mkPhone("b1", "Redmi Note 14 256gb", 8000, "Baclayon"));
  run("S.live=__live");
  e = run("resaleEvidence(S.live[0])");
  assert.deepStrictEqual([e.n, e.localN], [4, 1]);
  assert.notStrictEqual(e.confidence, "Wider-area only");
  const pp = run("profitPreview(S.live[0])");
  assert.strictEqual(pp.localComps, 1);
});

test("comparables exclude defective, parts-only, repair, wanted and accessory listings; defective targets get no estimate", async () => {
  const { run, ctx } = await loadApp();
  ctx.__live = [
    mkPhone("t", "Redmi Note 14 256gb", 7000, "Tagbilaran City"),
    mkPhone("d1", "Redmi Note 14 256gb lcd issue", 1000, "Cebu City", { fl: ["defective"] }),
    mkPhone("d2", "Redmi Note 14 256gb for parts", 800, "Cebu City", { fl: ["parts-only"] }),
    mkPhone("w1", "WTB Redmi Note 14 256gb", 6000, "Cebu City", { cls: "wanted" }),
    mkPhone("c1", "Redmi Note 14 256gb", 9000, "Cebu City"),
    mkPhone("c2", "Redmi Note 14 256gb", 9500, "Mandaue City"),
  ];
  run("S.live=__live");
  assert.strictEqual(run("resaleEvidence(S.live[0])"), null, "only 2 usable comps");
  assert.strictEqual(run("resaleEvidence(S.live[1])"), null, "defective target is not valued from normal comps");
});

test("geoLevel separates stated province, town-name inference, other provinces, ambiguous and unknown towns", async () => {
  const { run } = await loadApp();
  assert.strictEqual(run("geoLevel({c:'Tagbilaran City',province:'PH-07'})"), "bohol-town");
  assert.strictEqual(run("geoLevel({c:'Baclayon',province:'Bohol'})"), "bohol-stated");
  assert.strictEqual(run("geoLevel({c:'Cebu City',province:'PH-07'})"), "other-province");
  assert.strictEqual(run("geoLevel({c:'Dumaguete City',province:'NIR'})"), "other-province");
  assert.strictEqual(run("geoLevel({c:'Talisay',province:'PH-07'})"), "ambiguous");
  assert.strictEqual(run("geoLevel({c:'',province:''})"), "unknown");
});

test("buildScanReport de-duplicates across searches and reports the radius as a hint that Facebook may exceed", async () => {
  const { run, ctx } = await loadApp();
  run("S.nearTown='Tagbilaran'");
  const L = (id, c, cls = "device") => ({ id, t: "Redmi Note 14 256gb", p: 9000, g: "Phones", cls, c, province: "PH-07" });
  ctx.__o = { results: [
    { k: "cellphone", raw: 48, sec: 9, listings: [L("1", "Tagbilaran City"), L("2", "Cebu City"), L("3", "Cebu City", "review")] },
    { k: "phone", raw: 48, sec: 10, listings: [L("2", "Cebu City"), L("4", "Baclayon")] },
  ], attempted: 2, completed: 2, failed: 0, seconds: 20, slowest: 10, hiddenSec: 0, radius: 60, sortBy: "creation_time_descend", strict: false, center: { lat: 9.66, lon: 123.86 } };
  const r = run("buildScanReport(__o)");
  assert.deepStrictEqual([r.raw, r.cleaned, r.unique, r.duplicates], [96, 5, 4, 1]);
  assert.strictEqual(r.geo["bohol-town"], 2);
  assert.strictEqual(r.radius.beyond, 2, "two unique Cebu City listings sit ~73 km away, beyond the 60 km request");
  assert.strictEqual(r.perKeyword[1].duplicates, 1);
  assert.strictEqual(r.perKeyword[0].deviceLocalUnique, 1);
  assert.ok(/ESTIMATE/.test(r.costNote));
  assert.strictEqual(r.estimatedCostUsd, 0.0481);
});

test("scanDiagnostics labels cost as an estimate and never as billing", async () => {
  const { run, ctx } = await loadApp();
  ctx.__o = { results: [{ k: "phone", raw: 48, sec: 8, listings: [] }], attempted: 1, completed: 1, failed: 0, seconds: 8, slowest: 8, hiddenSec: 0, radius: 60, sortBy: "distance_ascend", strict: false, center: {} };
  run("S.scanReport=buildScanReport(__o)");
  const text = run("scanDiagnostics()");
  assert.ok(/estimate/i.test(text) && /not Apify billing/.test(text));
  assert.ok(/sort distance_ascend/.test(text));
});

// ---- Mocked scan: replays real titles/towns from the 2026-10-23 export; no network, no Apify credits. ----
const FIX = require("./fixtures/scan-2026-10-23-samples.json");
function mockFetchFor(calls) {
  return async (url, opts) => {
    if (String(url).includes("bohol-geography")) throw new Error("unexpected geography fetch");
    const body = JSON.parse(opts.body);
    calls.push({ url: String(url), body });
    const rows = FIX[body.searchKeyword] || [];
    const items = rows.map((r, i) => ({
      id: body.searchKeyword + "-" + i + "-" + r.title.length, marketplace_listing_title: r.title, listing_price: { amount: "5000" },
      creation_time: Date.now() / 1000 - 3600, location: { reverse_geocode: { city: r.city, state: r.state } },
      listingUrl: "https://www.facebook.com/marketplace/item/" + i + "/",
    }));
    return { ok: true, status: 200, json: async () => items, text: async () => "" };
  };
}

test("mocked scan: request parameters, spend cap, no server-side maxPrice, token never logged", async () => {
  const { run, raw, ctx } = await loadApp();
  const calls = []; ctx.fetch = mockFetchFor(calls);
  run("S.tok='apify_api_SECRET123';S.nearTown='Tagbilaran';S.radius=60;S.nearest=true;S.strict=false;S.busy=0");
  await raw("refresh([{k:'redmi'},{k:'cellphone',disc:true}],20000)");
  assert.strictEqual(calls.length, 2);
  for (const c of calls) {
    assert.ok(c.url.includes("maxTotalChargeUsd=0.1"), "per-run spend cap is sent");
    assert.strictEqual(c.body.sortBy, "distance_ascend");
    assert.strictEqual(c.body.maxPagesPerUrl, 1);
    assert.strictEqual(c.body.getListingDetails, false);
    assert.ok(!("maxPrice" in c.body), "maxPrice must stay client-side so Cebu comparables are still retrieved");
    assert.strictEqual(c.body.radiusKm, 60);
  }
  const logs = run("localStorage.getItem(LOG_KEY)||''");
  assert.ok(logs.length > 100 && logs.includes("scan_started"), "scan events were logged");
  assert.ok(!logs.includes("SECRET123") && !logs.includes("apify_api_"), "token must not appear in stored logs");
});

test("mocked scan: classification, dedupe, report, keyword history and result filtering on real titles", async () => {
  const { run, raw, ctx } = await loadApp();
  const calls = []; ctx.fetch = mockFetchFor(calls);
  run("S.tok='t';S.nearTown='Tagbilaran';S.radius=60;S.nearest=false;S.busy=0;S.cat='Phones';S.province='Bohol';S.max='20000';S.q='';S.kwHist={}");
  await raw("refresh([{k:'redmi'},{k:'cellphone',disc:true},{k:'phone',disc:true}],20000)");
  const r = run("S.scanReport");
  assert.strictEqual(r.requests.completed, 3);
  assert.ok(r.unique <= r.cleaned && r.unique > 0);
  assert.ok(r.geo["bohol-town"] >= 2, "OPPO A5s / REDMI A7 PRO in Tagbilaran and Baclayon are recognised");
  assert.ok(r.classes.repair >= 1, "the real 'B&J IPhone Repair/Center' title is tagged repair");
  assert.ok(r.classes.wanted >= 1, "the real 'CELLPHONE GUBA PALITON' title is tagged as a buying request");
  assert.strictEqual(run("S.live.filter(function(l){return /monitor|refrigerator|ddr[2-5]/i.test(l.t)&&l.g==='Phones'}).length"), 0, "monitors, fridges and RAM sticks never count as Phones");
  run("res()");
  const shown = run("S.live.filter(function(l){return l.g===S.cat&&!notDevice(l)&&locMatches(l)&&distanceFromRef(l)<=S.radius}).map(function(l){return l.t+'|'+l.c})");
  assert.ok(shown.some(t => /A7 PRO/i.test(t) && /Baclayon/.test(t)), "Redmi A7 Pro (Baclayon) survives all filters");
  assert.ok(!shown.some(t => /Repair\/Center/i.test(t)), "repair ad is excluded");
  const hist = run("S.kwHist");
  assert.strictEqual(hist.__scans, 1);
  assert.ok(hist.cellphone && hist.cellphone.runs === 1 && hist.redmi.runs === 1);
  const text = run("scanDiagnostics()");
  assert.ok(/duplicates across searches/.test(text) && /Per keyword/.test(text));
});

test("rendering: Search view and result breakdown include the new controls and the device stage", async () => {
  const { run, els } = await loadApp();
  const html = run("vSearch()");
  for (const id of ["opt-near", "opt-allbrand", "opt-brands", "opt-maxsearch", "opt-hideviewed", "opt-strict", "probe-sort", "usage-report", "scan-plan"]) assert.ok(html.includes(id), id + " present");
  run("S.live=[{id:'a',t:'Redmi A7 Pro 64GB',p:3700,g:'Phones',cls:'device',c:'Baclayon',province:'PH-07',h:2,fl:[]},{id:'b',t:'Cellphone',p:1500,g:'Phones',cls:'review',cr:'No model or storage identified',c:'Tagbilaran City',province:'PH-07',h:1,fl:[]}];S.cat='Phones';S.province='Bohol';S.radius=60;S.max='20000';S.q=''");
  run("res()");
  assert.ok(/device listings 2/.test(els.breakdown.textContent), els.breakdown.textContent);
  const card = run("card(S.live[1])");
  assert.ok(/Unclear listing/.test(card));
});
