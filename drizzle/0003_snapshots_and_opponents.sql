CREATE TABLE "analytics_snapshots" (
	"key" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"week" integer,
	"computed_at" timestamp with time zone NOT NULL,
	"data" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "nba_games" ADD COLUMN "opponent_pro_team_id" integer;--> statement-breakpoint
ALTER TABLE "nba_games" ADD COLUMN "abbrev" text;