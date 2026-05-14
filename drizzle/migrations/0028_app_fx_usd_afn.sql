CREATE TABLE IF NOT EXISTS "app_fx_usd_afn" (
	"singleton_id" text PRIMARY KEY DEFAULT 'singleton' NOT NULL,
	"afn_per_one_usd" numeric(18, 6) NOT NULL,
	"rate_source" text DEFAULT 'manual' NOT NULL,
	"synced_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "app_fx_usd_afn" ("singleton_id", "afn_per_one_usd", "rate_source")
VALUES ('singleton', 70, 'manual')
ON CONFLICT ("singleton_id") DO NOTHING;
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "afn_per_usd_snapshot" numeric(18, 6);
