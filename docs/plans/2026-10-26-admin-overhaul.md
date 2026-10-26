# Admin and standings overhaul (agreed 26 Oct 2026)

**Answer first:** Stanley and Adam (duo "Smashing Balls") reviewed the site. Every decision below is settled. The work is split into tasks A to F. A, B and C can run in parallel; D and E come after; F is last.

Live site: https://gooners-sigma.vercel.app · Repo: github.com/stanleychiu0314/fantasy-basketball · Admin: `/admin` (password, Stanley and Adam only).

## Rules for whoever builds this

| Rule | Why |
| --- | --- |
| Never `git push` without Stanley's OK in chat; never force-push | His global rule. Pushing to `main` deploys production. |
| Stanley runs migrations himself (`pnpm db:migrate`) | `.env.local` is blocked for the agent. `pnpm drizzle-kit generate` is fine. |
| `rm -rf` is blocked by a hook | Delete single files with `rm` and folders with `rmdir`. |
| Build with `env -u NODE_ENV pnpm build` if a build misbehaves | An old NODE_ENV setting broke builds. |
| Before done: `pnpm typecheck && pnpm lint && pnpm test` | Ignore type errors under `.next/dev` (stale dev cache). |
| Code style: TypeScript, named exports (pages excepted), named constants, JSDoc on functions over 5 lines, comments explain why | `~/.claude/CLAUDE.md` |
| No em dashes in UI copy | His writing style. |
| UI work: reuse the site's existing CSS classes in `src/app/globals.css` (card, eb, tag, verdict, meter, wk, mini, tab, scroll) | Keep the look consistent. |

## Decisions

### Public site
1. **Standings (`src/components/panels/StandingsPanel.tsx`):** merge the category record into the W-L cell, same size, on every screen width: **1-0-0 · 8-1-0 cats**. Remove the separate grey "Cats" column (it is hidden under 700px today). Ranking stays: matchup record, then category record.
2. **End of week:** from **Sunday 11:59 PM America/New_York** a finished week shows **"Final (pending)"**, not Live. The Monday **10:00 UTC** cron (`/api/sync`, `vercel.json`) locks it as final, with late West Coast games counted. Today `syncFromEspn` in `src/lib/league.ts` only marks a week final when ESPN moves past it, or 2 days after it ends. Change that to lock at the first sync after Monday 10:00 UTC. Week dates come from `weekBounds` in `src/lib/season.ts` (UTC dates; convert the cutoff to New York time).

### Saved results (performance)
3. New table **`analytics_snapshots`**: kind (`week_moves` | `trades`), week (nullable), computed_at, data (jsonb). One migration; Stanley runs it.
4. **Monday 10:00 UTC cron:** compute pickups, streaming and categories to chase for **this week and next week**, and store them.
5. **Daily 10:00 UTC cron:** compute trade ideas and store them. The trade search (`tradeIdeas` in `src/lib/analytics.ts`, about 1s) leaves the page path.
6. **Between runs:** hide any suggested player who has since been rostered (rosters sync every 5 minutes into `league_config.espn_cache`). Add **Recompute now** buttons (admin server actions) for the week moves and for trades.

### Week screen (`/admin/analytics/week/[week]`, this and next week only)
Four tabs:

| Tab | Contents, top to bottom |
| --- | --- |
| **Matchup** (default) | 1. Games played and games left for all 4 managers (Stanley, Adam, both opponents) plus duo totals. 2. Per category: now (you / them / ±) and projected final ±, green when ahead, red when behind. 3. At the bottom: the existing category-chances table and the win %, moved there. |
| **Moves** | Pickups (from the snapshot), categories you are losing, streaming: NBA teams with 4 games that week, favorable and unfavorable opponents, free agents to stream. |
| **Rosters** | 4 boxes, one per manager: each player's stats this week, whether he plays today, games left. |
| **You vs Adam** | Teammate head-to-head for that week, category by category. Information only; it never affects results. |

