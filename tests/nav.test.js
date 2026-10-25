const test = require("node:test");
const assert = require("node:assert");
const { createNav, parseHash, KEY, TTL_MS } = require("../nav.js");

// A tiny fake browser: a scrollable list of equally tall cards, a history stack, and sessionStorage.
function fakeEnv(opts = {}) {
  const CARD_H = 100, N = opts.cards || 60;
  const listeners = { win: {}, doc: {} };
  const store = {};
  let t = 1_000_000;
  const env = {
    y: 0, ids: Array.from({ length: N }, (_, i) => "f" + i), headerOffset: 0,
    entries: [{ state: null, hash: "" }], idx: 0,
    store, clock: () => t, advance: ms => { t += ms; },
  };
  const win = {
    get scrollY() { return env.y; },
    scrollTo: (_x, y) => { env.y = Math.max(0, y); },
    location: { get hash() { return env.entries[env.idx].hash; }, pathname: "/Marketplace_finder/", search: "" },
    addEventListener: (n, f) => { (listeners.win[n] = listeners.win[n] || []).push(f); },
  };
  const doc = {
    hidden: false, documentElement: { scrollTop: 0 },
    querySelectorAll: () => env.ids.map((id, i) => ({
      dataset: { i: id, a: "open" },
      getBoundingClientRect: () => ({ top: env.headerOffset + i * CARD_H - env.y, bottom: env.headerOffset + (i + 1) * CARD_H - env.y }),
    })),
    addEventListener: (n, f) => { (listeners.doc[n] = listeners.doc[n] || []).push(f); },
  };
  const history = {
    get state() { return env.entries[env.idx].state; },
    pushState: (st, _t, url) => { env.entries.splice(env.idx + 1); env.entries.push({ state: st, hash: url.startsWith("#") ? url : "" }); env.idx++; },
    replaceState: (st, _t, url) => { env.entries[env.idx] = { state: st, hash: (url || "").startsWith("#") ? url : "" }; },
    back: () => { if (env.idx > 0) { env.idx--; (listeners.win.popstate || []).forEach(f => f({ state: env.entries[env.idx].state })); } },
  };
  const storage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
  env.nav = createNav({ window: win, document: doc, history, storage, now: env.clock, raf: f => f(), setTimeout: f => { f(); return 0; }, clearTimeout() {} });
  env.fire = (target, name, ev = {}) => (listeners[target][name] || []).forEach(f => f(ev));
  env.app = Object.assign({ t: "search", d: 0, q: "", max: "20000", cat: "Phones", so: "rn" }, opts.app || {});
  return env;
}
const topCardId = env => { for (const [i, id] of env.ids.entries()) if (i * 100 - env.y + 100 > 0) return id; };

test("parseHash accepts only #/l/<id>", () => {
  assert.strictEqual(parseHash("#/l/f123"), "f123");
  assert.strictEqual(parseHash("#/l/a%20b"), "a b");
  for (const bad of ["", "#", "#/x/1", "#/l/", "#/l/a/b", "#/l/%E0%A4%A", null, undefined]) assert.strictEqual(parseHash(bad), null, String(bad));
});

test("opening a listing pushes one history entry and stores the list position as an anchor", () => {
  const e = fakeEnv(); e.y = 2345;
  e.nav.openDetail(e.app, "f23");
  assert.strictEqual(e.entries.length, 2);
  assert.deepStrictEqual(e.entries[1].state, { fr: 1, v: "detail", id: "f23" });
  assert.strictEqual(e.entries[1].hash, "#/l/f23");
  const s = JSON.parse(e.store[KEY]);
  assert.deepStrictEqual([s.t, s.cat, s.max, s.so, s.a, s.o, s.y], ["search", "Phones", "20000", "rn", "f23", -45, 2345]);
});

test("Android system Back (popstate) and the in-app Back button both return to the same anchored position", () => {
  const e = fakeEnv(); e.y = 2345;
  let popped = null;
  e.nav.onPop(p => { popped = p; if (!p.detailId) { e.y = 0; e.nav.restoreScroll(p.snapshot); } });
  e.nav.openDetail(e.app, "f23"); e.y = 0;                      // detail screen scrolls to top
  e.fire("win", "popstate", { state: e.entries[e.idx].state });  // system Back gesture arrives as popstate (simulated at the detail entry first)
  assert.strictEqual(popped.detailId, "f23");
  assert.strictEqual(e.nav.back(), true, "in-app Back uses history.back()");
  assert.strictEqual(popped.detailId, null);
  assert.strictEqual(e.y, 2345, "list returns to the same place");
  assert.strictEqual(e.idx, 0);
});

