import { and, desc, eq, inArray } from "drizzle-orm";

import {
  agentEvents,
  contacts,
  conversationProfiles,
  conversations,
  ctwaSessions,
  products,
  salesDraftOrders,
} from "@/drizzle/schema";
import { db } from "@/lib/db";
import {
  buildMetaFunnelPayload,
  postMetaEventsPayload,
} from "@/lib/meta-capi-funnel";
import {
  getBusinessArticleBySlug,
  listBusinessKnowledgeSummaries,
  normalizeKnowledgeSlug,
  searchBusinessKnowledge,
} from "@/lib/knowledge/business-knowledge";
import { hashExternalIdForMeta } from "@/lib/phone";

const META_EVENT_ID_MAX_LEN = 64;

export const SALES_STAGES = [
  "new",
  "discovering",
  "recommending",
  "objection_handling",
  "confirming_order",
  "ready_for_human_order",
  "handoff",
  "closed",
] as const;

export type SalesStage = (typeof SALES_STAGES)[number];

export type SalesAgentToolContext = {
  conversationId: string;
  waIdDigits: string;
  contactId: string | null;
};

function isSalesStage(s: string): s is SalesStage {
  return (SALES_STAGES as readonly string[]).includes(s);
}

function metaFunnelEventId(conversationId: string, dedupeKey: string): string {
  const raw = `f_${conversationId}_${dedupeKey}`;
  if (raw.length <= META_EVENT_ID_MAX_LEN) return raw;
  return hashExternalIdForMeta(raw);
}

function parseInterestedIds(raw: unknown): string | null {
  if (raw == null) return null;
  if (Array.isArray(raw)) {
    const ids = raw.filter((x) => typeof x === "string").map((s) => s.trim());
    return ids.length ? ids.join(",") : null;
  }
  if (typeof raw === "string") return raw.trim() || null;
  return null;
}

async function loadLatestCtwa(contactId: string) {
  const [row] = await db
    .select({
      ctwaClid: ctwaSessions.ctwaClid,
      wabaId: ctwaSessions.wabaId,
    })
    .from(ctwaSessions)
    .where(eq(ctwaSessions.contactId, contactId))
    .orderBy(desc(ctwaSessions.sendTime))
    .limit(1);
  return row ?? null;
}

async function loadContactCountry(contactId: string): Promise<string | null> {
  const [row] = await db
    .select({ countryCode: contacts.countryCode })
    .from(contacts)
    .where(eq(contacts.id, contactId))
    .limit(1);
  return row?.countryCode?.trim() || null;
}

