CREATE TABLE "player_projections" (
	"source" text NOT NULL,
	"kind" text NOT NULL,
	"player_id" integer NOT NULL,
	"player_name" text NOT NULL,
	"line" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_projections_source_player_id_pk" PRIMARY KEY("source","player_id")
);
