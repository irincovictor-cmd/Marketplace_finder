const test = require("node:test");
const assert = require("node:assert");
const { loadApp } = require("./harness.js");

// ---------- helpers: a mocked Apify. No network, no credits. ----------
let SEQ = 0;
const NOWS = () => Date.now() / 1000;
const item = (id, title, price, city, o = {}) => ({
  id: String(id), marketplace_listing_title: title, listing_price: { amount: String(price) },
  creation_time: NOWS() - (o.hours === undefined ? 2 : o.hours) * 3600, listingUrl: o.url || "https://www.facebook.com/marketplace/item/" + id + "/",
  location: Object.assign({ reverse_geocode: { city: city === undefined ? "Tagbilaran City" : city, state: o.state || "PH-07" } }, o.lat !== undefined ? { latitude: o.lat, longitude: o.lon } : {}),
  location_text: o.text ? { text: o.text } : undefined, marketplace_listing_category_id: o.cid,
});
// responses: { keyword: [items] | "fail" }
function mockApify(ctx, responses, calls = []) {
  ctx.fetch = async (url, opts) => {
    const body = JSON.parse(opts.body); calls.push({ url: String(url), body });
    const r = responses[body.searchKeyword !== undefined ? body.searchKeyword : "__urls"];
    if (r === "fail") return { ok: false, status: 500, text: async () => "server error", json: async () => ({}) };
    return { ok: true, status: 200, json: async () => r || [], text: async () => "" };
  };
  return calls;
}
const setup = run => run("S.tok='tok';S.nearTown='Tagbilaran';S.province='Bohol';S.radius=60;S.cat='Phones';S.max='20000';S.q='';S.busy=0;S.kwHist={};S.so='new';S.hideViewed=false");
const TASKS = "[{k:'cellphone',disc:true},{k:'phone',disc:true}]";
const order = els => [...els.res.innerHTML.matchAll(/data-i="([^"]+)"/g)].map(m => m[1]);

// ===================== Task 1: new discoveries first =====================
test("first scan: every listing found is NEW and first-seen is recorded; repeating the same scan marks nothing NEW", async () => {
  const { run, raw, ctx } = await loadApp(); setup(run);
  mockApify(ctx, { cellphone: [item(1, "Redmi Note 13 8/256", 9000, "Tagbilaran City"), item(2, "Oppo A5s 4/64", 3000, "Baclayon")], phone: [] });
  await raw(`refresh(${TASKS},20000)`);
  assert.deepStrictEqual(run("S.live.map(function(l){return isNewListing(l)})"), [true, true]);
  const first = run("S.seen.items.f1.f");
  run("res()");
  await new Promise(r => setTimeout(r, 1100));                   // time passes
  await raw(`refresh(${TASKS},20000)`);
  assert.strictEqual(run("S.live.filter(isNewListing).length"), 0, "re-fetched listings must not be labelled NEW again");
  assert.strictEqual(run("S.seen.items.f1.f"), first, "first-seen is preserved across scans");
  assert.ok(run("S.seen.items.f1.l") > first, "last-seen advances");
  assert.strictEqual(run("S.seen.scans"), 2);
});

test("a later scan puts genuinely new listings at the top and older ones below by Marketplace listing age", async () => {
  const { run, raw, ctx, els } = await loadApp(); setup(run);
  mockApify(ctx, { cellphone: [item(1, "Redmi Note 13 8/256", 9000, "Tagbilaran City", { hours: 30 }), item(2, "Oppo A5s 4/64", 3000, "Baclayon", { hours: 5 })], phone: [] });
  await raw(`refresh(${TASKS},20000)`);
  mockApify(ctx, { cellphone: [item(1, "Redmi Note 13 8/256", 9000, "Tagbilaran City", { hours: 30 }), item(2, "Oppo A5s 4/64", 3000, "Baclayon", { hours: 5 }), item(3, "Tecno Spark 20 128gb", 5000, "Dauis", { hours: 20 })], phone: [item(4, "Infinix Hot 40 8/256", 7000, "Panglao", { hours: 70 })] });
  await raw(`refresh(${TASKS},20000)`);
  run("res()");
  assert.deepStrictEqual(order(els), ["f3", "f4", "f2", "f1"], "NEW first (freshest listing first), then older discoveries by Marketplace age");
  assert.ok(/NEW/.test(run("card(S.live.filter(function(l){return l.id==='f4'})[0])")));
  assert.ok(!/NEW/.test(run("card(S.live.filter(function(l){return l.id==='f1'})[0])")));
  assert.ok(/2 new/.test(els.cnt.textContent), els.cnt.textContent);
});

