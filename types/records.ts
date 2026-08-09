/**
 * Shared shape for GET /api/documents (Phase 24), used by both the route
 * handler and the Records screen so the two can never drift apart.
 */

export const RECORDS_STATUS_FILTERS = ['approved', 'rejected'] as const;
export type RecordsStatusFilter = (typeof RECORDS_STATUS_FILTERS)[number];

export const RECORDS_SORT_FIELDS = ['documentDate', 'vendorName', 'total', 'createdAt'] as const;
export type RecordsSortField = (typeof RECORDS_SORT_FIELDS)[number];

export interface RecordItem {
  id: string;
  filename: string;
  vendorName: string | null;
  documentNumber: string | null;
  documentDate: string | null;
  currency: string | null;
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  reviewStatus: RecordsStatusFilter;
  overallConfidence: number | null;
  approvedAt: string | null;
  createdAt: string;
}

export interface RecordsResponse {
  data: RecordItem[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}
