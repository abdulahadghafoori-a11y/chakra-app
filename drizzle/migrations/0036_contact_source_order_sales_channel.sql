ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "source" text NOT NULL DEFAULT 'whatsapp';
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "sales_channel" text NOT NULL DEFAULT 'online';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "orders_sales_channel_idx" ON "orders" ("sales_channel");
