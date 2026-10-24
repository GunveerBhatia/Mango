# Slip

A minimalist, mobile-first sports betting research app. NBA first; built so other leagues can be added later.

Slip shows **probabilities, not picks**. It never calls anything a "lock".

## What's in it

**Picks for you (top of home)**
- Slip builds up to two parlays for you: **Best value** (legs that beat their price by 3%+) and **Higher hit chance** (the likeliest legs where our estimate still beats the price).
- One leg per game, so legs don't rise and fall together. 2–3 legs.
- Each leg shows our win %; tap it to see **why**: the book's odds, our estimate, and the stats behind it.
- **Add to slip** puts the whole parlay in your slip.
- If nothing is worth betting, it says **No bet today** instead of forcing picks.
- Player props are included when you set `ODDS_API_KEY` and `AUTO_PROPS=on` (this uses many credits; see below).

**Games (home)**
- One card per game: tip-off in your local time, moneyline, spread, total.
- **Win %**: the vig-free probability implied by the odds. Tap it to see the math.
- **Edge finder**: every bet gets an estimate from Slip's model. Bets that beat the book's price by 3%+ get a green "Edge +4.2%" label.
- **"No bet today"**: when nothing clears the 3% bar, the home screen says so.
- **Line shopping**: with an Odds API key, each price is the best available across US books, with the book's name.
- **Tags**: Home, Back-to-back, 3+ in 4 nights, Key player out.

**Game detail** (tap "Details" on a card)
- Quick read: 2–3 plain-English bullets.
- Every bet with the book's probability vs. our estimate, plus "Compare books".
- Injuries, rest & travel, last 10 games with a trend line, last 10 head-to-head, home/away splits, pace and offensive/defensive ratings. Each section is collapsed to one line until you tap it.

**Props**
- Search any player playing today, then pick PTS / REB / AST / PRA / 3PM.
- Sportsbook line (with an Odds API key) or your own line, last 10 games as a bar chart with the line drawn across, hit rates (last 10, vs. tonight's opponent, home/away), and a minutes trend that turns red when minutes are dropping.
- **Trades are handled**: once a player has 5+ games with his new team, only those count. Before that, older games are included but faded, with a note. "vs opponent" only counts games with his current team.

**Parlay builder**
- Tap any price to add it to the slip. Tap the bar above the menu to open it.
- Combined odds, payout for your stake, chance to hit (implied probabilities multiplied), and our estimate.
- How much expected value each leg costs or adds, in dollars.
- Plain-English warnings for correlated or contradictory legs, and when the chance to hit drops below 25%.
- Capped at 4 legs by default (you can change this in My Record).

**Bankroll manager**
- Enter your bankroll in My Record. The slip suggests a stake (1–3% flat, or ¼ Kelly, which says $0 when there's no edge).
- Saving a slip that stakes more than 5% of your bankroll is blocked.

**My Record**
- Profit, ROI, win rate, units (1 unit = 1% of your bankroll when the slip was saved).
- Profit and ROI by bet type (moneyline, spread, total, props, parlays), with a plain warning when a type is losing money.
- Best and worst leg types: your hit rate vs. the hit rate the odds said you needed.
- **Closing line value**: results and closing odds fill in automatically from ESPN after games end (DraftKings' closing line). For props, type the closing odds yourself. Consistently beating the close is the best sign a strategy works.

> Saved slips and settings live in your browser (localStorage). They stay on the device you use, so use the same phone and browser. Clearing site data erases them.

## How the edge is calculated

Everything is in `lib/model.ts`. It's simple on purpose:

1. **Game model**: expected margin = half the gap in the two teams' last-10 point differential + 2.5 for home court − 1.5 for a back-to-back − 1 for 3-in-4 nights − 3 per key player out. Blended 60/40 with ESPN's BPI matchup predictor when ESPN publishes one. Turned into win/cover/over probabilities with a normal curve.
2. **Prop model**: the player's last-10 average and spread, scaled down if minutes are dropping.
3. **Respect the market**: the model gets 30% of the say (`MODEL_WEIGHT`). The other 70% is the market's vig-free probability. Books are hard to beat, so a model that disagrees a lot with the market is usually wrong.
4. **Edge** = blended estimate − the probability implied by the best price you can get. Highlighted at +3% (`EDGE_THRESHOLD`).

Edges are estimates, not guarantees. Your closing line value in My Record is how you find out whether they're real.

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
   - `BALLDONTLIE_API_KEY`: optional and currently unused. Player game logs come from ESPN for free; balldontlie's free tier doesn't include game stats.

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
| The Odds API | Odds from every book | 500 credits/month free; game odds cost 3 credits per refresh (3 markets × 1 region) | 60 min (`ODDS_CACHE_MINUTES`) |
| The Odds API (props) | Player prop lines | 5 credits per game, fetched when you open a player (or for every game with `AUTO_PROPS=on`) | 60 min |

At 60 minutes you'd spend at most ~72 credits on a day you use the app non-stop, and much less in practice. The home page footer shows how many credits you have left. Raise `ODDS_CACHE_MINUTES` if you run low.

## Where the data comes from

Every screen shows a small "source" line. The code is split so a source can be swapped without touching the UI:

- `lib/providers/espn.ts`: ESPN schedules, results, team stats, rosters, player game logs, injuries, BPI and closing odds.
- `lib/providers/odds-api.ts`: The Odds API.
- `lib/providers/injuries.ts`: picks the injury source. To swap ESPN for another source, write a function with the same shape and point `getInjuries` at it.
- `lib/leagues.ts`: every league-specific setting. Adding a league starts here.

## Useful commands

```bash
npm run dev     # run locally
npm test        # run the odds, slip and model tests
npm run lint    # check code style
npm run build   # production build
```

## Deploying (optional)

The easiest host is [Vercel](https://vercel.com): import the GitHub repo, set **Root Directory** to `slip`, and add the same keys from `.env.local` under Environment Variables.
