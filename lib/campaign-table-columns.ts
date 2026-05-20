export const CAMPAIGN_TABLE_COLUMNS = [
  { id: "spend", label: "Spend (Insights)" },
  { id: "paidAds", label: "Payable ads" },
  { id: "ctwa", label: "CTWA sessions" },
  { id: "messaging", label: "Messaging started" },
  { id: "converted", label: "Orders" },
  { id: "pending", label: "Pending" },
  { id: "convRevenue", label: "Converted revenue" },
  { id: "gross", label: "Gross profit" },
  { id: "salesComm", label: "Sales comm." },
  { id: "delivery", label: "Delivery cost" },
  { id: "net", label: "Net profit" },
  { id: "cpa", label: "CPA" },
  { id: "roas", label: "Profit ROAS" },
  { id: "capi", label: "CAPI" },
  { id: "metaFreq", label: "Meta freq (7d)" },
  { id: "metaQuality", label: "Meta quality (7d)" },
  { id: "metaQStreak", label: "Low quality streak" },
  { id: "metaFirstImpr", label: "First impr. share (7d)" },
] as const;

export type CampaignTableColumnId = (typeof CAMPAIGN_TABLE_COLUMNS)[number]["id"];

export const CAMPAIGN_TABLE_COLUMNS_STORAGE_KEY =
  "chakra-campaigns-table-columns-v3";

export function defaultCampaignTableVisibility(): Record<
  CampaignTableColumnId,
  boolean
> {
  return Object.fromEntries(
    CAMPAIGN_TABLE_COLUMNS.map((c) => [c.id, true]),
  ) as Record<CampaignTableColumnId, boolean>;
}
