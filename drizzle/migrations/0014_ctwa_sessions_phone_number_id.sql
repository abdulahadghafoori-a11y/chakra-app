-- Cloud API phone number id (receiving number) per session; WABA stays in waba_id.
ALTER TABLE "ctwa_sessions" ADD COLUMN IF NOT EXISTS "phone_number_id" text;

-- Normalize contacts to international digits only (WhatsApp wa_id style).
UPDATE "contacts" SET "phone_number" = regexp_replace("phone_number", '\D', '', 'g') WHERE "phone_number" ~ '[^0-9]';
