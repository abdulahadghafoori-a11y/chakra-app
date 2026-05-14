const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export const CAMPAIGN_RANGE_PRESETS = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "last_2", label: "Last 2 days" },
  { id: "last_3", label: "Last 3 days" },
  { id: "last_7", label: "Last 7 days" },
  { id: "last_14", label: "Last 14 days" },
  { id: "last_30", label: "Last 30 days" },
  { id: "last_90", label: "Last 90 days" },
] as const;

export type CampaignRangePresetId = (typeof CAMPAIGN_RANGE_PRESETS)[number]["id"];

export const CUSTOM_RANGE_SELECT_VALUE = "custom";

export type CampaignInsightsBounds = {
  sinceDay: string;
  untilDay: string;
  sinceIso: string;
  untilIso: string;
  label: string;
};

export type ParsedCampaignRange = CampaignInsightsBounds & {
  /** For URL sync: preset id, `custom`, or `days:N` (legacy). */
  selectValue: string;
  isCustom: boolean;
  /** Short label for UI, e.g. "Last 7 days" or "Custom (2025-01-01 → 2025-01-07)". */
  displayLabel: string;
};

function presetHumanLabel(id: CampaignRangePresetId): string {
  const p = CAMPAIGN_RANGE_PRESETS.find((x) => x.id === id);
  return p?.label ?? id;
}

function isoDateUTC(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function boundsFromSinceUntilDays(
  sinceDay: string,
  untilDay: string,
): CampaignInsightsBounds {
  const since = new Date(`${sinceDay}T00:00:00.000Z`);
  const until = new Date(`${untilDay}T23:59:59.999Z`);
  return {
    sinceDay,
    untilDay,
    sinceIso: since.toISOString(),
    untilIso: until.toISOString(),
    label: `${sinceDay} → ${untilDay}`,
  };
}

export function daysBetweenInclusive(sinceDay: string, untilDay: string): number {
  const a = new Date(`${sinceDay}T00:00:00.000Z`).getTime();
  const b = new Date(`${untilDay}T00:00:00.000Z`).getTime();
  return Math.floor((b - a) / 86_400_000) + 1;
}

export function addUtcDaysToDateOnly(day: string, deltaDays: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays));
  return isoDateUTC(dt);
}

export function isValidUtcDateOnly(s: string): boolean {
  if (!DATE_ONLY.test(s)) return false;
  const t = new Date(`${s}T00:00:00.000Z`).getTime();
  if (Number.isNaN(t)) return false;
  return isoDateUTC(new Date(t)) === s;
}

/** Rolling last N calendar days in UTC, inclusive through today (1–90). */
export function clampCampaignInsightsDays(raw: number): number {
  if (!Number.isFinite(raw)) return 30;
  return Math.min(90, Math.max(1, Math.floor(raw)));
}

function rollingLastNDaysUtc(n: number): CampaignInsightsBounds {
  const days = clampCampaignInsightsDays(n);
  const now = new Date();
  const untilDay = isoDateUTC(now);
  const since = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() - (days - 1),
    ),
  );
  const sinceDay = isoDateUTC(since);
  return boundsFromSinceUntilDays(sinceDay, untilDay);
}

function presetBounds(id: CampaignRangePresetId): CampaignInsightsBounds {
  const now = new Date();
  switch (id) {
    case "today": {
      const d = isoDateUTC(now);
      return boundsFromSinceUntilDays(d, d);
    }
    case "yesterday": {
      const y = new Date(
        Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          now.getUTCDate() - 1,
        ),
      );
      const d = isoDateUTC(y);
      return boundsFromSinceUntilDays(d, d);
    }
    case "last_2":
    case "last_3":
    case "last_7":
    case "last_14":
    case "last_30":
    case "last_90": {
      const spanById = {
        last_2: 2,
        last_3: 3,
        last_7: 7,
        last_14: 14,
        last_30: 30,
        last_90: 90,
      } as const;
      const span = spanById[id];
      const untilDay = isoDateUTC(now);
      const since = new Date(
        Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          now.getUTCDate() - (span - 1),
        ),
      );
      const sinceDay = isoDateUTC(since);
      return boundsFromSinceUntilDays(sinceDay, untilDay);
    }
  }
}

function isPresetId(s: string): s is CampaignRangePresetId {
  return CAMPAIGN_RANGE_PRESETS.some((p) => p.id === s);
}

/** Limits insight sync / ROAS query length (Marketing API–friendly). */
const MAX_INSIGHT_RANGE_DAYS = 90;

function clampCustomToMaxSpan(
  from: string,
  until: string,
): { from: string; until: string } {
  const span = daysBetweenInclusive(from, until);
  if (span <= MAX_INSIGHT_RANGE_DAYS) return { from, until };
  const newFrom = addUtcDaysToDateOnly(until, -(MAX_INSIGHT_RANGE_DAYS - 1));
  return { from: newFrom, until };
}

export function assertValidCampaignInsightRange(
  sinceDay: string,
  untilDay: string,
): void {
  if (
    !isValidUtcDateOnly(sinceDay) ||
    !isValidUtcDateOnly(untilDay) ||
    sinceDay > untilDay
  ) {
    throw new Error("Invalid insights date range");
  }
  if (daysBetweenInclusive(sinceDay, untilDay) > MAX_INSIGHT_RANGE_DAYS) {
    throw new Error(`Insights range cannot exceed ${MAX_INSIGHT_RANGE_DAYS} days`);
  }
}

type SearchParamsSlice = {
  range?: string;
  from?: string;
  to?: string;
  /** @deprecated use `range` or `from`+`to` */
  days?: string;
};

export function parseCampaignRangeSearchParams(
  sp: SearchParamsSlice,
): ParsedCampaignRange {
  const fromRaw = sp.from?.trim();
  const toRaw = sp.to?.trim();

  if (
    fromRaw &&
    toRaw &&
    isValidUtcDateOnly(fromRaw) &&
    isValidUtcDateOnly(toRaw) &&
    fromRaw <= toRaw
  ) {
    const { from, until } = clampCustomToMaxSpan(fromRaw, toRaw);
    const b = boundsFromSinceUntilDays(from, until);
    return {
      ...b,
      selectValue: CUSTOM_RANGE_SELECT_VALUE,
      isCustom: true,
      displayLabel: `Custom (${from} → ${until})`,
    };
  }

  const rangeRaw = sp.range?.trim();
  if (rangeRaw && isPresetId(rangeRaw)) {
    const b = presetBounds(rangeRaw);
    return {
      ...b,
      selectValue: rangeRaw,
      isCustom: false,
      displayLabel: presetHumanLabel(rangeRaw),
    };
  }

  if (sp.days != null && sp.days !== "") {
    const n = Number.parseInt(sp.days, 10);
    const b = rollingLastNDaysUtc(n);
    const d = clampCampaignInsightsDays(Number.isFinite(n) ? n : 30);
    return {
      ...b,
      selectValue: `days:${d}`,
      isCustom: false,
      displayLabel: legacyDaysSelectLabel(d),
    };
  }

  const b = presetBounds("last_7");
  return {
    ...b,
    selectValue: "last_7",
    isCustom: false,
    displayLabel: presetHumanLabel("last_7"),
  };
}

/** Label for legacy `days:N` select value (rolling window). */
export function legacyDaysSelectLabel(days: number): string {
  const d = clampCampaignInsightsDays(days);
  return `Last ${d} days (rolling)`;
}
