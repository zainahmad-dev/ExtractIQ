import { getSupabaseAdminClient } from '@/lib/storage/supabase';

export type ProcessingLogStatus = 'success' | 'failed';

/**
 * Single place every pipeline step's processing_logs row is written from —
 * lib/jobs/process-document.ts (Phase 12) is the only caller today, but any
 * future job should log through this rather than inserting directly.
 * Logging failures are swallowed (logged to console) rather than thrown so a
 * broken log write never fails the pipeline step it's describing.
 */
export async function logStep(
  documentId: string,
  step: string,
  status: ProcessingLogStatus,
  durationMs: number,
  message?: string
): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from('processing_logs').insert({
    document_id: documentId,
    step,
    status,
    duration_ms: Math.round(durationMs),
    message,
  });

  if (error) {
    console.error(`Failed to write processing log (document ${documentId}, step ${step}):`, error.message);
  }
}
