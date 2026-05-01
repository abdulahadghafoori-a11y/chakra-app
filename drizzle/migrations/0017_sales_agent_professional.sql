-- Sales agent: stage, lead, handoff metadata, customer profile, draft orders, CAPI funnel dedupe.
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "stage" text DEFAULT 'new' NOT NULL;
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "lead_score" text;
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "handoff_reason" text;
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "handoff_at" timestamptz;
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "conversation_summary" text;

CREATE INDEX IF NOT EXISTS "conversations_stage_idx" ON "conversations" ("stage");
CREATE INDEX IF NOT EXISTS "conversations_lead_score_idx" ON "conversations" ("lead_score");

CREATE TABLE IF NOT EXISTS "conversation_profiles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "conversation_id" uuid NOT NULL REFERENCES "conversations"("id") ON DELETE CASCADE,
  "customer_name" text,
  "city" text,
  "address_note" text,
  "interested_product_ids" text,
  "budget_band" text,
  "urgency" text,
  "trust_objection" boolean DEFAULT false NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "conversation_profiles_conversation_id_unique" UNIQUE ("conversation_id")
);

CREATE INDEX IF NOT EXISTS "conversation_profiles_conversation_id_idx" ON "conversation_profiles" ("conversation_id");

CREATE TABLE IF NOT EXISTS "sales_draft_orders" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "conversation_id" uuid NOT NULL REFERENCES "conversations"("id") ON DELETE CASCADE,
  "contact_id" uuid REFERENCES "contacts"("id") ON DELETE SET NULL,
  "payload" jsonb NOT NULL DEFAULT '{}',
  "status" text DEFAULT 'draft' NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "sales_draft_orders_conversation_id_idx" ON "sales_draft_orders" ("conversation_id");

CREATE TABLE IF NOT EXISTS "agent_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "conversation_id" uuid NOT NULL REFERENCES "conversations"("id") ON DELETE CASCADE,
  "event_name" text NOT NULL,
  "dedupe_key" text NOT NULL,
  "sent_at" timestamptz DEFAULT now() NOT NULL,
  "metadata" jsonb,
  CONSTRAINT "agent_events_conversation_dedupe_unique" UNIQUE ("conversation_id", "dedupe_key")
);

CREATE INDEX IF NOT EXISTS "agent_events_conversation_id_idx" ON "agent_events" ("conversation_id");
