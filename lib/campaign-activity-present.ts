import {
  META_INSIGHTS_SYNC_EMAIL,
  META_MARKETING_API_ACTIVITY_EMAIL,
  META_STRUCTURE_SYNC_EMAIL,
  type FieldChange,
} from "@/lib/campaign-activity";

export type ActivityPresentRow = {
  activity: string;
  activityDetails: string;
  itemChanged: string;
  changedBy: string;
  /** ISO timestamp */
  whenIso: string;
};

function humanizeMetaValue(s: string | null): string {
  if (s == null || s === "") return "—";
  return s.replace(/_/g, " ").replace(/\s+/g, " ").trim();
}

function formatChangeLine(c: FieldChange): string {
  return `From ${humanizeMetaValue(c.from)} — to ${humanizeMetaValue(c.to)}`;
}

function changedByLabel(email: string): string {
  const e = email.trim().toLowerCase();
  if (e === META_STRUCTURE_SYNC_EMAIL.toLowerCase()) return "Meta";
  if (e === META_INSIGHTS_SYNC_EMAIL.toLowerCase()) return "Meta";
  if (e === META_MARKETING_API_ACTIVITY_EMAIL.toLowerCase()) return "Meta";
  if (e === "public-order-create") return "Public order form";
  const at = email.indexOf("@");
  if (at > 0) return email.slice(0, at).replace(/\./g, " ").replace(/\b\w/g, (x) => x.toUpperCase());
  return email;
}

function humanizeEventType(raw: string): string {
  return raw
    .split("_")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

/** Infer entity from Marketing API `event_type` when `object_type` is missing or noisy. */
function marketingApiEntityFromEventType(
  eventType: string,
): "campaign" | "ad_set" | "ad" | null {
  const e = eventType.toLowerCase();
  /** More specific tokens first — avoids `campaign` matching inside unrelated strings. */
  if (e.includes("ad_set") || e.includes("adset")) return "ad_set";
  if (
    e.includes("first_delivery") ||
    e.includes("_ad_") ||
    e === "create_ad" ||
    e.startsWith("update_ad")
  ) {
    return "ad";
  }
  if (
    e.includes("campaign_group") ||
    e.includes("campaign") ||
    e === "merge_campaigns"
  ) {
    return "campaign";
  }
  return null;
}

function formatMinorMoney(amount: unknown, currency: string): string {
  const n = typeof amount === "number" ? amount : Number(amount);
  if (!Number.isFinite(n)) return String(amount ?? "—");
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency.length === 3 ? currency : "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n / 100);
  } catch {
    return `${(n / 100).toFixed(2)} ${currency}`;
  }
}

function formatPaymentAmountObject(o: Record<string, unknown>): string | null {
  if (o.type !== "payment_amount") return null;
  const cur = typeof o.currency === "string" ? o.currency : "USD";
  const raw =
    o.old_value ?? o.new_value ?? o.amount ?? o.value ?? o.budget_remaining;
  const additional =
    typeof o.additional_value === "string" ? o.additional_value.trim() : "";
  const additionalType =
    typeof o.additional_type === "string" ? o.additional_type.trim() : "";
  const num =
    typeof raw === "number"
      ? raw
      : typeof raw === "string"
        ? Number.parseFloat(raw)
        : NaN;
  if (!Number.isFinite(num)) return null;
  const money = formatMinorMoney(num, cur);
  if (additional && additionalType !== "status_string") {
    return `${money} (${additional})`;
  }
  return additional ? `${money} ${additional}` : money;
}

function tryPairPaymentAmounts(
  oldVal: unknown,
  newVal: unknown,
): string | null {
  const leftParsed =
    oldVal &&
    typeof oldVal === "object" &&
    !Array.isArray(oldVal)
      ? formatPaymentAmountObject(oldVal as Record<string, unknown>)
      : null;
  const rightParsed =
    newVal &&
    typeof newVal === "object" &&
    !Array.isArray(newVal)
      ? formatPaymentAmountObject(newVal as Record<string, unknown>)
      : null;
  if (leftParsed && rightParsed) {
    return `From ${leftParsed} — to ${rightParsed}`;
  }
  if (!leftParsed && rightParsed) return rightParsed;
  if (leftParsed && !rightParsed) return leftParsed;
  return null;
}

