import { generateCompletion } from './client';
import { buildExtractionPrompt, buildRetryPrompt } from './prompts';
import { extractedDocumentJsonSchema, validateExtractedDocument } from './schemas';
import { withRetry, handleRetryExhaustion } from '@/lib/validation/retry';
import type { ExtractedDocument } from '@/types/document';

export type StructureResult =
  | { success: true; data: ExtractedDocument; rawOutput: string }
  | { success: false; error: string; rawOutput: string };

export interface PreviousAttempt {
  rawOutput: string;
  errors: string;
}

/**
 * Raw text -> prompt -> Ollama (schema-constrained JSON mode) -> parse -> Zod
 * validate. Single attempt by itself; `previousAttempt` lets a caller (namely
 * structureDocumentWithRetry below) drive a second attempt through
 * buildRetryPrompt() instead of duplicating this chain. Not wired into the
 * orchestrator yet (Phase 12).
 */
export async function structureDocument(
  rawText: string,
  previousAttempt?: PreviousAttempt
): Promise<StructureResult> {
  const prompt = previousAttempt
    ? buildRetryPrompt(rawText, previousAttempt.rawOutput, previousAttempt.errors)
    : buildExtractionPrompt(rawText);

  let rawOutput: string;
  try {
    const result = await generateCompletion(prompt, {
      format: extractedDocumentJsonSchema,
      temperature: 0,
    });
    rawOutput = result.text;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error calling Ollama',
      rawOutput: '',
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawOutput);
  } catch {
    return { success: false, error: 'Model output was not valid JSON', rawOutput };
  }

  const validation = validateExtractedDocument(parsed);
  if (!validation.success) {
    return { success: false, error: validation.errors, rawOutput };
  }

  return { success: true, data: validation.data, rawOutput };
}

/**
 * structureDocument, retried once on Zod validation failure — the retry
 * attempt uses buildRetryPrompt() (via structureDocument's previousAttempt
 * param) so the model sees exactly what it got wrong. On exhaustion, records
 * documents.status = 'needs_manual_entry' + error_reason directly (Phase 18
 * formalizes this through the shared state machine).
 */
export async function structureDocumentWithRetry(
  documentId: string,
  rawText: string
): Promise<StructureResult> {
  let previousAttempt: PreviousAttempt | undefined;
  let lastResult: StructureResult | undefined;

  try {
    return await withRetry(
      async () => {
        const result = await structureDocument(rawText, previousAttempt);
        lastResult = result;
        if (!result.success) {
          previousAttempt = { rawOutput: result.rawOutput, errors: result.error };
          throw new Error(result.error);
        }
        return result;
      },
      { retries: 1 }
    );
  } catch {
    const failure = lastResult as Extract<StructureResult, { success: false }>;
    await handleRetryExhaustion(documentId, failure.error);
    return failure;
  }
}
