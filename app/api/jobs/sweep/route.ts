import { NextResponse } from 'next/server';
import { withApiErrorHandler } from '@/lib/api-error-handler';
import { getSupabaseAdminClient } from '@/lib/storage/supabase';
import { isDocumentStatus, type DocumentStatus } from '@/types/status';
import { processDocument } from '@/lib/jobs/process-document';
import { claimTransition } from '@/lib/validation/state-machine';

/** Every status except the three terminal resting states is eligible for recovery. */
const RECOVERABLE_STATUSES: DocumentStatus[] = [
  'queued',
  'processing',
  'extracting_text',
  'running_ocr',
  'running_llm',
  'validating',
];

/** A recoverable-status document that hasn't progressed in this long is considered stalled. */
const STUCK_TIMEOUT_MS = 10 * 60 * 1000;

interface SweepResult {
  id: string;
  previousStatus: DocumentStatus;
  status: DocumentStatus;
  error?: string;
}

/**
 * Meant to be hit by an external scheduler (Phase 30), not run in-process —
 * this project has no queue/cron infrastructure of its own. Finds documents
 * stuck in a non-terminal status (a crashed server, a killed process, an
 * uncaught exception before Phase 12's orchestrator could record failure)
 * and re-invokes processDocument() for each. Since the orchestrator only
 * claims documents in 'queued' status, anything found further along is reset
 * to 'queued' first — there's no partial-resume support, so recovery re-runs
 * the whole pipeline from the top.
 */
export const POST = withApiErrorHandler(async () => {
  const supabase = getSupabaseAdminClient();
  const cutoff = new Date(Date.now() - STUCK_TIMEOUT_MS).toISOString();

  const { data: stuckDocuments, error } = await supabase
    .from('documents')
    .select('id, status, status_history')
    .in('status', RECOVERABLE_STATUSES)
    .lt('updated_at', cutoff);

  if (error) {
    return NextResponse.json(
      { error: `Failed to query stuck documents: ${error.message}` },
      { status: 500 }
    );
  }

  const results: SweepResult[] = [];

  for (const doc of stuckDocuments ?? []) {
    const status = doc.status;
    if (!isDocumentStatus(status)) {
      results.push({
        id: doc.id,
        previousStatus: 'queued',
        status: 'queued',
        error: `Unrecognized status: ${status}`,
      });
      continue;
    }

    try {
      if (status !== 'queued') {
        const message = `Recovered by sweep after stalling in '${status}' for over ${Math.round(STUCK_TIMEOUT_MS / 1000)}s`;

        let reset;
        try {
          reset = await claimTransition(doc.id, status, 'queued', doc.status_history, message);
        } catch (transitionError) {
          const detail =
            transitionError instanceof Error ? transitionError.message : 'Unknown error';
          results.push({ id: doc.id, previousStatus: status, status, error: detail });
          continue;
        }

        if (!reset) {
          // Progressed past this status since the query above ran — no longer stuck.
          continue;
        }
      }

      const result = await processDocument(doc.id);
      results.push({ id: doc.id, previousStatus: status, status: result.status });
    } catch (processError) {
      const message = processError instanceof Error ? processError.message : 'Unknown error';
      results.push({ id: doc.id, previousStatus: status, status, error: message });
    }
  }

  return NextResponse.json({ swept: results.length, results });
});
