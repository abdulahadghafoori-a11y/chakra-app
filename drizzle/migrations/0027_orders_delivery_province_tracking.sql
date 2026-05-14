ALTER TABLE "orders"
ADD COLUMN IF NOT EXISTS "delivery_province_afghanistan" text;
--> statement-breakpoint
ALTER TABLE "orders"
ADD COLUMN IF NOT EXISTS "delivery_tracking_number" text;
