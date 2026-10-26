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
