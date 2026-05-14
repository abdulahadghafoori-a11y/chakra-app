ALTER TABLE "order_items" DROP COLUMN IF EXISTS "unit_sale_price_afn";
--> statement-breakpoint
ALTER TABLE "order_items" DROP COLUMN IF EXISTS "line_value_afn";
--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN IF EXISTS "value_afn";
--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN IF EXISTS "delivery_cost_afn";
