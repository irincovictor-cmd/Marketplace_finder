# FlipRadar Issue Tracker

Last reviewed: October 23, 2026 — Sprint 1 implementation

This log separates **Open**, **Resolved (needs regression testing)**, and **Investigating** items. Screenshots and observed behavior are from manual Android/GitHub Pages testing. Avoid exposing Apify tokens in reports.

## Open — priority order

### FR-001 — All-category scan is too slow (High; optimization implemented, needs phone test)
- **Observed:** Search UI showed `Searching "laptop" (4 of 13)` during an All-category scan; user reported long wait.
- **Cause confirmed in code:** `refresh()` loops over 13 keyword requests with `await fetch(...)` inside a sequential `for` loop. Each actor run can take several seconds; total time accumulates.
- **Impact:** Slow response, repeated Apify credit consumption, little progress feedback; search screen continues showing previously saved results during the scan.
- **Suggested approach:** Start with an explicit single-category/default scan; offer optional All scan with an estimated request count; show per-keyword progress and elapsed time; add cancellation and partial-result handling. Investigate controlled concurrency (e.g. 2 concurrent actor runs), actor batching if supported, and deduplication/caching. Compare runtime and Apify usage before/after; do not assume concurrency reduces billable work.
- **Sprint 1 implementation:** Up to 2 concurrent keyword requests, progress updates with elapsed time and failure counts, and incremental per-keyword persistence. No scan cancellation, caching, or timing benchmark yet. Two concurrent requests can increase simultaneous Apify usage; total cost is not guaranteed to decrease.
- **Status:** Implemented; **needs live timing/credit regression testing**.

### FR-002 — Loaded listings vs visible results unclear (High; breakdown implemented, needs phone test)
- **Observed:** 99 clean listings loaded, but only 2 displayed with Bohol-only enabled and a ₱50,000 price cap. Switching category to All still showed 2.
- **Possible causes:** Bohol filter, category, budget, keyword, source location, and/or duplicate records. Exact counts per filter not yet measured.
- **Suggested approach:** Show a transparent funnel: fetched → cleaned → under budget → selected category → Bohol matches; include counts and explanatory empty states. Test with Bohol-only toggled off without spending API credits.
- **Sprint 1 implementation:** Search now shows loaded → keyword → budget → category → location counts. This reports client-side filtering, not actor-side rejections or raw scraped counts.
- **Status:** Breakdown implemented; **root cause of 99 → 2 still investigating**.

### FR-003 — Search coverage may be too narrow (Medium)
- **Current configuration:** Tagbilaran center (9.6477, 123.8547), `radiusKm: 40`, `maxPagesPerUrl: 1`, `daysSinceListed: "7"`, response `limit=60` per keyword.
- **Observed:** User reports limited coverage. Prior actor logs showed a NYC Marketplace URL despite Bohol coordinates.
- **Suggested approach:** Verify how the actor handles location before changing it; expose safe radius, age, and depth settings, with cost warnings and usage comparisons.
- **Status:** Investigating; **location behavior intentionally deferred at user's request**.

### FR-004 — Bohol location recognition incomplete (Medium)
- **Cause in code:** `BO` fallback list includes only Tagbilaran, Baclayon, Jagna, Tubigon, Panglao, Dauis, and Duero. `clean()` also checks the state text for "Bohol".
- **Impact:** Valid Bohol listings may be excluded if state/city metadata is incomplete or formatted differently.
- **Suggested approach:** Improve normalized location matching and inspect actual Apify records; don't classify unknown locations as confirmed Bohol.
- **Status:** Open.

### FR-005 — Deal scores can be misleading (Medium)
- **Observed:** Two Bohol phone results in screenshot both labeled "Pricey"; not independently verified against sold prices.
- **Cause in code:** Estimated value uses asking-price quartiles from loosely grouped listing titles, sometimes with few comparisons; storage, variant and condition may differ.
- **Suggested approach:** Display sample size/confidence, improve model/variant matching, distinguish asking prices from actual resale values, and permit manual resale estimates.
- **Status:** Open.

### FR-006 — Partial scan failures discard new results (Medium; fixed, needs phone test)
- **Cause in code:** `refresh()` collects results across keywords but only persists `all` after the entire loop. A later HTTP error leaves earlier successful keyword results unapplied.
- **Suggested approach:** Save successful batches incrementally; show failures per keyword and a retry button.
- **Sprint 1 implementation:** Each successful keyword batch replaces that keyword's saved listings immediately and persists locally. Errors are shown per keyword at completion, and successful batches remain saved.
- **Status:** Implemented; **needs live partial-failure testing**.

### FR-007 — Client-side token and external listing data hardening (Medium)
- **Current design:** Apify token stored in browser localStorage and included in the request URL; listing content and URLs are interpolated into HTML.
- **Risks:** URL logging/exposure and untrusted markup/URLs. No compromise reported.
- **Suggested approach:** Consider Authorization header or backend proxy, escape untrusted listing text, validate outbound URLs, and avoid publishing credentials.
- **Status:** Open.

