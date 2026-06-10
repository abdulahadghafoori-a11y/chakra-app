ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "campaign_attributed_at" timestamp with time zone;
--> statement-breakpoint
UPDATE "orders" AS o
SET "campaign_attributed_at" = s."send_time"
FROM "ctwa_sessions" AS s
WHERE o."ctwa_session_id" = s."id"
  AND o."campaign_attributed_at" IS NULL;
--> statement-breakpoint
UPDATE "orders"
SET "campaign_attributed_at" = "order_event_at"
WHERE "manual_meta_campaign_id" IS NOT NULL
  AND "ctwa_session_id" IS NULL
  AND "campaign_attributed_at" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "orders_campaign_attributed_at_idx" ON "orders" ("campaign_attributed_at" DESC);
