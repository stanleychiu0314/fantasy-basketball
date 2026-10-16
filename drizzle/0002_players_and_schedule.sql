CREATE TABLE "nba_games" (
	"pro_team_id" integer NOT NULL,
	"day" integer NOT NULL,
	CONSTRAINT "nba_games_pro_team_id_day_pk" PRIMARY KEY("pro_team_id","day")
);
--> statement-breakpoint
CREATE TABLE "players" (
	"player_id" integer PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"pro_team_id" integer NOT NULL,
	"on_team_id" integer,
	"injury_status" text NOT NULL,
	"draft_pick" integer,
	"adp" real,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
