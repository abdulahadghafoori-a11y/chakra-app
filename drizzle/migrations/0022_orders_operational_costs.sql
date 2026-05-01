ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "delivery_cost" numeric(14, 4) DEFAULT '0' NOT NULL;
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "return_cost" numeric(14, 4) DEFAULT '0' NOT NULL;
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "cod_fee" numeric(14, 4) DEFAULT '0' NOT NULL;