test("the same listing id returned by several keywords is stored once and counted as one discovery", async () => {
  const { run, raw, ctx } = await loadApp(); setup(run);
  const dup = item(9, "Realme C55 6/128", 6000, "Tagbilaran City");
  mockApify(ctx, { cellphone: [dup, item(10, "Vivo Y27 128GB", 5500, "Baclayon")], phone: [dup, dup] });
  await raw(`refresh(${TASKS},20000)`);
  assert.strictEqual(run("S.live.length"), 2);
  assert.strictEqual(Object.keys(run("S.seen.items")).length, 2);
  assert.strictEqual(run("S.scanReport.newDiscoveries"), 2);
  assert.ok(run("S.scanReport.duplicates") >= 1);
});

test("a listing that only a different keyword returns this time is not lost from the saved list", async () => {
  const { run, raw, ctx } = await loadApp(); setup(run);
  const x = item(5, "Honor X8b 8/256", 8000, "Tagbilaran City");
  mockApify(ctx, { cellphone: [x], phone: [] });
  await raw(`refresh(${TASKS},20000)`);
  mockApify(ctx, { cellphone: [], phone: [x] });
  await raw(`refresh(${TASKS},20000)`);
  assert.deepStrictEqual(run("S.live.map(function(l){return l.id})"), ["f5"]);
  assert.ok(!run("isNewListing(S.live[0])"));
});

test("first-seen times, NEW state and viewed state survive a page reload / browser restart (localStorage)", async () => {
  const a = await loadApp(); setup(a.run);
  mockApify(a.ctx, { cellphone: [item(1, "Redmi Note 13 8/256", 9000, "Tagbilaran City")], phone: [] });
  await a.raw(`refresh(${TASKS},20000)`);
  a.run("markViewed('f1')");
  const firstSeen = a.run("S.seen.items.f1.f");
  const b = await loadApp(Object.assign({}, a.store));            // new page load, same localStorage
  assert.strictEqual(b.run("S.seen.items.f1.f"), firstSeen);
  assert.ok(b.run("isNewListing(S.live[0])"), "still NEW until the next scan");
  assert.ok(b.run("isViewedListing(S.live[0])"));
  assert.strictEqual(b.run("S.seen.scans"), 1);
});

test("migration: listings saved by an older version are never labelled NEW; only really new ones are", async () => {
  const legacy = [{ id: "f100", t: "Samsung A14 4/128", p: 6000, g: "Phones", c: "Tagbilaran City", province: "PH-07", h: 40, k: "samsung", s: [1, 1, 1], n: 1 },
                  { id: "f101", t: "iPhone 11 64GB", p: 11000, g: "Phones", c: "Baclayon", province: "PH-07", h: 80, k: "iphone", s: [1, 1, 1], n: 1 }];
  const { run, raw, ctx, store } = await loadApp({ fr_live: JSON.stringify(legacy) });
  assert.strictEqual(run("S.live.filter(isNewListing).length"), 0, "nothing is NEW right after migration");
  assert.ok(run("S.seen.migratedAt") > 0 && store.fr_seen_v1, "registry persisted");
  setup(run);
  mockApify(ctx, { cellphone: [item(100, "Samsung A14 4/128", 6000, "Tagbilaran City"), item(200, "Poco C65 6/128", 5000, "Dauis")], phone: [] });
  await raw(`refresh(${TASKS},20000)`);
  assert.deepStrictEqual(run("S.live.filter(isNewListing).map(function(l){return l.id})"), ["f200"]);
});