function humanizeBidStrategy(raw: string): string {
  const u = raw.toUpperCase();
  if (u.includes("LOWEST_COST") || u.includes("LOWEST_COST_WITHOUT_CAP")) {
    return "Highest volume bid strategy";
  }
  return humanizeMetaValue(raw);
}

function truncateDetail(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(0, max - 1))}…`;
}

function summarizeTargetingBlocks(blocks: Record<string, unknown>[]): string {
  const lines: string[] = [];
  const placementLike = /placement|feed|instagram|audience network|reels/i;
  for (const b of blocks.slice(0, 6)) {
    const content =
      typeof b.content === "string" ? b.content.replace(/:$/, "").trim() : "";
    const children = Array.isArray(b.children) ? b.children : [];
    let text = children
      .map((c) => (typeof c === "string" ? c : JSON.stringify(c)))
      .join(", ");
    const isPlacementRow =
      placementLike.test(content) || placementLike.test(text);
    const maxChars = isPlacementRow ? 96 : 140;
    text = truncateDetail(text, maxChars);
    if (content && text) lines.push(`${content}: ${text}`);
    else if (text) lines.push(text);
  }
  const head = lines.slice(0, 3).join(" · ");
  if (!head) return "Audience / targeting updated";
  const out = blocks.length > 3 ? `${head} · …` : head;
  return truncateDetail(out, 260);
}

/** Meta sometimes nests linkage under `campaign_id` without old/new wrappers. */
function formatCampaignLinkageBlob(extra: Record<string, unknown>): string | null {
  const cidVal = extra.campaign_id;
  if (cidVal && typeof cidVal === "object" && !Array.isArray(cidVal)) {
    const o = cidVal as Record<string, unknown>;
    const id = o.new ?? o.mutation_input ?? o.old;
    if (id != null && String(id).trim() !== "") {
      return `Parent campaign ID: ${String(id)}`;
    }
    return "Campaign linkage updated";
  }
  return null;
}

function formatCampaignLinkageRecursive(root: Record<string, unknown>): string | null {
  const direct = formatCampaignLinkageBlob(root);
  if (direct) return direct;
  const nv = root.new_value;
  if (nv && typeof nv === "object" && !Array.isArray(nv)) {
    return formatCampaignLinkageBlob(nv as Record<string, unknown>);
  }
  const ov = root.old_value;
  if (ov && typeof ov === "object" && !Array.isArray(ov)) {
    return formatCampaignLinkageBlob(ov as Record<string, unknown>);
  }
  return null;
}

function compactExtraFallback(extra: Record<string, unknown>): string {
  try {
    const s = JSON.stringify(extra);
    return s.length > 420 ? `${s.slice(0, 417)}…` : s;
  } catch {
    return "";
  }
}

/** Whole-object `extra_data` is often only `{ type: "composite_data" }` (no old/new_value). */
function compositeDataSummary(eventType: string): string {
  const e = eventType.toLowerCase().replace(/-/g, "_");
  if (
    e.includes("create_ad_set") ||
    (e.includes("ad_set") && /creat/.test(e))
  ) {
    return "Ad set initial configuration created";
  }
  if (
    e.includes("create_campaign") ||
    (/\bcreate\b/.test(e) &&
      e.includes("campaign") &&
      !e.includes("ad_set") &&
      !e.includes("adgroup"))
  ) {
    return "Campaign initial configuration created";
  }
  if (
    /\bcreate_ad\b/.test(e) ||
    (e.includes("create") && e.includes("_ad") && !e.includes("ad_set"))
  ) {
    return "Ad initial configuration created";
  }
  if (e.includes("create")) return "Initial configuration created";
  return "Composite configuration updated";
}

/** Readable “Activity details” for Meta `/activities` `extra_data`. */
function formatMarketingApiActivityDetails(
  extra: Record<string, unknown>,
  eventType: string,
): string {
  if (extra.type === "composite_data") {
    return compositeDataSummary(eventType);
  }

  const linkage = formatCampaignLinkageRecursive(extra);
  if (linkage) return linkage;

  const ov = extra.old_value;
  const nv = extra.new_value;

  const paymentPair = tryPairPaymentAmounts(ov, nv);
  if (paymentPair) return paymentPair;

  if (
    nv &&
    typeof nv === "object" &&
    !Array.isArray(nv) &&
    ov == null &&
    formatPaymentAmountObject(nv as Record<string, unknown>)
  ) {
    return formatPaymentAmountObject(nv as Record<string, unknown>) ?? "";
  }

  if (
    typeof ov === "string" &&
    typeof nv === "string" &&
    ov.trim() !== "" &&
    nv.trim() !== ""
  ) {
    return `From ${ov.trim()} — to ${nv.trim()}`;
  }

  if (
    (typeof ov === "number" || typeof ov === "string") &&
    (typeof nv === "number" || typeof nv === "string")
  ) {
    const bid =
      eventType.toLowerCase().includes("bid") ||
      eventType.toLowerCase().includes("budget");
    if (bid) {
      const oNum =
        typeof ov === "number" ? ov : Number.parseFloat(String(ov));
      const nNum =
        typeof nv === "number" ? nv : Number.parseFloat(String(nv));
      if (Number.isFinite(oNum) && Number.isFinite(nNum)) {
        return `From ${formatMinorMoney(oNum, "USD")} — to ${formatMinorMoney(nNum, "USD")}`;
      }
    }
    return `From ${String(ov)} — to ${String(nv)}`;
  }

  if (Array.isArray(ov) && Array.isArray(nv)) {
    const sample = nv[0];
    if (
      nv.length &&
      typeof sample === "object" &&
      sample !== null &&
      !Array.isArray(sample) &&
      ("content" in sample || "children" in sample)
    ) {
      return summarizeTargetingBlocks(nv as Record<string, unknown>[]);
    }
    if (ov.length === nv.length) return "Primary creative asset replaced";
    return `Creative / asset IDs updated (${ov.length} → ${nv.length})`;
  }

  if (typeof nv === "string") {
    const t = nv.trim();
    if (/^[A-Z0-9_]+$/.test(t) && t.includes("_")) {
      return humanizeBidStrategy(t);
    }
    return t;
  }

  if (typeof nv === "boolean") return nv ? "Enabled" : "Disabled";
  if (nv === "false" || nv === "true") return nv === "true" ? "Enabled" : "Disabled";

  if (nv && typeof nv === "object" && !Array.isArray(nv)) {
    const rec = nv as Record<string, unknown>;
    if (rec.type === "composite_data") {
      return compositeDataSummary(eventType);
    }
    const nestedLink = formatCampaignLinkageBlob(rec);
    if (nestedLink) return nestedLink;
  }

  if (
    nv &&
    typeof nv === "object" &&
    Array.isArray(nv) &&
    nv.length &&
    typeof nv[0] === "object" &&
    nv[0] !== null &&
    ("content" in (nv[0] as object) || "children" in (nv[0] as object))
  ) {
    return summarizeTargetingBlocks(nv as Record<string, unknown>[]);
  }

  const ovStr =
    ov != null && ov !== "" ? String(ov).trim() : "";
  const nvStr =
    nv != null && nv !== "" ? String(nv).trim() : "";
  if (ovStr && nvStr) return `From ${ovStr} — to ${nvStr}`;
  if (nvStr) return nvStr;
  if (ovStr) return ovStr;

  return truncateDetail(compactExtraFallback(extra), 380);
}

function marketingApiItemChanged(input: {
  campaignId: string;
  campaignName: string | null;
  metadata: Record<string, unknown>;
  eventType: string;
}): string {
  const m = input.metadata;
  const oid = typeof m.object_id === "string" ? m.object_id.trim() : "";
  const oname =
    typeof m.object_name === "string" && m.object_name.trim()
      ? m.object_name.trim()
      : "—";
  const ot = (
    typeof m.object_type === "string" ? m.object_type : ""
  ).toLowerCase();

  const inferred = marketingApiEntityFromEventType(input.eventType);

  const lineFor = (
    entity: "campaign" | "ad_set" | "ad",
    id: string,
    name: string,
  ): string => {
    if (entity === "campaign") return `${name}\nCampaign ID: ${id}`;
    if (entity === "ad_set") return `${name}\nAd set ID: ${id}`;
    return `${name}\nAd ID: ${id}`;
  };

  /** Prefer `event_type` over Meta `object_type` (often mislabeled vs Ads Manager). */
  if (inferred === "ad_set" && oid) return lineFor("ad_set", oid, oname);
  if (inferred === "ad" && oid) return lineFor("ad", oid, oname);
  if (inferred === "campaign" && oid) return lineFor("campaign", oid, oname);

  if (ot.includes("adset") || ot.includes("ad_set")) {
    if (oid) return lineFor("ad_set", oid, oname);
  }
  if (ot === "ad" || ot.includes("creative") || ot.includes("adgroup")) {
    if (oid) return lineFor("ad", oid, oname);
  }
  if (ot.includes("campaign")) {
    if (oid) return lineFor("campaign", oid, oname);
  }

  if (oid) return `${oname}\nObject ID: ${oid}`;
  return `${input.campaignName?.trim() ?? "Campaign"}\nCampaign ID: ${input.campaignId}`;
}

function structureHeadlineForChange(
  entity: string,
  c: FieldChange,
): string {
  if (entity === "meta_campaign") {
    if (c.field === "effective_status") return "Campaign status updated";
    if (c.field === "status") return "Campaign configuration updated";
    if (c.field === "name") return "Campaign name updated";
    if (c.field === "objective") return "Campaign objective updated";
    return "Campaign updated";
  }
  if (entity === "meta_ad_set") {
    if (c.field === "effective_status") return "Ad set status updated";
    if (c.field === "meta_campaign_id") return "Ad set moved between campaigns";
    if (c.field === "status") return "Ad set configuration updated";
    if (c.field === "name") return "Ad set name updated";
    return "Ad set updated";
  }
  if (entity === "meta_ad") {
    if (c.field === "effective_status") return "Ad status updated";
    if (c.field === "meta_campaign_id" || c.field === "meta_ad_set_id") {
      return "Ad hierarchy updated";
    }
    if (c.field === "status") return "Ad configuration updated";
    if (c.field === "name") return "Ad name updated";
    return "Ad updated";
  }
  return "Structure updated";
}

function changePriority(field: string): number {
  const order = [
    "effective_status",
    "status",
    "meta_campaign_id",
    "meta_ad_set_id",
    "name",
    "objective",
  ];
  const i = order.indexOf(field);
  return i === -1 ? 99 : i;
}

function sortChanges(changes: FieldChange[]): FieldChange[] {
  return [...changes].sort(
    (a, b) => changePriority(a.field) - changePriority(b.field),
  );
}

function itemBlock(input: {
  campaignId: string;
  campaignName: string | null;
  metadata: Record<string, unknown>;
}): string {
  const m = input.metadata;
  const entity = typeof m.entity === "string" ? m.entity : "";
  const entityId = typeof m.entityId === "string" ? m.entityId : "";
  const itemDisplayName =
    typeof m.itemDisplayName === "string" && m.itemDisplayName.trim()
      ? m.itemDisplayName.trim()
      : null;

  if (entity === "meta_campaign") {
    const nameLine = itemDisplayName ?? input.campaignName?.trim() ?? "Campaign";
    const cid = entityId || input.campaignId;
    return `${nameLine}\nCampaign ID: ${cid}`;
  }
  if (entity === "meta_ad_set") {
    const nameLine = itemDisplayName ?? "Ad set";
    return `${nameLine}\nAd set ID: ${entityId}`;
  }
  if (entity === "meta_ad") {
    const nameLine = itemDisplayName ?? "Ad";
    return `${nameLine}\nAd ID: ${entityId}`;
  }
  return itemDisplayName ?? `Campaign ID: ${input.campaignId}`;
}

/** Meta sometimes returns `extra_data` as a JSON string in stored snapshots. */
function coerceMarketingExtraRecord(
  raw: unknown,
): Record<string, unknown> | null {
  if (raw == null) return null;
  if (typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  if (typeof raw === "string") {
    const t = raw.trim();
    if (!t) return null;
    try {
      const p = JSON.parse(t) as unknown;
      if (typeof p === "object" && p !== null && !Array.isArray(p)) {
        return p as Record<string, unknown>;
      }
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Maps stored `campaign_activity` rows into Ads-Manager-style columns for UI + export.
 */
export function presentCampaignActivityRow(input: {
  campaignId: string;
  campaignName: string | null;
  createdAtIso: string;
  createdByEmail: string;
  kind: string;
  body: string;
  metadata: Record<string, unknown> | null;
}): ActivityPresentRow {
  const meta = input.metadata ?? {};
  const subtype = typeof meta.subtype === "string" ? meta.subtype : "";

  if (input.kind === "note") {
    return {
      activity: "Note",
      activityDetails: input.body,
      itemChanged:
        `${input.campaignName?.trim() ?? "Campaign"}\nCampaign ID: ${input.campaignId}`,
      changedBy: changedByLabel(input.createdByEmail),
      whenIso: input.createdAtIso,
    };
  }

  if (input.kind === "attribution") {
    const action = typeof meta.action === "string" ? meta.action : "";
    const headline =
      action === "clear"
        ? "Manual attribution cleared"
        : action === "move_from"
          ? "Order attribution removed from this campaign"
          : action === "move_to"
            ? "Order attributed to this campaign"
            : "Manual campaign attribution updated";
    const oid = typeof meta.orderId === "string" ? meta.orderId : "";
    return {
      activity: headline,
      activityDetails: oid ? `Order ${oid}` : input.body,
      itemChanged:
        `${input.campaignName?.trim() ?? "Campaign"}\nCampaign ID: ${input.campaignId}`,
      changedBy: changedByLabel(input.createdByEmail),
      whenIso: input.createdAtIso,
    };
  }

  if (
    input.kind === "meta_activity" &&
    subtype === "marketing_api_activity"
  ) {
    const eventType =
      typeof meta.event_type === "string" ? meta.event_type : "";
    const translated =
      typeof meta.translated_event_type === "string"
        ? meta.translated_event_type.trim()
        : "";
    const headline =
      translated ||
      (eventType ? humanizeEventType(eventType) : "Meta activity");
    let activityDetails = "";
    const extraRec = coerceMarketingExtraRecord(meta.extra_data);
    if (extraRec) {
      activityDetails = formatMarketingApiActivityDetails(extraRec, eventType);
    }
    if (!activityDetails.trim()) activityDetails = input.body;

    const actor =
      typeof meta.actor_name === "string" && meta.actor_name.trim()
        ? meta.actor_name.trim()
        : "";
    const app =
      typeof meta.application_name === "string" &&
      meta.application_name.trim()
        ? meta.application_name.trim()
        : "";
    const changedBy =
      actor || app || changedByLabel(input.createdByEmail);

    return {
      activity: headline,
      activityDetails,
      itemChanged: marketingApiItemChanged({
        campaignId: input.campaignId,
        campaignName: input.campaignName,
        metadata: meta,
        eventType,
      }),
      changedBy,
      whenIso: input.createdAtIso,
    };
  }

  if (subtype === "insights_sync") {
    const since = typeof meta.sinceDay === "string" ? meta.sinceDay : "";
    const until = typeof meta.untilDay === "string" ? meta.untilDay : "";
    const rows = meta.rowsUpserted;
    const ads = meta.adsTouched;
    return {
      activity: "Insights synced",
      activityDetails: `${since} → ${until}: ${String(rows)} row(s), ${String(ads)} ad(s).`,
      itemChanged:
        `${input.campaignName?.trim() ?? "Campaign"}\nCampaign ID: ${input.campaignId}`,
      changedBy: changedByLabel(input.createdByEmail),
      whenIso: input.createdAtIso,
    };
  }

  if (subtype === "structure_sync" && Array.isArray(meta.changes)) {
    const rawChanges = (meta.changes as unknown[]).filter(
      (c): c is FieldChange =>
        !!c &&
        typeof c === "object" &&
        typeof (c as FieldChange).field === "string",
    );
    const entity = typeof meta.entity === "string" ? meta.entity : "";
    const sorted = sortChanges(rawChanges);
    const primary = sorted[0];
    const headline = primary
      ? structureHeadlineForChange(entity, primary)
      : "Structure updated";
    const details = sorted.map(formatChangeLine).join("\n");
    return {
      activity: headline,
      activityDetails: details,
      itemChanged: itemBlock({
        campaignId: input.campaignId,
        campaignName: input.campaignName,
        metadata: meta,
      }),
      changedBy: changedByLabel(input.createdByEmail),
      whenIso: input.createdAtIso,
    };
  }

  return {
    activity: "Activity",
    activityDetails: input.body,
    itemChanged:
      `${input.campaignName?.trim() ?? "Campaign"}\nCampaign ID: ${input.campaignId}`,
    changedBy: changedByLabel(input.createdByEmail),
    whenIso: input.createdAtIso,
  };
}

export function formatActivityWhenForLocale(
  iso: string,
  locale?: string,
): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
