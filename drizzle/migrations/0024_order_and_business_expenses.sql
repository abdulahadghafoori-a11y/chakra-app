CREATE TABLE IF NOT EXISTS "order_expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" text NOT NULL REFERENCES "orders"("id") ON DELETE CASCADE,
	"category" text NOT NULL,
	"amount" numeric(14, 4) NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "order_expenses_order_id_idx" ON "order_expenses" ("order_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "business_expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category" text NOT NULL,
	"amount" numeric(14, 4) NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"note" text,
	"incurred_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "business_expenses_incurred_date_idx" ON "business_expenses" ("incurred_date");