test("partial failure: results from searches that succeeded are kept and registered; the failed keyword keeps its previous listings", async () => {
  const { run, raw, ctx } = await loadApp(); setup(run);
  mockApify(ctx, { cellphone: [item(1, "Redmi Note 13 8/256", 9000, "Tagbilaran City")], phone: [item(2, "Oppo A5s 4/64", 3000, "Baclayon")] });
  await raw(`refresh(${TASKS},20000)`);
  mockApify(ctx, { cellphone: "fail", phone: [item(2, "Oppo A5s 4/64", 3000, "Baclayon"), item(3, "Itel A70 4/128", 3500, "Dauis")] });
  await raw(`refresh(${TASKS},20000)`);
  assert.deepStrictEqual(run("S.live.map(function(l){return l.id}).sort()"), ["f1", "f2", "f3"], "f1 stays although its keyword failed");
  assert.deepStrictEqual(run("S.live.filter(isNewListing).map(function(l){return l.id})"), ["f3"]);
  assert.strictEqual(run("S.scanReport.requests.failed"), 1);
  assert.strictEqual(run("S.seen.scans"), 2);
});

test("a scan where every search fails changes nothing: NEW badges and history stay as they were", async () => {
  const { run, raw, ctx } = await loadApp(); setup(run);
  mockApify(ctx, { cellphone: [item(1, "Redmi Note 13 8/256", 9000, "Tagbilaran City")], phone: [] });
  await raw(`refresh(${TASKS},20000)`);
  mockApify(ctx, { cellphone: "fail", phone: "fail" });
  await raw(`refresh(${TASKS},20000)`);
  assert.strictEqual(run("S.seen.scans"), 1);
  assert.ok(run("isNewListing(S.live[0])"), "the earlier NEW badge is not wiped by a failed scan");
});

test("storage stays bounded: the saved list and the registry are capped and saved listings are protected", async () => {
  const { run } = await loadApp(); setup(run);
  run("S.sv=['f0']");
  run("S.live=[];for(var i=0;i<1200;i++)S.live.push({id:'f'+i,t:'x',p:1,g:'Phones',c:'x',h:1});S.seen=FRSeen.create();var ctx=FRSeen.beginScan(S.seen);var r=FRSeen.register(S.seen,ctx,S.live,1000);S.seen=r.state;S.live=capLive(S.live)");
  assert.strictEqual(run("S.live.length"), 800);
  assert.ok(run("S.live.some(function(l){return l.id==='f0'})"), "saved listing survives the cap");
});

test("hide viewed: opened listings can be hidden and the count is reported", async () => {
  const { run, raw, ctx, els } = await loadApp(); setup(run);
  mockApify(ctx, { cellphone: [item(1, "Redmi Note 13 8/256", 9000, "Tagbilaran City"), item(2, "Oppo A5s 4/64", 3000, "Baclayon")], phone: [] });
  await raw(`refresh(${TASKS},20000)`);
  run("markViewed('f1')"); run("S.hideViewed=true"); run("res()");
  assert.deepStrictEqual(order(els), ["f2"]);
  assert.ok(/1 opened \(hidden\)/.test(els.cnt.textContent));
  run("S.hideViewed=false"); run("res()"); assert.strictEqual(order(els).length, 2);
});

test("Facebook creation time and FlipRadar first-seen are different things", async () => {
  const { run, raw, ctx } = await loadApp(); setup(run);
  mockApify(ctx, { cellphone: [item(1, "Redmi Note 13 8/256", 9000, "Tagbilaran City", { hours: 100 })], phone: [] });
  await raw(`refresh(${TASKS},20000)`);
  const text = run("seenText(S.live[0])");
  assert.ok(/First found by FlipRadar just now/.test(text) && /NEW/.test(text), text);
  const age = run("ageH(S.live[0])");
  assert.ok(age > 99 && age < 101, "listing age still reflects Facebook's creation time (100 h)");
});

