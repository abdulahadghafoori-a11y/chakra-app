import { parsePhoneNumberFromString } from "libphonenumber-js";

export type PhonePresentation = {
  /** E.g. international format with spaces */
  formattedInternational: string;
  /** ISO 3166-1 alpha-2, if known */
  countryCode: string | null;
  /** English region name, if known */
  countryName: string | null;
};

/**
 * Derives display formatting and country from stored `contacts.phone_number`
 * (international digits) or legacy E.164 with `+`.
 */
export function getPhonePresentation(storedPhone: string): PhonePresentation {
  if (!storedPhone?.trim()) {
    return {
      formattedInternational: "",
      countryCode: null,
      countryName: null,
    };
  }

  const raw = storedPhone.trim();
  const forParse = raw.startsWith("+")
    ? raw
    : `+${raw.replace(/\D/g, "")}`;

  const parsed = parsePhoneNumberFromString(forParse);
  if (!parsed) {
    return {
      formattedInternational: raw,
      countryCode: null,
      countryName: null,
    };
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

  return {
    formattedInternational: parsed.formatInternational(),
    countryCode: cc,
    countryName,
  };
}
