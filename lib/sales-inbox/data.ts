import { and, asc, count, desc, eq, inArray, type SQL } from "drizzle-orm";

import {
  agentEvents,
  contacts,
  conversationMessages,
  conversationProfiles,
  conversations,
  ctwaSessions,
  salesDraftOrders,
} from "@/drizzle/schema";
import { db } from "@/lib/db";
import {
  DEFAULT_TABLE_PAGE_SIZE,
  resolveTablePage,
} from "@/lib/table-pagination";

export type SalesInboxListRow = {
  id: string;
  waId: string;
  stage: string;
  leadScore: string | null;
  status: string;
  conversationSummary: string | null;
  updatedAt: Date;
  contactPhone: string | null;
  contactId: string | null;
  contactName: string | null;
  profileCity: string | null;
  lastRole: string | null;
};

function buildListConditions(opts: {
  stage?: string;
  lead?: string;
  preset?: "all" | "handoff" | "ready" | "unanswered";
}): SQL | undefined {
  const parts: SQL[] = [];
  if (opts.stage?.trim()) {
    parts.push(eq(conversations.stage, opts.stage.trim()));
  }
  if (opts.lead?.trim()) {
    parts.push(eq(conversations.leadScore, opts.lead.trim()));
  }
  if (opts.preset === "handoff") {
    parts.push(eq(conversations.status, "handoff"));
  }
  if (opts.preset === "ready") {
    parts.push(eq(conversations.stage, "ready_for_human_order"));
  }
  if (!parts.length) return undefined;
  return parts.length === 1 ? parts[0]! : and(...parts);
}

const SALES_INBOX_SCAN_CAP = 500;

export async function listSalesInboxConversations(opts: {
  stage?: string;
  lead?: string;
  preset?: "all" | "handoff" | "ready" | "unanswered";
  page: number;
  pageSize?: number;
}): Promise<{ rows: SalesInboxListRow[]; total: number; page: number }> {
  const pageSize = Math.min(
    Math.max(1, opts.pageSize ?? DEFAULT_TABLE_PAGE_SIZE),
    100,
  );
  const where = buildListConditions(opts);
  const unanswered = opts.preset === "unanswered";

  const baseQuery = db
    .select({
      id: conversations.id,
      waId: conversations.waId,
      stage: conversations.stage,
      leadScore: conversations.leadScore,
      status: conversations.status,
      conversationSummary: conversations.conversationSummary,
      updatedAt: conversations.updatedAt,
      contactPhone: contacts.phoneNumber,
      contactId: contacts.id,
      contactName: contacts.name,
      profileCity: conversationProfiles.city,
    })
    .from(conversations)
    .leftJoin(contacts, eq(conversations.contactId, contacts.id))
    .leftJoin(
      conversationProfiles,
      eq(conversationProfiles.conversationId, conversations.id),
    );

  if (!unanswered) {
    const countBase = db
      .select({ n: count() })
      .from(conversations)
      .leftJoin(contacts, eq(conversations.contactId, contacts.id))
      .leftJoin(
        conversationProfiles,
        eq(conversationProfiles.conversationId, conversations.id),
      );
    const [countRow] = where
      ? await countBase.where(where)
      : await countBase;
    const total = Number(countRow?.n ?? 0);
    const { page, offset } = resolveTablePage({
      requestedPage: opts.page,
      total,
      pageSize,
    });

    const rows = await (where ? baseQuery.where(where) : baseQuery)
      .orderBy(desc(conversations.updatedAt))
      .limit(pageSize)
      .offset(offset);

    const ids = rows.map((r) => r.id);
    const lastRoleMap = await loadLastMessageRoles(ids);
    const mapped: SalesInboxListRow[] = rows.map((r) => ({
      id: r.id,
      waId: r.waId,
      stage: r.stage,
      leadScore: r.leadScore,
      status: r.status,
      conversationSummary: r.conversationSummary,
      updatedAt: r.updatedAt,
      contactPhone: r.contactPhone,
      contactId: r.contactId,
      contactName: r.contactName,
      profileCity: r.profileCity,
      lastRole: lastRoleMap.get(r.id) ?? null,
    }));
    return { rows: mapped, total, page };
  }

  const rows = await (where ? baseQuery.where(where) : baseQuery)
    .orderBy(desc(conversations.updatedAt))
    .limit(SALES_INBOX_SCAN_CAP);

  const ids = rows.map((r) => r.id);
  const lastRoleMap = await loadLastMessageRoles(ids);
  const filtered: SalesInboxListRow[] = rows
    .map((r) => ({
      id: r.id,
      waId: r.waId,
      stage: r.stage,
      leadScore: r.leadScore,
      status: r.status,
      conversationSummary: r.conversationSummary,
      updatedAt: r.updatedAt,
      contactPhone: r.contactPhone,
      contactId: r.contactId,
      contactName: r.contactName,
      profileCity: r.profileCity,
      lastRole: lastRoleMap.get(r.id) ?? null,
    }))
    .filter((r) => r.lastRole === "user");

  const total = filtered.length;
  const { page, offset } = resolveTablePage({
    requestedPage: opts.page,
    total,
    pageSize,
  });
  return {
    rows: filtered.slice(offset, offset + pageSize),
    total,
    page,
  };
}

async function loadLastMessageRoles(
  conversationIds: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!conversationIds.length) return map;

  const recent = await db
    .select({
      conversationId: conversationMessages.conversationId,
      role: conversationMessages.role,
    })
    .from(conversationMessages)
    .where(inArray(conversationMessages.conversationId, conversationIds))
    .orderBy(desc(conversationMessages.createdAt))
    .limit(3000);

  for (const m of recent) {
    if (!map.has(m.conversationId)) {
      map.set(m.conversationId, m.role);
    }
  }
  return map;
}

export async function getSalesConversationDetail(conversationId: string) {
  const [conv] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);
  if (!conv) return null;

  const [profile] = await db
    .select()
    .from(conversationProfiles)
    .where(eq(conversationProfiles.conversationId, conversationId))
    .limit(1);

  const [contact] = conv.contactId
    ? await db
        .select()
        .from(contacts)
        .where(eq(contacts.id, conv.contactId))
        .limit(1)
    : [null];

  const messages = await db
    .select()
    .from(conversationMessages)
    .where(eq(conversationMessages.conversationId, conversationId))
    .orderBy(asc(conversationMessages.createdAt));

  const drafts = await db
    .select()
    .from(salesDraftOrders)
    .where(eq(salesDraftOrders.conversationId, conversationId))
    .orderBy(desc(salesDraftOrders.createdAt));

  const ctwa =
    conv.contactId != null
      ? await db
          .select()
          .from(ctwaSessions)
          .where(eq(ctwaSessions.contactId, conv.contactId))
          .orderBy(desc(ctwaSessions.sendTime))
          .limit(3)
      : [];

  const [evRow] = await db
    .select({ n: count() })
    .from(agentEvents)
    .where(eq(agentEvents.conversationId, conversationId));

  return {
    conversation: conv,
    profile: profile ?? null,
    contact: contact ?? null,
    messages,
    drafts,
    ctwa,
    agentEventCount: evRow?.n ?? 0,
  };
}