export async function runSalesToolCall(
  name: string,
  args: Record<string, unknown>,
  ctx: SalesAgentToolContext,
): Promise<string> {
  switch (name) {
    case "get_store_policy": {
      const topic =
        typeof args.topic === "string" && args.topic.trim()
          ? args.topic.trim()
          : "general";
      const slug = normalizeKnowledgeSlug(topic);
      let article = await getBusinessArticleBySlug(slug);
      if (!article && slug !== "general") {
        article = await getBusinessArticleBySlug("general");
      }
      if (!article) {
        const topics = await listBusinessKnowledgeSummaries();
        return JSON.stringify({
          error: "no_business_knowledge",
          hint: "Add rows in business_knowledge or use /sales/knowledge",
          topics,
        });
      }
      return JSON.stringify({
        slug: article.slug,
        title: article.title,
        policy_dari: article.body,
        source: "database",
      });
    }

    case "search_business_knowledge": {
      const query = typeof args.query === "string" ? args.query : "";
      const hits = await searchBusinessKnowledge(query);
      return JSON.stringify({
        hits: hits.map((h) => ({
          slug: h.slug,
          title: h.title,
          excerpt:
            h.body.length > 450 ? `${h.body.slice(0, 450)}…` : h.body,
        })),
      });
    }

    case "save_customer_profile": {
      await db
        .insert(conversationProfiles)
        .values({ conversationId: ctx.conversationId })
        .onConflictDoNothing({
          target: conversationProfiles.conversationId,
        });

      const patch: Record<string, unknown> = {};
      const setStr = (k: keyof typeof patch, v: unknown) => {
        if (typeof v === "string" && v.trim()) patch[k] = v.trim();
      };
      setStr("customerName" as never, args.customer_name);
      setStr("city" as never, args.city);
      setStr("addressNote" as never, args.address_note);
      setStr("budgetBand" as never, args.budget_band);
      if (typeof args.urgency === "string" && args.urgency.trim()) {
        const u = args.urgency.trim().toLowerCase();
        if (["today", "this_week", "browsing"].includes(u)) {
          patch.urgency = u;
        }
      }
      const interested = parseInterestedIds(args.interested_product_ids);
      if (interested) patch.interestedProductIds = interested;
      if (typeof args.trust_objection === "boolean") {
        patch.trustObjection = args.trust_objection;
      }

      if (Object.keys(patch).length === 0) {
        return JSON.stringify({ ok: true, updated: false, note: "no_fields" });
      }

      await db
        .update(conversationProfiles)
        .set(patch as Record<string, never>)
        .where(eq(conversationProfiles.conversationId, ctx.conversationId));

      return JSON.stringify({ ok: true, updated: true, fields: Object.keys(patch) });
    }

    case "set_lead_score": {
      const score =
        typeof args.score === "string" ? args.score.trim().toLowerCase() : "";
      if (!["hot", "warm", "cold"].includes(score)) {
        return JSON.stringify({
          ok: false,
          error: "score_must_be_hot_warm_or_cold",
        });
      }
      const reason =
        typeof args.reason === "string" ? args.reason.trim().slice(0, 500) : "";
      await db
        .update(conversations)
        .set({ leadScore: score })
        .where(eq(conversations.id, ctx.conversationId));
      return JSON.stringify({ ok: true, lead_score: score, reason });
    }

    case "set_sales_stage": {
      const stageRaw =
        typeof args.stage === "string" ? args.stage.trim().toLowerCase() : "";
      if (!isSalesStage(stageRaw)) {
        return JSON.stringify({
          ok: false,
          error: "invalid_stage",
          allowed: SALES_STAGES,
        });
      }
      await db
        .update(conversations)
        .set({ stage: stageRaw })
        .where(eq(conversations.id, ctx.conversationId));
      return JSON.stringify({ ok: true, stage: stageRaw });
    }

    case "set_conversation_summary": {
      const summary =
        typeof args.summary === "string" ? args.summary.trim().slice(0, 4000) : "";
      if (!summary) {
        return JSON.stringify({ ok: false, error: "summary_required" });
      }
      await db
        .update(conversations)
        .set({ conversationSummary: summary })
        .where(eq(conversations.id, ctx.conversationId));
      return JSON.stringify({ ok: true, chars: summary.length });
    }

    case "handoff_to_human": {
      const reason =
        typeof args.reason === "string"
          ? args.reason.trim().slice(0, 1000)
          : "handoff_requested";
      await db
        .update(conversations)
        .set({
          status: "handoff",
          stage: "handoff",
          handoffReason: reason,
          handoffAt: new Date(),
        })
        .where(eq(conversations.id, ctx.conversationId));
      return JSON.stringify({
        ok: true,
        status: "handoff",
        note: "no_further_bot_replies_for_this_thread",
      });
    }

    case "create_draft_order": {
      const items = args.items;
      if (!Array.isArray(items) || items.length === 0) {
        return JSON.stringify({ ok: false, error: "items_required" });
      }
      type LineIn = { product_id?: string; quantity?: number };
      const lines: { productId: string; quantity: number }[] = [];
      for (const raw of items) {
        const it = raw as LineIn;
        const productId =
          typeof it.product_id === "string" ? it.product_id.trim() : "";
        const qty = typeof it.quantity === "number" ? it.quantity : 0;
        if (!productId || qty < 1 || !Number.isInteger(qty)) {
          return JSON.stringify({
            ok: false,
            error: "invalid_line",
            detail: { productId, qty },
          });
        }
        lines.push({ productId, quantity: qty });
      }

      const ids = [...new Set(lines.map((l) => l.productId))];
      const prows = await db
        .select({
          id: products.id,
          name: products.name,
          sku: products.sku,
          defaultSalePrice: products.defaultSalePrice,
        })
        .from(products)
        .where(inArray(products.id, ids));

      if (prows.length !== ids.length) {
        return JSON.stringify({ ok: false, error: "unknown_product_id" });
      }

      const byId = new Map(prows.map((p) => [p.id, p]));
      let total = 0;
      const resolvedLines: {
        line_index: number;
        product_id: string;
        name: string;
        sku: string;
        quantity: number;
        unit_sale_price: number;
        line_total: number;
      }[] = [];

      for (let idx = 0; idx < lines.length; idx++) {
        const l = lines[idx]!;
        const p = byId.get(l.productId)!;
        const unit = Number(p.defaultSalePrice);
        if (!Number.isFinite(unit)) {
          return JSON.stringify({
            ok: false,
            error: "invalid_price",
            product_id: p.id,
          });
        }
        const lineTotal = unit * l.quantity;
        total += lineTotal;
        resolvedLines.push({
          line_index: idx,
          product_id: p.id,
          name: p.name,
          sku: p.sku,
          quantity: l.quantity,
          unit_sale_price: unit,
          line_total: lineTotal,
        });
      }

      const [prof] = await db
        .select()
        .from(conversationProfiles)
        .where(eq(conversationProfiles.conversationId, ctx.conversationId))
        .limit(1);

      const payload = {
        currency: "USD",
        value_total: total,
        wa_phone_digits: ctx.waIdDigits,
        lines: resolvedLines,
        customer: {
          name: prof?.customerName ?? null,
          city: prof?.city ?? null,
          address_note: prof?.addressNote ?? null,
        },
        confirmed_payment_on_delivery:
          args.confirmed_payment_on_delivery === true,
        created_by: "sales_agent_tool",
      };

      const [draft] = await db
        .insert(salesDraftOrders)
        .values({
          conversationId: ctx.conversationId,
          contactId: ctx.contactId,
          payload,
          status: "draft",
        })
        .returning({ id: salesDraftOrders.id });

      await db
        .update(conversations)
        .set({ stage: "ready_for_human_order" })
        .where(eq(conversations.id, ctx.conversationId));

      return JSON.stringify({
        ok: true,
        draft_order_id: draft?.id,
        value_usd: total,
        line_count: resolvedLines.length,
      });
    }

    case "send_capi_event": {
      if (!ctx.contactId) {
        return JSON.stringify({
          ok: false,
          error: "contact_required_for_capi",
        });
      }
      const eventRaw =
        typeof args.event_name === "string" ? args.event_name.trim() : "";
      const eventName = eventRaw as "Lead" | "ViewContent" | "AddToCart";
      if (!["Lead", "ViewContent", "AddToCart"].includes(eventName)) {
        return JSON.stringify({
          ok: false,
          error: "invalid_event_name",
          allowed: ["Lead", "ViewContent", "AddToCart"],
        });
      }
      const dedupeKey =
        typeof args.dedupe_key === "string" ? args.dedupe_key.trim() : "";
      if (!dedupeKey || dedupeKey.length > 200) {
        return JSON.stringify({ ok: false, error: "dedupe_key_required" });
      }

      const ctwa = await loadLatestCtwa(ctx.contactId);
      const countryCode = await loadContactCountry(ctx.contactId);

      const productId =
        typeof args.product_id === "string" ? args.product_id.trim() : "";
      const customData: Record<string, unknown> = {
        currency: "USD",
      };
      if (typeof args.value === "number" && Number.isFinite(args.value)) {
        customData.value = args.value;
      }

      if (eventName === "ViewContent" || eventName === "AddToCart") {
        if (!productId) {
          return JSON.stringify({
            ok: false,
            error: "product_id_recommended_for_this_event",
          });
        }
        const [p] = await db
          .select({
            sku: products.sku,
            name: products.name,
            defaultSalePrice: products.defaultSalePrice,
          })
          .from(products)
          .where(eq(products.id, productId))
          .limit(1);
        if (!p) {
          return JSON.stringify({ ok: false, error: "product_not_found" });
        }
        const price = Number(p.defaultSalePrice);
        customData.content_type = "product";
        customData.content_ids = [p.sku];
        customData.content_name = p.name;
        if (eventName === "AddToCart") {
          const qty =
            typeof args.quantity === "number" && args.quantity >= 1
              ? Math.floor(args.quantity)
              : 1;
          const lineValue = Number.isFinite(price) ? price * qty : 0;
          customData.value = lineValue;
          customData.contents = [
            {
              id: p.sku,
              quantity: qty,
              item_price: price,
              title: p.name,
            },
          ];
        } else {
          if (!customData.value && Number.isFinite(price)) {
            customData.value = price;
          }
        }
      }

      const inserted = await db
        .insert(agentEvents)
        .values({
          conversationId: ctx.conversationId,
          eventName,
          dedupeKey,
          metadata: { product_id: productId || null },
        })
        .onConflictDoNothing({
          target: [agentEvents.conversationId, agentEvents.dedupeKey],
        })
        .returning({ id: agentEvents.id });

      if (inserted.length === 0) {
        return JSON.stringify({
          ok: true,
          skipped: true,
          reason: "already_sent_dedupe",
        });
      }

      const eventId = metaFunnelEventId(ctx.conversationId, dedupeKey);
      const { payload } = buildMetaFunnelPayload({
        eventName,
        eventTime: new Date(),
        contactId: ctx.contactId,
        phoneDigits: ctx.waIdDigits,
        countryCode,
        ctwaClid: ctwa?.ctwaClid ?? null,
        whatsappBusinessAccountId: ctwa?.wabaId ?? null,
        eventId,
        customData,
      });

      try {
        await postMetaEventsPayload(payload);
      } catch (e) {
        await db
          .delete(agentEvents)
          .where(
            and(
              eq(agentEvents.conversationId, ctx.conversationId),
              eq(agentEvents.dedupeKey, dedupeKey),
            ),
          );
        const msg = e instanceof Error ? e.message : String(e);
        return JSON.stringify({ ok: false, error: "capi_failed", detail: msg });
      }

      return JSON.stringify({
        ok: true,
        sent: true,
        event_name: eventName,
        dedupe_key: dedupeKey,
      });
    }

    default:
      return JSON.stringify({ error: "unknown_sales_tool", name });
  }
}
