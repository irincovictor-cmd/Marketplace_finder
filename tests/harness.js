// Loads the real index.html script into a Node vm with minimal browser stubs so app functions can be regression-tested.
const fs = require("fs"), path = require("path"), vm = require("vm");
const root = path.join(__dirname, "..");
async function loadApp(seed, opts) {
  opts = opts || {};
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).sort((a, b) => b.length - a.length)[0];
  const store = Object.assign({}, seed || {}), els = {}, session = Object.assign({}, opts.session || {}), listeners = { window: {}, document: {} }, scrolls = [], hist = { entries: [{ state: null }], idx: 0 };
  const el = () => new Proxy({ style: {}, dataset: {}, classList: { toggle() {}, add() {}, remove() {} }, innerHTML: "", textContent: "", value: "" }, { get: (t, k) => k in t ? t[k] : (typeof k === "string" ? () => el() : undefined), set: (t, k, v) => (t[k] = v, true) });
  const geo = JSON.parse(fs.readFileSync(path.join(root, "bohol-geography.json"), "utf8"));
  const ctx = {
    console, setTimeout, clearTimeout, Promise, Date, Math, JSON, Object, Array, Map, Set, Number, String, RegExp, Error, TypeError, parseFloat, parseInt, isFinite,
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
    document: { hidden: false, documentElement: { scrollTop: 0 }, getElementById: id => els[id] || (els[id] = el()), createElement: () => el(), querySelector: () => el(), querySelectorAll: () => [], addEventListener: (n, f) => { (listeners.document[n] = listeners.document[n] || []).push(f); }, body: el() },
    navigator: {}, location: { href: "http://localhost/", hash: opts.hash || "", pathname: "/", search: "" }, URL,
    sessionStorage: { getItem: k => (k in session ? session[k] : null), setItem: (k, v) => { session[k] = String(v); }, removeItem: k => { delete session[k]; } },
    history: { get state() { return hist.entries[hist.idx].state; }, pushState: (st, _t, url) => { hist.entries.splice(hist.idx + 1); hist.entries.push({ state: st, url }); hist.idx++; }, replaceState: (st, _t, url) => { hist.entries[hist.idx] = { state: st, url }; }, back: () => { if (hist.idx > 0) { hist.idx--; setImmediate(() => (listeners.window.popstate || []).forEach(f => f({ state: hist.entries[hist.idx].state }))); } } },
    scrollY: 0, scrollTo: (_x, y) => { ctxRef.scrollY = y; scrolls.push(y); }, requestAnimationFrame: f => { f(); return 0; },
    fetch: async () => ({ ok: true, status: 200, json: async () => geo, text: async () => "" }),
    encodeURIComponent, decodeURIComponent, Intl,
  };
  const ctxRef = ctx; ctx.window = ctx; ctx.self = ctx; ctx.addEventListener = (n, f) => { (listeners.window[n] = listeners.window[n] || []).push(f); }; ctx.confirm = () => true; ctx.alert = () => {};
  vm.createContext(ctx);
  for (const f of ["classify.js", "discovery.js", "plan.js", "nav.js", "seen.js"]) vm.runInContext(fs.readFileSync(path.join(root, f), "utf8"), ctx, { filename: f });
  ctx.FRClassify = ctx.FRClassify || (ctx.window && ctx.window.FRClassify);
  vm.runInContext(inline, ctx, { filename: "index.html<script>" });
  for (let i = 0; i < 5; i++) await new Promise(r => setImmediate(r));   // let the geography fetch resolve
  // Values created inside the vm have a different Array/Object prototype; clone them so deepStrictEqual works.
  const click = (data) => { const elx = { dataset: data }; (listeners.document.click || []).forEach(f => f({ target: { closest: () => elx } })); };
  const fire = (target, name, ev) => (listeners[target][name] || []).forEach(f => f(ev || {}));
  return { ctx, els, store, session, hist, scrolls, click, fire, raw: code => vm.runInContext(code, ctx), run: code => { const v = vm.runInContext(code, ctx); return v && typeof v === "object" ? JSON.parse(JSON.stringify(v)) : v; } };
}
module.exports = { loadApp };
