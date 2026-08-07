/**
 * Single source of truth for the two pipeline enums. Must match the CHECK
 * constraints in supabase/migrations/0001_init.sql exactly. Do not define
 * these enums anywhere else in the codebase.
 */

export const DOCUMENT_STATUSES = [
  'queued',
  'processing',
  'extracting_text',
  'running_ocr',
  'running_llm',
  'validating',
  'awaiting_review',
  'completed',
  'needs_manual_entry',
] as const;

export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export function isDocumentStatus(value: string): value is DocumentStatus {
  return (DOCUMENT_STATUSES as readonly string[]).includes(value);
}

export const REVIEW_STATUSES = ['pending_review', 'approved', 'rejected'] as const;

export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export function isReviewStatus(value: string): value is ReviewStatus {
  return (REVIEW_STATUSES as readonly string[]).includes(value);
}
