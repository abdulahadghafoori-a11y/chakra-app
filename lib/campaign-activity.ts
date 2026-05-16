import { campaignActivity } from "@/drizzle/schema";
import { db } from "@/lib/db";

/** Automated rows when Meta Marketing API structure sync detects changes. */
export const META_STRUCTURE_SYNC_EMAIL = "meta-structure-sync";

/** Automated rows after daily insights upsert batches. */
export const META_INSIGHTS_SYNC_EMAIL = "meta-insights-sync";

/** Rows from Meta Marketing API `/{ad-account-id}/activities` (Ads Manager–style audit feed). */
export const META_MARKETING_API_ACTIVITY_EMAIL = "meta-marketing-api-activity";

export type CampaignActivityKind = "note" | "system" | "attribution";

export type FieldChange = {
  field: string;
  from: string | null;
  to: string | null;
};

function normStr(v: string | null | undefined): string | null {
  const t = typeof v === "string" ? v.trim() : "";
  return t.length ? t : null;
}

function summarizeChanges(entityLabel: string, changes: FieldChange[]): string {
  if (!changes.length) return `${entityLabel}: no detected changes`;
  return `${entityLabel}: ${changes.map((c) => `${c.field} ${fmt(c.from)}→${fmt(c.to)}`).join("; ")}`;
}

function fmt(v: string | null): string {
  return v == null ? "∅" : JSON.stringify(v);
}

export async function insertCampaignActivityRow(input: {
  metaCampaignId: string;
  createdByEmail: string;
  kind: CampaignActivityKind;
  body: string;
  metadata?: Record<string, unknown> | null;
}): Promise<void> {
  await db.insert(campaignActivity).values({
    metaCampaignId: input.metaCampaignId,
    createdByEmail: input.createdByEmail,
    kind: input.kind,
    body: input.body,
    metadata: input.metadata ?? null,
  });
}

export async function recordMetaCampaignStructureDiff(input: {
  prev:
    | {
        id: string;
        name: string | null;
        objective: string | null;
        status: string | null;
        effectiveStatus: string | null;
      }
    | undefined;
  next: {
    id: string;
    name: string | null;
    objective: string | null;
    status: string | null;
    effectiveStatus: string | null;
  };
}): Promise<void> {
  if (!input.prev) return;
  const changes: FieldChange[] = [];
  const fields: Array<[string, string | null | undefined, string | null | undefined]> = [
    ["name", input.prev?.name, input.next.name],
    ["objective", input.prev?.objective, input.next.objective],
    ["status", input.prev?.status, input.next.status],
    ["effective_status", input.prev?.effectiveStatus, input.next.effectiveStatus],
  ];
  for (const [field, a, b] of fields) {
    const fa = normStr(a ?? null);
    const fb = normStr(b ?? null);
    if (fa !== fb) changes.push({ field, from: fa, to: fb });
  }
  if (!changes.length) return;
  await insertCampaignActivityRow({
    metaCampaignId: input.next.id,
    createdByEmail: META_STRUCTURE_SYNC_EMAIL,
    kind: "system",
    body: summarizeChanges("Campaign", changes),
    metadata: {
      subtype: "structure_sync",
      entity: "meta_campaign",
      entityId: input.next.id,
      itemDisplayName: input.next.name ?? null,
      changes,
    },
  });
}

export async function recordMetaAdSetStructureDiff(input: {
  prev:
    | {
        id: string;
        metaCampaignId: string;
        name: string | null;
        status: string | null;
        effectiveStatus: string | null;
      }
    | undefined;
  next: {
    id: string;
    metaCampaignId: string;
    name: string | null;
    status: string | null;
    effectiveStatus: string | null;
  };
}): Promise<void> {
  if (!input.prev) return;
  const changes: FieldChange[] = [];
  const cmpFields: Array<[string, string | null | undefined, string | null | undefined]> = [
    ["meta_campaign_id", input.prev.metaCampaignId, input.next.metaCampaignId],
    ["name", input.prev.name, input.next.name],
    ["status", input.prev.status, input.next.status],
    ["effective_status", input.prev.effectiveStatus, input.next.effectiveStatus],
  ];
  for (const [field, a, b] of cmpFields) {
    const fa = normStr(a ?? null);
    const fb = normStr(b ?? null);
    if (fa !== fb) changes.push({ field, from: fa, to: fb });
  }
  if (!changes.length) return;
  await insertCampaignActivityRow({
    metaCampaignId: input.next.metaCampaignId,
    createdByEmail: META_STRUCTURE_SYNC_EMAIL,
    kind: "system",
    body: summarizeChanges(`Ad set ${input.next.id}`, changes),
    metadata: {
      subtype: "structure_sync",
      entity: "meta_ad_set",
      entityId: input.next.id,
      campaignId: input.next.metaCampaignId,
      itemDisplayName: input.next.name ?? null,
      changes,
    },
  });
}

