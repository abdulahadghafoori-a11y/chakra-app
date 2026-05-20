"use client";

import { useEffect, useMemo, useState } from "react";

import {
  DEFAULT_TABLE_PAGE_SIZE,
  paginateClientRows,
} from "@/lib/table-pagination";

export function useClientTablePage<T>(
  items: T[],
  pageSize = DEFAULT_TABLE_PAGE_SIZE,
) {
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [items]);

  const slice = useMemo(
    () => paginateClientRows(items, page, pageSize),
    [items, page, pageSize],
  );

  return {
    pageRows: slice.pageRows,
    page: slice.page,
    pageCount: slice.pageCount,
    total: slice.total,
    rankOffset: slice.rankOffset,
    setPage,
  };
}
