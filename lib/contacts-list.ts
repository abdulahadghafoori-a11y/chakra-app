import { sql, or, ilike, desc, asc, type SQL } from "drizzle-orm";

import { contacts } from "@/drizzle/schema";
import { db } from "@/lib/db";

export const CONTACTS_PAGE_SIZE = 20;

/** Escape `%`, `_`, `\` for use inside a SQL `LIKE` / `ILIKE` pattern. */
function escapeLikeMeta(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function buildSearchWhere(q: string | undefined): SQL | undefined {
  const raw = q?.trim();
  if (!raw) return undefined;
  const pattern = `%${escapeLikeMeta(raw)}%`;
  return or(
    ilike(contacts.phoneNumber, pattern),
    ilike(contacts.name, pattern),
    ilike(contacts.countryName, pattern),
  );
}

export type ContactListRow = {
  id: string;
  phoneNumber: string;
  name: string | null;
  countryCode: string | null;
  countryName: string | null;
  createTime: Date;
  sessionCount: number;
  orderCount: number;
  /** Sum of order values, as decimal string (matches numeric column). */
  lifetimeValue: string;
  /** Neon may return `Date` or string for `sql` aggregates. */
  lastOrderAt: Date | string | null;
  lastSessionAt: Date | string | null;
};

/**
 * Lists contacts with CTWA session count, order count, lifetime order value, and last activity timestamps.
 * Uses correlated subqueries (indexed on `contact_id`).
 */
export async function listContactsWithStats(input: {
  q?: string;
  order: "newest" | "oldest";
  page: number;
  pageSize?: number;
}): Promise<{ rows: ContactListRow[]; total: number; page: number }> {
  const pageSize = Math.min(
    Math.max(1, input.pageSize ?? CONTACTS_PAGE_SIZE),
    100,
  );
  const requestedPage = Math.max(1, input.page);
  const wherePart = buildSearchWhere(input.q);
  const orderBy =
    input.order === "oldest" ? asc(contacts.createTime) : desc(contacts.createTime);

  const base = db
    .select({
      id: contacts.id,
      phoneNumber: contacts.phoneNumber,
      name: contacts.name,
      countryCode: contacts.countryCode,
      countryName: contacts.countryName,
      createTime: contacts.createTime,
      // Correlate to outer row — do not use ${contacts.id} here; Drizzle may emit bare "id" and break uuid/text.
      sessionCount: sql<number>`(
        select count(*)::int from ctwa_sessions s where s.contact_id = "contacts"."id"
      )`.mapWith(Number),
      orderCount: sql<number>`(
        select count(*)::int from orders o where o.contact_id = "contacts"."id"
      )`.mapWith(Number),
      lifetimeValue: sql<string>`(
        select coalesce(sum(o.value::numeric), 0)::text
        from orders o where o.contact_id = "contacts"."id"
      )`,
      lastOrderAt: sql<Date | null>`(
        select max(o.order_event_at) from orders o where o.contact_id = "contacts"."id"
      )`,
      lastSessionAt: sql<Date | null>`(
        select max(s.send_time) from ctwa_sessions s where s.contact_id = "contacts"."id"
      )`,
    })
    .from(contacts);

  const countBase = db
    .select({ n: sql<number>`count(*)::int`.mapWith(Number) })
    .from(contacts);
  const [countRow] = wherePart
    ? await countBase.where(wherePart)
    : await countBase;

  const total = countRow?.n ?? 0;
  const maxPage = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requestedPage, maxPage);
  const offset = (page - 1) * pageSize;

  const listQuery = wherePart ? base.where(wherePart) : base;

  const rows = (await listQuery
    .orderBy(orderBy)
    .limit(pageSize)
    .offset(offset)) as ContactListRow[];

  return { rows, total, page };
}
