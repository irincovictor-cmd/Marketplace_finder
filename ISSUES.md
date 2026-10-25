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

## PSGC geography upgrade — first phase (October 23, 2026)

- Source: user-provided PSA **PSGC 3Q 2026 Publication Datafile.xlsx**, worksheet `PSGC`, dated 30 September 2026. PSA attribution required by source metadata.
- Extracted the 48 Bohol municipality/city names from the official data and embedded an offline name list in `index.html`. No PSA API key required.
- Normalizes `City of Tagbilaran` / `Tagbilaran City` / `Tagbilaran` for municipality lookup and existing coordinates. Recognizes Calape and Trinidad as Bohol municipalities, though distance remains unknown until separately verified coordinates are supplied.
- Explicit ambiguity guard for shared municipality names (e.g. Valencia, Carmen, Danao, Alicia, Anda, Buenavista, Pilar, San Isidro, San Miguel). Such names require explicit Bohol province evidence rather than being blindly assigned.
- Some common Cebu aliases now recognized; full nationwide/province coordinate mapping and ambiguous town resolution remain outstanding.
- **Important:** PSGC administrative names are not geocoordinates. No invented coordinates added. Radius filtering still excludes municipalities without verified coordinates. Need coordinate source, then test against the user's 167 cached listings and latest rejected-listing logs.
- Source attribution: Philippine Statistics Authority (PSA), Philippine Standard Geographic Code (PSGC), 3rd Quarter 2026.


### FR-PRICING-01 — Conflicting valuation methods (Fixed in code; phone test pending)
- **Observed:** Redmi Note 15 Pro 512GB details showed 6 broad comparable listings and an estimated ₱4,800–₱11,990 range while its new model-specific label said `Insufficient comps` and score 0/100.
- **Root cause:** Detail used legacy `ST(l)`/`evidence(l)` based on broad cleaner statistics; Home/Search used a separate `resaleEvidence()` matcher.
- **Fix:** Detail, Search, Home and calculator prefills now share the model-specific `profitPreview()` evidence path. Require at least 3 other matching phone model/storage/network-label asking prices. Insufficient evidence yields no valuation or automatic score, not a misleading 0/100.
- **Method:** illustrative resale = median matching *asking* price × 0.85; illustrative net = resale − purchase price − ₱500 assumed costs. These assumptions do not imply a verified resale market.
- **Status:** Committed; JavaScript syntax validated; Android/GitHub Pages functional verification pending. No paid scan.
- **Follow-ups:** inspect model parser on real titles (including Pro/Pro+, 4G/5G and storage); deduplicate comparables, normalize source categories, account for condition/battery, validate actual resale prices, and calibrate confidence.


### FR-DISCOVERY-01 — One-click category discovery experiment (October 23, 2026)
- Added **Test category discovery (1 paid actor run)** on Search. Actor `curious_coder/facebook-marketplace`, URL `https://www.facebook.com/marketplace/tagbilaran/electronics/`, `maxPagesPerUrl=1`, API dataset response `limit=24`, no detail/media fetching, PH proxy, strict filtering.
- Test runs only after user confirmation and uses the token stored locally in the browser; no token is committed. It reports returned items, phone-like listings, detected brand labels, Bohol-recognized locations and sample titles; results are logged as `category_test_result` (or `category_test_error`). Existing `fr_live` and keyword scanner remain unchanged.
- Actor documentation supports category URLs but **the exact Tagbilaran slug and local category results are unverified**. Dataset response `limit=24` caps returned items, not necessarily actor-side billed work. Run can incur charges.
- **Status:** Code committed and JavaScript syntax checked. User must trigger one test from their browser. Review Logs and Apify actual run charges before choosing a discovery strategy.


### FR-DISCOVERY-01 — First category URL test result (October 23, 2026; Android)
- User-triggered test completed: **24 returned**, **1 phone-like** (heuristic), **0 Bohol-recognized**.
- Sample results were from California (Mill Valley, Concord, San Francisco, San Leandro, Milpitas, Sunnyvale, Castro Valley), despite targeting `https://www.facebook.com/marketplace/tagbilaran/electronics/` with PH proxy. This shows the requested URL did **not** yield local Bohol results in this test. Exact reason not yet established.
- Existing saved keyword scan remained at 3 searches and showed 5 results within the selected 60 km radius; category test did not overwrite saved listings.
- **Decision:** Do not switch production discovery to this category URL. Investigate actor-supported location inputs / canonical location identifiers / URL handling before any further paid test. Do not assume PH proxy alone enforces Philippine location.
- **Evidence:** User-provided Android screenshot of test summary (October 23, 2026). No billing amount confirmed.


