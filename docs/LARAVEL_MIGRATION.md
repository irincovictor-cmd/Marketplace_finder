# Marketplace Finder / FlipRadar — Laravel Migration Baseline

## Purpose
Migrate the existing static HTML/JavaScript application to Laravel without silently dropping capabilities. The current JavaScript app remains the behavior reference. **Do not overwrite or remove the working static app until equivalent functionality has passed tests.**

## Confirmed source
- Original application: `index.html`, plus extracted pure-JavaScript helpers (such as `classify.js` and `discovery.js`).
- Automated tests: `npm test` / `node --test tests/*.test.js`.
- Existing browser data uses `localStorage`; retaining it on the same origin requires an explicit migration plan.
- Live Facebook Marketplace discovery depends on a paid, third-party Apify actor. It is NOT verified that all requests, geography, filtering and costs behave as intended.

## Functional preservation checklist
- [ ] Home, Search, listing detail, Saved, Watchlist, profit calculator, responsive mobile navigation
- [ ] Category, budget, keyword, price, location/radius/province filters; clear status for ambiguous locations
- [ ] All-brand phone discovery, classification and safe exclusion/review of accessories and wanted/repair ads
- [ ] Adaptive discovery terms, request limits, upfront cost warning/confirmation, progress and partial failures
- [ ] Existing listing normalization, duplicate/repost grouping, stored listing lookup, similar-comparable estimation
- [ ] First-seen / viewed / NEW / SEEN behavior and newest/nearest/price/deal sorts
- [ ] Scroll restoration and Android/browser Back behavior
- [ ] Saved items, watchlist, preferences, diagnostics and export
- [ ] Exact listing and photo links with URL validation
- [ ] No background scan or notification feature accidentally represented as existing functionality

## Migration boundaries
1. **Frontend first:** retain the current HTML, styling and pure JS helpers until Laravel Blade/Vite parity is established; do not rewrite calculation logic without parity tests.
2. **Backend:** move the Apify credential and paid API requests behind validated Laravel endpoints. Keep the token out of logs, URLs, Git history and client-side storage for new installations.
3. **Persistence:** select a deliberate strategy for old localStorage data; first boot must not silently erase saved items, scan history or preferences. An opt-in import/export is appropriate.
4. **Database:** SQLite is a viable portable default. Treat generated SQLite files as user data, not committed source code.
5. **Portability:** include Dockerfile, Compose file, startup scripts, locked dependencies and `.env.example`. Fresh clones should need Docker and a supported host, not host-level PHP/Node installation.
6. **Costs / permissions:** paid Apify scans must never fire automatically at first boot, from tests, or from the build. Preserve user confirmation and rate/cost safeguards.
7. **Security:** auth/CSRF, validation, outbound URL safety, server-side token secret, secret masking and request limits must be reviewed when moving requests to Laravel.

## Acceptance criteria
- Original JavaScript tests pass unchanged before migration and equivalent/new tests pass afterward.
- UI and calculations are compared against captured baseline cases, including location uncertainty and insufficient pricing comparables.
- Fresh clone: `docker compose up -d --build` initializes and serves the project, without a host PHP/Composer/Node installation.
- A clean browser can use the app with sample/offline data; a live scan requires an intentionally configured token and explicit approval.
- Persistent data survives container restart; a documented backup/restore preserves data across machines.
- Existing working `main` remains untouched until the migrated app is validated.

## Order of implementation
1. Baseline the existing tests and feature inventory.
2. Scaffold Laravel and Docker in this migration branch; serve the original frontend from Laravel as a transitional milestone.
3. Implement secure Apify proxy/API, preserving request payload semantics and usage reporting.
4. Move storage and state incrementally with import/export and parity coverage.
5. Refactor UI to Blade/Vite components only where beneficial.
6. Validate clean install and regression tests; merge only after confirmation.
