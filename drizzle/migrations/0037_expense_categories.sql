CREATE TABLE IF NOT EXISTS "expense_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"kind" text NOT NULL DEFAULT 'other',
	"color_key" text NOT NULL DEFAULT 'slate',
	"is_active" boolean NOT NULL DEFAULT true,
	"sort_order" integer NOT NULL DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "expense_categories_name_unique" ON "expense_categories" ("name");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "expense_categories_slug_unique" ON "expense_categories" ("slug");
--> statement-breakpoint
INSERT INTO "expense_categories" ("name", "slug", "kind", "color_key", "sort_order") VALUES
  ('Rent', 'rent', 'facilities', 'violet', 10),
  ('Electricity', 'electricity', 'facilities', 'yellow', 20),
  ('Food', 'food', 'operations', 'orange', 30),
  ('Bike fuel', 'bike-fuel', 'vehicle', 'amber', 40),
  ('Repair cost', 'repair-cost', 'vehicle', 'rose', 50),
  ('Delivery cost (overhead)', 'delivery-overhead', 'operations', 'sky', 60),
  ('Packaging', 'packaging', 'operations', 'teal', 70),
  ('Supplies', 'supplies', 'operations', 'cyan', 80),
  ('Marketing (non-Meta)', 'marketing-non-meta', 'operations', 'fuchsia', 90),
  ('Bank fees', 'bank-fees', 'overhead', 'slate', 100),
  ('Software / subscriptions', 'software', 'overhead', 'indigo', 110),
  ('Accountant / legal', 'professional', 'overhead', 'purple', 120),
  ('Insurance', 'insurance', 'overhead', 'blue', 130),
  ('Shop supplies', 'shop-supplies', 'operations', 'lime', 140),
  ('Vehicle maintenance', 'vehicle-maintenance', 'vehicle', 'red', 150),
  ('Utilities', 'utilities', 'facilities', 'yellow', 25),
  ('Other', 'other', 'other', 'slate', 999)
ON CONFLICT DO NOTHING;
--> statement-breakpoint
ALTER TABLE "business_expenses" ADD COLUMN IF NOT EXISTS "category_id" uuid;
--> statement-breakpoint
ALTER TABLE "business_expenses" ADD COLUMN IF NOT EXISTS "amount_afn" numeric(18, 0);
--> statement-breakpoint
ALTER TABLE "business_expenses" ADD COLUMN IF NOT EXISTS "afn_per_usd_snapshot" numeric(18, 6);
--> statement-breakpoint
ALTER TABLE "business_expenses" ADD COLUMN IF NOT EXISTS "vendor" text;
--> statement-breakpoint
ALTER TABLE "business_expenses" ADD COLUMN IF NOT EXISTS "receipt_ref" text;
--> statement-breakpoint
UPDATE "business_expenses" SET "category_id" = (SELECT "id" FROM "expense_categories" WHERE "slug" = 'rent' LIMIT 1) WHERE "category" = 'rent' AND "category_id" IS NULL;
--> statement-breakpoint
UPDATE "business_expenses" SET "category_id" = (SELECT "id" FROM "expense_categories" WHERE "slug" = 'electricity' LIMIT 1) WHERE "category" = 'electricity' AND "category_id" IS NULL;
--> statement-breakpoint
UPDATE "business_expenses" SET "category_id" = (SELECT "id" FROM "expense_categories" WHERE "slug" = 'utilities' LIMIT 1) WHERE "category" = 'utilities' AND "category_id" IS NULL;
--> statement-breakpoint
UPDATE "business_expenses" SET "category_id" = (SELECT "id" FROM "expense_categories" WHERE "slug" = 'other' LIMIT 1) WHERE "category_id" IS NULL;
--> statement-breakpoint
UPDATE "business_expenses" SET "amount_afn" = ROUND("amount"::numeric * COALESCE("afn_per_usd_snapshot", (SELECT "afn_per_one_usd"::numeric FROM "app_fx_usd_afn" WHERE "singleton_id" = 'singleton' LIMIT 1), 70)) WHERE "amount_afn" IS NULL;
--> statement-breakpoint
UPDATE "business_expenses" SET "afn_per_usd_snapshot" = (SELECT "afn_per_one_usd"::numeric FROM "app_fx_usd_afn" WHERE "singleton_id" = 'singleton' LIMIT 1) WHERE "afn_per_usd_snapshot" IS NULL;
--> statement-breakpoint
ALTER TABLE "business_expenses" DROP COLUMN IF EXISTS "category";
--> statement-breakpoint
ALTER TABLE "business_expenses" ALTER COLUMN "category_id" SET NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "business_expenses" ADD CONSTRAINT "business_expenses_category_id_expense_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "expense_categories"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "business_expenses_category_id_idx" ON "business_expenses" ("category_id");
