CREATE TABLE "league_config" (
	"id" integer PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"espn_cache" jsonb,
	"last_synced" timestamp with time zone,
	"last_day_synced" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"member" text PRIMARY KEY NOT NULL,
	"paid" boolean DEFAULT false NOT NULL,
	"paid_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "player_day_stats" (
	"day" integer NOT NULL,
	"week" integer NOT NULL,
	"player_id" integer NOT NULL,
	"player_name" text NOT NULL,
	"espn_team_id" integer NOT NULL,
	"lineup_slot" integer NOT NULL,
	"active" boolean NOT NULL,
	"fgm" integer NOT NULL,
	"fga" integer NOT NULL,
	"ftm" integer NOT NULL,
	"fta" integer NOT NULL,
	"tpm" integer NOT NULL,
	"reb" integer NOT NULL,
	"ast" integer NOT NULL,
	"stl" integer NOT NULL,
	"blk" integer NOT NULL,
	"to" integer NOT NULL,
	"pts" integer NOT NULL,
	CONSTRAINT "player_day_stats_day_player_id_pk" PRIMARY KEY("day","player_id")
);
--> statement-breakpoint
CREATE TABLE "score_edits" (
	"id" serial PRIMARY KEY NOT NULL,
	"week" integer NOT NULL,
	"member" text NOT NULL,
	"action" text NOT NULL,
	"old_stats" jsonb,
	"new_stats" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_week_stats" (
	"week" integer NOT NULL,
	"member" text NOT NULL,
	"stats" jsonb NOT NULL,
	"source" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_week_stats_week_member_pk" PRIMARY KEY("week","member")
);
--> statement-breakpoint
CREATE TABLE "trade_alerts" (
	"id" text PRIMARY KEY NOT NULL,
	"player_id" integer NOT NULL,
	"player_name" text NOT NULL,
	"from_member" text NOT NULL,
	"to_member" text NOT NULL,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"dismissed" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "week_status" (
	"week" integer PRIMARY KEY NOT NULL,
	"final" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE INDEX "player_day_stats_week_idx" ON "player_day_stats" USING btree ("week");