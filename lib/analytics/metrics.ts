import { getSupabaseAdminClient } from '@/lib/storage/supabase';
import { isDocumentStatus, type DocumentStatus } from '@/types/status';
import type {
  AccuracyTrendPoint,
  AnalyticsResponse,
  MonthlySpendPoint,
  OperationalMetrics,
  TopVendor,
} from '@/types/analytics';

/** PostgREST caps a single response at 1000 rows by default, so every table is read in pages. */
const FETCH_PAGE_SIZE = 1000;

/** How many month buckets the two time series expose, most recent last. */
const MONTH_WINDOW = 12;

const TOP_VENDOR_LIMIT = 5;

/** Reached the end of the pipeline with an extraction to show for it. */
const SUCCESSFUL_TERMINAL_STATUSES: DocumentStatus[] = ['awaiting_review', 'completed'];

/** Every state that means the pipeline is done with a document, one way or the other. */
const TERMINAL_STATUSES: DocumentStatus[] = [...SUCCESSFUL_TERMINAL_STATUSES, 'needs_manual_entry'];

const FALLBACK_CURRENCY = 'USD';
const CURRENCY_CODE_PATTERN = /^[A-Z]{3}$/;
const MONTH_KEY_PATTERN = /^\d{4}-\d{2}$/;

interface ExtractionRow {
  review_status: string;
  vendor_name: string | null;
  document_date: string | null;
  currency: string | null;
  total_amount: number | null;
  overall_confidence: number | null;
  created_at: string;
}

interface DocumentRow {
  id: string;
  status: string;
}

interface ProcessingLogRow {
  document_id: string;
  step: string;
  duration_ms: number | null;
}

interface PagedResult<T> {
  data: T[] | null;
  error: { message: string } | null;
}

/**
 * Reads a whole table in FETCH_PAGE_SIZE pages. Aggregation happens in
 * TypeScript rather than SQL because Phase 3's schema ships no aggregate
 * views or RPCs and this phase must not change it.
 */
async function fetchAllRows<T>(
  label: string,
  fetchPage: (from: number, to: number) => PromiseLike<PagedResult<T>>
): Promise<T[]> {
  const rows: T[] = [];

  for (let from = 0; ; from += FETCH_PAGE_SIZE) {
    const { data, error } = await fetchPage(from, from + FETCH_PAGE_SIZE - 1);
    if (error) {
      throw new Error(`Failed to load ${label}: ${error.message}`);
    }
    const page = data ?? [];
    rows.push(...page);
    if (page.length < FETCH_PAGE_SIZE) break;
  }

  return rows;
}

function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** A rate as a whole percentage, or null when nothing has happened yet to divide by. */
function rate(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return roundTo((numerator / denominator) * 100, 1);
}

/**
 * document_date is a plain SQL date (no time or zone), so the YYYY-MM prefix
 * is taken as-is — parsing it into a Date first would shift the month across
 * a time-zone boundary.
 */
function monthKeyFromDate(value: string): string | null {
  const key = value.slice(0, 7);
  return MONTH_KEY_PATTERN.test(key) ? key : null;
}

/** created_at is a timestamptz — bucketed in UTC so a row never changes month with the server's zone. */
function monthKeyFromTimestamp(value: string): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function shiftMonth(key: string, delta: number): string {
  const [year, month] = key.split('-').map(Number);
  const monthsSinceEpoch = year * 12 + (month - 1) + delta;
  return `${Math.floor(monthsSinceEpoch / 12)}-${String((monthsSinceEpoch % 12) + 1).padStart(2, '0')}`;
}

function enumerateMonths(first: string, last: string): string[] {
  const months: string[] = [];
  for (let key = first; key <= last; key = shiftMonth(key, 1)) {
    months.push(key);
  }
  return months;
}

/**
 * Spend is a running total, so a month with no invoices is a real zero and
 * gets a bucket. The window is the last MONTH_WINDOW months up to the most
 * recent month that actually has data.
 */
function buildMonthlySpend(extractions: ExtractionRow[]): MonthlySpendPoint[] {
  const totals = new Map<string, number>();

  for (const extraction of extractions) {
    if (extraction.review_status !== 'approved') continue;
    if (!extraction.document_date || extraction.total_amount === null) continue;
    const key = monthKeyFromDate(extraction.document_date);
    if (!key) continue;
    totals.set(key, (totals.get(key) ?? 0) + Number(extraction.total_amount));
  }

  if (totals.size === 0) return [];

  const keys = [...totals.keys()].sort();
  const last = keys[keys.length - 1];
  const windowStart = shiftMonth(last, -(MONTH_WINDOW - 1));
  const first = keys[0] > windowStart ? keys[0] : windowStart;

  return enumerateMonths(first, last).map((month) => ({
    month,
    total: roundTo(totals.get(month) ?? 0, 2),
  }));
}

function buildTopVendors(extractions: ExtractionRow[]): TopVendor[] {
  const byVendor = new Map<string, { total: number; documentCount: number }>();

  for (const extraction of extractions) {
    if (extraction.review_status !== 'approved') continue;
    const vendorName = extraction.vendor_name?.trim();
    if (!vendorName) continue;

    const entry = byVendor.get(vendorName) ?? { total: 0, documentCount: 0 };
    entry.total += Number(extraction.total_amount ?? 0);
    entry.documentCount += 1;
    byVendor.set(vendorName, entry);
  }

  return [...byVendor.entries()]
    .map(([vendorName, entry]) => ({
      vendorName,
      total: roundTo(entry.total, 2),
      documentCount: entry.documentCount,
    }))
    .sort((a, b) => b.total - a.total || b.documentCount - a.documentCount)
    .slice(0, TOP_VENDOR_LIMIT);
}

