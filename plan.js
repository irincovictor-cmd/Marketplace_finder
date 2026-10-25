/* FlipRadar scan planning (pure; no DOM, no network).
 * - buildScanPlan: which paid searches a scan will run, bounded and costed BEFORE anything is charged.
 * - buildCategoryUrl: experimental Marketplace category URL builder (never used by the normal scanner).
 * - learnLocationIds: remembers Facebook location ids seen in scan results (free; no extra request).
 * Browser: window.FRPlan. Node: require("./plan.js").
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./discovery.js"));
  else root.FRPlan = factory(root.FRDiscovery);
})(typeof self !== "undefined" ? self : this, function (D) {
  var BRAND_TERMS = ["iphone", "samsung", "redmi"];
  var BROAD_POOL = ["phone", "cellphone", "android", "smartphone", "128gb", "256gb", "5g"];
  var ITEMS_PER_SEARCH = 48;           // one page returned 48 listings in every logged scan (observed, not guaranteed)
  var HARD_MAX_SEARCHES = 12;          // absolute ceiling regardless of settings

  function clampMax(n, fallback) {
    n = Math.floor(Number(n));
    if (!Number.isFinite(n) || n < 1) n = fallback;
    return Math.min(n, HARD_MAX_SEARCHES);
  }

  /* opts: { category, kw, allBrand, includeBrands, history, maxSearches, discMax }
   * kw is the legacy keyword map (e.g. {Phones:[...], Laptops:[...]}). category "" means every category. */
  function buildScanPlan(opts) {
    var o = opts || {}, kw = o.kw || {}, max = clampMax(o.maxSearches, 6), terms = [], trimmed = [];
    var phones = o.category === "Phones" && o.allBrand !== false;
    if (phones) {
      var broad = D.pickDiscoveryTerms(o.history || {}, BROAD_POOL, clampMax(o.discMax, 3));
      broad.forEach(function (k) { terms.push({ k: k, disc: true, source: "broad" }); });
      if (o.includeBrands !== false) BRAND_TERMS.forEach(function (k) {
        if (!terms.some(function (t) { return t.k === k; })) terms.push({ k: k, disc: true, source: "brand" });
      });
    } else {
      var cats = o.category ? [o.category] : Object.keys(kw), seen = {};
      cats.forEach(function (c) { (kw[c] || []).forEach(function (k) { if (!seen[k]) { seen[k] = 1; terms.push({ k: k, disc: false, source: "category-default" }); } }); });
    }
    if (terms.length > max) { trimmed = terms.slice(max).map(function (t) { return t.k; }); terms = terms.slice(0, max); }
    var requests = terms.length, items = requests * ITEMS_PER_SEARCH;
    return { category: o.category || "All", terms: terms, requests: requests, maxSearches: max, trimmed: trimmed,
             estimatedItems: items, estimatedCostUsd: D.estimateCostUsd(items, requests),
             note: "Cost is an ESTIMATE from the actor price list (about " + ITEMS_PER_SEARCH + " listings per search); it is not a billing limit." };
  }

  function planSummary(plan) {
    var names = plan.terms.map(function (t) { return t.k; }).join(", ");
    return plan.requests + " paid search" + (plan.requests === 1 ? "" : "es") + " (" + names + ") · about $" + plan.estimatedCostUsd.toFixed(2) + " estimated"
      + (plan.trimmed.length ? " · limit reached, skipped: " + plan.trimmed.join(", ") : "");
  }

  /* ---- Experimental category URL (needs owner approval to run; see ISSUES.md FR-017) ---- */
  var ID_RX = /^[A-Za-z0-9_.-]{2,60}$/, SLUG_RX = /^[a-z0-9-]{2,40}$/;
  function buildCategoryUrl(o) {
    o = o || {};
    if (!ID_RX.test(String(o.locationId || "")) || /\.\./.test(o.locationId)) throw new Error("Invalid Facebook location id");
    var cat = String(o.category || "electronics");
    if (!SLUG_RX.test(cat)) throw new Error("Invalid category slug");
    var q = [];
    if (o.sortBy) { if (!/^[a-z_]{3,40}$/.test(o.sortBy)) throw new Error("Invalid sort"); q.push("sortBy=" + o.sortBy); }
    if (Number.isFinite(Number(o.radiusKm)) && Number(o.radiusKm) > 0) q.push("radius_in_km=" + Math.round(Number(o.radiusKm)));
    if (o.includeCoords && Number.isFinite(Number(o.lat)) && Number.isFinite(Number(o.lon)))
      q.push("latitude=" + Number(o.lat).toFixed(5), "longitude=" + Number(o.lon).toFixed(5));   // parameter names are UNVERIFIED
    if (o.days && /^(1|7|30)$/.test(String(o.days))) q.push("daysSinceListed=" + o.days);
    return "https://www.facebook.com/marketplace/" + o.locationId + "/" + cat + (q.length ? "?" + q.join("&") : "");
  }

  /* existing: {townKey: {vanity, cityPageId, n}}; listings: cleaned listings with lv (location_vanity_or_id) and cp (city_page.id). */
  function learnLocationIds(existing, listings, isLocal) {
    var out = JSON.parse(JSON.stringify(existing || {}));
    (listings || []).forEach(function (l) {
      if (!isLocal(l) || (!l.lv && !l.cp)) return;
      var key = String(l.c || "").trim().toLowerCase(); if (!key) return;
      var e = out[key] || { vanity: "", cityPageId: "", n: 0, counts: {} };
      var tag = (l.lv || "") + "|" + (l.cp || ""); e.counts[tag] = (e.counts[tag] || 0) + 1; e.n++;
      var best = Object.keys(e.counts).sort(function (a, b) { return e.counts[b] - e.counts[a]; })[0].split("|");
      e.vanity = best[0]; e.cityPageId = best[1]; out[key] = e;
    });
    return out;
  }

  return { buildScanPlan: buildScanPlan, planSummary: planSummary, buildCategoryUrl: buildCategoryUrl, learnLocationIds: learnLocationIds,
           BRAND_TERMS: BRAND_TERMS, BROAD_POOL: BROAD_POOL, ITEMS_PER_SEARCH: ITEMS_PER_SEARCH, HARD_MAX_SEARCHES: HARD_MAX_SEARCHES };
});
