/**
 * Meta Marketing (Graph) API — ad account structure + insights + activities.
 * Token: META_ACCESS_TOKEN (`ads_read` covers Insights and Ad Account `/activities`).
 * Ad account: META_AD_ACCOUNT_ID (with or without act_ prefix).
 */

const DEFAULT_GRAPH_VERSION = "v22.0";

export function metaGraphVersion(): string {
  return process.env.META_GRAPH_VERSION?.trim() || DEFAULT_GRAPH_VERSION;
}

export function metaGraphOrigin(): string {
  return `https://graph.facebook.com/${metaGraphVersion()}`;
}

export function normalizeActId(raw: string): string {
  const t = raw.trim();
  if (!t) return t;
  return t.startsWith("act_") ? t : `act_${t}`;
}

export function getMarketingAccessToken(): string {
  const t = process.env.META_ACCESS_TOKEN?.trim();
  if (!t) {
    throw new Error("META_ACCESS_TOKEN is not set");
  }
  return t;
}

export function getMetaAdAccountId(): string {
  const raw = process.env.META_AD_ACCOUNT_ID?.trim();
  if (!raw) {
    throw new Error("META_AD_ACCOUNT_ID is not set");
  }
  return normalizeActId(raw);
}

export type MetaGraphError = {
  message: string;
  type?: string;
  code?: number;
  error_subcode?: number;
};

export type MetaGraphEnvelope<T> = {
  data?: T;
  error?: MetaGraphError;
  paging?: { next?: string; cursors?: { after?: string } };
};

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return { parse_error: text.slice(0, 200) };
  }
}

export async function graphGet<T = unknown>(
  path: string,
  searchParams: Record<string, string>,
): Promise<T> {
  const token = getMarketingAccessToken();
  const url = new URL(`${metaGraphOrigin()}/${path.replace(/^\//, "")}`);
  url.searchParams.set("access_token", token);
  for (const [k, v] of Object.entries(searchParams)) {
    if (v !== undefined && v !== "") url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString(), { method: "GET" });
  const body = (await readJson(res)) as MetaGraphEnvelope<unknown> & Record<
    string,
    unknown
  >;
  if (!res.ok || body?.error) {
    const err = body?.error as MetaGraphError | undefined;
    throw new Error(
      err?.message || `Meta Graph HTTP ${res.status}: ${JSON.stringify(body)}`,
    );
  }
  return body as T;
}

export async function graphGetPaged<T extends Record<string, unknown>>(
  relativePath: string,
  searchParams: Record<string, string>,
): Promise<T[]> {
  const token = getMarketingAccessToken();
  const base = `${metaGraphOrigin()}/${relativePath.replace(/^\//, "")}`;
  const params = new URLSearchParams({ access_token: token, ...searchParams });
  let url: string | null = `${base}?${params.toString()}`;
  const out: T[] = [];
  while (url) {
    const res = await fetch(url, { method: "GET" });
    const body = (await readJson(res)) as MetaGraphEnvelope<T[]>;
    if (!res.ok || body.error) {
      throw new Error(
        body.error?.message ||
          `Meta Graph HTTP ${res.status}: ${JSON.stringify(body)}`,
      );
    }
    if (Array.isArray(body.data)) {
      out.push(...(body.data as T[]));
    }
    url = body.paging?.next ?? null;
  }
  return out;
}

export type MetaCampaignNode = {
  id: string;
  name?: string;
  status?: string;
  effective_status?: string;
  objective?: string;
};

export type MetaAdSetNode = {
  id: string;
  name?: string;
  status?: string;
  effective_status?: string;
  campaign_id: string;
};

export type MetaAdNode = {
  id: string;
  name?: string;
  status?: string;
  effective_status?: string;
  adset_id: string;
  campaign_id: string;
};

export type MetaAdDetail = {
  id: string;
  name?: string;
  status?: string;
  effective_status?: string;
  adset_id?: string;
  campaign_id?: string;
};

export type MetaAdSetDetail = {
  id: string;
  name?: string;
  status?: string;
  effective_status?: string;
  campaign_id?: string;
};

