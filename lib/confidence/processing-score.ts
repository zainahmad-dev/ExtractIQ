const STARTING_SCORE = 100;

/** Charged per extra full pass through the pipeline beyond the first — e.g. Phase 13's sweep recovering a stalled document. */
const RETRY_PENALTY = 30;

/** Charged once if OCR ran at all, as a less-reliable fallback from (or replacement for) clean digital-PDF text extraction. */
const OCR_FALLBACK_PENALTY = 10;

/** Charged per logged step that failed outright. */
const FAILED_STEP_PENALTY = 15;

export interface ProcessingLogEntry {
  step: string;
  status: string;
}

export interface ProcessingScoreResult {
  score: number;
  retryCount: number;
  usedOcrFallback: boolean;
  failedStepCount: number;
}

/**
 * Scores pipeline execution health from a document's processing_logs rows —
 * independent of how trustworthy the extracted data itself is (that's Phase
 * 16's field/overall confidence). Each orchestrator step logs exactly once
 * per pass (Phase 13's logStep), so a step name appearing more than once
 * means the whole job re-ran (e.g. Phase 13's sweep endpoint recovering a
 * stalled document) — that repeat count is what "retries" penalizes here.
 */
export function scoreProcessing(logs: ProcessingLogEntry[]): ProcessingScoreResult {
  const stepCounts = new Map<string, number>();
  let failedStepCount = 0;

  for (const log of logs) {
    stepCounts.set(log.step, (stepCounts.get(log.step) ?? 0) + 1);
    if (log.status === 'failed') failedStepCount += 1;
  }

  const retryCount = stepCounts.size > 0 ? Math.max(...stepCounts.values()) - 1 : 0;
  const usedOcrFallback = stepCounts.has('ocr');

  let score = STARTING_SCORE;
  score -= retryCount * RETRY_PENALTY;
  if (usedOcrFallback) score -= OCR_FALLBACK_PENALTY;
  score -= failedStepCount * FAILED_STEP_PENALTY;
  score = Math.max(0, Math.min(STARTING_SCORE, score));

  return { score, retryCount, usedOcrFallback, failedStepCount };
}
