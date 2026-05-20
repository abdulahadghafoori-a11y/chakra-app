import type { CampaignVerdict } from "@/lib/campaign-verdict";
import type { CampaignPerformanceRow } from "@/lib/campaigns-rollups";
import {
  CAMPAIGNS_TABLE_PAGE_SIZE,
  resolveTablePage,
} from "@/lib/table-pagination";

export type CampaignVerdictFilter = CampaignVerdict | "ALL";

const VERDICT_VALUES = new Set<string>([
  "SCALE",
  "KEEP",
  "OPTIMIZE",
  "KILL",
  "LEARNING",
  "ATTRIBUTION_ISSUE",
]);

export function parseCampaignVerdictFilter(
  raw: string | undefined,
): CampaignVerdictFilter {
  const v = raw?.trim().toUpperCase();
  if (!v || v === "ALL") return "ALL";
  if (VERDICT_VALUES.has(v)) return v as CampaignVerdict;
  return "ALL";
}

export function filterCampaignPerformance(
  rows: CampaignPerformanceRow[],
  verdict: CampaignVerdictFilter,
): CampaignPerformanceRow[] {
  if (verdict === "ALL") return rows;
  return rows.filter((r) => r.verdict === verdict);
}

export function paginateCampaignPerformance(
  rows: CampaignPerformanceRow[],
  requestedPage: number,
  pageSize = CAMPAIGNS_TABLE_PAGE_SIZE,
) {
  const total = rows.length;
  const { page, pageCount, offset } = resolveTablePage({
    requestedPage,
    total,
    pageSize,
  });
  return {
    pageRows: rows.slice(offset, offset + pageSize),
    page,
    pageCount,
    total,
    rankOffset: offset,
  };
}
