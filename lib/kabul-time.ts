/**
 * Kabul (Asia/Kabul, UTC+4:30) wall time for CAPI `event_time` / order timestamp.
 * Values from `<input type="datetime-local" />` are interpreted as Kabul, not the browser's local zone.
 */

/** TZ for formatting DB instants (`timestamptz` stored as UTC) in the staff UI. */
export const APP_DISPLAY_TIMEZONE = "Asia/Kabul";

const KABUL_DATE_MEDIUM_SHORT: Intl.DateTimeFormatOptions = {
  timeZone: APP_DISPLAY_TIMEZONE,
  dateStyle: "medium",
  timeStyle: "short",
};

/**
 * Format a UTC instant (from Postgres) as date + time in Kabul for tables and lists.
 */
export function formatDateTimeKabul(
  input: Date | string | null | undefined,
): string {
  if (input == null || input === "") return "—";
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return "—";
  try {
    return new Intl.DateTimeFormat(
      "en-GB",
      KABUL_DATE_MEDIUM_SHORT,
    ).format(date);
  } catch {
    return "—";
  }
}

const KABUL_OFFSET = "+04:30";

const KABUL_LOCAL_RE = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

/**
 * `datetime-local` value for "now" in Kabul, e.g. `2025-01-15T10:30`.
 * Safe for `defaultValues` in a client form.
 */
export function getDefaultKabulDateTimeLocal(): string {
  const s = new Date().toLocaleString("sv-SE", { timeZone: "Asia/Kabul" });
  const [date, time] = s.split(" ");
  if (!date || !time) return "";
  return `${date}T${time.slice(0, 5)}`;
}

/**
 * Parse a Kabul wall-clock string from `datetime-local` into a UTC `Date` instant.
 * Appends `+04:30` and uses ISO-8601 parsing.
 */
export function kabulDateTimeLocalToDate(value: string): Date {
  const trimmed = value.trim();
  const m = trimmed.match(KABUL_LOCAL_RE);
  if (!m) {
    throw new Error("Invalid Kabul date/time; use YYYY-MM-DDTHH:mm");
  }
  const [, d, hh, mm, sec] = m;
  const seconds = sec ?? "00";
  const iso = `${d}T${hh}:${mm}:${seconds}${KABUL_OFFSET}`;
  const out = new Date(iso);
  if (Number.isNaN(out.getTime())) {
    throw new Error("Invalid Kabul date/time");
  }
  return out;
}

/** Human-readable Kabul time + Unix seconds (for CAPI / review UI). */
export function describeKabulLocalForMeta(value: string): {
  kabulLabel: string;
  unixSeconds: number;
} {
  const d = kabulDateTimeLocalToDate(value);
  const unixSeconds = Math.floor(d.getTime() / 1000);
  const kabulLabel = formatDateTimeKabul(d);
  return { kabulLabel, unixSeconds };
}

/** Meta rejects events with event_time more than ~7 days in the past. */
export function isWithinMetaEventTimeWindow(
  d: Date,
  now: Date = new Date(),
): boolean {
  const min = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  return d.getTime() >= min;
}
