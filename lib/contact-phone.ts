import { parsePhoneNumberFromString } from "libphonenumber-js";

import { e164ToDigits, parseToE164 } from "@/lib/phone-e164";

/**
 * Canonical key for `contacts.phone_number`: international digits only (WhatsApp `wa_id` style).
 * Accepts typed user input (national or E.164) via `parseToE164`.
 */
export function contactPhoneKeyFromRaw(raw: string): string | null {
  const trimmed = raw.trim().replace(/\s/g, "");
  if (!trimmed) return null;
  const e164 = parseToE164(trimmed);
  if (!e164) return null;
  return e164ToDigits(e164);
}

export function countryFromPhoneDigits(digits: string): {
  countryCode: string | null;
  countryName: string | null;
} {
  const d = digits.replace(/\D/g, "");
  if (!d) return { countryCode: null, countryName: null };
  const parsed = parsePhoneNumberFromString(`+${d}`);
  if (!parsed?.isValid()) {
    return { countryCode: null, countryName: null };
  }
  const cc = parsed.country ?? null;
  let countryName: string | null = null;
  if (cc) {
    try {
      countryName =
        new Intl.DisplayNames(["en"], { type: "region" }).of(cc) ?? cc;
    } catch {
      countryName = cc;
    }
  }
  return { countryCode: cc, countryName };
}