test("anchor restore survives a changed list: header height and new cards above do not break the position", () => {
  const e = fakeEnv(); e.y = 1800;
  e.nav.openDetail(e.app, "f18");
  const saved = e.nav.current();
  e.headerOffset = 130;                         // e.g. a results banner appeared above the list
  e.ids.unshift("n1", "n2");                    // two new listings arrived at the top
  e.y = 0; e.nav.restoreScroll(saved);
  const target = e.ids.indexOf(saved.a);
  assert.strictEqual(Math.round(e.headerOffset + target * 100 - e.y), saved.o, "same card at the same screen offset");
});

test("restore falls back to raw scrollY when the anchor card no longer exists", () => {
  const e = fakeEnv(); e.y = 900;
  e.nav.openDetail(e.app, "f9");
  e.ids = e.ids.filter(id => id !== "f9"); e.y = 0;
  e.nav.restoreScroll(e.nav.current());
  assert.strictEqual(e.y, 900);
});

test("a re-render (for example scan progress) keeps the visible card in place", () => {
  const e = fakeEnv(); e.y = 3000;
  const before = topCardId(e);
  e.nav.keepAnchor(() => { e.ids.unshift("new1", "new2", "new3"); e.headerOffset = 60; });
  assert.strictEqual(topCardId(e), before, "same card is still at the top");
});

test("filters and sort survive a discarded tab: state is read back from sessionStorage after reload", () => {
  const e = fakeEnv({ app: { q: "poco", max: "15000", so: "near" } }); e.y = 1200;
  e.nav.openDetail(e.app, "f12");
  const e2 = fakeEnv(); e2.store[KEY] = e.store[KEY];        // new page load, same tab session
  e2.entries[0].hash = "#/l/f12";
  const b = e2.nav.boot();
  assert.deepStrictEqual([b.snapshot.q, b.snapshot.max, b.snapshot.so, b.snapshot.cat, b.detailId], ["poco", "15000", "near", "Phones", "f12"]);
});

test("stale or corrupt snapshots are ignored", () => {
  const e = fakeEnv(); e.y = 500; e.nav.openDetail(e.app, "f5");
  e.advance(TTL_MS + 1);
  assert.strictEqual(e.nav.load(), null, "older than six hours");
  e.store[KEY] = "{not json"; assert.strictEqual(e.nav.load(), null);
  e.store[KEY] = JSON.stringify({ v: 99, ts: e.clock() }); assert.strictEqual(e.nav.load(), null);
});

test("returning from the Facebook app: scroll is restored only when the page was reset to the top", () => {
  const e = fakeEnv(); e.y = 2200;
  e.nav.trackScroll(() => e.app);
  e.fire("win", "scroll");                                      // debounced save while browsing
  e.doc = null; e.y = 0;                                         // browser lost the position while the page was hidden
  e.fire("doc", "visibilitychange");                             // becomes visible again
  assert.strictEqual(e.y, 2200);
  e.y = 640; e.fire("doc", "visibilitychange");                  // user is somewhere else: leave alone
  assert.strictEqual(e.y, 640);
});

test("restoreIfReset never fires inside a detail view or on a different tab", () => {
  const e = fakeEnv(); e.y = 2000; e.nav.trackScroll(() => e.app); e.fire("win", "scroll");
  e.y = 0;
  assert.strictEqual(e.nav.restoreIfReset(() => Object.assign({}, e.app, { d: "f1" })), false);
  assert.strictEqual(e.nav.restoreIfReset(() => Object.assign({}, e.app, { t: "saved" })), false);
  assert.strictEqual(e.y, 0);
});

