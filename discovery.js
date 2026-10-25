/* FlipRadar discovery helpers: dedupe-aware yield, keyword history, adaptive term choice, cost estimate.
 * Pure functions, no DOM or network. Browser: window.FRDiscovery. Node: require("./discovery.js").
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.FRDiscovery = factory();
})(typeof self !== "undefined" ? self : this, function () {
  var PRICE_PER_ITEM_USD = 0.0005;   // actor pricing page, basic listing item (checked 2026-10-23); an ESTIMATE, not billing
  var PRICE_PER_RUN_USD = 0.00005;
  var REVISIT_AFTER_SCANS = 5;       // a proven-zero term is retried after this many scans
  var PROVEN_ZERO_RUNS = 3;

  function estimateCostUsd(rawItems, runs) {
    return Math.round((rawItems * PRICE_PER_ITEM_USD + runs * PRICE_PER_RUN_USD) * 1e5) / 1e5;
  }

  /* results: ordered [{k, listings:[{id, local:boolean, device:boolean}], raw:number}]
   * A listing counts for the FIRST keyword that returned it; later repeats are duplicates. */
  function computeYield(results, seenIds) {
    var seen = seenIds || new Set(), out = [];
    results.forEach(function (r) {
      var y = { k: r.k, raw: r.raw || 0, cleaned: r.listings.length, unique: 0, duplicates: 0, localUnique: 0, deviceLocalUnique: 0 };
      r.listings.forEach(function (l) {
        var id = String(l.id);
        if (seen.has(id)) { y.duplicates++; return; }
        seen.add(id); y.unique++;
        if (l.local) { y.localUnique++; if (l.device) y.deviceLocalUnique++; }
      });
      out.push(y);
    });
    return out;
  }

  function recordScan(history, yields) {
    var h = JSON.parse(JSON.stringify(history || {}));
    h.__scans = (h.__scans || 0) + 1;
    yields.forEach(function (y) {
      var e = h[y.k] || { runs: 0, raw: 0, unique: 0, localUnique: 0, deviceLocalUnique: 0, lastScan: 0 };
      e.runs++; e.raw += y.raw; e.unique += y.unique; e.localUnique += y.localUnique;
      e.deviceLocalUnique += y.deviceLocalUnique; e.lastScan = h.__scans;
      h[y.k] = e;
    });
    return h;
  }

  function provenZero(e) { return e && e.runs >= PROVEN_ZERO_RUNS && e.deviceLocalUnique === 0; }

  /* One slot for the best proven term, then untried terms (exploration), then best devices-per-run; proven-zero terms rest for a few scans. */
  function pickDiscoveryTerms(history, pool, max) {
    var h = history || {}, scans = h.__scans || 0, picks = [];
    var rows = pool.map(function (k, i) {
      var e = h[k];
      return { k: k, i: i, runs: e ? e.runs : 0, score: e && e.runs ? e.deviceLocalUnique / e.runs : Infinity,
               resting: !!(e && provenZero(e) && scans - e.lastScan < REVISIT_AFTER_SCANS) };
    });
    rows = rows.filter(function (r) { return !r.resting; });
    rows.sort(function (a, b) { return (b.score - a.score) || (a.runs - b.runs) || (a.i - b.i); });
    // Reserve the first slot for the best term that has actually produced local devices, so exploration never crowds out what works.
    var proven = rows.filter(function (r) { return r.runs > 0 && r.score > 0 && r.score !== Infinity; });
    proven.sort(function (a, b) { return (b.score - a.score) || (a.i - b.i); });
    var best = max >= 2 && proven.length ? proven[0] : null;
    if (best) { picks.push(best.k); rows = rows.filter(function (r) { return r !== best; }); max -= 1; }
    rows.slice(0, Math.max(0, max)).forEach(function (r) { picks.push(r.k); });
    return picks;
  }

  function summarizeHistory(history) {
    var h = history || {}, rows = [];
    Object.keys(h).forEach(function (k) {
      if (k === "__scans") return;
      var e = h[k];
      rows.push({ k: k, runs: e.runs, raw: e.raw, localUnique: e.localUnique, deviceLocalUnique: e.deviceLocalUnique,
                  perRun: e.runs ? Math.round(e.deviceLocalUnique / e.runs * 10) / 10 : 0,
                  costUsd: estimateCostUsd(e.raw, e.runs), provenZero: !!provenZero(e) });
    });
    rows.sort(function (a, b) { return b.perRun - a.perRun || a.k.localeCompare(b.k); });
    return rows;
  }

  return { estimateCostUsd: estimateCostUsd, computeYield: computeYield, recordScan: recordScan,
           pickDiscoveryTerms: pickDiscoveryTerms, summarizeHistory: summarizeHistory,
           PRICE_PER_ITEM_USD: PRICE_PER_ITEM_USD, PRICE_PER_RUN_USD: PRICE_PER_RUN_USD };
});
