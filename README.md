# Gooners (fantasy-basketball)

Live site for a 12-manager ESPN fantasy basketball league played as six two-person duos. Each week the duos' combined ESPN stats go head to head across nine categories, and the site keeps the standings, weekly matchups, payouts and punishments up to date on its own.

## How it works

- **ESPN sync.** `src/lib/espn.ts` reads the league from ESPN's fantasy JSON endpoint (the league is public, so no login is needed). Page views trigger a sync when data is more than 5 minutes old, and a Vercel Cron job runs a backup sync daily.
- **Duo scoring.** `src/lib/scoring.ts` sums both managers' raw stats, then compares duos category by category. FG% and FT% come from summed makes and attempts, never from averaging percentages. Turnovers are lower-is-better.
- **Storage.** Neon Postgres via Drizzle (`src/lib/db/schema.ts`): one config row, one row per ESPN team per week, and a week-final flag. Rows typed in by hand are marked `manual` and are never overwritten by a sync.
- **Admin.** `/admin` is password protected. It maps ESPN teams to managers, edits duo names, punishments and pairings, and corrects scores.

## Stack

Next.js 16 (App Router, TypeScript), Drizzle ORM, Neon Postgres, Vitest, hosted on Vercel.

## Local development

```bash
pnpm install
cp .env.example .env.local   # fill in values
pnpm db:push                 # create tables in Neon
pnpm dev
```

Without `DATABASE_URL` the site still runs read-only, pulling straight from ESPN.

```bash
pnpm test        # scoring and calendar tests
pnpm typecheck
pnpm lint
```

## Environment variables

| Name | Purpose |
| --- | --- |
| `DATABASE_URL` | Neon connection string. Added automatically by the Vercel Neon integration. |
| `ADMIN_PASSWORD` | Password for `/admin`. |
| `CRON_SECRET` | Shared secret Vercel Cron sends to `/api/sync`. |
| `ESPN_S2`, `ESPN_SWID` | Only if the ESPN league is made private. |
