import type { PaginationMeta, PaginatedResult } from "../types/pagination.type";

export type PaginationInput = {
  page?: number;
  pageSize?: number;
};

export type ResolvedPagination = {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
} | null;

/** Parse page/pageSize query strings. Returns null when pageSize is omitted (return all). */
export function resolvePagination(input: {
  page?: string;
  pageSize?: string;
  defaultPageSize?: number;
  maxPageSize?: number;
}): ResolvedPagination {
  if (input.pageSize === undefined || input.pageSize === "") {
    return null;
  }
  const max = input.maxPageSize ?? 100;
  const defaultSize = input.defaultPageSize ?? 25;
  const pageSize = Math.min(
    max,
    Math.max(1, Number(input.pageSize) || defaultSize),
  );
  const page = Math.max(1, Number(input.page) || 1);
  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize,
    take: pageSize,
  };
}

export function paginatedResult<T>(
  data: T[],
  total: number,
  pagination: ResolvedPagination,
): PaginatedResult<T> {
  const meta: PaginationMeta = {
    total,
    ...(pagination
      ? { page: pagination.page, pageSize: pagination.pageSize }
      : { page: 1, pageSize: total }),
  };
  return { data, meta };
}
