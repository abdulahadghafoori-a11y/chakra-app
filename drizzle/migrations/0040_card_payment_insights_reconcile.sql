ALTER TABLE "card_payments" ADD COLUMN IF NOT EXISTS "insights_period_start" date;
--> statement-breakpoint
ALTER TABLE "card_payments" ADD COLUMN IF NOT EXISTS "insights_period_end" date;
--> statement-breakpoint
ALTER TABLE "card_payments" ADD COLUMN IF NOT EXISTS "insights_spend_usd" numeric(14, 4);
--> statement-breakpoint
ALTER TABLE "card_payments" ADD COLUMN IF NOT EXISTS "cash_scale_factor" numeric(18, 6);