export type MetaCampaignDetail = {
  id: string;
  name?: string;
  status?: string;
  effective_status?: string;
  objective?: string;
};

export async function fetchCampaignsForAccount(
  actId: string,
): Promise<MetaCampaignNode[]> {
  return graphGetPaged<MetaCampaignNode>(`${actId}/campaigns`, {
    fields: "id,name,status,effective_status,objective",
    limit: "100",
  });
}

export async function fetchAdSetsForCampaign(
  campaignId: string,
): Promise<MetaAdSetNode[]> {
  return graphGetPaged<MetaAdSetNode>(`${campaignId}/adsets`, {
    fields: "id,name,status,effective_status,campaign_id",
    limit: "100",
  });
}

export async function fetchAdsForAdSet(adSetId: string): Promise<MetaAdNode[]> {
  return graphGetPaged<MetaAdNode>(`${adSetId}/ads`, {
    fields: "id,name,status,effective_status,adset_id,campaign_id",
    limit: "100",
  });
}

export async function fetchAdById(adId: string): Promise<MetaAdDetail> {
  const r = await graphGet<MetaAdDetail>(`${adId}`, {
    fields: "id,name,status,effective_status,adset_id,campaign_id",
  });
  return r;
}

export async function fetchAdSetById(adSetId: string): Promise<MetaAdSetDetail> {
  const r = await graphGet<MetaAdSetDetail>(`${adSetId}`, {
    fields: "id,name,status,effective_status,campaign_id",
  });
  return r;
}

export async function fetchCampaignById(
  campaignId: string,
): Promise<MetaCampaignDetail> {
  const r = await graphGet<MetaCampaignDetail>(`${campaignId}`, {
    fields: "id,name,status,effective_status,objective",
  });
  return r;
}

/** Row from `GET act_{AD_ACCOUNT_ID}/activities` (Marketing API activity log). */
export type MetaMarketingActivityNode = {
  actor_id?: string;
  actor_name?: string;
  application_name?: string;
  date_time_in_timezone?: string;
  event_time?: string;
  event_type?: string;
  extra_data?: string | Record<string, unknown>;
  object_id?: string;
  object_name?: string;
  object_type?: string;
  translated_event_type?: string;
};

const META_ACTIVITIES_FIELDS =
  "actor_id,actor_name,application_name,date_time_in_timezone,event_time,event_type,extra_data,object_id,object_name,object_type,translated_event_type";

/**
 * Paginates all activity rows Meta returns for the ad account (typically ~recent window — see Meta docs).
 * Uses Graph pagination (`paging.next`) via {@link graphGetPaged}.
 */
export async function fetchAdAccountActivities(
  actId: string,
): Promise<MetaMarketingActivityNode[]> {
  return graphGetPaged<MetaMarketingActivityNode>(`${actId}/activities`, {
    fields: META_ACTIVITIES_FIELDS,
    limit: "100",
  });
}

export type InsightAdRow = {
  ad_id?: string;
  adset_id?: string;
  campaign_id?: string;
  impressions?: string;
  clicks?: string;
  spend?: string;
  date_start?: string;
  date_stop?: string;
  account_currency?: string;
  frequency?: string;
  quality_ranking?: string;
  /** Breakdown rows from Insights API (messaging, purchases, …). */
  actions?: unknown;
};

/** Daily spend rows when using time_increment=1 at ad level. */
export async function fetchAdInsightsDailyRange(
  actId: string,
  since: string,
  until: string,
): Promise<InsightAdRow[]> {
  const timeRange = JSON.stringify({ since, until });
  /** Align conversion columns with typical Ads Manager windows (7d click + 1d view + 1d click). */
  const actionAttributionWindows = JSON.stringify([
    "7d_click",
    "1d_view",
    "1d_click",
  ]);
  return graphGetPaged<InsightAdRow>(`${actId}/insights`, {
    level: "ad",
    time_increment: "1",
    fields:
      "ad_id,adset_id,campaign_id,impressions,clicks,spend,date_start,date_stop,account_currency,actions,frequency,quality_ranking",
    time_range: timeRange,
    action_attribution_windows: actionAttributionWindows,
    limit: "500",
  });
}
