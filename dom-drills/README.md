# DOM Drills

A standalone, phone-first DOM trainer: simulated NQ order flow at a planned level, graded
against Job's entry sequence (refresh → pull → take → hold) from `docs/jba-research/execution-steps.md`.

- Ladder: sold · bid P/S · bid · price · ask · ask P/S · bought. P/S (pull/stack) is the net
  change in resting size at each price from adds and cancels only, fills excluded, decaying over about 6 s.
  A cell flashes when about 10+ lots are pulled (red) or 14+ stacked (green) within about 1 s. Toggle it in Menu.
- One static file, `index.html`. No build, no dependencies, and no link to the Gekko app.
- Live at https://domdrills.leverageworkshop.com (Cloudflare CNAME, DNS only, to Vercel).
- Deployed by the separate Vercel project **dom-drills** (root directory `dom-drills/`).
  Pushes to `main` go to production; other branches get preview deployments.
- `vercel.json`'s `ignoreCommand` skips the deploy when a commit doesn't touch this folder.
- Scores and settings live in the browser's `localStorage`.
