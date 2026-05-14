ALTER TABLE "ad_insights_daily" ADD COLUMN IF NOT EXISTS "frequency" numeric(14, 6);
--> statement-breakpoint
ALTER TABLE "ad_insights_daily" ADD COLUMN IF NOT EXISTS "quality_ranking" text;
--> statement-breakpoint
ALTER TABLE "ad_insights_daily" ADD COLUMN IF NOT EXISTS "first_time_impression_ratio" numeric(16, 8);
