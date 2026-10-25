/* FlipRadar navigation: history entries for listing details, scroll anchoring, state that survives tab discards.
 * Dependencies are injected so the logic is testable without a browser.
 * Browser: window.FRNav. Node: require("./nav.js").
 *
 * Model
 *  - Opening a listing pushes ONE history entry (#/l/<id>), so the Android system Back gesture returns to the list.
 *  - Before opening, the list position is captured as an ANCHOR (first visible card id + its offset) plus raw scrollY.
 *  - The snapshot (tab, filters, sort, anchor) is kept in sessionStorage. It survives reloads and tab discards
 *    (for example after returning from the Facebook app) and disappears when the tab session ends.
 *  - Re-rendering the list keeps the anchor card at the same screen offset.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.FRNav = factory();
})(typeof self !== "undefined" ? self : this, function () {
  var KEY = "fr_nav_v1", TTL_MS = 6 * 3600 * 1000, VERSION = 1;

  function parseHash(h) {
    var m = /^#\/l\/([^/?#]+)$/.exec(String(h || ""));
    if (!m) return null;
    try { return decodeURIComponent(m[1]); } catch (e) { return null; }
  }

  function createNav(env) {
    var win = env.window, doc = env.document, hist = env.history, store = env.storage;
    var now = env.now || Date.now, raf = env.raf || function (f) { f(); };
    var timer = env.setTimeout || setTimeout, clear = env.clearTimeout || clearTimeout;
    var snap = null, pending = null, debounceId = null, skipPops = 0;

    function scrollY() { return win.scrollY || (doc.documentElement && doc.documentElement.scrollTop) || 0; }
    function cards() { return Array.prototype.slice.call(doc.querySelectorAll('[data-a="open"]')); }
    function findCard(id) { var all = cards(); for (var i = 0; i < all.length; i++) if (String(all[i].dataset.i) === String(id)) return all[i]; return null; }
    function visibleAnchor() {
      var all = cards();
      for (var i = 0; i < all.length; i++) { var r = all[i].getBoundingClientRect(); if (r.bottom > 0) return { id: all[i].dataset.i, offset: r.top }; }
      return null;
    }

    function capture(app) {
      var a = visibleAnchor();
      return { v: VERSION, t: app.t, d: app.d || 0, q: app.q || "", max: app.max || "", cat: app.cat || "", so: app.so || "",
               y: Math.round(scrollY()), a: a ? String(a.id) : null, o: a ? Math.round(a.offset) : 0, ts: now() };
    }
    function persist(s) { snap = s; try { store.setItem(KEY, JSON.stringify(s)); } catch (e) { /* private mode or quota: keep in memory only */ } return s; }
    function load() {
      try {
        var s = JSON.parse(store.getItem(KEY));
        if (!s || s.v !== VERSION || typeof s.ts !== "number" || now() - s.ts > TTL_MS) return null;
        return s;
      } catch (e) { return null; }
    }
    function current() { return snap || load(); }

    // Put the anchor card back at its remembered screen offset; fall back to the raw scroll position.
    // Thumbnails and banners can change card heights after the first paint, so the alignment is repeated for a few frames.
    function restoreScroll(s) {
      if (!s) return "none";
      var attempt = 0;
      function pass() {
        var el = s.a ? findCard(s.a) : null;
        if (el) win.scrollTo(0, Math.max(0, scrollY() + el.getBoundingClientRect().top - (s.o || 0)));
        else win.scrollTo(0, s.y || 0);
        if (++attempt < 3) raf(pass);
      }
      raf(function () { raf(pass); });
      return "scheduled";
    }

    // Run a re-render and keep the card the user was looking at in the same place.
    function keepAnchor(fn) {
      var a = visibleAnchor();
      fn();
      if (!a) return;
      var el = findCard(a.id);
      if (el) { var delta = el.getBoundingClientRect().top - a.offset; if (Math.abs(delta) > 1) win.scrollTo(0, Math.max(0, scrollY() + delta)); }
    }

    function openDetail(app, id) {
      persist(capture(app));
      try { hist.pushState({ fr: 1, v: "detail", id: String(id) }, "", "#/l/" + encodeURIComponent(String(id))); } catch (e) { /* file:// or sandbox */ }
    }
    function hasDetailEntry() { return !!(hist.state && hist.state.v === "detail"); }
    // The caller renders the list immediately, then pops the history entry quietly: the resulting popstate is ignored once.
    function skipNextPop() { skipPops++; }
    function back() { if (hasDetailEntry()) { hist.back(); return true; } return false; }
    function leaveDetail() {
      if (hist.state && hist.state.v === "detail") { try { hist.replaceState({ fr: 1, v: "list" }, "", win.location.pathname + (win.location.search || "")); } catch (e) {} }
    }

    function onPop(cb) {
      win.addEventListener("popstate", function (e) {
        if (skipPops > 0) { skipPops--; return; }
        var st = e.state || {};
        var id = st.v === "detail" ? st.id : parseHash(win.location.hash);
        cb({ detailId: id || null, snapshot: current() });
      });
    }

    function trackScroll(getApp) {
      function save() { var app = getApp(); if (!app.d) persist(capture(app)); }
      win.addEventListener("scroll", function () { clear(debounceId); debounceId = timer(save, 150); }, { passive: true });
      win.addEventListener("pagehide", save);
      doc.addEventListener("visibilitychange", function () { if (doc.hidden) save(); else restoreIfReset(getApp); });
      win.addEventListener("pageshow", function (e) { if (e && e.persisted) restoreIfReset(getApp); });
    }
    // Returning from another app can leave the page at the top; restore only if that clearly happened.
    function restoreIfReset(getApp) {
      var app = getApp ? getApp() : { d: 0 }, s = current();
      if (app.d || !s || s.d || scrollY() > 10 || (s.y || 0) < 200 || s.t !== app.t) return false;
      restoreScroll(s); return true;
    }

    // Boot: returns the snapshot to apply (or null) and the listing id from the URL hash, if any.
    function boot() {
      var s = load(), id = parseHash(win.location.hash);
      if (s) snap = s;
      pending = s && !id ? s : (s && id ? s : null);
      return { snapshot: s, detailId: id };
    }
    function takePendingRestore() { var p = pending; pending = null; return p; }

    return { capture: capture, persist: persist, load: load, current: current, restoreScroll: restoreScroll, keepAnchor: keepAnchor,
             openDetail: openDetail, back: back, hasDetailEntry: hasDetailEntry, skipNextPop: skipNextPop, leaveDetail: leaveDetail, onPop: onPop, trackScroll: trackScroll,
             restoreIfReset: restoreIfReset, boot: boot, takePendingRestore: takePendingRestore, KEY: KEY };
  }
  return { createNav: createNav, parseHash: parseHash, KEY: KEY, TTL_MS: TTL_MS };
});
