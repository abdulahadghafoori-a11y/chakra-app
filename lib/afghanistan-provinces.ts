/**
 * Afghanistan provinces (34) — English labels for staff UI.
 */
export const AFGHANISTAN_PROVINCES = [
  "Badakhshan",
  "Badghis",
  "Baghlan",
  "Balkh",
  "Bamyan",
  "Daykundi",
  "Farah",
  "Faryab",
  "Ghazni",
  "Ghor",
  "Helmand",
  "Herat",
  "Jowzjan",
  "Kabul",
  "Kandahar",
  "Kapisa",
  "Khost",
  "Kunar",
  "Kunduz",
  "Laghman",
  "Logar",
  "Nangarhar",
  "Nimruz",
  "Nuristan",
  "Paktia",
  "Paktika",
  "Panjshir",
  "Parwan",
  "Samangan",
  "Sar-e Pol",
  "Takhar",
  "Urozgan",
  "Maidan Wardak",
  "Zabul",
] as const;

export type AfghanistanProvince = (typeof AFGHANISTAN_PROVINCES)[number];

export const AFGHANISTAN_PROVINCE_SET = new Set<string>(AFGHANISTAN_PROVINCES);

/** Provinces other than Kabul — used when staff marks delivery outside local Kabul. */
export const AFGHANISTAN_PROVINCES_OUTSIDE_KABUL = AFGHANISTAN_PROVINCES.filter(
  (p) => p !== "Kabul",
);

export const AFGHANISTAN_OUTSIDE_KABUL_PROVINCE_SET = new Set<string>(
  AFGHANISTAN_PROVINCES_OUTSIDE_KABUL,
);