// ===================== Task 2: all-brand discovery =====================
test("all-brand scan keeps phones of any brand even when the title lacks the search word, and keeps accessory/repair/wanted ads inspectable", async () => {
  const { run, raw, ctx } = await loadApp(); setup(run);
  mockApify(ctx, { cellphone: [
    item(1, "Ulefone Armor 25 5G 12/256", 14000, "Tagbilaran City"), item(2, "Doogee S100 Pro 12GB 256GB", 9000, "Dauis"),
    item(3, "Galaxy A54 5G 8/256", 11000, "Baclayon"), item(4, "Cubot KingKong X 8/256 5G", 8000, "Panglao"),
    item(5, "B&J IPhone Repair/Center", 3500, "Tagbilaran City"), item(6, "WTB iPhone 11", 100, "Tagbilaran City"),
    item(7, "Phone holder for car", 300, "Tagbilaran City"), item(8, "SAMSUNG ODYSSEY G5 MONITOR", 9000, "Tagbilaran City"),
  ], phone: [] });
  await raw(`refresh(${TASKS},20000)`);
  const byId = Object.fromEntries(run("S.live.map(function(l){return [l.id,{g:l.g,cls:l.cls}]})"));
  for (const id of ["f1", "f2", "f3", "f4"]) assert.deepStrictEqual(byId[id], { g: "Phones", cls: "device" }, id);
  assert.strictEqual(byId.f5.cls, "repair"); assert.strictEqual(byId.f6.cls, "wanted"); assert.strictEqual(byId.f7.cls, "accessory");
  assert.strictEqual(byId.f8, undefined, "a monitor is not a phone, so phone discovery drops it");
  run("res()");
  assert.deepStrictEqual(run("S.live.filter(function(l){return l.g==='Phones'&&!notDevice(l)}).map(function(l){return l.id}).sort()"), ["f1", "f2", "f3", "f4"]);
});

test("phone discovery does not discard listings because of price outliers or the scan-time budget; the budget applies when browsing", async () => {
  const { run, raw, ctx, els } = await loadApp(); setup(run);
  mockApify(ctx, { cellphone: [item(1, "Redmi A3 3/64", 1800, "Tagbilaran City"), item(2, "iPhone 15 Pro 256GB", 52000, "Tagbilaran City"), item(3, "Tecno Spark 20 128gb", 6000, "Dauis")], phone: [] });
  await raw(`refresh(${TASKS},10000)`);
  assert.strictEqual(run("S.live.length"), 3, "cheap and over-budget phones are stored");
  run("S.max='10000'"); run("res()");
  assert.deepStrictEqual(order(els).sort(), ["f1", "f3"], "over-budget phone hidden");
  run("S.max='60000'"); run("res()");
  assert.strictEqual(order(els).length, 3, "raising the budget shows it again without a new paid scan");
});

test("an unrecognisable title from a phone search goes to the 'possible phones' review list, not to results and not into the void", async () => {
  const { run, raw, ctx, els } = await loadApp(); setup(run);
  mockApify(ctx, { cellphone: [item(1, "Ulefone Armor 25", 9000, "Tagbilaran City")], phone: [] });
  await raw(`refresh(${TASKS},20000)`);
  run("res()");
  assert.strictEqual(order(els).length, 0);
  assert.ok(/Possible phones/.test(els["possible-phones"].innerHTML) && /Ulefone Armor 25/.test(els["possible-phones"].innerHTML));
});

test("scan plan: request count and estimated cost are shown before scanning; the user limit and a declined confirmation prevent any request", async () => {
  const { run, ctx, els, click } = await loadApp(); setup(run);
  run("S.maxSearches=6");
  run("renderPlan()");
  assert.ok(/This scan: 6 paid searches/.test(els["scan-plan"].innerHTML), els["scan-plan"].innerHTML);
  assert.ok(/estimate/i.test(els["scan-plan"].innerHTML));
  run("S.maxSearches=3"); run("renderPlan()"); assert.ok(/This scan: 3 paid searches/.test(els["scan-plan"].innerHTML));
  const calls = mockApify(ctx, {});
  let asked = ""; ctx.confirm = msg => { asked = msg; return false; };
  click({ a: "scan" });
  assert.strictEqual(calls.length, 0, "declining the confirmation makes no paid request");
  assert.ok(/3 paid Apify searches/.test(asked) && /not a billing limit/.test(asked), asked);
  ctx.confirm = () => true; click({ a: "scan" });
  await new Promise(r => setTimeout(r, 50));
  assert.strictEqual(calls.length, 3);
  assert.ok(calls.every(c => c.body.maxPagesPerUrl === 1 && c.url.includes("maxTotalChargeUsd")));
});

test("all-brand search can be switched off to restore the old brand scan; other categories keep their own keywords", async () => {
  const { run } = await loadApp(); setup(run);
  run("S.allBrand=false"); assert.deepStrictEqual(run("currentPlan().terms.map(function(t){return t.k})"), ["iphone", "samsung", "redmi"]);
  run("S.cat='Laptops'"); assert.ok(run("currentPlan().terms.every(function(t){return t.disc===false})"));
});

