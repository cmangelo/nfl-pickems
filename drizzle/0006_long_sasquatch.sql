ALTER TABLE "chat_messages" DROP CONSTRAINT "chat_messages_body_length";--> statement-breakpoint
ALTER TABLE "chat_messages" ALTER COLUMN "body" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "deleted_by_id" integer;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_deleted_by_id_users_id_fk" FOREIGN KEY ("deleted_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_body_length" CHECK (("chat_messages"."deleted_at" IS NULL AND "chat_messages"."body" IS NOT NULL AND char_length("chat_messages"."body") BETWEEN 1 AND 500) OR ("chat_messages"."deleted_at" IS NOT NULL AND "chat_messages"."body" IS NULL));