# FlipRadar (Marketplace_finder)

*Find deals. Flip smarter.*

A mobile-first web app for a gadget reseller in Bohol, Philippines. It finds underpriced items on Facebook Marketplace, scores each deal, and calculates profit before you buy. The whole app is one file: `index.html`.

**Status (October 22, 2026):** MVP. The interface is complete. Live data through Apify is built but has not been verified from this standalone version yet (see PLAN.md for the test checklist).

## October 23, 2026 update — location and pricing safeguards

- **Search radius now filters displayed listings**, not just the Apify request. The reference point is the selected **Distance from town** town, using approximate town-center coordinates. Unknown towns are excluded from radius-filtered search results.
- **Province filter** operates separately from radius. Select **All** to allow listings from other provinces *within the chosen radius*; select a province to restrict further. Distance is straight-line, not driving distance.
- **Nearest (approx.)** sorts eligible listings by town-center distance. For a nearest-first view, select this sort option.
- **Limitations:** Only towns in the app's coordinate lookup can be included. The actor's search location accuracy is unverified; missing/ambiguous geodata can cause valid listings to be hidden. The scan center uses the chosen town.
- **Deal scoring:** Estimates are based on scraped asking prices, **not completed sales**. Live listings with fewer than five similar-title comparables are labeled **Unverified**, and the listing detail calls the estimated difference an asking-price spread rather than guaranteed profit. Manual calculator results still depend on user-entered resale price and expenses. AI integration has **not** been added; it would require a reliable pricing dataset, safeguards, and a secret-key backend.

## Features

- **Home:** category shortcuts and the best deals in Bohol.
- **Search:** keyword, max price, category, sort (best deal, lowest price, newest), "Bohol only" switch.
- **Budget scan:** pick a category and a max price, then scan live listings for that category without choosing a model.
- **Listing details:** estimated value range, deal score, potential profit range, photo link, link to the Marketplace listing, save button.
- **Profit calculator:** buying price, selling price, extra costs, quick presets, profit and ROI.
- **Watchlist:** keywords with a max price, on/off switch, match count, per-item refresh.
- **Saved:** listings you saved.

## Files

| File | Purpose |
|---|---|
| `index.html` | The entire app (HTML, CSS, JavaScript). |
| `README.md` | This document. |
| `PLAN.md` | Roadmap, backlog, open questions and test checklist. |

## Deploy on GitHub Pages (phone only)

1. In the repo on github.com, tap **Add file → Upload files**, choose `index.html` (and the two `.md` files), then **Commit changes**.
2. Go to **Settings → Pages**. Under Branch choose **main** and **/ (root)**, then **Save**.
3. After a minute or two the app is at `https://<your-username>.github.io/Marketplace_finder/`.
4. Open it in Chrome and use **Add to Home screen**.

## First use

1. Open the **Watchlist** tab and paste your Apify API token (Apify console → Integrations). It is saved only on your phone.
2. Add keywords, for example `iphone 13` with a max price, and tap **Refresh live listings**.
3. Until the first refresh the app shows sample listings. Some are from a real test run; most are made up.

## How the numbers work

- **Estimated value:** low, average and high are the 25th, 50th and 75th percentile of similar listings. Similar means the same first two words of the title (for example "iphone 13"). With fewer than 4 similar listings the app falls back to the whole keyword search and marks the estimate as rough.
- **Deal score (0 to 100):** `50 + 1.75 × (percent below average price)`, rounded and limited to 0–100. Labels: 80 and up Great Deal, 65 and up Good Deal, 50 and up Fair Deal, below 50 Pricey.
- **Potential profit range:** estimated low and high value minus the listing price.
- **Profit:** selling price − buying price − extra costs. **ROI:** profit ÷ buying price.
- **Cleaning rules:** sold or pending listings, installment bait ("pautang", "installment", "downpayment"), accessories (case, charger, cover, protector, strap, figure, sticker, skin) and prices below 30% of the median are dropped. A listing must contain every word of the keyword.

