-- Sales agent: conversation state, message log, inbound idempotency.
CREATE TABLE IF NOT EXISTS "conversations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "contact_id" uuid REFERENCES "contacts"("id") ON DELETE SET NULL,
  "wa_id" text NOT NULL,
  "phone_number_id" text,
  "status" text DEFAULT 'bot' NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "conversations_wa_id_idx" ON "conversations" ("wa_id");
CREATE INDEX IF NOT EXISTS "conversations_contact_id_idx" ON "conversations" ("contact_id");

CREATE TABLE IF NOT EXISTS "conversation_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "conversation_id" uuid NOT NULL REFERENCES "conversations"("id") ON DELETE CASCADE,
  "role" text NOT NULL,
  "content" text NOT NULL,
  "provider_message_id" text,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "conversation_messages_conversation_id_idx" ON "conversation_messages" ("conversation_id");

CREATE UNIQUE INDEX IF NOT EXISTS "conversation_messages_provider_wamid_unique" ON "conversation_messages" ("provider_message_id")
  WHERE "provider_message_id" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "sales_agent_inbound_complete" (
  "wamid" text PRIMARY KEY NOT NULL,
  "completed_at" timestamptz DEFAULT now() NOT NULL
);