## Resolved — verify after deployments

### FR-008 — Apify HTTP 400 validation error
- **Observed:** `Input is not valid: Field input.daysSinceListed must be string.`
- **Fix:** Changed `daysSinceListed: 7` to `daysSinceListed: "7"`; improved error reporting to display Apify response details.
- **Status:** Resolved for this validation error; recheck if actor schema changes.

### FR-009 — Facebook app redirect loses listing/search target
- **Observed:** Forced `intent://` opened Facebook Marketplace search screen without the expected item.
- **Fix:** Removed forced app deep link and retained normal HTTPS Marketplace listing/search URLs.
- **Status:** User reported working.

### FR-010 — All category rejected by scan validation
- **Observed:** "Pick a category and enter a max price first" even with All selected.
- **Fix:** All now expands to 13 keywords and asks for confirmation due to possible Apify costs.
- **Status:** Fixed; however introduced/exposed FR-001's slow 13-search workflow.

### FR-011 — Phone specs lookup requested
- **Fix:** Added a free GSMArena-restricted web search link for phone listings and basic title cleaning, with a variant-check reminder.
- **Status:** Implemented; real-world matching accuracy still needs testing.

## Testing notes
- GitHub Pages hosts a static front end; scans happen only on user action.
- Re-test on the phone after each deployment and hard refresh.
- Record: category, keyword, budget, Bohol toggle, number fetched/cleaned/shown, elapsed time, Apify runs/credits, and any error text.
- Avoid running a 13-keyword scan solely for debugging if a single-keyword reproduction will suffice.

## October 23 — location filtering and deal-estimate follow-up

- **Root cause (code):** Radius previously went only to the Apify actor; the displayed results filtered by province but **not radius**. Nearest-first sorting was optional and used a small town lookup; unrecognized towns had unknown distances. Selected town and actor scan center could differ.
- **Implemented:** Enforce approximate town-center distance <= selected radius for displayed search results, use selected town for future Apify scan center, and include the radius stage in the filter breakdown. Unknown towns are excluded rather than presented as nearby.
- **Caveats:** Straight-line town-center distances are approximations; unknown/ambiguous geocoding may exclude genuine nearby results. Province All means all provinces within radius, not all of the Philippines. Apify may still ignore coordinates.
- **Pricing root cause:** `sc()` compared listing price with median *asking prices*, using coarse first-two-word grouping; a cheap listing could be scored highly despite model, condition, or authenticity differences.
- **Implemented interim safeguard:** A listing needs at least five similar-title comparables to receive a positive deal label; otherwise **Unverified**. Detail screen says asking-price spread, not guaranteed profit. The existing manual profit calculator remains available.
- **Open:** Verify exact device variants and conditions, actual sold prices, full Bohol municipality geocoding, mobile runtime, and external API options. **No AI API was added** because pricing data and secure backend infrastructure are not yet available.
- **Regression test:** Tagbilaran / 40 km / All province / Nearest; confirm no displayed listing exceeds 40 km, unknown towns are excluded, and order increases by distance. Change province and reference town without paying for a new scan. Check saved and detail links and sample/live labels.

## Sprint 1 verification checklist (pending)

- [ ] Single-category scan succeeds and preserves Facebook and GSMArena links.
- [ ] All-category scan shows no more than two active requests and finishes faster than prior sequential behavior; record elapsed time and Apify usage.
- [ ] Progress increments until all 13 keywords complete; switching tabs does not lose results.
- [ ] Simulate one failed keyword and verify successful keyword results remain saved.
- [ ] Confirm breakdown changes when toggling Bohol only and changing category without triggering Apify.
- [ ] Confirm search location, radius, listing age, and depth are unchanged.
- [ ] Check duplicate listings and localStorage size after repeated scans.

## October 23 follow-up: loading and empty search results

- **Observed:** On PC Parts with ₱50,000 budget and Bohol-only enabled, screen showed 0 results while displaying old sequential message `Searching "monitor" (3 of 3)`.
- **Interpretation:** High budget does not override category and location filters. Root cause of 0 results remains unverified until breakdown counts are inspected. Old message suggests stale GitHub Pages/browser cache or an in-progress scan from a previous deployment.
- **Implemented:** Animated spinner, progress bar, completed/total counter, and filter-stage-specific empty-state messages. No change to Bohol center, radius, or actor search inputs.
- **Test:** Refresh page after deployment, confirm spinner and `Scan X/Y` message, compare counts with Bohol-only on/off, and avoid repeated paid scans while diagnosing.

## Sprint 1 continuation: per-keyword diagnostics (October 23, 2026)