- **Favorable matchup** = the NBA opponent is among the **10 worst defenses by points allowed per game**; unfavorable = the 10 best. If ESPN has no points-allowed data, stop and ask Stanley before using anything else.
- **Streaming candidates:** free agents only, ranked by games that week and matchup.
- Projections already assume every team fills its top 10 spots daily, bench included (day-by-day simulation in `fillLineup`). Keep that.

### Analytics overview (`/admin/analytics`, becomes the admin home)
Top to bottom: This week and Next week buttons → **You vs Adam**: one row per week (categories won each), monthly subtotals (calendar months), season total → **Your duo vs every duo** (season average table, kept) → strengths and odds against each duo → trade ideas (from the snapshot, with an "as of" time) → projection data and Refresh at the bottom. **Remove** the roster section.

### Admin layout
`/admin` opens to analytics. Tabs: **Analytics** (default) · **Correct scores** · **Settings** (sync, league settings, buy-ins, duos and ESPN teams, punishment picks, schedule). Nothing is deleted. The current admin is `src/components/admin/AdminApp.tsx`; analytics is `src/app/admin/analytics/` and `src/components/admin/AnalyticsView.tsx`.

### Mobile
Each task checks its own screens at 375px. Task F checks every admin screen and the public site.

## Task split

| Task | Scope | Depends on |
| --- | --- | --- |
| **A** | Standings layout (decision 1) + "Final (pending)" and the Monday lock (decision 2) | none |
| **B** | `analytics_snapshots` table and migration, cron jobs, Recompute actions, hiding picked-up players (decisions 3-6) | none |
| **C** | Streaming data: points-allowed source, 4-game NBA teams per week, favorable and unfavorable opponents, free-agent streams. A pure module B can call and store | none |
| **D** | Week screen: 4 tabs, games for the 4 managers, ± table, rosters, You vs Adam | B, C |
| **E** | Overview layout + monthly You vs Adam + admin tabs | B |
| **F** | Mobile pass + final check of the whole site | all |

## Useful facts
- Duos: Smashing Balls = Adam (ESPN team 2) + Stanley (team 1). Opponents come from `gamesForWeek` in `src/lib/playoffs.ts`.
- Per-manager weekly team totals: `team_week_stats` rows keyed by member (`d1a` = Adam, `d1b` = Stanley).
- Per-player daily stats: `player_day_stats` (active lineup only). NBA schedule: `nba_games`. Player status and draft slot: `players`.
- ESPN live team totals come from `cumulativeScoreLive`, not `cumulativeScore`.
- Analytics loader: `src/app/admin/analytics/context.ts` (`loadAnalyticsContext`, `weekWindow`, `played`, `myGame`, `cachedTradeIdeas`).

## Status (update as tasks land)

Sequencing changed from the table above: **C runs before B**, because both need schema changes and only one migration should be generated. C adds `nba_games.opponent_pro_team_id` to schema.ts without generating a migration; B adds `analytics_snapshots` and generates **one** migration covering both.

| Task | Status |
| --- | --- |
| A | done, commit 36bf32d (not pushed). Phone layout of standings still to be checked in F |
| C | done, commit (see git log). Defense: site.api.espn.com standings avgPointsAgainst, matched by abbrev. fetchNbaDefense() is not stored; B must call it |
| B | done, commit 4f60dec. Migration 0003 applied by Stanley 26 Oct 2026. Pure helpers in src/lib/snapshot-rules.ts; loader moved to src/lib/analytics-context.ts; openWeeks uses the calendar |
| D | done, commit b443d11 |
| E | done, commit 50104bf. Note for F: an in-progress week with no games yet shows 9 ties in You vs Adam; week page back link should go straight to /admin |
| F | done, commit ce18021. 375px checked by JS measurement; lower parts of screens by reasoning |

Nothing is committed by workers; the orchestrator reviews, commits, then asks Stanley to run `pnpm db:migrate` and approve the push.

