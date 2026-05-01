/**
 * Parse Meta Ads Insights `actions` breakdown for funnel optimization.
 * App-recorded CTWA + orders remain source of truth; these power Meta-side signals.
 *
 * Notes:
 * - Graph may return several rows per `action_type`; Ads Manager totals are sums — never `.find` one row.
 * - `value` may be a string or number; some rows expose counts only on `7d_click` / `1d_click`.
 */

export type InsightActionRow = {
  action_type?: string;
  /** Raw row for attribution-window fields. */
  raw: Record<string, unknown>;
};

function rowMetric(row: Record<string, unknown>): number {
  const read = (k: string): number | null => {
    const raw = row[k];
    if (raw == null || raw === "") return null;
    if (typeof raw === "number" && Number.isFinite(raw)) return raw;
    const n = Number.parseFloat(String(raw));
    return Number.isFinite(n) ? n : null;
  };

  const primary = read("value");
  if (primary != null) return primary;

  for (const k of ["7d_click", "1d_click", "7d_view", "1d_view", "dda"]) {
    const n = read(k);
    if (n != null && n > 0) return n;
  }
  return 0;
}

export function parseActionsFromInsight(raw: unknown): InsightActionRow[] {
  if (!Array.isArray(raw)) return [];
  const out: InsightActionRow[] = [];
  for (const x of raw) {
    if (x && typeof x === "object") {
      const r = x as Record<string, unknown>;
      const at = r.action_type;
      out.push({
        action_type: typeof at === "string" ? at : undefined,
        raw: r,
      });
    }
  }
  return out;
}

function sumExactType(
  actions: InsightActionRow[],
  actionType: string,
): number {
  let s = 0;
  for (const a of actions) {
    if (a.action_type === actionType) {
      s += rowMetric(a.raw);
    }
  }
  return s;
}

function sumMatchingType(
  actions: InsightActionRow[],
  predicate: (t: string) => boolean,
): number {
  let s = 0;
  for (const a of actions) {
    const t = a.action_type ?? "";
    if (predicate(t)) {
      s += rowMetric(a.raw);
    }
  }
  return s;
}

/**
 * Messaging funnel from Meta (conversations started + common alternates Ads Manager shows).
 */
export function messagingConversationsStartedFromActions(
  actions: InsightActionRow[],
): number {
  const s7 = sumExactType(
    actions,
    "onsite_conversion.messaging_conversation_started_7d",
  );
  const s1 = sumExactType(
    actions,
    "onsite_conversion.messaging_conversation_started_1d",
  );
  const firstReply = sumExactType(
    actions,
    "onsite_conversion.messaging_first_reply",
  );

  const primary = Math.max(s7, s1, firstReply);
  if (primary > 0) return primary;

  return sumMatchingType(actions, (t) =>
    t.includes("messaging_conversation_started"),
  );
}

const PURCHASE_EXACT_TYPES = [
  "purchase",
  "omni_purchase",
  "offsite_conversion.fb_pixel_purchase",
  "onsite_conversion.purchase",
  "web_in_store_purchase",
  /** SKU / catalog purchase breakdowns Meta sometimes returns */
  "onsite_conversion.messenger_purchase",
  "onsite_conversion.post_unified_attribution_purchase",
] as const;

/**
 * Purchase count Meta attributes (insights). For each action type, sums all rows
 * (same type may repeat), then takes the max across standard purchase families to
 * limit overlap between e.g. purchase vs omni_purchase in some accounts.
 */
export function metaPurchasesFromActions(actions: InsightActionRow[]): number {
  let best = 0;
  for (const key of PURCHASE_EXACT_TYPES) {
    best = Math.max(best, sumExactType(actions, key));
  }

  const customLabeledPurchase = sumMatchingType(
    actions,
    (t) =>
      /^offsite_conversion\.custom\./i.test(t) &&
      /purchase|purchased/i.test(t),
  );

  return Math.max(best, customLabeledPurchase);
}