- **Implemented:** The Search screen now displays per-keyword raw Apify count, count surviving client-side cleaning, and count recognized as Bohol, plus a summary and failures. Diagnostics are saved locally after a completed scan and can be inspected without paying for another request.
- **Purpose:** Distinguish a zero-result scan from cleaning exclusions and Bohol-only exclusions. These counts are based on API items returned (up to the request limit), not Facebook's full inventory.
- **Status:** Code committed; JavaScript syntax checked; Android live test pending.
- **Caution:** Do not change location assumptions until the actor's NYC-versus-Bohol behavior is investigated separately.

## October 23: province and radius controls

- **Implemented:** Search screen province filter (All, Bohol, Cebu, Negros Oriental, Leyte) and radius options (20, 40, 60, 80, 100, 150 km), saved in localStorage.
- **Scanning:** Province-specific approximate center coordinates and chosen radius are sent to Apify on the next manual scan. Selecting All filters across saved locations but new scans use the Bohol center as a fallback; All does **not** mean nationwide scanning.
- **Filtering:** Province filtering of existing saved listings is immediate and free. New Apify records store reverse-geocoded state; older saved records with missing state may be unknown or only matched through a limited city fallback.
- **Unverified:** The actor previously logged NYC despite Bohol coordinates. Radius/location controls are requested inputs, **not confirmed geographic enforcement**. Validate real run logs before claiming coverage.
- **Regression checks:** Confirm changing province does not launch a paid scan; radius changes affect next scan; changing tabs preserves selections; scan diagnostics and saved listings remain usable.

## October 23: nearest-first sorting

- Added **Nearest (approx.)** sort and a user-selectable reference town (default Tagbilaran), with approximate straight-line distances using a small town-center lookup. Unknown town names sort last; no precise device GPS is accessed.
- Sorting works on already saved listings, does not spend Apify credits, and does not change scan radius or center. Reference town persists locally.
- **Known limitation:** Only a limited list of towns is recognized; coordinates are approximate town centers, not seller addresses, and distances are not driving distances. Future enhancement: user-selected barangay/location or consent-based GPS, plus broader geocoding coverage.
- **Testing:** Select Nearest and change reference town, confirm ordering and unknown-town behavior, and verify other sort options remain functional.

### FR-Location-Inspector — Rejected listings diagnostics (October 23, 2026)
- Screenshot: 159 saved listings → 149 under budget → 95 category → 1 province → 1 within 40 km. This indicates province interpretation is the largest visible exclusion stage, not necessarily that only one nearby item exists.
- Added expandable **Rejected listings / filter inspector** on Search. It shows each excluded saved listing, price, raw city/state, interpreted province, approximate distance, all failed filter reasons, and original Marketplace URL when present. Includes rejection-reason selector and limits display to first 80 per selection to avoid overloading mobile browsers.
- The inspector evaluates **saved cleaned listings only**. Records discarded before storage by `clean()` cannot be reconstructed from localStorage. No additional Apify calls are required to inspect saved listings.
- Follow-up: Review raw city/state of excluded listings on device; expand recognized municipality lookup and investigate Apify geocoding based on actual examples. Check inspector interactions and persistence in Android browser.


## Deferred idea: AI Listing Inspector

Backlog only; not deployed. Future photo-based device identification, listing inconsistency checks, specification verification, confidence reporting, and seller questions. Secure serverless API proxy and cost limits required. Blocked on trustworthy search/location and model data.

## Current focus: search accuracy

- Last observed: 159 saved → 149 budget → 95 category → 1 province → 1 within 40 km; separate last-scan diagnostic: 144 raw → 89 cleaned → 1 Bohol-recognized. These are different populations.
- Investigate rejected records' raw city/state, interpreted province, and unknown-town cases before changing location logic.
- Verify actor geotargeting with actual logs and Marketplace listing locations. Previous runs showed a NYC search URL despite Philippine coordinates.
- Test strict radius and nearest ordering with known towns. Expand Bohol town lookup only after collecting examples.
- Inspector currently covers saved cleaned listings, not items discarded by initial cleaning; consider bounded diagnostic capture later.
- Avoid new broad scans until existing data is inspected.

## Local diagnostic logging (October 23, 2026)

- Added **Logs · scan history & errors** expandable panel to Search. Persists at most 100 events in browser localStorage key `fr_diagnostic_log_v1`.
- Events: scan start with keywords and location settings, per-keyword raw/cleaned/Bohol counts and up to 12 cleaned location samples, keyword errors, completed scan with a bounded filter audit. **Record current filters** captures counts and up to 40 excluded cleaned listings, with title, price, raw city/state, interpreted province, approximate distance, and exclusion reasons.
- **Export JSON**, **Copy logs**, and **Clear logs** controls. No additional Apify scan required for filter audits.
- Token redaction attempts to remove Apify token strings; nevertheless, exported logs can contain listing titles, city/state, prices, and URLs if future events add them. Review before sharing. Stored locally, not automatically sent to GitHub or ChatGPT.
- Limitations: logging begins only after this version is loaded, existing prior searches are not retrospectively recorded; initial raw records rejected by `clean()` are not stored; localStorage can be erased by browser cleanup. Browser runtime and export behavior need phone testing.
