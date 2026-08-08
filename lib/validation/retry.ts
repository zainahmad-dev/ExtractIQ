import { getSupabaseAdminClient } from '@/lib/storage/supabase';
import { isDocumentStatus } from '@/types/status';
import { transitionStatus } from '@/lib/validation/state-machine';

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

/**
 * Called once withRetry exhausts its attempts. Reads the document's current
 * status + status_history and hands off to Phase 18's state machine for the
 * actual write — the single place OCR and LLM structuring land on
 * consistently, and now (unlike before Phase 18) status_history correctly
 * gets the failure entry appended as part of the same write.
 */
export async function handleRetryExhaustion(documentId: string, reason: string): Promise<void> {
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('documents')
    .select('status, status_history')
    .eq('id', documentId)
    .single();

  if (error || !data) {
    throw new Error(
      `Failed to read document ${documentId} before recording retry exhaustion: ${error?.message ?? 'not found'}`
    );
  }

  if (!isDocumentStatus(data.status)) {
    throw new Error(`Document ${documentId} has an unrecognized status: ${data.status}`);
  }

  await transitionStatus(
    documentId,
    data.status,
    'needs_manual_entry',
    data.status_history,
    reason
  );
}
