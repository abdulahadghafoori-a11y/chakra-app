CREATE TABLE IF NOT EXISTS "card_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_id" uuid NOT NULL,
	"paid_at" date NOT NULL,
	"payee" text NOT NULL,
	"amount_afn" numeric(18, 0) NOT NULL,
	"afn_per_usd_snapshot" numeric(18, 6) NOT NULL,
	"amount" numeric(14, 4) NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"statement_ref" text,
	"external_ref" text,
	"note" text,
	"linked_expense_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "card_payments" ADD CONSTRAINT "card_payments_category_id_expense_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "expense_categories"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "card_payments" ADD CONSTRAINT "card_payments_linked_expense_id_business_expenses_id_fk" FOREIGN KEY ("linked_expense_id") REFERENCES "business_expenses"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "card_payments_linked_expense_id_unique" ON "card_payments" ("linked_expense_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "card_payments_paid_at_idx" ON "card_payments" ("paid_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "card_payments_category_id_idx" ON "card_payments" ("category_id");
