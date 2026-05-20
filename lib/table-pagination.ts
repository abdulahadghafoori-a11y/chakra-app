/** Default page size for admin list tables. */
export const DEFAULT_TABLE_PAGE_SIZE = 20;

export const ORDERS_TABLE_PAGE_SIZE = 25;
export const DASHBOARD_ORDERS_PAGE_SIZE = 10;
export const DASHBOARD_ORDERS_SEARCH_PAGE_SIZE = 25;
export const CAMPAIGNS_TABLE_PAGE_SIZE = 15;
export const META_ENGAGEMENT_PAGE_SIZE = 25;

export function parseTablePage(raw: string | undefined): number {
  const n = Number.parseInt(raw ?? "1", 10);
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

export function resolveTablePage(input: {
  requestedPage: number;
  total: number;
  pageSize: number;
}): { page: number; pageCount: number; offset: number } {
  const pageSize = Math.min(Math.max(1, input.pageSize), 100);
  const pageCount = Math.max(1, Math.ceil(input.total / pageSize));
  const page = Math.min(Math.max(1, input.requestedPage), pageCount);
  const offset = (page - 1) * pageSize;
  return { page, pageCount, offset };
}

export function paginateClientRows<T>(
  rows: T[],
  requestedPage: number,
  pageSize: number,
): {
  pageRows: T[];
  page: number;
  pageCount: number;
  total: number;
  rankOffset: number;
} {
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
