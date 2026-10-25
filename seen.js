/* FlipRadar discovery registry: when did FlipRadar FIRST see each listing?
 * Pure functions over a plain JSON state, so it can be persisted in localStorage and tested in Node.
 * Browser: window.FRSeen. Node: require("./seen.js").
 *
 * Three different times are kept apart on purpose:
 *   - Marketplace creation time  -> listing.ct (epoch seconds), supplied by Facebook; never touched here.
 *   - firstSeenAt (f) / lastSeenAt (l) -> when FlipRadar first / most recently received the listing in a scan.
 *   - viewedAt (v) -> when the user opened it inside FlipRadar.
 *
 * "NEW" means: first discovered by the most recent scan that completed at least one search.
 * Listings that existed before this feature (migrated) have s = 0 and are never NEW.
 * State shape: { v:1, scans:N, migratedAt:epochSeconds|null, items:{ id: {f,l,s,v?} } }
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.FRSeen = factory();
})(typeof self !== "undefined" ? self : this, function () {
  var VERSION = 1, DEFAULT_CAP = 3000;

  function create() { return { v: VERSION, scans: 0, migratedAt: null, items: {} }; }
  function valid(state) { return !!state && state.v === VERSION && state.items && typeof state.items === "object" && Number.isFinite(state.scans); }
  function clone(state) { return JSON.parse(JSON.stringify(state)); }
  function normId(id) { if (id === null || id === undefined) return ""; var s = String(id).trim(); return s && s !== "undefined" && s !== "null" ? s : ""; }

  /* Load whatever was persisted; a missing or damaged value becomes an empty registry. */
  function revive(raw) { return valid(raw) ? clone(raw) : create(); }

  /* One-time migration: listings already stored by older versions become "known" (s = 0) so they are never NEW. */
  function migrate(state, listings, nowSec) {
    var st = revive(state);
    if (st.migratedAt) return st;
    (listings || []).forEach(function (l) {
      var id = normId(l && l.id); if (!id || st.items[id]) return;
      st.items[id] = { f: nowSec, l: nowSec, s: 0 };
    });
    st.migratedAt = nowSec;
    return st;
  }

  /* A scan number is reserved when the scan starts but only committed once a search succeeds,
   * so a scan that fails completely changes nothing (existing NEW badges stay). */
  function beginScan(state) { return { no: state.scans + 1, committed: false }; }
  function commitScan(state, ctx) {
    if (ctx.committed) return state;
    var st = clone(state); st.scans = ctx.no; ctx.committed = true; return st;
  }

  /* Register the listings returned by one successful search. Returns {state, newIds, knownIds}.
   * The same id arriving from several keywords is counted once: only the first sighting can be "new". */
  function register(state, ctx, listings, nowSec) {
    var st = ctx.committed ? clone(state) : commitScan(state, ctx), newIds = [], knownIds = [], seenNow = {};
    (listings || []).forEach(function (l) {
      var id = normId(l && l.id); if (!id || seenNow[id]) return;
      seenNow[id] = true;
      var it = st.items[id];
      if (!it) { st.items[id] = { f: nowSec, l: nowSec, s: ctx.no }; newIds.push(id); }
      else { it.l = nowSec; knownIds.push(id); }
    });
    return { state: st, newIds: newIds, knownIds: knownIds };
  }

  function isNew(state, id) { var it = state.items[normId(id)]; return !!it && it.s > 0 && it.s === state.scans; }
  function firstSeen(state, id) { var it = state.items[normId(id)]; return it ? it.f : null; }
  function lastSeen(state, id) { var it = state.items[normId(id)]; return it ? it.l : null; }
  function isViewed(state, id) { var it = state.items[normId(id)]; return !!it && !!it.v; }
  function markViewed(state, id, nowSec) {
    id = normId(id); if (!id) return state;
    var st = clone(state), it = st.items[id] || (st.items[id] = { f: nowSec, l: nowSec, s: 0 });
    if (!it.v) it.v = nowSec;
    return st;
  }

  /* Keep storage bounded. Ids in keepIds (listings still displayed or saved) are never dropped; otherwise the
   * least recently seen entries go first. */
  function prune(state, keepIds, cap) {
    var st = clone(state), max = cap || DEFAULT_CAP, keep = keepIds || new Set(), ids = Object.keys(st.items);
    if (ids.length <= max) return st;
    var removable = ids.filter(function (id) { return !keep.has(id); })
      .sort(function (a, b) { return (st.items[a].l - st.items[b].l) || (a < b ? -1 : 1); });
    var drop = ids.length - max;
    for (var i = 0; i < removable.length && i < drop; i++) delete st.items[removable[i]];
    return st;
  }

  /* "New discoveries first": NEW listings on top (freshest Marketplace listing first), then everything else by
   * Marketplace listing age. ageH(l) returns the listing's age in hours (smaller = newer). */
  function compareNewFirst(state, ageH) {
    return function (a, b) {
      var na = isNew(state, a.id) ? 0 : 1, nb = isNew(state, b.id) ? 0 : 1;
      if (na !== nb) return na - nb;
      var d = ageH(a) - ageH(b);
      if (d) return d;
      var ida = String(a.id), idb = String(b.id); return ida < idb ? -1 : ida > idb ? 1 : 0;
    };
  }

  return { create: create, revive: revive, migrate: migrate, beginScan: beginScan, commitScan: commitScan, register: register,
           isNew: isNew, firstSeen: firstSeen, lastSeen: lastSeen, isViewed: isViewed, markViewed: markViewed,
           prune: prune, compareNewFirst: compareNewFirst, normId: normId, DEFAULT_CAP: DEFAULT_CAP };
});
