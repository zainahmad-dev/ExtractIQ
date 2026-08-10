/**
 * Shared shapes for GET /api/export (Phase 26), used by the route handler,
 * the csv/json generators, and the Export screen so they can never drift.
 */

/** Must stay in sync with exports.format's CHECK constraint in supabase/migrations/0001_init.sql. */
export const EXPORT_FORMATS = ['csv', 'json'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export function isExportFormat(value: unknown): value is ExportFormat {
  return typeof value === 'string' && (EXPORT_FORMATS as readonly string[]).includes(value);
}

/** One approved extraction, flattened. Both generators render exactly this shape. */
export interface ExportRecord {
  documentId: string;
  filename: string;
  vendorName: string | null;
  documentNumber: string | null;
  documentDate: string | null;
  currency: string | null;
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  overallConfidence: number | null;
  approvedAt: string | null;
}

/**
 * The filter set an export can be scoped by — the same fields Records offers,
 * minus review status (exports are always approved-only). Declared as a type
 * alias rather than an interface so it keeps an implicit index signature and
 * can be stored straight into exports.filters (a jsonb column).
 */
export type ExportFilters = {
  vendor?: string;
  dateFrom?: string;
  dateTo?: string;
  amountMin?: number;
  amountMax?: number;
  search?: string;
};