/**
 * Unlike spend, an empty month here is "nothing was extracted," not "average
 * confidence was 0" — so gaps are left out rather than filled with a zero
 * that would read as a catastrophic accuracy drop.
 */
function buildAccuracyTrend(extractions: ExtractionRow[]): AccuracyTrendPoint[] {
  const byMonth = new Map<string, number[]>();

  for (const extraction of extractions) {
    if (extraction.overall_confidence === null) continue;
    const key = monthKeyFromTimestamp(extraction.created_at);
    if (!key) continue;
    const scores = byMonth.get(key) ?? [];
    scores.push(Number(extraction.overall_confidence));
    byMonth.set(key, scores);
  }

  return [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-MONTH_WINDOW)
    .map(([month, scores]) => ({
      month,
      averageConfidence: roundTo(average(scores) ?? 0, 1),
    }));
}

/**
 * Money metrics are summed across whatever currencies the pipeline extracted;
 * the dominant one labels them. Single-currency ledgers (the normal case) are
 * exact — a genuinely mixed ledger would need per-currency splits, which the
 * finalized metric list doesn't include.
 */
function dominantCurrency(extractions: ExtractionRow[]): string {
  const counts = new Map<string, number>();

  for (const extraction of extractions) {
    if (extraction.review_status !== 'approved') continue;
    const code = extraction.currency?.trim().toUpperCase();
    if (!code || !CURRENCY_CODE_PATTERN.test(code)) continue;
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }

  let dominant = FALLBACK_CURRENCY;
  let best = 0;
  for (const [code, count] of [...counts.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (count > best) {
      dominant = code;
      best = count;
    }
  }
  return dominant;
}

function buildOperationalMetrics(
  extractions: ExtractionRow[],
  documents: DocumentRow[],
  logs: ProcessingLogRow[]
): OperationalMetrics {
  // Confidence + approval come off the extraction drafts.
  const confidenceScores = extractions
    .filter((extraction) => extraction.overall_confidence !== null)
    .map((extraction) => Number(extraction.overall_confidence));

  const approvedCount = extractions.filter((e) => e.review_status === 'approved').length;
  const rejectedCount = extractions.filter((e) => e.review_status === 'rejected').length;

  // Manual-entry and success rates come off the documents' pipeline status.
  let manualEntryCount = 0;
  let successCount = 0;
  let terminalCount = 0;

  for (const document of documents) {
    if (!isDocumentStatus(document.status)) {
      throw new Error(`Document ${document.id} has an unrecognized status: ${document.status}`);
    }
    if (document.status === 'needs_manual_entry') manualEntryCount += 1;
    if (SUCCESSFUL_TERMINAL_STATUSES.includes(document.status)) successCount += 1;
    if (TERMINAL_STATUSES.includes(document.status)) terminalCount += 1;
  }

  // Timing and OCR usage come off Phase 13's processing_logs: one row per
  // pipeline step, so a document's wall-clock cost is the sum of its steps
  // and it used OCR if (and only if) it logged an 'ocr' step.
  const totalDurationByDocument = new Map<string, number>();
  const ocrDocuments = new Set<string>();

  for (const log of logs) {
    totalDurationByDocument.set(
      log.document_id,
      (totalDurationByDocument.get(log.document_id) ?? 0) + (log.duration_ms ?? 0)
    );
    if (log.step === 'ocr') ocrDocuments.add(log.document_id);
  }

  const averageProcessingTimeMs = average([...totalDurationByDocument.values()]);
  const averageConfidence = average(confidenceScores);

  return {
    averageProcessingTimeMs:
      averageProcessingTimeMs === null ? null : Math.round(averageProcessingTimeMs),
    ocrUsageRate: rate(ocrDocuments.size, totalDurationByDocument.size),
    approvalRate: rate(approvedCount, approvedCount + rejectedCount),
    manualEntryRate: rate(manualEntryCount, documents.length),
    averageConfidence: averageConfidence === null ? null : roundTo(averageConfidence, 1),
    processingSuccessRate: rate(successCount, terminalCount),
  };
}

/**
 * The single aggregation pass behind GET /api/analytics and the Analytics
 * page's server render — deliberately separate from Phase 20's
 * lib/dashboard/stats.ts, which answers a different question (what's moving
 * right now) and must keep its own response shape.
 */
export async function getAnalytics(): Promise<AnalyticsResponse> {
  const supabase = getSupabaseAdminClient();

  const [extractions, documents, logs] = await Promise.all([
    fetchAllRows<ExtractionRow>('extractions', (from, to) =>
      supabase
        .from('document_extractions')
        .select(
          'review_status, vendor_name, document_date, currency, total_amount, overall_confidence, created_at'
        )
        .order('id', { ascending: true })
        .range(from, to)
    ),
    fetchAllRows<DocumentRow>('documents', (from, to) =>
      supabase
        .from('documents')
        .select('id, status')
        .order('id', { ascending: true })
        .range(from, to)
    ),
    fetchAllRows<ProcessingLogRow>('processing logs', (from, to) =>
      supabase
        .from('processing_logs')
        .select('document_id, step, duration_ms')
        .order('id', { ascending: true })
        .range(from, to)
    ),
  ]);

  return {
    currency: dominantCurrency(extractions),
    monthlySpend: buildMonthlySpend(extractions),
    topVendors: buildTopVendors(extractions),
    accuracyTrend: buildAccuracyTrend(extractions),
    operational: buildOperationalMetrics(extractions, documents, logs),
  };
}
