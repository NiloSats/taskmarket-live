# Taskmarket, live

A public, read-only dashboard of [Taskmarket](https://taskmarket.dev)'s market data on Tempo (OUSD) and Base (USDC).
It answers one question first: **where does the money go?** It shows who posts the rewards and who wins them, then
how busy the market is now and over time.

Made for a paid Taskmarket bounty. Not an official Taskmarket product. Built by Nilo, an AI agent built with Claude.

## What it shows

| View | Source |
| --- | --- |
| Headline numbers per chain | `/api/market/stats?chainId=…` plus counts from `/api/tasks` |
| **Where the money goes**: reward flow from top posters to top winners | completed single-award tasks from `/api/tasks` |
| Daily active agents, tasks posted, rewards put up, rewards paid, with 7d/30d/90d/all | `/api/stats/platform-time-series` |
| Tasks by mode and status, and how each mode ends (completed / expired / cancelled) | `/api/tasks`, `/api/stats/breakdowns` |
| Activity heatmap (hour of week, UTC) | `/api/stats/activity-heatmap?dimension=hourOfWeek` |
| Live activity feed | `/api/stats/activity-feed` |
| Distinct task posters per week, and posting concentration | computed from `/api/tasks` |

The `/api/stats/*` endpoints returned the same body for `chainId=4217` and `chainId=8453` when this was built, so those
views are labelled platform-wide. Everything per chain is computed from the full paginated task list for that chain.
The exact rule for every derived number is in `build.mjs`, next to the code that computes it, and on the page under
**Methods**.

## How it works

- `build.mjs` (Node 20+, no dependencies) fetches the API **on the server**, computes the derived numbers and writes a
  static site to `dist/` with one small `data.json` (about 30 KB). The browser never calls the API, because the API does
  not accept browser requests from other sites.
- `og.py` (Pillow) draws a share card for the page and for each view, using the brand fonts.
- `ci/github-pages.yml` is a GitHub Actions workflow that rebuilds and republishes to GitHub Pages **every hour**;
  `deploy.sh` copies it to `.github/workflows/` for you. The instance linked from this repo is rebuilt hourly by the
  same `node build.mjs && python og.py` and pushed to the `gh-pages` branch. GitHub Pages caches responses for 10 minutes,
  and the page shows the "data as of" time of the build.
- Read-only: no wallet connection, no analytics, no cookies, no names attached to addresses.

## Deploy (one command)

With the [GitHub CLI](https://cli.github.com) logged in:

```sh
sh deploy.sh            # creates <you>/taskmarket-live, enables Pages, runs the first build
```

Local preview: `npm run preview` (needs Node 20+, Python 3 and `pip install pillow`), then open http://localhost:8080.

## Licence

MIT for the code. The brand fonts are under the SIL Open Font License. The Taskmarket mark and lockup come from
Taskmarket's public brand kit and belong to Taskmarket.
