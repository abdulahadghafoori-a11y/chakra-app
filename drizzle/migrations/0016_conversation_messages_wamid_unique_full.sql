-- Partial unique index cannot serve as ON CONFLICT arbiter for provider_message_id (42P10).
-- Replace with a full unique index; Postgres still allows many rows with NULL provider_message_id.
DROP INDEX IF EXISTS "conversation_messages_provider_wamid_unique";

CREATE UNIQUE INDEX "conversation_messages_provider_wamid_unique" ON "conversation_messages" ("provider_message_id");