export async function recordMetaAdStructureDiff(input: {
  prev:
    | {
        id: string;
        metaAdSetId: string;
        metaCampaignId: string;
        name: string | null;
        status: string | null;
        effectiveStatus: string | null;
      }
    | undefined;
  next: {
    id: string;
    metaAdSetId: string;
    metaCampaignId: string;
    name: string | null;
    status: string | null;
    effectiveStatus: string | null;
  };
}): Promise<void> {
  if (!input.prev) return;
  const changes: FieldChange[] = [];
  const cmpFields: Array<[string, string | null | undefined, string | null | undefined]> = [
    ["meta_campaign_id", input.prev.metaCampaignId, input.next.metaCampaignId],
    ["meta_ad_set_id", input.prev.metaAdSetId, input.next.metaAdSetId],
    ["name", input.prev.name, input.next.name],
    ["status", input.prev.status, input.next.status],
    ["effective_status", input.prev.effectiveStatus, input.next.effectiveStatus],
  ];
  for (const [field, a, b] of cmpFields) {
    const fa = normStr(a ?? null);
    const fb = normStr(b ?? null);
    if (fa !== fb) changes.push({ field, from: fa, to: fb });
  }
  if (!changes.length) return;
  await insertCampaignActivityRow({
    metaCampaignId: input.next.metaCampaignId,
    createdByEmail: META_STRUCTURE_SYNC_EMAIL,
    kind: "system",
    body: summarizeChanges(`Ad ${input.next.id}`, changes),
    metadata: {
      subtype: "structure_sync",
      entity: "meta_ad",
      entityId: input.next.id,
      campaignId: input.next.metaCampaignId,
      itemDisplayName: input.next.name ?? null,
      changes,
    },
  });
}

export async function recordInsightsSyncSummaries(input: {
  sinceDay: string;
  untilDay: string;
  byCampaign: Map<string, { rowsUpserted: number; adsTouched: number }>;
}): Promise<void> {
  const rows = [...input.byCampaign.entries()].sort(([a], [b]) => a.localeCompare(b));
  for (const [campaignId, v] of rows) {
    if (v.rowsUpserted <= 0) continue;
    await insertCampaignActivityRow({
      metaCampaignId: campaignId,
      createdByEmail: META_INSIGHTS_SYNC_EMAIL,
      kind: "system",
      body: `Insights synced ${input.sinceDay}→${input.untilDay}: ${v.rowsUpserted} row(s), ${v.adsTouched} ad(s).`,
      metadata: {
        subtype: "insights_sync",
        sinceDay: input.sinceDay,
        untilDay: input.untilDay,
        rowsUpserted: v.rowsUpserted,
        adsTouched: v.adsTouched,
      },
    });
  }
}

/** Dual timelines when manual attribution moves between campaigns (plan). */
export async function recordManualCampaignAttributionChange(input: {
  actorEmail: string;
  orderId: string;
  fromCampaignId: string | null;
  toCampaignId: string | null;
}): Promise<void> {
  const { actorEmail, orderId } = input;
  const from = normStr(input.fromCampaignId);
  const to = normStr(input.toCampaignId);
  if (from === to) return;

  const metaOrder = { orderId, previousCampaignId: from, nextCampaignId: to };

  if (!from && to) {
    await insertCampaignActivityRow({
      metaCampaignId: to,
      createdByEmail: actorEmail,
      kind: "attribution",
      body: `Order ${orderId}: manual Meta campaign attribution set.`,
      metadata: { ...metaOrder, action: "set" },
    });
    return;
  }

  if (from && !to) {
    await insertCampaignActivityRow({
      metaCampaignId: from,
      createdByEmail: actorEmail,
      kind: "attribution",
      body: `Order ${orderId}: manual Meta campaign attribution cleared.`,
      metadata: { ...metaOrder, action: "clear" },
    });
    return;
  }

  if (from && to && from !== to) {
    await insertCampaignActivityRow({
      metaCampaignId: from,
      createdByEmail: actorEmail,
      kind: "attribution",
      body: `Order ${orderId}: manual attribution moved away from this campaign.`,
      metadata: { ...metaOrder, action: "move_from" },
    });
    await insertCampaignActivityRow({
      metaCampaignId: to,
      createdByEmail: actorEmail,
      kind: "attribution",
      body: `Order ${orderId}: manual attribution assigned from another campaign.`,
      metadata: { ...metaOrder, action: "move_to" },
    });
  }
}