### FR-DISCOVERY-01 — Category discovery test result (October 23, 2026)
- **Observed on Android:** 24 returned, 1 phone-like, **0 Bohol-recognized**. Sample results were from Mill Valley, Concord, San Francisco, San Leandro, Milpitas, Sunnyvale and Castro Valley, California.
- **Conclusion:** The experimental `/marketplace/tagbilaran/electronics/` URL with PH proxy and one page did **not** constrain results to Bohol. Do not replace the existing keyword scanner or treat the PH proxy as location enforcement.
- **Next investigation:** Verify actor's supported URL and location input schema and whether it accepts geographic search URLs, authenticated marketplace context, or latitude/longitude together with category browsing. Do not spend further credits without validating inputs; keep the test isolated from saved listings.
- **Status:** Test completed; geographic relevance failed. Source: user's screenshot of category test report.


### FR-DISCOVERY-02 — Claude location probe integrated (October 23, 2026)
- Applied Claude's proposal to replace the California-returning category URL with latitude/longitude/radius inputs and optional phone discovery terms. Added experimental strict filtering and phone-discovery toggles, both off by default.
- The probe can run `phone`, `android`, `256gb` or no keyword, with one page and a 24-item response cap. Its output logs locations, countries, brands, and Bohol recognition. It does not overwrite saved listings.
- Claude's reported actor-schema finding: latitude/longitude are ignored when `urls` is supplied. This finding still requires independent actor-schema verification before declaring root cause confirmed. The Tagbilaran URL fallback to California remains a hypothesis.
- A `maxTotalChargeUsd=0.10` request parameter is now sent; **enforcement and actual charges have not been verified**. Do not assume $0.10 is a guaranteed cap, or that output limits constrain billable work.
- Integration adjusted checkbox HTML and added confirmation before extra discovery searches. JavaScript syntax check passed. No paid test performed.
- **Next:** Verify actor input schema and billing semantics; run a single approved location probe, inspect raw country and city metadata, and check actual Apify charges before enabling broader discovery.


### FR-DISCOVERY-02 — First location-anchored Android probe result (October 23, 2026)
- User screenshot: 24 returned, 22 classified phone-like, **0 Bohol-recognized**, country labels `{"?":24}`.
- Samples: Cebu City (PH-07), Mandaue City (PH-07), Lapu-Lapu City (PH-07), Dumaguete City (NIR), and ambiguous Talisay (PH-07). No Bohol examples among the displayed samples.
- The coordinate-based probe is a geographic improvement over the earlier California category-URL result, but it does **not yet establish that the requested Bohol center/radius is honored**. Country field extraction is missing or mapped incorrectly.
- Phone-like heuristic incorrectly includes repair centers, chargers, and motorcycle phone holders; filter needs accessory/service exclusions and better classification.
- Next: review exported raw probe logs and actor schema, verify submitted center/radius and response geo fields, inspect all 24 locations, and compare against the chosen town and radius. Do not expand paid scans until geotargeting is validated.


### FR-DISCOVERY-03 — Evidence review of the 8-search Android scan and what changed (October 23, 2026, Claude)
**Verified from the exported log (`flipradar-logs-2026-10-23.json`) and the actor's published input schema**
- `radiusKm` is sent, but Facebook returns listings beyond it. In both the 40 km and 60 km scans most cleaned results were Cebu City, Mandaue, Lapu-Lapu and Dumaguete, about 73-74 km from Tagbilaran. The radius is a hint, not a hard filter. The actor documents `radiusKm` as always kilometres.
- Bohol supply per search was small and stable: across six earlier 3-search scans, iphone 0-1, samsung 0-1, redmi 2-3 Bohol-recognized of 48 raw. The default sort is newest first, so the 48 newest across a wide area are mostly Cebu.
- The actor's schema lists `sortBy` options `creation_time_descend`, `price_ascend`, `price_descend` and **`distance_ascend`**. FlipRadar always used newest first. Whether `distance_ascend` puts Bohol first is **untested**.
- `strictFiltering` ("exclude broad matches: outside location, similar items") exists. Two identical probes with it enabled still returned 0 Bohol of 24, so it has **not been shown to help** here.
- `maxPrice` exists server-side but is deliberately NOT sent: the comparable-price engine needs the higher-priced listings, including Cebu ones, to find comparables.
- Misclassification: `cg()` treated any title containing a brand as a Phone. The rejected samples show Samsung monitors, a Samsung refrigerator, tablets and watches passing the Phones category. Probe results also counted a repair centre and chargers as phones.
- Buying requests are common in Bisaya: "guba cellphone paliton" and "MO PALIT KO GUBA NGA IPHONE" are people wanting to BUY broken phones. "pm sa mupalit" means "message me if you want to buy" and is a selling cue.