// ===================== Task 3: geography =====================
test("unknown locations are never counted as nearby; they are listed for review", async () => {
  const { run, raw, ctx, els } = await loadApp(); setup(run);
  mockApify(ctx, { cellphone: [item(1, "Redmi Note 13 8/256", 9000, "Tagbilaran City"), item(2, "Realme C55 6/128", 6000, ""), item(3, "Vivo Y27 128GB", 5500, "Cebu City"), item(4, "Oppo A5s 4/64", 3000, "Dumaguete City", { state: "NIR" })], phone: [] });
  await raw(`refresh(${TASKS},20000)`);
  run("res()");
  assert.deepStrictEqual(order(els), ["f1"], "only the confirmed local listing is in the results");
  assert.ok(/1 nearby listing/.test(els.cnt.textContent) && /1 need a location check/.test(els.cnt.textContent) && /2 outside your area/.test(els.cnt.textContent), els.cnt.textContent);
  assert.ok(/Needs location verification \(1\)/.test(els["location-review"].innerHTML) && /Realme C55/.test(els["location-review"].innerHTML));
  assert.deepStrictEqual(run("S.live.map(function(l){return [l.id,locStatus(l)]})"), [["f1", "local"], ["f2", "verify"], ["f3", "outside"], ["f4", "outside"]]);
});

test("coordinates from Facebook, when present, give an exact distance and decide inside/outside; conflicting evidence means verify", async () => {
  const { run } = await loadApp(); setup(run);
  const loc = o => run(`(function(){var l=${JSON.stringify(o)};return [locStatus(l),Math.round(distanceFromRef(l)),distSource(l),geoLevel(l)]})()`);
  const near = loc({ c: "", province: "", la: 9.65, lo: 123.86 });
  assert.deepStrictEqual([near[0], near[2], near[3]], ["local", "gps", "bohol-gps"]);
  assert.ok(near[1] >= 0 && near[1] <= 3, "a point a couple of km from the Tagbilaran centre: " + near[1] + " km");
  assert.strictEqual(loc({ c: "", province: "", la: 10.3157, lo: 123.8854 })[0], "outside", "Cebu City coordinates");
  assert.strictEqual(loc({ c: "Cebu City", province: "PH-07", la: 9.65, lo: 123.86 })[0], "verify", "town says Cebu, coordinates say Bohol: do not guess");
  assert.strictEqual(loc({ c: "", province: "", lt: "Tagbilaran City, Bohol" })[0], "verify", "text alone gives no distance, so it is not counted as nearby");
  assert.strictEqual(loc({ c: "Tagbilaran City", province: "PH-07" })[2], "town");
});

test("province text Bohol is recognised as stated evidence; a Bohol-sounding town in another province is not claimed", async () => {
  const { run } = await loadApp(); setup(run);
  assert.strictEqual(run("geoLevel({c:'',province:'',lt:'Jagna, Bohol'})"), "bohol-stated");
  assert.strictEqual(run("isB({c:'Cebu City',province:'PH-07'})"), false);
  assert.strictEqual(run("isB({c:'Tagbilaran City',province:'PH-07'})"), true);
});

test("the scan report shows which location fields Facebook actually supplied, with category ids for recognised phones", async () => {
  const { run, raw, ctx } = await loadApp(); setup(run);
  mockApify(ctx, { cellphone: [item(1, "Redmi Note 13 8/256", 9000, "Tagbilaran City", { lat: 9.65, lon: 123.86, text: "Tagbilaran, Bohol", cid: "1234567" }), item(2, "Oppo A5s 4/64", 3000, "Baclayon")], phone: [] });
  await raw(`refresh(${TASKS},20000)`);
  const f = run("S.scanReport.fields");
  assert.deepStrictEqual([f.total, f.gps, f.locationText, f.categoryId], [2, 1, 1, 1]);
  assert.deepStrictEqual(run("S.scanReport.catIds"), { 1234567: 1 });
  assert.ok(/1 with coordinates/.test(run("scanDiagnostics()")));
  assert.deepStrictEqual(Object.keys(run("S.locIds")), ["tagbilaran city"].filter(() => false), "no Facebook location id was supplied in this fixture, so none is learned");
});

