import { getSupabaseAdminClient } from '@/lib/storage/supabase';
import { isDocumentStatus, type DocumentStatus } from '@/types/status';

/** Every status except the two terminal resting states — what's still moving through the pipeline. */
const ACTIVE_STATUSES: DocumentStatus[] = [
  'queued',
  'processing',
  'extracting_text',
  'running_ocr',
  'running_llm',
  'validating',
  'awaiting_review',
];

const LIST_LIMIT = 10;

export interface DashboardStatCounts {
  totalDocuments: number;
  awaitingReview: number;
  needsManualEntry: number;
  approved: number;
}

export interface DashboardQueueItem {
  id: string;
  filename: string;
  status: DocumentStatus;
  updatedAt: string;
}

export interface DashboardActivityItem {
  id: string;
  filename: string;
  status: DocumentStatus;
  updatedAt: string;
}

export interface DashboardStats {
  stats: DashboardStatCounts;
  queue: DashboardQueueItem[];
  recentActivity: DashboardActivityItem[];
}

function toDocumentStatus(documentId: string, status: string): DocumentStatus {
  if (!isDocumentStatus(status)) {
    throw new Error(`Document ${documentId} has an unrecognized status: ${status}`);
  }
  return status;
}

/**
 * One aggregation query set powering both GET /api/stats and the Dashboard
 * page's server-rendered load — a single source of truth so the two can
 * never drift apart on the response shape.
 */
export async function getDashboardStats(): Promise<DashboardStats> {
  const supabase = getSupabaseAdminClient();

  const [
    totalResult,
    awaitingReviewResult,
    needsManualEntryResult,
    approvedResult,
    queueResult,
    recentActivityResult,
  ] = await Promise.all([
    supabase.from('documents').select('*', { count: 'exact', head: true }),
    supabase
      .from('documents')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'awaiting_review'),
    supabase
      .from('documents')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'needs_manual_entry'),
    supabase
      .from('document_extractions')
      .select('*', { count: 'exact', head: true })
      .eq('review_status', 'approved'),
    supabase
      .from('documents')
      .select('id, filename, status, updated_at')
      .in('status', ACTIVE_STATUSES)
      .order('updated_at', { ascending: false })
      .limit(LIST_LIMIT),
    supabase
      .from('documents')
      .select('id, filename, status, updated_at')
      .order('updated_at', { ascending: false })
      .limit(LIST_LIMIT),
  ]);

  const firstError =
    totalResult.error ||
    awaitingReviewResult.error ||
    needsManualEntryResult.error ||
    approvedResult.error ||
    queueResult.error ||
    recentActivityResult.error;

  if (firstError) {
    throw new Error(`Failed to load dashboard stats: ${firstError.message}`);
  }

  return {
    stats: {
      totalDocuments: totalResult.count ?? 0,
      awaitingReview: awaitingReviewResult.count ?? 0,
      needsManualEntry: needsManualEntryResult.count ?? 0,
      approved: approvedResult.count ?? 0,
    },
    queue: (queueResult.data ?? []).map((doc) => ({
      id: doc.id,
      filename: doc.filename,
      status: toDocumentStatus(doc.id, doc.status),
      updatedAt: doc.updated_at,
    })),
    recentActivity: (recentActivityResult.data ?? []).map((doc) => ({
      id: doc.id,
      filename: doc.filename,
      status: toDocumentStatus(doc.id, doc.status),
      updatedAt: doc.updated_at,
    })),
  };
}
