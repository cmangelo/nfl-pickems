DROP INDEX "entries_week_user_idx";--> statement-breakpoint
ALTER TABLE "entries" ADD COLUMN "entry_no" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "entries_week_user_no_idx" ON "entries" USING btree ("week_id","user_id","entry_no");--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_entry_no_range" CHECK ("entries"."entry_no" BETWEEN 1 AND 10);