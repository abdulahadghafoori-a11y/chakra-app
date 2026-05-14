/**
 * Map Meta Ads `quality_ranking` on insights rows to a 0–1 score for cockpit rules.
 * Unknown or missing values return null (do not weight that row in aggregates).
 */
export function metaQualityRankingToScore0to1(
  raw: string | null | undefined,
): number | null {
  if (raw == null) return null;
  const u = raw
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_")
    .replace(/-+/g, "_");
  if (!u || u === "UNKNOWN" || u === "EMPTY" || u === "UNRANKED") return null;
  if (u.includes("ABOVE_AVERAGE")) return 1;
  if (u === "AVERAGE") return 0.5;
  if (u.includes("BOTTOM_35")) return 0.3;
  if (u.includes("BELOW_AVERAGE")) return 0.35;
  return null;
}

export function parseInsightsFrequencyRaw(
  raw: string | undefined | null,
): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}
