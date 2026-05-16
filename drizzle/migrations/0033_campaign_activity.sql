CREATE TABLE IF NOT EXISTS "campaign_activity" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "meta_campaign_id" text NOT NULL REFERENCES "meta_campaigns"("id") ON DELETE CASCADE,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by_email" text NOT NULL,
  "kind" text NOT NULL,
  "body" text NOT NULL,
  "metadata" jsonb
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "campaign_activity_meta_campaign_id_idx" ON "campaign_activity" ("meta_campaign_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "campaign_activity_created_at_idx" ON "campaign_activity" ("created_at");
