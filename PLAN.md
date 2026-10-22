# FlipRadar: Plan and Roadmap

Last updated: October 22, 2026

## Why this exists

Two problems in gadget buying and selling in Bohol:

1. Too much time scrolling Marketplace to find a device worth flipping.
2. Sell posts often don't reach the right buyers and sit for days.

FlipRadar tackles problem 1 first. Problem 2 is in the backlog.

## Decisions so far

- Facebook has no public Marketplace API, so listings come from an Apify scraper (`curious_coder/facebook-marketplace`). Apify's free credit ($5 a month) covers light use.
- Default area is Bohol (Tagbilaran coordinates). Cebu results are kept out by the "Bohol only" switch, which can be turned off.
- No login or accounts for now. One person uses the app and data stays on the phone.
- The app is one static `index.html`, hosted free on GitHub Pages, so it works from a phone with no laptop.
- The Apify token is entered in the app and stored locally, never in the repo.
- Fetching happens only when the user taps a button, to control cost. No automatic loop.
- Design source: a 10-screen ChatGPT prototype (dark navy, orange accent). The spec lives in the Claude doc "FlipRadar – Prototype Spec".

## Phases

| Phase | Scope | Status |
|---|---|---|
| 1. Interface | Home, Search, Listing Details, Profit Calculator, Watchlist, Saved, sample data | Done |
| 2. Live data | Refresh from Apify, cleaning, Bohol filter, real estimated values, budget scan | Built, needs verification in the standalone version |
| 3. Alerts | Notify about new matches and price drops while the app is closed | Not started |
| 4. AI deal analysis | Deal analysis screen with checklist and risk warnings | Not started |

## Next steps (in order)

1. Deploy to GitHub Pages and run the test checklist below.
2. Fix whatever the first live refresh reveals (CORS, field names, empty results).
3. Tune the cleaning rules using real Bohol results (junk titles, odd prices).
4. Replace guessed sample market prices or remove sample data once live data works.
5. Decide how to do alerts (options below).
6. Add the inventory tracker (below).

## Test checklist (first live run)

- [ ] Page loads on the phone and can be added to the home screen.
- [ ] Token saved after closing and reopening the app.
- [ ] Refresh with `iphone 13` loads listings, or shows a clear error.
- [ ] Listings show Philippine pesos, not dollars.
- [ ] "Bohol only" keeps only Bohol towns.
- [ ] Deal scores and estimated ranges look sensible against real prices you know.
- [ ] "View on Marketplace" opens the exact listing.
- [ ] "Open photo" opens the picture. Note whether thumbnails show.
- [ ] Budget scan for one category stays within your credit; check Apify's usage page afterwards.
- [ ] Profit calculator matches your own arithmetic.

## Alerts: options for Phase 3

- **Apify schedule plus notification:** run the scraper on a timer inside Apify and send results by email or webhook. No code, works with the app closed. Cost depends on how often it runs.
- **Telegram bot:** a small script posts new matches to a Telegram chat. Needs somewhere to run it (Termux on the phone, or a free cloud function).
- **Keep manual:** tap refresh two or three times a day. Free and simplest.

## Backlog

**Buying side**
- Alerts tab (new match, price drop) and notification history.
- Deal Analysis screen: score ring, checklist (price vs average, resale value, photos, seller), market low/average/high.
- Saved folders.
- Carousell as a second source.
- Remember listings between refreshes to detect price drops and mark new ones.
- Better model matching (storage size, condition) so estimates are tighter.

**Selling side (problem 2)**
- Inventory tracker: buy price, date bought, date listed, where posted. Days-listed counter turns yellow at 3 days and red at 5, with advice to repost or cut the price.
- Listing helper: caption in English or Taglish with the price in the first line, plus a posting checklist (groups, platforms, best times).
- Buyer list: people who asked about devices and which model, so you can message them when matching stock arrives.
- Stats: total profit, average days to sell, best-earning models.

## Risks and open questions

- Apify may block browser requests from the page (CORS). If so, a tiny proxy function is needed.
- Facebook can change or block scraping at any time. Costs or reliability may change.
- Estimates depend on matching similar titles. Seller titles are messy, so estimates can be off. Treat scores as a guide, not a verdict.
- Few Bohol listings per scan because search results are dominated by Cebu. A wider radius costs more credit.
- Scraping is against Facebook's terms. Decide how comfortable you are before relying on it.
- Whether to keep Vehicles and Home & Living categories from the prototype (currently dropped).

## Maintenance notes

- If listings stop loading, check the Apify usage page (credit used up?) and the actor's page for notices before changing code.
- All scraper-specific code is in two places: the `refresh` function (request) and the `clean` function (field names and filters).