**Scan time (282 s for 8 searches), inferred from log timestamps**
- Six of eight requests finished in roughly 8-12 s each, in line with the earlier 3-search scans (19-28 s total).
- `cellphone` and `android` both completed within one second of each other, about 249 s after the previous pair. Two independent requests stalling for the same period and finishing together points to the **page being suspended or throttled in the background** (the screenshot shows another app active). This is an inference, not proven. Not an Apify slowdown as far as the log shows.
- Concurrency is 2 workers. No change made to it.

**Cost: corrected assumptions**
- Actor price list (checked October 23, 2026): $0.50 per 1,000 basic listing items, $0.00005 per run start. Cost follows items returned, not number of searches. 8 runs x 48 items is about $0.19 **estimated**; the 3-search scan about $0.07. These are estimates, never billing. The new "Show Apify-reported usage" button reads `usageTotalUsd` from Apify's run records.
- The $0.10 `maxTotalChargeUsd` cap is a documented Apify run parameter for pay-per-event actors, but whether this actor honors it has **not** been verified.

**Implemented (mocked and unit tested; no live Apify run, no Android run)**
- `classify.js`: classifies a title as device / accessory / repair / wanted / review, plus kind (phone, tablet, wearable, laptop, console, other) and flags (defective, parts-only, swap, very-low-price). Accessories, repair ads and buying requests get the rejection reason "Not a device for sale" and stay visible in the rejected-listings inspector. Unclear titles ("Cellphone") stay in results with a visible warning.
- Category fix: monitors, fridges, tablets, watches and RAM sticks are no longer Phones.
- `discovery.js`: duplicate-aware per-keyword yield, persistent keyword history, adaptive discovery term choice (untried first, then best local devices per run, terms with zero local devices after 3 runs rest for 5 scans), cost estimate. Discovery terms per scan are capped at 3.
- Optional "Nearest-first sorting" toggle (default off) sends `distance_ascend`. The probe has a sort selector so it can be tested for about one cent before using it in scans.
- Scan report in the diagnostics: searches attempted/completed, raw/cleaned/unique/duplicates, location confidence (province stated / inferred from town name / other province / ambiguous / unknown), requested radius vs how many results fell beyond it and the farthest distance, listing types, per-keyword local yield, slowest request, seconds the page was hidden, estimated cost labelled as an estimate.
- Screen Wake Lock requested during scans (Android Chrome supports it) to reduce suspension.
- Comparables: storage written as `8+256` or `12/512` is now read; repost duplicates (same title, price, town) and the listing's own reposts no longer count; accessories, repair, wanted, defective and parts-only listings are excluded; a defective target gets no estimate; each estimate shows how many comparables are in Bohol vs elsewhere, and "Wider-area only" is labelled. The 3-comparable minimum and the 0.85 / PHP 500 formula are unchanged. These remain asking prices, not completed sales.
- Bug fixes: `filterAudit` split multi-word queries with a double-backslash regex; the location-review link regex rejected URLs containing the letter "s".

**Tests:** `npm test` (or `node --test tests/*.test.js`): 74 tests. 49 classifier cases, 9 discovery, 16 app/regression tests that load the real `index.html` in a stubbed browser, including a mocked end-to-end scan replaying 96 real titles from the log. Many classifier cases use titles from the same log the rules were tuned on, so they are regression tests, not an unbiased accuracy measure. Mutation checks confirmed the tests fail when dedupe, the device exclusion or the spend cap is removed.