All tasks done locally on 26 Oct 2026. Waiting on Stanley to approve the push. Open: Next.js printed a security advisory recommending an upgrade (not acted on).

## Round 2 feedback (26 Oct 2026, after deploy)

| # | Change |
| --- | --- |
| R1 | Remove the **Correct scores** tab from the admin tab bar. Keep the code and keep `/admin?tab=scores` working, just not linked. |
| R2 | **Settings:** remove the week matchup cards (the per-category score cards) from the Settings tab. |
| R3 | **Overview, You vs Adam:** each week row expands (e.g. `<details>`) to show every category: Stanley's value, Adam's value, who won. |
| R4 | **Moves, streaming:** team names are blank and favorable/unfavorable are all 0. Likely `nba_games.opponent_pro_team_id`/`abbrev` are still null because `refreshProjections` has not run since migration 0003, so the snapshot was built from empty data. Fix so it fills in (verify the upsert really writes them) and so a week-moves snapshot built from incomplete data gets rebuilt. Streaming must list free agents to stream; hide a section only if it is truly empty. |
| R5 | **Games left is undercounted.** Monday shows 35 per manager; expected about 40. `weekWindow` counts "days after today" from 00:00 ET Monday, so today's unplayed games are dropped. Count today's games that have not been played yet. |
| R6 | **Week, You vs Adam tab:** add projected games left for Stanley and Adam. |
| R7 | **Matchup tab, Games this week:** two columns. Left: Smashing Balls total, then Stanley, then Adam. Right: opponent duo total, then each opponent manager. Played and left for each. |
| R8 | Under that table, small pills: for each duo, its top 5 players by this league's draft pick, with how many games each plays this week (e.g. "Luka 4"). |

Round 2: done locally, commit efc4cf5, 72 tests pass. Waiting on Stanley to approve the push.

## Round 3 feedback (26 Oct 2026)

| # | Change |
| --- | --- |
| R9 | Week screen: new top-level tab **League** (after You vs Adam): every rostered player in the league plus free agents, ranked top to bottom by 9-cat value (`RatedPlayer.value`), with who owns him (manager and duo, or "Free agent"), per-game line, and games this week. Show the top 100. |
| R10 | Overview You vs Adam: add games played by Stanley and by Adam per week, in monthly subtotals and in the season total (active lineup games from player_day_stats). |
| R11 | Week screen Rosters tab gets two sub-tabs: **Stats** (exactly what it shows today) and **Schedule**. Schedule: two columns, ours (Stanley + Adam) on the left, opponent duo on the right; one row per player ordered by this league's draft pick; columns Mon to Sun of that week; "P" if he plays that day, "-" if not. IR/OUT tagged. Week 1 is Tue to Sun. |
| R12 | Pills under Games this week: each duo's top 10 = top 5 per manager by draft pick, with games this week. |

Round 3: done, pushed under the standing OK for display changes.

## Round 4 feedback (26 Oct 2026): League tab

| # | Change |
| --- | --- |
| R13 | League tab uses **this week's games only** (player_day_stats for the week, every game the player played, not just active-lineup days). Empty state ("Fills in once games are played this week") until someone has played. Rank by a weekly value: per-game z-scores across all players with 1+ game this week, summed over the 9 categories (TO inverted, FG%/FT% weighted by attempts, as in ratePlayers). |
| R14 | Owner column: every duo gets its own color, and every owner shows as a pill in that color (6 duos). Free agents get a neutral pill. Keep the row tint for Smashing Balls. |
| R15 | Heat-map background on every stat cell, from that category's z-score this week: z >= +2 is the strongest green, fading to no color at 0, then to red at z <= -2. TO is inverted (fewer is greener). The same colors in light and dark themes, with readable text. |
| R16 | Sticky header row when scrolling down, and on phones the #, Player, Owner and Games columns stay pinned while stats scroll sideways. |

Round 4: done and pushed. Games-played counts now skip all-zero ESPN rows (src/lib/games-played.ts). League tab shows rostered players only (free agents not stored).
