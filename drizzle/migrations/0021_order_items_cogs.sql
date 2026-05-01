ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "unit_cogs" numeric(14, 4) DEFAULT '0' NOT NULL;
--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "line_cogs" numeric(14, 4) DEFAULT '0' NOT NULL;
--> statement-breakpoint
UPDATE "order_items" oi
SET
  "unit_cogs" = p.cogs,
  "line_cogs" = (p.cogs::numeric * oi.quantity::numeric)
FROM "products" p
WHERE oi.product_id = p.id;