**Still unverified / open**
1. Whether nearest-first sorting returns Bohol listings first (needs one probe, about $0.01 estimated).
2. Whether `strictFiltering` or `maxTotalChargeUsd` are honored by this actor.
3. Whether the 282 s was a suspended page.
4. Actual Apify charges for the last scans (use the usage button).
5. Bisaya/Tagalog classifier cues were taken from titles seen so far; expect misses.
6. The unique Bohol total across 8 searches in the last scan cannot be reconstructed from the log (only 12 sample titles per keyword were stored). The new report records it.
7. If nearest-first fails, evaluate `blackfalcondata/facebook-marketplace-scraper` (documents categories and a strict-radius option). It is new and unreviewed; its schema has not been read in full.


## October 25, 2026 — verified handoff and issue status reconciliation

**Evidence standard:** Code inspected on GitHub main; syntax-only checks were reported for patch integration and subsequent UI changes. No full Android regression, current full Node test run, or additional paid Apify test has been verified by ChatGPT. Earlier sections are historical snapshots and may describe superseded behavior.

| Issue | Current status | Evidence / remaining work |
|---|---|---|
| FR-001 Slow sequential scanning | PARTIALLY FIXED | Up to two concurrent searches, progress and incremental saves are implemented; 20-second 3-keyword scan reported Oct 24, not a controlled performance benchmark. Cancellation and cost optimization remain open. |
| FR-002 Results disappear behind filters | PARTIALLY FIXED | Filter funnel, rejected-listing inspector and diagnostics implemented; geographic false negatives still possible. |
| FR-003 Geographic targeting / actor ignores coordinates | OPEN — BLOCKER | Oct 24 location probe: 24 returned, only 1 Bohol-recognized despite Tagbilaran / 40 km / strict filtering; country metadata unknown. Cebu results remain dominant. Category/URL and nearest-first behavior not proven. |
| FR-004 Bohol recognition | PARTIALLY FIXED | Normalization and broader municipality geography implemented; ambiguous/missing actor metadata and unknown town distances remain unresolved. Verify bohol-geography.json availability and loading. |
| FR-005 Smart profit detector | DEPRIORITIZED BY OWNER | Owner wants comprehensive device listings by budget/location, not predictive resale scoring. Keep manual profit calculator; avoid investing in automatic profit engine. |
| FR-006 Partial scan results lost on later failure | CODE FIXED — NEEDS REGRESSION | Successful keyword batches saved incrementally; simulate a failed keyword in tests. |
| FR-007 Token / untrusted data security | OPEN | Token remains in localStorage and API request URL; inspect escaping, link validation and accidental log leakage. |
| FR-008 daysSinceListed validation | FIXED | Numeric to string input correction. |
| FR-009 Facebook redirect loses listing | FIXED / USER CONFIRMED | Normal HTTPS links replaced forced intent deep links. |
| FR-010 All category validation | FIXED, COST RISK OPEN | All-category accepted but potentially many paid searches. |
| FR-011 Phone specifications link | IMPLEMENTED | GSMArena search shortcut; variant accuracy unverified. |
| FR-012 Search UI overcrowded | CODE FIXED — NEEDS ANDROID CHECK | Oct 25: location controls, advanced options and scan diagnostics moved into collapsible sections; simpler labels. Commit f3198014f9066abbafaa213a858b4cf8333f84e1. |
| FR-013 Returning from listing jumps to top | PARTIALLY FIXED | Oct 25: app's own Back button now remembers/restores scroll position with requestAnimationFrame. Commit 712d8c51cc5e8c0421583aef71faad5efa0d2524. Android system Back gesture, external Facebook return, filter state, browser history and list re-render still need testing. |
| FR-014 Phone brand coverage | OPEN — HIGH | Main scan still uses KW.Phones = [iphone,samsung,redmi]. Optional adaptive discovery is not a complete replacement; title-matching cleaner discards valid nonmatching device titles. Need category-first where actor supports it, broad fallback and dedupe, with bounded spend. |
| FR-015 Category selection / miscategorized sellers | OPEN — HIGH | Marketplace has categories, but support for category IDs/URLs in curious_coder/facebook-marketplace actor is unverified. Test schema without paid runs; retain category-misfiled phone ads via general queries and classifier. |
| FR-016 Browser history / persistent scroll | OPEN | App uses internal S.d navigation, not browser history. Address native Android Back, scroll position and returning from external links without resetting or losing search controls. |

