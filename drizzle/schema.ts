import { desc } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * One WhatsApp identity per row (international digits only, same as `wa_id`, no `+`).
 * `create_time` is the earliest known event time (LEAST on upsert).
 */
export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    phoneNumber: text("phone_number").notNull(),
    name: text("name"),
    countryCode: text("country_code"),
    countryName: text("country_name"),
    createTime: timestamp("create_time", { withTimezone: true }).notNull(),
  },
  (t) => [uniqueIndex("contacts_phone_number_unique").on(t.phoneNumber)],
);

/**
 * Singleton FX row: Afghan afghani equivalent to exactly 1.00 USD.
 * Orders are entered on /orders/new in AFN; persists as USD rounded to cents.
 */
export const appFxUsdAfn = pgTable("app_fx_usd_afn", {
  singletonId: text("singleton_id").primaryKey().default("singleton"),
  afnPerOneUsd: numeric("afn_per_one_usd", { precision: 18, scale: 6 }).notNull(),
  /** `manual`, `frankfurter`, `exchangerate_host`, etc. */
  rateSource: text("rate_source").notNull().default("manual"),
  syncedAt: timestamp("synced_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** Dashboard staff sign-in (/sales, /campaigns). Created via scripts/create-staff-user.mjs. */
export const staffUsers = pgTable(
  "staff_users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [uniqueIndex("staff_users_email_unique").on(t.email)],
);

/** Meta Ads dimension: campaign (Marketing API id as PK). */
export const metaCampaigns = pgTable("meta_campaigns", {
  id: text("id").primaryKey(),
  name: text("name"),
  objective: text("objective"),
  status: text("status"),
  effectiveStatus: text("effective_status"),
  syncedAt: timestamp("synced_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

/**
 * Archived Marketing API activity rows (`GET act_{id}/activities`).
 * Short API retention (~days); local rows extend history until `event_time` retention prune.
 */
export const metaMarketingActivities = pgTable(
  "meta_marketing_activities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dedupeKey: text("dedupe_key").notNull().unique(),
    metaCampaignId: text("meta_campaign_id")
      .notNull()
      .references(() => metaCampaigns.id, { onDelete: "cascade" }),
    eventTime: timestamp("event_time", { withTimezone: true }).notNull(),
    eventType: text("event_type").notNull(),
    translatedEventType: text("translated_event_type"),
    actorId: text("actor_id"),
    actorName: text("actor_name"),
    applicationName: text("application_name"),
    objectId: text("object_id"),
    objectName: text("object_name"),
    objectType: text("object_type"),
    extraData: jsonb("extra_data").$type<Record<string, unknown> | null>(),
    syncedAt: timestamp("synced_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("meta_marketing_activities_campaign_event_idx").on(
      t.metaCampaignId,
      t.eventTime,
    ),
    index("meta_marketing_activities_event_time_idx").on(t.eventTime),
  ],
);

/** Notes, Meta sync diffs, and manual attribution audit rows for campaign drill-down + CSV export. */
export const campaignActivity = pgTable(
  "campaign_activity",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    metaCampaignId: text("meta_campaign_id")
      .notNull()
      .references(() => metaCampaigns.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdByEmail: text("created_by_email").notNull(),
    kind: text("kind").notNull(),
    body: text("body").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
  },
  (t) => [
    index("campaign_activity_meta_campaign_id_idx").on(t.metaCampaignId),
    index("campaign_activity_created_at_idx").on(t.createdAt),
  ],
);

/** Meta ad set under a campaign. */
export const metaAdSets = pgTable(
  "meta_ad_sets",
  {
    id: text("id").primaryKey(),
    metaCampaignId: text("meta_campaign_id")
      .notNull()
      .references(() => metaCampaigns.id, { onDelete: "cascade" }),
    name: text("name"),
    status: text("status"),
    effectiveStatus: text("effective_status"),
    syncedAt: timestamp("synced_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("meta_ad_sets_meta_campaign_id_idx").on(t.metaCampaignId)],
);

/** Meta ad under an ad set (CTWA `source_id` is this id when it is an ad). */
export const metaAds = pgTable(
  "meta_ads",
  {
    id: text("id").primaryKey(),
    metaAdSetId: text("meta_ad_set_id")
      .notNull()
      .references(() => metaAdSets.id, { onDelete: "cascade" }),
    metaCampaignId: text("meta_campaign_id")
      .notNull()
      .references(() => metaCampaigns.id, { onDelete: "cascade" }),
    name: text("name"),
    status: text("status"),
    effectiveStatus: text("effective_status"),
    syncedAt: timestamp("synced_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("meta_ads_meta_ad_set_id_idx").on(t.metaAdSetId),
    index("meta_ads_meta_campaign_id_idx").on(t.metaCampaignId),
  ],
);

/** Daily ad-level insights (spend, etc.) from Marketing API. */
export const adInsightsDaily = pgTable(
  "ad_insights_daily",
  {
    insightDate: date("insight_date", { mode: "string" }).notNull(),
    metaAdId: text("meta_ad_id")
      .notNull()
      .references(() => metaAds.id, { onDelete: "cascade" }),
    metaAdSetId: text("meta_ad_set_id"),
    metaCampaignId: text("meta_campaign_id"),
    spend: numeric("spend", { precision: 16, scale: 4 }).notNull().default("0"),
    impressions: integer("impressions").notNull().default(0),
    clicks: integer("clicks").notNull().default(0),
    /** Meta Ads Insights `actions` — messaging conversations started (incl. CTWA). */
    messagingConversationsStarted: integer("messaging_conversations_started")
      .notNull()
      .default(0),
    /** Meta Ads Insights `actions` — purchase-related conversions (optimization signal). */
    metaPurchases: integer("meta_purchases").notNull().default(0),
    /** Meta `frequency` — avg times each account saw this ad on that day (nullable until sync). */
    frequency: numeric("frequency", { precision: 14, scale: 6 }),
    /** Raw Meta `quality_ranking` for this ad/day (e.g. ABOVE_AVERAGE). */
    qualityRanking: text("quality_ranking"),
/** Not returned by standard ad-level insights `fields` (Graph #100 if requested). Column reserved for future API or manual backfill. */
    firstTimeImpressionRatio: numeric("first_time_impression_ratio", {
      precision: 16,
      scale: 8,
    }),
    currency: text("currency").notNull().default("USD"),
    syncedAt: timestamp("synced_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.insightDate, t.metaAdId] }),
    index("ad_insights_daily_meta_campaign_id_idx").on(t.metaCampaignId),
    index("ad_insights_daily_insight_date_idx").on(t.insightDate),
  ],
);

/**
 * One row per CTWA referral session (unique on contact + clid + send_time).
 * `send_time` is the earliest of message send vs envelope time (and legacy ingest time on migrate).
 * Phone and display name live on `contacts` via `contact_id`.
 * `waba_id` is Meta WhatsApp Business Account id (`entry.id` on Cloud API webhooks).
 * `phone_number_id` is Cloud API `metadata.phone_number_id` for the receiving number.
 * `meta_ad_id` links to synced Meta ad when `source_id` is the ad id.
 */
export const ctwaSessions = pgTable(
  "ctwa_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    /** Meta CTWA click id (opaque string; often base64url-like). Stored verbatim after trim at ingest. */
    ctwaClid: text("ctwa_clid").notNull(),
    wabaId: text("waba_id"),
    phoneNumberId: text("phone_number_id"),
    sourceId: text("source_id"),
    sourceUrl: text("source_url"),
    sourceType: text("source_type"),
    sendTime: timestamp("send_time", { withTimezone: true }).notNull(),
    metaAdId: text("meta_ad_id").references(() => metaAds.id, {
      onDelete: "set null",
    }),
  },
  (t) => [
    index("ctwa_sessions_contact_id_idx").on(t.contactId),
    index("ctwa_sessions_ctwa_clid_idx").on(t.ctwaClid),
    index("ctwa_sessions_meta_ad_id_idx").on(t.metaAdId),
    uniqueIndex("ctwa_sessions_contact_ctwa_send_unique").on(
      t.contactId,
      t.ctwaClid,
      t.sendTime,
    ),
  ],
);

/**
 * WhatsApp sales agent thread (one per customer line identity + optional phone_number_id).
 */
export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contactId: uuid("contact_id").references(() => contacts.id, {
      onDelete: "set null",
    }),
    waId: text("wa_id").notNull(),
    phoneNumberId: text("phone_number_id"),
    /** `bot` | `handoff` — handoff stops automated replies. */
    status: text("status").notNull().default("bot"),
    /**
     * Sales funnel: new | discovering | recommending | objection_handling |
     * confirming_order | ready_for_human_order | closed
     */
    stage: text("stage").notNull().default("new"),
    leadScore: text("lead_score"),
    handoffReason: text("handoff_reason"),
    handoffAt: timestamp("handoff_at", { withTimezone: true }),
    /** Rolling summary for long threads (optional). */
    conversationSummary: text("conversation_summary"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("conversations_wa_id_idx").on(t.waId),
    index("conversations_contact_id_idx").on(t.contactId),
    index("conversations_stage_idx").on(t.stage),
    index("conversations_lead_score_idx").on(t.leadScore),
  ],
);

/** Structured customer facts for the sales agent (one row per conversation). */
export const conversationProfiles = pgTable(
  "conversation_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    customerName: text("customer_name"),
    city: text("city"),
    addressNote: text("address_note"),
    /** Comma-separated product UUIDs or JSON array as text. */
    interestedProductIds: text("interested_product_ids"),
    budgetBand: text("budget_band"),
    urgency: text("urgency"),
    trustObjection: boolean("trust_objection").notNull().default(false),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("conversation_profiles_conversation_id_unique").on(
      t.conversationId,
    ),
    index("conversation_profiles_conversation_id_idx").on(t.conversationId),
  ],
);

/** Draft cart / order intent before human or final createOrder. */
export const salesDraftOrders = pgTable(
  "sales_draft_orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id").references(() => contacts.id, {
      onDelete: "set null",
    }),
    payload: jsonb("payload").notNull().default({}),
    status: text("status").notNull().default("draft"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("sales_draft_orders_conversation_id_idx").on(t.conversationId)],
);

/** Deduped Meta CAPI funnel events (Lead, ViewContent, AddToCart). */
export const agentEvents = pgTable(
  "agent_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    eventName: text("event_name").notNull(),
    dedupeKey: text("dedupe_key").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).defaultNow().notNull(),
    metadata: jsonb("metadata"),
  },
  (t) => [
    uniqueIndex("agent_events_conversation_dedupe_unique").on(
      t.conversationId,
      t.dedupeKey,
    ),
    index("agent_events_conversation_id_idx").on(t.conversationId),
  ],
);

export const conversationMessages = pgTable(
  "conversation_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    content: text("content").notNull(),
    /** Inbound WhatsApp message id (`wamid`) when role is `user`. */
    providerMessageId: text("provider_message_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("conversation_messages_conversation_id_idx").on(t.conversationId),
    // Full unique index (not partial) so ON CONFLICT (provider_message_id) works.
    // Postgres allows multiple NULLs; only inbound user rows set wamid.
    uniqueIndex("conversation_messages_provider_wamid_unique").on(
      t.providerMessageId,
    ),
  ],
);

/** Idempotency: inbound `wamid` fully processed by sales agent (reply sent or skipped). */
export const salesAgentInboundComplete = pgTable(
  "sales_agent_inbound_complete",
  {
    wamid: text("wamid").primaryKey(),
    completedAt: timestamp("completed_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
);

/** Editable Dari (or mixed) articles for store policies and general business info — used by sales agent tools. */
export const businessKnowledge = pgTable(
  "business_knowledge",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    title: text("title"),
    body: text("body").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("business_knowledge_slug_unique").on(t.slug),
    index("business_knowledge_slug_idx").on(t.slug),
    index("business_knowledge_sort_idx").on(t.sortOrder),
  ],
);

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    sku: text("sku").notNull(),
    defaultSalePrice: numeric("default_sale_price", {
      precision: 14,
      scale: 4,
    }).notNull(),
    cogs: numeric("cogs", { precision: 14, scale: 4 }).notNull().default("0"),
    description: text("description"),
    /** Structured specs for agent answers (e.g. dimensions, model). Editable via /products/.../agent. */
    specsJson: jsonb("specs_json")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    /** FAQ entries for this SKU: `[{ "q": "...", "a": "..." }, ...]`. */
    faqJson: jsonb("faq_json").$type<unknown[]>().notNull().default([]),
    /** Long-form agent-facing notes (Dari): warranty detail, what is in the box, compatibility. */
    knowledgeNotes: text("knowledge_notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [uniqueIndex("products_sku_unique").on(t.sku)],
);

/**
 * Business id is `id` (e.g. ORD-…). Phone and `ctwa_clid` are not stored; resolve via
 * `contact_id` → contacts.phone_number (digits only) and optional `ctwa_session_id` → ctwa_sessions.ctwa_clid.
 */
export const orders = pgTable(
  "orders",
  {
    id: text("id").primaryKey(),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "restrict" }),
    ctwaSessionId: uuid("ctwa_session_id").references(() => ctwaSessions.id, {
      onDelete: "set null",
    }),
    /**
     * Staff override: attribute this order to a Meta campaign when there is no CTWA session.
     * Rollups use this only when `ctwa_session_id` is null (CTWA path takes precedence if set).
     */
    manualMetaCampaignId: text("manual_meta_campaign_id").references(
      () => metaCampaigns.id,
      { onDelete: "set null" },
    ),
    value: numeric("value", { precision: 14, scale: 4 }).notNull(),
    currency: text("currency").notNull().default("USD"),
    status: text("status").notNull(),
    capiSent: boolean("capi_sent").notNull().default(false),
    capiEventId: text("capi_event_id"),
    /** Optional: delivery / RTO / COD handling costs for contribution math (COD campaigns). */
    deliveryCost: numeric("delivery_cost", { precision: 14, scale: 4 })
      .notNull()
      .default("0"),
    returnCost: numeric("return_cost", { precision: 14, scale: 4 })
      .notNull()
      .default("0"),
    codFee: numeric("cod_fee", { precision: 14, scale: 4 })
      .notNull()
      .default("0"),
    /** When shipping outside local area: Afghan province label (staff-selected). */
    deliveryProvinceAfghanistan: text("delivery_province_afghanistan"),
    /** Courier / postal tracking reference for provincial delivery. */
    deliveryTrackingNumber: text("delivery_tracking_number"),
    /** Snapshot of AFN per 1 USD used when converting line items to USD (audit trail). */
    afnPerUsdSnapshot: numeric("afn_per_usd_snapshot", {
      precision: 18,
      scale: 6,
    }),
    /**
     * Checkout / Meta wall clock from staff form (`datetime-local` as Asia/Kabul).
     * Distinct from database insert time (`created_at`).
     */
    orderEventAt: timestamp("order_event_at", { withTimezone: true }).notNull(),
    /** Exact time this row was inserted (server clock). */
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("orders_contact_id_idx").on(t.contactId),
    index("orders_ctwa_session_id_idx").on(t.ctwaSessionId),
    index("orders_manual_meta_campaign_id_idx").on(t.manualMetaCampaignId),
    index("orders_order_event_at_idx").on(desc(t.orderEventAt)),
    index("orders_created_idx").on(desc(t.createdAt)),
  ],
);

/** Line items: composite PK (order id + stable line index). */
export const orderItems = pgTable(
  "order_items",
  {
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    lineIndex: integer("line_index").notNull(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    quantity: integer("quantity").notNull(),
    unitSalePrice: numeric("unit_sale_price", {
      precision: 14,
      scale: 4,
    }).notNull(),
    lineValue: numeric("line_value", { precision: 14, scale: 4 }).notNull(),
    /** Snapshot of product COGS at order time (campaign profit rollups). */
    unitCogs: numeric("unit_cogs", { precision: 14, scale: 4 })
      .notNull()
      .default("0"),
    lineCogs: numeric("line_cogs", { precision: 14, scale: 4 })
      .notNull()
      .default("0"),
  },
  (t) => [
    primaryKey({ columns: [t.orderId, t.lineIndex] }),
    index("order_items_order_id_idx").on(t.orderId),
  ],
);

/** Per-order expenses (e.g. inter-province delivery). Not the same as orders.deliveryCost — avoid double entry. */
export const orderExpenses = pgTable(
  "order_expenses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    category: text("category").notNull(),
    amount: numeric("amount", { precision: 14, scale: 4 }).notNull(),
    currency: text("currency").notNull().default("USD"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("order_expenses_order_id_idx").on(t.orderId)],
);

/** General overhead (rent, electricity) — not tied to an order; excluded from campaign rollups in v1. */
export const businessExpenses = pgTable(
  "business_expenses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    category: text("category").notNull(),
    amount: numeric("amount", { precision: 14, scale: 4 }).notNull(),
    currency: text("currency").notNull().default("USD"),
    note: text("note"),
    incurredDate: date("incurred_date", { mode: "string" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("business_expenses_incurred_date_idx").on(t.incurredDate)],
);

/** FB Page + IG comments ingested from Meta webhooks; staff moderate via Graph API. */
export const metaEngagementComments = pgTable(
  "meta_engagement_comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    platform: text("platform").notNull(),
    externalCommentId: text("external_comment_id").notNull(),
    parentExternalCommentId: text("parent_external_comment_id"),
    parentPostId: text("parent_post_id").notNull(),
    containerId: text("container_id").notNull(),
    authorExternalId: text("author_external_id"),
    authorName: text("author_name"),
    messageText: text("message_text"),
    permalinkUrl: text("permalink_url"),
    status: text("status").notNull().default("active"),
    rawPayload: jsonb("raw_payload"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("meta_engagement_comments_platform_external_unique").on(
      t.platform,
      t.externalCommentId,
    ),
    index("meta_engagement_comments_created_idx").on(desc(t.createdAt)),
    index("meta_engagement_comments_status_idx").on(t.status),
  ],
);

export const metaEngagementCommentActions = pgTable(
  "meta_engagement_comment_actions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    commentId: uuid("comment_id")
      .notNull()
      .references(() => metaEngagementComments.id, { onDelete: "cascade" }),
    action: text("action").notNull(),
    detail: jsonb("detail"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("meta_engagement_comment_actions_comment_id_idx").on(t.commentId)],
);

/** Dedupe Messenger / IG DM — one AI redirect reply per (channel, scope, participant). */
export const metaDmBridgeThreads = pgTable(
  "meta_dm_bridge_threads",
  {
    channel: text("channel").notNull(),
    scopeId: text("scope_id").notNull(),
    participantId: text("participant_id").notNull(),
    replySentAt: timestamp("reply_sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.channel, t.scopeId, t.participantId] }),
  ],
);

export const metaDmBridgeLogs = pgTable(
  "meta_dm_bridge_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    channel: text("channel").notNull(),
    scopeId: text("scope_id").notNull(),
    participantId: text("participant_id").notNull(),
    direction: text("direction").notNull(),
    body: text("body"),
    model: text("model"),
    raw: jsonb("raw"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("meta_dm_bridge_logs_created_idx").on(desc(t.createdAt))],
);

export type Conversation = typeof conversations.$inferSelect;
export type ConversationMessage = typeof conversationMessages.$inferSelect;
export type ConversationProfile = typeof conversationProfiles.$inferSelect;
export type SalesDraftOrder = typeof salesDraftOrders.$inferSelect;
export type AgentEvent = typeof agentEvents.$inferSelect;
export type BusinessKnowledge = typeof businessKnowledge.$inferSelect;

export type Contact = typeof contacts.$inferSelect;
export type MetaCampaign = typeof metaCampaigns.$inferSelect;
export type MetaAdSet = typeof metaAdSets.$inferSelect;
export type MetaAd = typeof metaAds.$inferSelect;
export type AdInsightDaily = typeof adInsightsDaily.$inferSelect;
export type CtwaSession = typeof ctwaSessions.$inferSelect;
export type Product = typeof products.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type OrderItem = typeof orderItems.$inferSelect;
export type OrderExpense = typeof orderExpenses.$inferSelect;
export type BusinessExpense = typeof businessExpenses.$inferSelect;
