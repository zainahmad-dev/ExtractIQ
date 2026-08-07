import { getSupabaseAdminClient } from '@/lib/storage/supabase';
import type { DocumentStatus } from '@/types/status';

export interface RetryOptions {
  retries: number;
}

/**
 * Generic retry wrapper shared by OCR (Phase 8) and LLM structuring (Phase
 * 10) — the one place either module's retry behavior lives. `fn` should
 * throw when its result doesn't meet the caller's success criteria; once
 * attempts are exhausted the last error is rethrown for the caller to handle.
 */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= options.retries; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}

const NEEDS_MANUAL_ENTRY: DocumentStatus = 'needs_manual_entry';

/**
 * Called once withRetry exhausts its attempts. Sets documents.status and
 * error_reason directly — Phase 18 will route this through the formal state
 * machine; until then this is the single place that performs the write, so
 * OCR and LLM structuring land on it consistently.
 */
export async function handleRetryExhaustion(documentId: string, reason: string): Promise<void> {
  const supabase = getSupabaseAdminClient();

  const { error } = await supabase
    .from('documents')
    .update({ status: NEEDS_MANUAL_ENTRY, error_reason: reason })
    .eq('id', documentId);

  if (error) {
    throw new Error(
      `Failed to record retry exhaustion for document ${documentId}: ${error.message}`
    );
  }
}
