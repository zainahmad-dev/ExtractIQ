import { getSupabaseAdminClient } from '@/lib/storage/supabase';
import type { DocumentStatus } from '@/types/status';

export interface StatusHistoryEntry {
  status: string;
  at: string;
  message?: string;
}

export class InvalidStatusTransitionError extends Error {
  constructor(from: DocumentStatus, to: DocumentStatus) {
    super(`Invalid status transition: '${from}' -> '${to}'`);
    this.name = 'InvalidStatusTransitionError';
  }
}

/**
 * The one allowed transition table for the full 9-state pipeline lifecycle
 * (types/status.ts's DOCUMENT_STATUSES — the source of truth for the states
 * themselves; this table only says which of those states can follow which).
 * Mirrors lib/jobs/process-document.ts's actual sequencing: the linear happy
 * path, an escape hatch into needs_manual_entry from any active step, and a
 * reset back to queued from any active step (Phase 13's sweep endpoint
 * recovering a stalled document for a full pipeline re-run). 'completed' and
 * 'needs_manual_entry' are currently terminal — no phase yet implements
 * reopening a completed document or resubmitting a manual-entry one, so no
 * transition out of either is defined.
 */
const TRANSITIONS: Record<DocumentStatus, readonly DocumentStatus[]> = {
  queued: ['processing', 'needs_manual_entry'],
  processing: ['extracting_text', 'running_ocr', 'needs_manual_entry', 'queued'],
  extracting_text: ['running_ocr', 'running_llm', 'needs_manual_entry', 'queued'],
  running_ocr: ['running_llm', 'needs_manual_entry', 'queued'],
  running_llm: ['validating', 'needs_manual_entry', 'queued'],
  validating: ['awaiting_review', 'needs_manual_entry', 'queued'],
  awaiting_review: ['completed'],
  completed: [],
  needs_manual_entry: [],
};

export function isValidTransition(from: DocumentStatus, to: DocumentStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

function buildHistory(
  history: StatusHistoryEntry[],
  to: DocumentStatus,
  message?: string
): StatusHistoryEntry[] {
  return [
    ...history,
    { status: to, at: new Date().toISOString(), ...(message ? { message } : {}) },
  ];
}

/**
 * Validates `from` -> `to` against the transition table (throws
 * InvalidStatusTransitionError if disallowed), then writes documents.status +
 * status_history (+ error_reason, when transitioning into needs_manual_entry
 * with a message) in one update. The only place any document's status is
 * written outside of its initial 'queued' creation in Phase 6's upload route.
 */
export async function transitionStatus(
  documentId: string,
  from: DocumentStatus,
  to: DocumentStatus,
  history: StatusHistoryEntry[],
  message?: string
): Promise<StatusHistoryEntry[]> {
  if (!isValidTransition(from, to)) {
    throw new InvalidStatusTransitionError(from, to);
  }

  const supabase = getSupabaseAdminClient();
  const nextHistory = buildHistory(history, to, message);

  const { error } = await supabase
    .from('documents')
    .update({
      status: to,
      status_history: nextHistory,
      ...(to === 'needs_manual_entry' && message ? { error_reason: message } : {}),
    })
    .eq('id', documentId);

  if (error) {
    throw new Error(`Failed to update document ${documentId} to status ${to}: ${error.message}`);
  }
  return nextHistory;
}

/**
 * Same validated write as transitionStatus, but conditioned on the row still
 * being in `from` at write time (optimistic concurrency) — for the one spot
 * two concurrent callers must not both succeed: Phase 12's queued -> processing
 * claim. Returns null if another writer already moved the row out of `from`.
 */
export async function claimTransition(
  documentId: string,
  from: DocumentStatus,
  to: DocumentStatus,
  history: StatusHistoryEntry[],
  message?: string
): Promise<StatusHistoryEntry[] | null> {
  if (!isValidTransition(from, to)) {
    throw new InvalidStatusTransitionError(from, to);
  }

  const supabase = getSupabaseAdminClient();
  const nextHistory = buildHistory(history, to, message);

  const { data, error } = await supabase
    .from('documents')
    .update({ status: to, status_history: nextHistory })
    .eq('id', documentId)
    .eq('status', from)
    .select()
    .maybeSingle();

  if (error) {
    throw new Error(
      `Failed to claim document ${documentId} from ${from} to ${to}: ${error.message}`
    );
  }

  return data ? nextHistory : null;
}
