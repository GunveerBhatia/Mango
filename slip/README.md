# Slip

A minimalist, mobile-first sports betting research app. NBA first; built so other leagues can be added later.

Slip shows **probabilities, not picks**. It never calls anything a "lock".

## What works today (step 1)

- **Today's Games**: one card per game with tip-off in your local time, moneyline, spread, total.
- **Win %**: the vig-free probability implied by the odds. Tap it to see the math.
- **Line shopping**: with an Odds API key, every price is the best available across US sportsbooks, with the book's name. Tap a price to see every book.
- **Tags**: Home, Back-to-back, 3+ in 4 nights, Key player out (a team's points/rebounds/assists leader listed Out or Doubtful).

Coming next: Game Detail, edge finder and "No bet today", Player Props, Parlay Builder, bankroll manager, and My Record (with closing line value).

## Setup (beginner friendly)

You need [Node.js](https://nodejs.org) version 20 or newer. Check with `node -v` in a terminal.

1. **Open a terminal in this folder**

   ```bash
   cd slip
   ```

2. **Install the app's packages** (one time)

   ```bash
   npm install
   ```

3. **Add your API keys**

   Copy the example settings file:

   ```bash
   cp .env.example .env.local
   ```

   Open `.env.local` in any text editor and paste your keys after the `=` signs:

   - `ODDS_API_KEY`: sign up free at https://the-odds-api.com. Optional: without it, Slip shows one sportsbook (DraftKings) via ESPN.
   - `BALLDONTLIE_API_KEY`: sign up at https://www.balldontlie.io. Not used yet; it's for player stats in a later step.

   `.env.local` is never committed to git, so your keys stay private.

4. **Start the app**

   ```bash
   npm run dev
   ```

   Open http://localhost:3000. To use it on your phone on the same Wi-Fi, open the "Network" address shown in the terminal (e.g. `http://192.168.1.20:3000`).

## Free-tier limits and caching

Slip saves every API response and reuses it, so opening the app many times doesn't spend your quota.

| Source | Used for | Cost | Reused for |
| --- | --- | --- | --- |
| ESPN public API | Schedule, records, injuries, fallback odds | Free, no key | 10 min (`ESPN_CACHE_MINUTES`) |
| The Odds API | Odds from every book | 500 credits/month free; each refresh costs 3 credits (3 markets × 1 region) | 60 min (`ODDS_CACHE_MINUTES`) |

At 60 minutes you'd spend at most ~72 credits on a day you use the app non-stop, and much less in practice. The home page footer shows how many credits you have left. Raise `ODDS_CACHE_MINUTES` if you run low.

## Where the data comes from

Every screen shows a small "source" line. The code is split so a source can be swapped without touching the UI:

- `lib/providers/espn.ts`: ESPN schedule, records, team leaders, injuries.
- `lib/providers/odds-api.ts`: The Odds API.
- `lib/providers/injuries.ts`: picks the injury source. To swap ESPN for another source, write a function with the same shape and point `getInjuries` at it.
- `lib/leagues.ts`: every league-specific setting. Adding a league starts here.

## Useful commands

```bash
npm run dev     # run locally
npm test        # run the odds-math and line-shopping tests
npm run lint    # check code style
npm run build   # production build
```

## Deploying (optional)

The easiest host is [Vercel](https://vercel.com): import the GitHub repo, set **Root Directory** to `slip`, and add the same keys from `.env.local` under Environment Variables.
