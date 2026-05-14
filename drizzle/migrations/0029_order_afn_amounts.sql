ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "value_afn" numeric(14, 4);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "delivery_cost_afn" numeric(14, 4) NOT NULL DEFAULT '0';
--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "unit_sale_price_afn" numeric(14, 4);
--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "line_value_afn" numeric(14, 4);