## Data source and cost

- Scraper: the Apify actor `curious_coder/facebook-marketplace`, called through Apify's API.
- Price: about $1.50 per 1,000 listings. Apify's free plan includes $5 of credit every month (it resets monthly, not daily), roughly 3,300 listings.
- One refresh scrapes up to about 48 listings per keyword, so roughly 5 to 15 cents. A budget scan runs 1 to 3 keywords per category.
- Location is set by coordinates (Tagbilaran: 9.6477, 123.8547) with a 40 km radius. Place names did not work in testing and returned US results. The radius is loose, so many results are from Cebu. The app filters Bohol using the listing's state and a town list.
- Scraping Facebook is against Facebook's terms and can break when Facebook changes its pages. Treat it as a tool that may need fixing.

## Security

- The Apify token is stored in your browser's local storage. It is never in the file. **Do not commit it to the repo** (the repo is public).
- Anyone with the token can spend your Apify credit. If it leaks, regenerate it in the Apify console.
- Apify's usage page shows your credit use. Check it after the first few refreshes.

## Known limitations

- No background scanning and no push alerts: the app only fetches when you tap refresh.
- Facebook photo links are signed and expire after a while. The app shows a thumbnail if the browser allows it and always offers an **Open photo** link.
- The **Open in Facebook app** button uses an Android shortcut. It is untested and may do nothing in some browsers. Opening the listing link in Chrome with "Open supported links" enabled for the Facebook app is the more reliable route.
- Sample listings link to a Marketplace search, not a specific item, and Facebook may drop the search text.
- Market estimates for sample listings are rough guesses, not real prices.

## Data stored on the phone (local storage keys)

`fr_saved` (saved listings), `fr_watch` (watchlist), `fr_live` (last live listings), `fr_up` (last refresh times), `fr_tok` (Apify token).

## October 23 — Pricing consistency update

- Home, Search, and Listing Details now share a single phone model-specific asking-price comparison engine. Requires at least 3 other listings matching detected model, storage and 4G/5G/unspecified label.
- With enough comparables, an **illustrative** resale price is median asking price discounted 15%, and illustrative net profit deducts the listing price and ₱500 assumed expenses. These are assumptions, **not completed-sale prices or guaranteed profits**.
- With insufficient comparable evidence, no automatic resale value or profit score is shown; manual profit calculator remains available. Its resale and expense inputs are prefilled only when evidence exists.
- Old broad price ranges in listing details have been removed. Existing local listings and Apify token remain on the device; this change does not require a new scan.
- JavaScript syntax checked; actual phone/browser regression testing remains pending. See PLAN.md and ISSUES.md for remaining risks.


## October 23, 2026 — Claude discovery patch integration

- Replaced the failed category-URL experiment with a location-anchored probe using selected town latitude, longitude and radius, without a Marketplace URL. Probe terms: phone, android, 256gb or no keyword. The probe requires confirmation and does not modify saved listings.
- Added optional **Strict local filtering** (off by default) and **Brand-independent phone discovery** (off by default). Discovery adds five terms: phone, cellphone, android, 128gb and 256gb, with extra paid requests only after confirmation.
- Added a request parameter `maxTotalChargeUsd=0.10` per actor run. Whether Apify enforces it for this endpoint is **not yet verified**; do not treat it as a guaranteed billing ceiling. API output `limit` also does not limit all billed work.
- The current normal scanner remains available. Syntax checked; no live paid test or Android regression test has been performed for these changes.


## Tests and new modules (October 23, 2026)
- `classify.js` classifies listing titles; `discovery.js` holds keyword-history and yield logic. Both are plain scripts loaded by `index.html` and also importable in Node.
- Run the suite with `npm test` or `node --test tests/*.test.js` (Node 20+). It loads the real `index.html` in a stubbed browser, so no network or Apify credits are used.
- `tests/fixtures/scan-2026-10-23-samples.json` holds listing titles and towns from an exported log (no tokens or links).
- Experimental toggles (all off by default): Strict local filtering, Adaptive brand-independent discovery, Nearest-first sorting. Scan costs shown in the app are estimates from the actor price list; use "Show Apify-reported usage" for Apify's own figures.


