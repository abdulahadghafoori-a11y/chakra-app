ALTER TABLE "ad_insights_daily" ADD COLUMN IF NOT EXISTS "messaging_conversations_started" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "ad_insights_daily" ADD COLUMN IF NOT EXISTS "meta_purchases" integer DEFAULT 0 NOT NULL;
