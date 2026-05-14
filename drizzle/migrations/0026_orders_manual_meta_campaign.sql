ALTER TABLE "orders"
ADD COLUMN IF NOT EXISTS "manual_meta_campaign_id" text REFERENCES "meta_campaigns"("id") ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "orders_manual_meta_campaign_id_idx" ON "orders" ("manual_meta_campaign_id");