**Oct 24 diagnostic snapshot (user-exported logs):** regular scan 3 keywords (iPhone, Samsung, Redmi), 144 raw, 57 cleaned, 4 Bohol-recognized, 0 failed, ~20 s; separate strict location probe 24 returned, 1 Bohol-recognized, 20 phone-like. These figures do **not** establish Phase 2 nearest-first effectiveness. No paid run was initiated while preparing this handoff.

**User's clarified acceptance criteria:** In Phones, display every plausible phone brand that falls within selected budget and configured area; do not require a brand-name match. Prioritize newest and nearest listings, accurate location evidence, visible unknown-location review, and direct seller links. Do not silently mislabel unknown-location listings as inside radius. Separate search-source coverage from client-side filters. Avoid claiming exhaustive Facebook inventory or reliable actor geofencing without proof.


## October 25, 2026 — discovery freshness and navigation follow-up

### FR-017 — Repeat scans do not prioritize newly discovered listings (OPEN — HIGH)
- **Owner report:** Re-running a scan displays previously seen items alongside new items; the user wants newly discovered devices first.
- **Code inspection:** Search currently defaults to `S.so="d"` (estimated profit). Other modes are price, listing age (`h`) and approximate distance. None sorts by first discovery or opened/viewed status. `refresh()` replaces results for the scanned keyword and merges/deduplicates current items by ID; it does not maintain a durable first-seen registry across runs. The actor's `creation_time_descend` setting sorts marketplace listings by their creation time, **not** by when FlipRadar first encountered them.
- **Required behavior:** Persist a first-seen timestamp for stable listing IDs across scans/keywords, preserve it on refresh, mark truly new discoveries clearly, prioritize new discoveries on subsequent scans, then sort older items by listing age. Provide a New first sort and optional Hide viewed control. Do not re-label all refreshed items NEW or silently lose history when a keyword batch is replaced. Design migration for existing `fr_live` and localStorage size limits. No additional Apify runs required for the local tracking logic.
- **Status:** Not implemented; delegated to Claude for architecture/tests.

### FR-013 — In-app Back scroll restoration follow-up (CODE PATCHED; USER RETEST PENDING)
- **Owner confirmed:** FlipRadar's **own Back button**, not Android system Back, still reset to the top after the earlier patch.
- **Latest targeted change:** Commit `b04fc02f9e09c9453583c821456c94cb999d641a` immediately calls `closeDetail()` and restores scroll before updating browser history. Earlier navigation code already included an anchor-based scroll restore and popstate handling. JavaScript syntax validated; no Android verification yet.
- **Regression requirement:** Open a listing near the bottom of a long Search result list, press in-app Back, confirm the same card remains in view and filter/sort inputs remain unchanged; repeat multiple times, including after changing sort and after an external Facebook visit.


## October 25, 2026 — Phase 3 (Claude): status after implementation

**Evidence standard.** Everything below was verified with deterministic Node tests (`npm test`) that load the real `index.html` in a stubbed browser and a mocked Apify. **No paid Apify run was made. Nothing was tested on an Android phone.** "Fixed" therefore means "implemented and covered by automated tests", not "confirmed on device".

| Issue | Status | Evidence and what remains |
|---|---|---|
| FR-017 New discoveries first | **IMPLEMENTED, TESTED (mocked). Android unverified** | `seen.js` registry (`fr_seen_v1`): firstSeenAt, lastSeenAt, scan number, viewedAt per listing id. Default sort "New discoveries first"; NEW badge; "Hide listings I have already opened". 16 registry unit tests plus 12 end-to-end tests. |
| FR-014 Phone brand coverage | **PARTIALLY FIXED** | Client side is brand independent and tested with 21 phone titles, including makers outside the brand list (Ulefone, Doogee, Cubot, Oukitel, UMIDIGI, Meizu, Lava, Fairphone, Sharp, HMD, Nothing and others). The scanner still needs the owner to run it to prove real-world yield. |
| FR-015 Category / miscategorised sellers | **PARTIALLY FIXED, category search NOT used in production** | See "Category support: verified facts" below. Broad searches plus classifier catch misfiled phones. |
| FR-003 Geographic targeting | **OPEN, still a blocker** | Client-side location handling is stricter and more transparent. Whether the actor/Facebook can return mostly-Bohol results is unproven. |
| FR-013 / FR-016 Back button and scroll | **PATCHED, tested with a fake browser. Android retest pending** | `nav.js`; ChatGPT's immediate in-app Back (b04fc02) behaviour is kept. |
| FR-007 Untrusted data in HTML | **PARTIALLY FIXED** | Listing links must be https facebook.com (else rebuilt from the numeric id); photo URLs validated and escaped; search box value escaped. The Apify token is still stored in localStorage and sent in the request URL. |
| FR-005 Smart profit | DEPRIORITISED | No work done. |

