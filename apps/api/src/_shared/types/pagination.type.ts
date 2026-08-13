export type PaginationMeta = {
  total: number;
  page?: number;
  pageSize?: number;
};

export type PaginatedResult<T> = {
  data: T[];
  meta: PaginationMeta;
};
