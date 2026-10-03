-- Multiple entries per player per week. Hand-edited to be re-runnable (the neon-http migrator applies
-- statements one by one and records the migration only at the end) and to add the new unique index
-- before dropping the old one.
ALTER TABLE "entries" ADD COLUMN IF NOT EXISTS "entry_no" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "entries_week_user_no_idx" ON "entries" USING btree ("week_id","user_id","entry_no");--> statement-breakpoint
DROP INDEX IF EXISTS "entries_week_user_idx";--> statement-breakpoint
ALTER TABLE "entries" DROP CONSTRAINT IF EXISTS "entries_entry_no_range";--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_entry_no_range" CHECK ("entries"."entry_no" BETWEEN 1 AND 10);
