/**
 * Shared shape for GET /api/analytics (Phase 25), used by both the route
 * handler and the Analytics screen so the two can never drift apart.
 */

/** A calendar-month bucket, keyed as YYYY-MM. */
export interface MonthlySpendPoint {
  month: string;
  total: number;
}

export interface TopVendor {
  vendorName: string;
  total: number;
  documentCount: number;
}

export interface AccuracyTrendPoint {
  month: string;
  averageConfidence: number;
}

/**
 * The six single-number operational metrics. Rates are whole percentages
 * (0-100); every field is null when its denominator is still zero, so the UI
 * can show "no data yet" rather than a misleading 0%.
 */
export interface OperationalMetrics {
  averageProcessingTimeMs: number | null;
  ocrUsageRate: number | null;
  approvalRate: number | null;
  manualEntryRate: number | null;
  averageConfidence: number | null;
  processingSuccessRate: number | null;
}

export interface AnalyticsResponse {
  /** ISO code the money metrics are denominated in — the dominant currency across approved extractions. */
  currency: string;
  monthlySpend: MonthlySpendPoint[];
  topVendors: TopVendor[];
  accuracyTrend: AccuracyTrendPoint[];
  operational: OperationalMetrics;
}
