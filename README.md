# FlipRadar (Marketplace_finder)

*Find deals. Flip smarter.*

A mobile-first web app for a gadget reseller in Bohol, Philippines. It finds underpriced items on Facebook Marketplace, scores each deal, and calculates profit before you buy. The whole app is one file: `index.html`.

**Status (October 22, 2026):** MVP. The interface is complete. Live data through Apify is built but has not been verified from this standalone version yet (see PLAN.md for the test checklist).

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