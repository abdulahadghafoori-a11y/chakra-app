CREATE TABLE IF NOT EXISTS "employees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"role" text,
	"phone" text,
	"is_active" boolean NOT NULL DEFAULT true,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "employees_is_active_idx" ON "employees" ("is_active");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payroll_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"paid_at" date NOT NULL,
	"period_label" text,
	"amount_afn" numeric(18, 0) NOT NULL,
	"afn_per_usd_snapshot" numeric(18, 6) NOT NULL,
	"amount" numeric(14, 4) NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payroll_payments" ADD CONSTRAINT "payroll_payments_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payroll_payments_paid_at_idx" ON "payroll_payments" ("paid_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payroll_payments_employee_id_idx" ON "payroll_payments" ("employee_id");