## October 25, 2026 — current user experience and limitations

**Updated product focus:** Find phones and other devices under a chosen budget in a configured area, regardless of brand. Automatic profit prediction is now lower priority; the manual calculator remains available. Existing descriptions above of the app as a deal-score-first tool are historical and should not be treated as the new acceptance criteria.

**Search interface:** Location/distance settings, advanced scan settings and technical diagnostics are collapsed by default (commit f3198014). The app's own listing-detail Back button restores the previous scroll offset (commit 712d8c5); Android system Back and returning from external Facebook links are not yet validated.

**Known limitations:** The default phone keyword list is still iPhone/Samsung/Redmi; optional adaptive terms do not guarantee all-brand coverage. Facebook Marketplace category support in the selected Apify actor has not been confirmed. October 24 user diagnostics showed 144 raw / 57 cleaned / 4 Bohol-recognized in the three-keyword scan, and 1 Bohol-recognized of 24 in a separate location probe. Apify coordinates and strict filtering have not demonstrated reliable Bohol-only discovery. No additional paid probe was run for this update. See ISSUES.md FR-012 through FR-016 and PLAN.md for Claude's prioritized engineering handoff.


## October 25, 2026 — subsequent fixes and requested behavior

- **Navigation:** After the user reported that FlipRadar's own Back button still returned to the top, a targeted fix was committed (`b04fc02`) to restore the list immediately before browser history navigation. The fix passed JavaScript syntax validation; actual Android behavior remains unconfirmed.
- **Sorting:** Current options are estimated profit (default), lowest price, Marketplace listing age (Newest), and approximate nearest. **Newly discovered first is not yet implemented.** The owner wants new listing IDs surfaced before listings seen on prior scans, with a NEW badge and persistent first-seen tracking; this requires a follow-up implementation and tests. No paid scan was performed for this documentation update.


## Phase 3 integration notes (Claude patch, October 25)


## Phase 3 (October 25, 2026): what changed for users
- **Find phones of any brand.** The Phones scan no longer depends on iPhone, Samsung and Redmi. Search terms are broad (phone, cellphone, android and others, chosen from what has worked) and the app decides what is a phone from the listing itself. Accessories, repair ads and buying requests are excluded but stay inspectable in the rejected-listings section; unclear titles go to "Possible phones".
- **Know the cost before scanning.** The Search tab shows the number of paid searches and an estimated cost; a confirmation repeats it. "Most paid searches per scan" is a hard limit in the app. The estimate is not a billing limit.
- **New discoveries first.** Listings found for the first time by the latest scan are marked NEW and shown first; older ones follow by Marketplace listing age. You can hide listings you have already opened. History survives reloads and is migrated from older saved listings without marking them new.
- **Honest locations.** Results show only listings with a confirmed location inside your area. Listings with an unclear location are listed separately, never counted as nearby.
- **Back button.** Opening a listing adds a history entry; both the in-app Back and the Android gesture return to the same card. Filters and sort survive a reload within the same browser tab.

## Developer notes
- New modules: `plan.js` (scan plans, category URL builder), `seen.js` (discovery registry), `nav.js` (navigation). All are plain scripts that also load in Node.
- Tests: `npm test` runs every `tests/*.test.js` file (167 tests at time of writing). `tests/harness.js` loads the real `index.html` in a stubbed browser with a mocked Apify, so no network or credits are used. `.github/workflows/test.yml` runs the suite on Node 20 and 22.
- New localStorage keys: `fr_seen_v1`, `fr_sort`, `fr_hideviewed`, `fr_allbrand`, `fr_brands`, `fr_maxsearches`, `fr_locids`. Existing keys are unchanged and never deleted. Navigation state uses sessionStorage (`fr_nav_v1`).
