CREATE TABLE "entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"week_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"tiebreaker" integer NOT NULL,
	"paid" boolean DEFAULT false NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "games" (
	"id" serial PRIMARY KEY NOT NULL,
	"week_id" integer NOT NULL,
	"espn_id" text NOT NULL,
	"kickoff_at" timestamp with time zone NOT NULL,
	"home_team" text NOT NULL,
	"away_team" text NOT NULL,
	"home_score" integer,
	"away_score" integer,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"winner" text,
	"manual_override" boolean DEFAULT false NOT NULL,
	CONSTRAINT "games_espn_id_unique" UNIQUE("espn_id")
);
--> statement-breakpoint
CREATE TABLE "picks" (
	"entry_id" integer NOT NULL,
	"game_id" integer NOT NULL,
	"pick" text NOT NULL,
	CONSTRAINT "picks_entry_id_game_id_pk" PRIMARY KEY("entry_id","game_id")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_state" (
	"key" text PRIMARY KEY NOT NULL,
	"last_synced_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"first_name" text NOT NULL,
	"username" text NOT NULL,
	"pin_hash" text NOT NULL,
	"is_admin" boolean DEFAULT false NOT NULL,
	"failed_attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "weeks" (
	"id" serial PRIMARY KEY NOT NULL,
	"season" integer NOT NULL,
	"week_number" integer NOT NULL,
	"unlock_at" timestamp with time zone NOT NULL,
	"lock_at" timestamp with time zone NOT NULL,
	"lock_override_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_week_id_weeks_id_fk" FOREIGN KEY ("week_id") REFERENCES "public"."weeks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_week_id_weeks_id_fk" FOREIGN KEY ("week_id") REFERENCES "public"."weeks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "picks" ADD CONSTRAINT "picks_entry_id_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "picks" ADD CONSTRAINT "picks_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "entries_week_user_idx" ON "entries" USING btree ("week_id","user_id");--> statement-breakpoint
CREATE INDEX "games_week_idx" ON "games" USING btree ("week_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_lower_idx" ON "users" USING btree (lower("username"));--> statement-breakpoint
CREATE UNIQUE INDEX "weeks_season_week_idx" ON "weeks" USING btree ("season","week_number");