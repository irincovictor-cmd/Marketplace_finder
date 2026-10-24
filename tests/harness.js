// Loads the real index.html script into a Node vm with minimal browser stubs so app functions can be regression-tested.
const fs = require("fs"), path = require("path"), vm = require("vm");
const root = path.join(__dirname, "..");
async function loadApp(seed) {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).sort((a, b) => b.length - a.length)[0];
  const store = Object.assign({}, seed || {}), els = {};
  const el = () => new Proxy({ style: {}, dataset: {}, classList: { toggle() {}, add() {}, remove() {} }, innerHTML: "", textContent: "", value: "" }, { get: (t, k) => k in t ? t[k] : (typeof k === "string" ? () => el() : undefined), set: (t, k, v) => (t[k] = v, true) });
  const geo = JSON.parse(fs.readFileSync(path.join(root, "bohol-geography.json"), "utf8"));
  const ctx = {
    console, setTimeout, clearTimeout, Promise, Date, Math, JSON, Object, Array, Map, Set, Number, String, RegExp, Error, TypeError, parseFloat, parseInt, isFinite,
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
    document: { hidden: false, getElementById: id => els[id] || (els[id] = el()), createElement: () => el(), querySelector: () => el(), querySelectorAll: () => [], addEventListener() {}, body: el() },
    navigator: {}, location: { href: "http://localhost/" },
    fetch: async () => ({ ok: true, status: 200, json: async () => geo, text: async () => "" }),
    encodeURIComponent, decodeURIComponent, Intl,
  };
  ctx.window = ctx; ctx.self = ctx; ctx.addEventListener = () => {}; ctx.confirm = () => true; ctx.alert = () => {};
  vm.createContext(ctx);
  for (const f of ["classify.js", "discovery.js"]) vm.runInContext(fs.readFileSync(path.join(root, f), "utf8"), ctx, { filename: f });
  ctx.FRClassify = ctx.FRClassify || (ctx.window && ctx.window.FRClassify);
  vm.runInContext(inline, ctx, { filename: "index.html<script>" });
  for (let i = 0; i < 5; i++) await new Promise(r => setImmediate(r));   // let the geography fetch resolve
  // Values created inside the vm have a different Array/Object prototype; clone them so deepStrictEqual works.
  return { ctx, els, raw: code => vm.runInContext(code, ctx), run: code => { const v = vm.runInContext(code, ctx); return v && typeof v === "object" ? JSON.parse(JSON.stringify(v)) : v; } };
}
module.exports = { loadApp };
