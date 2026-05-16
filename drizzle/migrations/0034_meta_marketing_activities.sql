CREATE TABLE IF NOT EXISTS "meta_marketing_activities" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "dedupe_key" text NOT NULL,
  "meta_campaign_id" text NOT NULL REFERENCES "meta_campaigns"("id") ON DELETE CASCADE,
  "event_time" timestamp with time zone NOT NULL,
  "event_type" text NOT NULL,
  "translated_event_type" text,
  "actor_id" text,
  "actor_name" text,
  "application_name" text,
  "object_id" text,
  "object_name" text,
  "object_type" text,
  "extra_data" jsonb,
  "synced_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "meta_marketing_activities_dedupe_key_unique" UNIQUE ("dedupe_key")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "meta_marketing_activities_campaign_event_idx" ON "meta_marketing_activities" ("meta_campaign_id", "event_time");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "meta_marketing_activities_event_time_idx" ON "meta_marketing_activities" ("event_time");