test("category URL probe: refuses without a learned location id (no request), then sends exactly one URL request without coordinates", async () => {
  const { run, ctx, click } = await loadApp(); setup(run);
  const calls = mockApify(ctx, { __urls: [item(1, "Redmi Note 13 8/256", 9000, "Tagbilaran City")] });
  click({ a: "caturl" }); await new Promise(r => setTimeout(r, 20));
  assert.strictEqual(calls.length, 0, "no learned id -> no paid request");
  run("S.locIds={'tagbilaran city':{vanity:'tagbilaran',cityPageId:'111',n:5,counts:{}}}");
  let asked = ""; ctx.confirm = m => { asked = m; return true; };
  click({ a: "caturl" }); await new Promise(r => setTimeout(r, 60));
  assert.strictEqual(calls.length, 1);
  const b = calls[0].body;
  assert.deepStrictEqual(b.urls, ["https://www.facebook.com/marketplace/tagbilaran/electronics?sortBy=distance_ascend&radius_in_km=60&daysSinceListed=7"]);
  assert.ok(!("latitude" in b) && !("longitude" in b), "coordinates are ignored for URL input, so none are sent");
  assert.ok(/ONE paid test/.test(asked) && /not a billing limit/.test(asked));
  assert.ok(calls[0].url.includes("maxTotalChargeUsd"));
});

// ===================== Task 4: navigation =====================
test("opening a listing and pressing in-app Back restores the same position and keeps category, budget, sort and filters", async () => {
  const a = await loadApp(); setup(a.run);
  a.run("S.t='search';S.so='n';S.q='redmi'"); a.ctx.scrollY = 4321;
  a.run("S.live=[{id:'f7',t:'Redmi Note 13 8/256',p:9000,g:'Phones',cls:'device',c:'Tagbilaran City',province:'PH-07',h:2,ct:Date.now()/1000-7200,fl:[]}]");
  a.click({ a: "open", i: "f7" });
  assert.strictEqual(a.run("S.d"), "f7");
  assert.deepStrictEqual(a.hist.entries.length, 2, "exactly one history entry was pushed");
  assert.ok(a.run("isViewedListing(S.live[0])"));
  a.ctx.scrollY = 0;
  a.click({ a: "back" });
  assert.strictEqual(a.run("S.d"), 0, "list is shown immediately, without waiting for popstate");
  assert.strictEqual(a.ctx.scrollY, 4321, "scroll position restored");
  assert.deepStrictEqual(a.run("[S.cat,S.max,S.so,S.q,S.t]"), ["Phones", "20000", "n", "redmi", "search"]);
  await new Promise(r => setTimeout(r, 30));                       // the quiet history pop arrives later
  assert.strictEqual(a.run("S.d"), 0);
  assert.strictEqual(a.hist.idx, 0);
  assert.strictEqual(a.scrolls.filter(y => y === 0).length >= 1, true);
});

test("Android system Back from a listing returns to the list at the saved position", async () => {
  const a = await loadApp(); setup(a.run); a.run("S.t='search'"); a.ctx.scrollY = 2750;
  a.run("S.live=[{id:'f7',t:'Redmi Note 13 8/256',p:9000,g:'Phones',cls:'device',c:'Tagbilaran City',province:'PH-07',h:2,fl:[]}]");
  a.click({ a: "open", i: "f7" }); a.ctx.scrollY = 0;
  a.hist.idx = 0;                                                  // browser moves back ...
  a.fire("window", "popstate", { state: a.hist.entries[0].state }); // ... and fires popstate
  assert.strictEqual(a.run("S.d"), 0);
  assert.strictEqual(a.ctx.scrollY, 2750);
});