### Category support: verified facts about `curious_coder/facebook-marketplace` (README and input schema read on Oct 25, 2026)
- **Verified:** there is **no category input field** and no category-id field. The README says categories are reached by pasting a Marketplace search URL ("search URLs (category, location, etc.)").
- **Verified (schema):** `latitude`/`longitude` are **ignored when `urls` are supplied**. Only `radius_in_km` (README: the name the actor adds to a URL it builds) and `sortBy=creation_time_descend` are documented as URL parameters.
- **Verified:** the README's sample output includes `marketplace_listing_category_id`, `location.latitude/longitude`, `location_text.text`, `location_vanity_or_id` and `reverse_geocode.city_page.id` per listing. The README sample is a vehicle listing fetched with details, so it is **unverified whether search-card results from our requests contain them.** Earlier logs showed the country code missing from search results.
- **Verified:** README and schema disagree on `strictFiltering`'s default (README true, schema false). FlipRadar always sends it explicitly.
- **Unverified:** the Facebook location slug or id that makes a category URL resolve to Tagbilaran. The earlier test used `/marketplace/tagbilaran/electronics/`, which returned California listings; the slug is probably not valid.
- **Decision:** category URLs cannot be combined with coordinates through this actor, so they are not used in scans. An owner-approved probe exists (see Approvals).

### Root causes addressed in this phase
1. **Brand gate.** Every Phones scan used `iphone`, `samsung`, `redmi` and then dropped any result whose title did not contain that word (for example "Galaxy A54" under "samsung"). Phone scans now never require the search word in the title.
2. **Silent deletion of real phones.** `clean()` removed any title containing "charger", "cover", "case" and so on (a phone sold "with charger" vanished), removed anything cheaper than 30% of the batch median (cheap phones vanished), and removed over-budget phones at scan time (raising the budget later showed nothing without a new paid scan). For phone scans these are replaced by the classifier; listings are kept and tagged, and the budget applies while browsing. Other categories keep the old behaviour.
3. **Unknown-brand phones were "other".** A phone from a maker not in the brand list was classified as a non-phone. Phones are now recognised from specs (12/256, 5G, dual SIM, mAh and so on); titles with no signal at all are kept in a "Possible phones" review list.
4. **Location logic only used a town name.** Exact coordinates, Facebook's location text, and conflicting evidence are now handled. See "Geographic status model".
5. **Misleading label.** The Advanced option "Only show verified local listings" only asked the actor to hide broad matches; FlipRadar already filters locally. Relabelled.
6. **Capacity.** The saved list was unbounded and a tie in "last seen" time could evict the newest scan results when trimming. Capped at 800, saved listings and the current scan are protected (found by a new test).
7. **Lost listings across keywords.** A listing stored under one keyword vanished if only another keyword returned it on the next scan. Fixed and tested.

### Geographic status model (implemented)
- **Local:** distance from the chosen centre is known (exact coordinates if supplied, otherwise the approximate centre of a recognised Bohol town) and within the radius, and the province matches.
- **Outside:** known to be farther than the radius, or in another province.
- **Needs a location check ("verify"):** no usable distance, or evidence conflicts (for example town says Cebu, coordinates say Bohol). **Never counted as nearby.** Shown in a separate list with the reason.
- Results header reports all three counts. Scan diagnostics report which fields Facebook actually supplied (coordinates, location text, category id, country), so the next scan answers the "does the actor return coordinates?" question at no extra cost.
- **Not claimed:** that the actor honours the radius. In logged scans most results were Cebu, 73 km away, with radius 40 and 60.