test("bfcache pageshow restores only when persisted", () => {
  const e = fakeEnv(); e.y = 1500; e.nav.trackScroll(() => e.app); e.fire("win", "scroll"); e.y = 0;
  e.fire("win", "pageshow", { persisted: false }); assert.strictEqual(e.y, 0);
  e.fire("win", "pageshow", { persisted: true });  assert.strictEqual(e.y, 1500);
});

test("leaving the detail view through a tab replaces the history entry so Back does not resurrect it", () => {
  const e = fakeEnv(); e.nav.openDetail(e.app, "f3");
  assert.strictEqual(e.entries[e.idx].state.v, "detail");
  e.nav.leaveDetail();
  assert.strictEqual(e.entries[e.idx].state.v, "list");
  assert.strictEqual(e.nav.back(), false, "nothing to go back to inside the app");
});

test("in-app Back with no pushed entry (for example a deep link) returns false so the caller handles it", () => {
  const e = fakeEnv(); assert.strictEqual(e.nav.back(), false);
});

test("storage failures never throw", () => {
  const e = fakeEnv();
  const bad = createNav({ window: { scrollY: 10, scrollTo() {}, location: { hash: "", pathname: "/", search: "" }, addEventListener() {} },
    document: { hidden: false, documentElement: {}, querySelectorAll: () => [], addEventListener() {} },
    history: { state: null, pushState() { throw new Error("blocked"); }, replaceState() {}, back() {} },
    storage: { getItem() { throw new Error("denied"); }, setItem() { throw new Error("quota"); } }, now: () => 1 });
  assert.doesNotThrow(() => bad.openDetail({ t: "search" }, "x"));
  assert.strictEqual(bad.load(), null);
});

test("in-app Back: list is rendered immediately, the history pop is ignored once, and system Back still works afterwards", () => {
  const e = fakeEnv(); e.y = 2345;
  const events = [];
  e.nav.onPop(p => events.push(p.detailId || "list"));
  e.nav.openDetail(e.app, "f23"); e.y = 0;
  // --- what the app does on the Back button ---
  assert.strictEqual(e.nav.hasDetailEntry(), true);
  e.y = 0; e.nav.restoreScroll(e.nav.current());               // immediate render + restore (no waiting for popstate)
  assert.strictEqual(e.y, 2345, "position is back before any popstate arrives");
  e.nav.skipNextPop(); e.nav.back();
  assert.deepStrictEqual(events, [], "the quiet history pop does not trigger a second render");
  assert.strictEqual(e.idx, 0);
  // --- later: open again and use the system Back gesture ---
  e.nav.openDetail(e.app, "f24");
  e.idx = 0;                                                    // the browser moves history first ...
  e.fire("win", "popstate", { state: e.entries[0].state });     // ... then fires popstate (Android system Back)
  assert.deepStrictEqual(events, ["list"], "skip counter was consumed; system Back is handled normally");
});

test("scroll restore is repeated for several frames so late layout shifts (images) do not leave the list off position", () => {
  const e = fakeEnv(); e.y = 1800; e.nav.openDetail(e.app, "f18");
  const frames = []; let shifted = false;
  const nav2 = (function () {                                     // same env but queued frames
    const { createNav } = require("../nav.js");
    return createNav({ window: { get scrollY() { return e.y; }, scrollTo: (_x, y) => { e.y = y; }, location: { hash: "", pathname: "/", search: "" }, addEventListener() {} },
      document: { hidden: false, documentElement: {}, addEventListener() {}, querySelectorAll: () => e.ids.map((id, i) => ({ dataset: { i: id }, getBoundingClientRect: () => ({ top: (shifted ? 160 : 0) + i * 100 - e.y, bottom: (shifted ? 160 : 0) + (i + 1) * 100 - e.y }) })) },
      history: { state: null, pushState() {}, replaceState() {}, back() {} }, storage: { getItem: () => JSON.stringify(e.nav.current()), setItem() {} }, now: e.clock, raf: f => frames.push(f) });
  })();
  e.y = 0; nav2.restoreScroll(e.nav.current());
  while (frames.length) { const f = frames.shift(); f(); if (!shifted && frames.length) shifted = true; }   // a banner appears after the first pass
  const saved = e.nav.current();
  assert.strictEqual(Math.round(160 + e.ids.indexOf(saved.a) * 100 - e.y), saved.o, "final pass corrected the shift");
});
