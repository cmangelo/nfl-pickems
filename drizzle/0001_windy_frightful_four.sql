ALTER TABLE "entries" ADD COLUMN "edited_by_admin_id" integer;--> statement-breakpoint
ALTER TABLE "entries" ADD COLUMN "admin_edited_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "deactivated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "weeks" ADD COLUMN "tiebreaker_game_id" integer;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_edited_by_admin_id_users_id_fk" FOREIGN KEY ("edited_by_admin_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;