### Remaining limitations (do not treat as solved)
- Bohol coverage depends on what Facebook returns for a Tagbilaran-centred search. Nearest-first sorting is still untested.
- The "Possible phones" list can contain non-phones; it is a review list, not results.
- Classifier cues for Bisaya/Tagalog come from titles seen so far and will miss some.
- A listing's "NEW" badge means "first received by FlipRadar in the latest scan that completed at least one search". It says nothing about when the seller posted it.
- localStorage limits: saved list 800 listings, registry 3000 ids. Very long histories lose the oldest ids.

### Approvals needed (no paid run was made)
1. One normal scan with the new plan, about 6 searches, roughly $0.14 **estimated**. Afterwards tap "View Apify usage" for the real figure and share the log: the report will show coordinate, location-text and category-id availability and how many results are new.
2. Optional: the "Test location accuracy" probe with nearest-first (about $0.01 estimated) to settle FR-003.
3. Optional, only after a scan has learned a location id: "Test Marketplace category link" (one run, about $0.01 estimated).


## October 26, 2026 — Phase 3 Android field feedback (open)

### FR-018 — Reposts and price-change clones appear as separate results (OPEN)
- Screenshot shows near-identical `Cellphone+` posts in Batuan with the same thumbnail, at ₱1,800 and ₱2,000. Owner also reports sellers reposting or lowering prices.
- Existing exact listing-ID deduplication is insufficient for different IDs representing the same device. Do **not** assume identical generic titles mean identical devices.
- Group high-confidence same-seller/same-device reposts using available seller identity, image fingerprints, model/storage, location, title similarity, and timestamps; gracefully degrade when fields are missing. Show the most recently posted/updated confirmed listing, not automatically the cheapest. Label `Possible duplicate posts (N)` with expandable alternatives and price history when verifiable. Avoid merging unrelated devices or suppressing listings without confidence.

### FR-019 — Opening a result makes it disappear from New discoveries (OPEN)
- Owner confirms scroll now returns near prior position, but clicked listing disappears from the currently selected `New discoveries` list.
- Desired: opening marks listing `SEEN` without removing it from the current result set or reflowing the current list; on a subsequent scan, previously seen listings should be ranked after genuinely unseen discoveries when `New discoveries` is selected. Keep separate first-seen, viewed, scan-batch, and listing-created metadata. Persist seen state across reloads; maintain stable card position during detail-to-list navigation. Explicit `Hide seen` may be offered, default OFF.

### FR-020 — Listing card density and low-confidence warnings (OPEN / UX)
- Android screenshot: generic `Cellphone+` cards consume considerable vertical space with repeated `Unclear listing`, `No reliable model-specific price estimate yet`, and `Insufficient comps` text. Owner prioritizes scanning within budget over profit estimation. Condense warnings into short expandable details, preserve title/price/location/thumbnail and visible uncertainty, and de-emphasize profit predictions.

### FR-021 — Latest exported scan diagnostics and geographic reliability (PARTIAL)
- Export `flipradar-logs-2026-10-25.json` (latest scan 2026-10-25 16:11:32 UTC): six keyword requests succeeded, zero failed, 33 s; 288 raw, 272 cleaned, 236 unique IDs, 36 duplicate IDs, 188 first-seen discoveries reported.
- Latest report geo: 169 Bohol-town matches, 45 other-province, 13 ambiguous, 9 unknown; no per-listing GPS, country, or locationText fields in 236 unique results. Requested 40 km; report says 155 within, 7 beyond, 74 without distance. UI funnel: 344 loaded → 254 within budget → 185 Phones → 174 device candidates → 96 province → 85 radius. These counts refer to different stages and must not be conflated.
- `Needs location verification (20)` screenshot includes ambiguous Talisay, Cortes, Maria and Getafe entries. Some are Bohol municipality names but also exist elsewhere; keep unverified unless province corroborated. Avoid blanket auto-classification.
- Actor request used `distance_ascend`, `strictFiltering:false`. Cost `$0.1443` is an **estimate**, not billed amount; historical `apify_usage` was a separate older lookup. Do not claim zero-cost scans.
- Historical errors in 100-event export: 2026-10-23 `Failed to fetch` category test and `Could not reach Apify` keyword request. **No errors recorded in latest scan.** Older category URL experiment returned California results, not validated as supported geographic category filtering.