test("reload or tab discard (for example after visiting Facebook): filters, sort and open listing come back from sessionStorage", async () => {
  const a = await loadApp(); setup(a.run); a.run("S.t='search';S.so='near';S.q='poco';S.max='15000';S.cat='Phones'"); a.ctx.scrollY = 1900;
  a.run("S.live=[{id:'f7',t:'Poco X6 8/256',p:9000,g:'Phones',cls:'device',c:'Tagbilaran City',province:'PH-07',h:2,fl:[]}]");
  a.click({ a: "open", i: "f7" });
  const live = a.store.fr_live || JSON.stringify(a.run("S.live"));
  const b = await loadApp({ fr_live: live }, { session: a.session, hash: "#/l/f7" });
  assert.deepStrictEqual(b.run("[S.t,S.so,S.q,S.max,S.cat,S.d]"), ["search", "near", "poco", "15000", "Phones", "f7"]);
});

test("listing links: only https facebook.com links are used, otherwise the link is rebuilt from the numeric id", async () => {
  const { run } = await loadApp();
  assert.strictEqual(run("listingHref({id:'f123',t:'x',u:'https://www.facebook.com/marketplace/item/123/'})"), "https://www.facebook.com/marketplace/item/123/");
  assert.strictEqual(run("listingHref({id:'f123',t:'x',u:'javascript:alert(1)'})"), "https://www.facebook.com/marketplace/item/123/");
  assert.strictEqual(run("listingHref({id:'f123',t:'x',u:'https://evil.example/marketplace/item/123/'})"), "https://www.facebook.com/marketplace/item/123/");
  assert.strictEqual(run("listingHref({id:'f123',t:'x'})"), "https://www.facebook.com/marketplace/item/123/");
  const html = run("vDet({id:'f123',t:'x\"><script>',p:1,g:'Phones',c:'a',h:1,u:'https://www.facebook.com/marketplace/item/123/\" onmouseover=\"x',i:'javascript:x',fl:[]})");
  assert.ok(!/<script>/.test(html) && !/onmouseover="x/.test(html) && !/javascript:x/.test(html));
});

test("Search tab is organised as category, budget, area, scan, browse and keeps diagnostics out of the main flow", async () => {
  const { run } = await loadApp(); setup(run);
  const html = run("vSearch()");
  const at = s => html.indexOf(s);
  assert.ok(at("1 · Category") < at("2 · Maximum budget") && at("2 · Maximum budget") < at("3 · Area") && at("3 · Area") < at("4 · Scan Marketplace") && at("4 · Scan Marketplace") < at("5 · Browse"));
  assert.ok(at('id="scan-diagnostics"') > at('id="res"'), "diagnostics sit below the results, inside a collapsed section");
  assert.ok(/<details class="ui-fold"><summary>📊 Scan diagnostics/.test(html) && /Developer tools \(paid tests\)/.test(html));
  assert.ok(/option value="new">New discoveries first/.test(html));
});

test("default sort is New discoveries first and the chosen sort is remembered", async () => {
  const a = await loadApp(); assert.strictEqual(a.run("S.so"), "new");
  a.ctx.document.getElementById("so"); a.fire("document", "input", { target: { id: "so", value: "p" } });
  assert.strictEqual(a.store.fr_sort, JSON.stringify("p"));
  const b = await loadApp(Object.assign({}, a.store)); assert.strictEqual(b.run("S.so"), "p");
});

test("a real scan applies the storage cap: the saved list stays at 800, saved listings survive, the registry stays bounded", async () => {
  const legacy = Array.from({ length: 790 }, (_, i) => ({ id: "f" + (1000 + i), t: "Old phone " + i, p: 5000, g: "Phones", c: "Tagbilaran City", province: "PH-07", h: 100, k: "old", s: [1, 1, 1], n: 1 }));
  const { run, raw, ctx } = await loadApp({ fr_live: JSON.stringify(legacy), fr_saved: JSON.stringify(["f1000"]) });
  setup(run);
  const fresh = Array.from({ length: 60 }, (_, i) => item(5000 + i, "Redmi " + i + " 8/256", 7000, "Tagbilaran City"));
  mockApify(ctx, { cellphone: fresh, phone: [] });
  await raw(`refresh(${TASKS},20000)`);
  assert.strictEqual(run("S.live.length"), 800);
  assert.ok(run("S.live.some(function(l){return l.id==='f1000'})"), "a saved listing is never evicted, even though it is among the oldest");
  assert.strictEqual(run("S.live.filter(function(l){return l.id.indexOf('f5')===0}).length"), 60, "all fresh listings are kept");
  assert.ok(run("Object.keys(S.seen.items).length") <= 3000);
});
