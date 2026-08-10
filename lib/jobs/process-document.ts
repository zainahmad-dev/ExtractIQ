import { getSupabaseAdminClient, DOCUMENTS_BUCKET } from '@/lib/storage/supabase';
import { isDocumentStatus, type DocumentStatus } from '@/types/status';
import { extractPdfText } from '@/lib/pdf/extract';
import { extractTextFromImageWithRetry, extractTextFromPdfWithRetry } from '@/lib/ocr/extract';
import { structureDocumentWithRetry } from '@/lib/ollama/structure';
import { logStep } from '@/lib/logger/processing';
import { runArithmeticChecks } from '@/lib/validation/arithmetic';
import { score } from '@/lib/confidence/score';
import { scoreProcessing } from '@/lib/confidence/processing-score';
import {
  claimTransition,
  transitionStatus,
  type StatusHistoryEntry,
} from '@/lib/validation/state-machine';
import type { ExtractedDocument } from '@/types/document';

/** No OCR runs for a digital PDF, so it gets a fixed high baseline rather than a null. */
const DIGITAL_PDF_OCR_QUALITY_BASELINE = 98;

/** document_extractions columns Phase 16's confidence algorithm will score. */
const REQUIRED_FIELD_KEYS = [
  'vendor_name',
  'document_number',
  'document_date',
  'currency',
  'subtotal_amount',
  'tax_amount',
  'total_amount',
  'line_items',
] as const;

function isPresent(value: string | number | null): boolean {
  if (value === null) return false;
  return typeof value === 'string' ? value.trim().length > 0 : true;
}

/**
 * The model returns no native per-field confidence, so field_confidence here
 * is a presence signal (100 if the field came back non-null/non-empty, 0 if
 * not) — the baseline Phase 16 will later multiply by an OCR-quality factor
 * and cap against Phase 14's arithmetic checks. missing_fields lists the same
 * absent fields by their document_extractions column name.
 */
function collectConfidenceSignals(data: ExtractedDocument): {
  fieldConfidence: Record<string, number>;
  missingFields: string[];
} {
  const presence: Record<(typeof REQUIRED_FIELD_KEYS)[number], boolean> = {
    vendor_name: isPresent(data.vendorName),
    document_number: isPresent(data.documentNumber),
    document_date: isPresent(data.documentDate),
    currency: isPresent(data.currency),
    subtotal_amount: isPresent(data.subtotal),
    tax_amount: isPresent(data.tax),
    total_amount: isPresent(data.total),
    line_items: data.lineItems.length > 0,
  };

  const fieldConfidence: Record<string, number> = {};
  const missingFields: string[] = [];

  for (const key of REQUIRED_FIELD_KEYS) {
    const present = presence[key];
    fieldConfidence[key] = present ? 100 : 0;
    if (!present) missingFields.push(key);
  }

  return { fieldConfidence, missingFields };
}

export class DocumentNotFoundError extends Error {
  constructor(documentId: string) {
    super(`Document ${documentId} not found`);
    this.name = 'DocumentNotFoundError';
  }
}

export interface ProcessDocumentResult {
  id: string;
  status: DocumentStatus;
}

function readStatus(documentId: string, status: string): DocumentStatus {
  if (!isDocumentStatus(status)) {
    throw new Error(`Document ${documentId} has an unrecognized status: ${status}`);
  }
  return status;
}

/**
 * lib/ocr/extract.ts's and lib/ollama/structure.ts's *WithRetry helpers never
 * throw — on exhaustion they call lib/validation/retry.ts's
 * handleRetryExhaustion, which (as of Phase 18) already writes both status
 * and status_history via the shared state machine. This just re-reads the
 * row to detect that it happened and resync this function's local
 * status/history with what was written, before the pipeline stops.
 */
async function checkForExternalFailure(documentId: string): Promise<
  | { failed: false }
  | {
      failed: true;
      status: DocumentStatus;
      history: StatusHistoryEntry[];
      errorReason: string | null;
    }
> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('documents')
    .select('status, status_history, error_reason')
    .eq('id', documentId)
    .single();

  if (error || !data) {
    throw new Error(
      `Failed to re-check status for document ${documentId}: ${error?.message ?? 'not found'}`
    );
  }

  const status = readStatus(documentId, data.status);
  if (status === 'needs_manual_entry') {
    return {
      failed: true,
      status,
      history: data.status_history,
      errorReason: data.error_reason,
    };
  }
  return { failed: false };
}

/**
 * Sequences a queued document through extraction, structuring, and draft
 * creation: Phase 7 (PDF text) -> Phase 8 OCR (if flagged, or always for
 * image uploads) -> Phase 10 LLM structuring, each guarded by Phase 11's
 * retry wrapper -> insert document_extractions (+ line_items), including
 * Phase 15's four raw confidence signals combined by Phase 16's score() into
 * field_confidence/overall_confidence. A finally block scores pipeline
 * execution health via Phase 17's scoreProcessing() and persists it to
 * documents.processing_confidence regardless of how the run ends.
 *
 * Idempotent: only a document in 'queued' status is claimed and run. The
 * claim is a conditional update (status='queued' in the WHERE clause) so two
 * concurrent calls can't both process the same document — the loser simply
 * reports back whatever status the winner left behind.
 */
export async function processDocument(documentId: string): Promise<ProcessDocumentResult> {
  const supabase = getSupabaseAdminClient();

  const { data: document, error: fetchError } = await supabase
    .from('documents')
    .select('*')
    .eq('id', documentId)
    .single();

  if (fetchError || !document) {
    throw new DocumentNotFoundError(documentId);
  }

  const initialStatus = readStatus(documentId, document.status);
  if (initialStatus !== 'queued') {
    return { id: documentId, status: initialStatus };
  }

  const claimedHistory = await claimTransition(
    documentId,
    'queued',
    'processing',
    document.status_history,
    'Claimed for processing'
  );

  if (!claimedHistory) {
    const { data: latest, error: latestError } = await supabase
      .from('documents')
      .select('status')
      .eq('id', documentId)
      .single();
    if (latestError || !latest) {
      throw new Error(`Failed to read status for document ${documentId} after a claim conflict`);
    }
    return { id: documentId, status: readStatus(documentId, latest.status) };
  }

  let currentStatus: DocumentStatus = 'processing';
  let history: StatusHistoryEntry[] = claimedHistory;

  /** Validates + writes the next transition, then advances the tracked local state to match. */
  async function advance(to: DocumentStatus, message?: string): Promise<void> {
    history = await transitionStatus(documentId, currentStatus, to, history, message);
    currentStatus = to;
  }

  try {
    const downloadStart = Date.now();
    const { data: fileBlob, error: downloadError } = await supabase.storage
      .from(DOCUMENTS_BUCKET)
      .download(document.file_path);

    if (downloadError || !fileBlob) {
      await logStep(
        documentId,
        'download_source',
        'failed',
        Date.now() - downloadStart,
        downloadError?.message
      );
      await advance(
        'needs_manual_entry',
        `Failed to download source file: ${downloadError?.message ?? 'unknown error'}`
      );
      return { id: documentId, status: 'needs_manual_entry' };
    }
    await logStep(documentId, 'download_source', 'success', Date.now() - downloadStart);
    const buffer = Buffer.from(await fileBlob.arrayBuffer());

    let rawText: string;
    let ocrQualityScore: number;

    if (document.mime_type === 'application/pdf') {
      await advance('extracting_text', 'Extracting text from PDF');

      const pdfStart = Date.now();
      let pdfResult;
      try {
        pdfResult = await extractPdfText(buffer);
      } catch (pdfError) {
        // A file that isn't a readable PDF at all (truncated, corrupt, or
        // mislabelled) fails here rather than returning poor-quality text, so
        // it never reaches the OCR fallback — record it as its own failed step.
        const detail = pdfError instanceof Error ? pdfError.message : 'unknown error';
        await logStep(documentId, 'pdf_extraction', 'failed', Date.now() - pdfStart, detail);
        await advance('needs_manual_entry', `Failed to read PDF: ${detail}`);
        return { id: documentId, status: 'needs_manual_entry' };
      }
      await logStep(
        documentId,
        'pdf_extraction',
        'success',
        Date.now() - pdfStart,
        `qualityScore=${pdfResult.qualityScore.toFixed(1)} requiresOcr=${pdfResult.requiresOcr}`
      );

      if (pdfResult.requiresOcr) {
        await advance(
          'running_ocr',
          `PDF text quality score ${pdfResult.qualityScore.toFixed(1)} is below threshold — running OCR`
        );

        const ocrStart = Date.now();
        const ocrResult = await extractTextFromPdfWithRetry(documentId, buffer);

        // Checked before the step is logged: the retry wrapper resolves an
        // exhausted OCR run normally (having already written the failure
        // itself), so the DB row — not the returned value — is what says
        // whether this step actually succeeded.
        const failureCheck = await checkForExternalFailure(documentId);
        if (failureCheck.failed) {
          await logStep(
            documentId,
            'ocr',
            'failed',
            Date.now() - ocrStart,
            failureCheck.errorReason ?? undefined
          );
          currentStatus = failureCheck.status;
          history = failureCheck.history;
          return { id: documentId, status: 'needs_manual_entry' };
        }
        await logStep(
          documentId,
          'ocr',
          'success',
          Date.now() - ocrStart,
          `wordCount=${ocrResult.wordCount}`
        );
        rawText = ocrResult.text;
        ocrQualityScore = ocrResult.ocrQualityScore;
      } else {
        rawText = pdfResult.text;
        ocrQualityScore = DIGITAL_PDF_OCR_QUALITY_BASELINE;
      }
    } else {
      await advance('running_ocr', 'Running OCR on image upload');

      const ocrStart = Date.now();
      const ocrResult = await extractTextFromImageWithRetry(documentId, buffer);

      // Same ordering as the scanned-PDF branch above, and for the same
      // reason: the DB row is the authority on whether OCR succeeded.
      const failureCheck = await checkForExternalFailure(documentId);
      if (failureCheck.failed) {
        await logStep(
          documentId,
          'ocr',
          'failed',
          Date.now() - ocrStart,
          failureCheck.errorReason ?? undefined
        );
        currentStatus = failureCheck.status;
        history = failureCheck.history;
        return { id: documentId, status: 'needs_manual_entry' };
      }
      await logStep(
        documentId,
        'ocr',
        'success',
        Date.now() - ocrStart,
        `wordCount=${ocrResult.wordCount}`
      );
      rawText = ocrResult.text;
      ocrQualityScore = ocrResult.ocrQualityScore;
    }

    if (!rawText.trim()) {
      await advance('needs_manual_entry', 'No usable text could be extracted from the document');
      return { id: documentId, status: 'needs_manual_entry' };
    }

    await advance('running_llm', 'Structuring extracted text via LLM');

    const llmStart = Date.now();
    const structureResult = await structureDocumentWithRetry(documentId, rawText);
    await logStep(
      documentId,
      'llm_structuring',
      structureResult.success ? 'success' : 'failed',
      Date.now() - llmStart,
      structureResult.success ? undefined : structureResult.error
    );

    if (!structureResult.success) {
      // structureDocumentWithRetry already routed this failure through
      // handleRetryExhaustion (Phase 11/18) once its own retry was exhausted —
      // resync from the DB rather than writing a second, redundant transition.
      const failureCheck = await checkForExternalFailure(documentId);
      if (failureCheck.failed) {
        currentStatus = failureCheck.status;
        history = failureCheck.history;
      } else {
        // Shouldn't happen given structureDocumentWithRetry's contract, but
        // never report a status the DB doesn't actually have.
        await advance('needs_manual_entry', structureResult.error);
      }
      return { id: documentId, status: 'needs_manual_entry' };
    }

    await advance('validating', 'Validating structured output against schema');

    const data = structureResult.data;
    const saveStart = Date.now();
    const { fieldConfidence: rawFieldConfidence, missingFields } = collectConfidenceSignals(data);
    const { fieldConfidence, overallConfidence } = score({
      fieldConfidence: rawFieldConfidence,
      ocrQualityScore,
      schemaValid: structureResult.success,
      arithmeticChecks: runArithmeticChecks(data),
    });

    const { data: extraction, error: insertError } = await supabase
      .from('document_extractions')
      .insert({
        document_id: documentId,
        vendor_name: data.vendorName,
        document_number: data.documentNumber,
        document_date: data.documentDate,
        currency: data.currency,
        subtotal_amount: data.subtotal,
        tax_amount: data.tax,
        total_amount: data.total,
        raw_text: rawText,
        extracted_data: data,
        field_confidence: fieldConfidence,
        ocr_quality_score: ocrQualityScore,
        schema_valid: structureResult.success,
        missing_fields: missingFields,
        overall_confidence: overallConfidence,
      })
      .select()
      .single();

    if (insertError || !extraction) {
      await logStep(
        documentId,
        'save_extraction',
        'failed',
        Date.now() - saveStart,
        insertError?.message
      );
      await advance(
        'needs_manual_entry',
        `Failed to save extraction: ${insertError?.message ?? 'unknown error'}`
      );
      return { id: documentId, status: 'needs_manual_entry' };
    }

    // line_items.draft_id references this document_extractions row per Phase 3.
    if (data.lineItems.length > 0) {
      const { error: lineItemsError } = await supabase.from('line_items').insert(
        data.lineItems.map((item) => ({
          draft_id: extraction.id,
          description: item.description,
          quantity: item.quantity,
          unit_price: item.unitPrice,
          amount: item.amount,
        }))
      );

      if (lineItemsError) {
        await logStep(
          documentId,
          'save_extraction',
          'failed',
          Date.now() - saveStart,
          lineItemsError.message
        );
        await advance('needs_manual_entry', `Failed to save line items: ${lineItemsError.message}`);
        return { id: documentId, status: 'needs_manual_entry' };
      }
    }

    await logStep(documentId, 'save_extraction', 'success', Date.now() - saveStart);

    await advance('awaiting_review', 'Extraction saved; awaiting review');
    return { id: documentId, status: 'awaiting_review' };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error during processing';
    try {
      // A helper may already have failed the document with a more specific
      // reason (Phase 11's retry exhaustion writes one before returning);
      // whatever went wrong afterwards must not overwrite it.
      const alreadyFailed = await checkForExternalFailure(documentId);
      if (alreadyFailed.failed) {
        currentStatus = alreadyFailed.status;
        history = alreadyFailed.history;
        console.error(
          `Document ${documentId} was already failed (${alreadyFailed.errorReason ?? 'no reason recorded'}); not overwriting with:`,
          message
        );
      } else {
        await advance('needs_manual_entry', message);
      }
    } catch (transitionError) {
      console.error(`Failed to record failure for document ${documentId}:`, transitionError);
    }
    return { id: documentId, status: 'needs_manual_entry' };
  } finally {
    // Runs after every return path above (success or failure) so pipeline
    // execution health is scored regardless of outcome — it's independent of
    // how trustworthy the extracted data itself turned out to be.
    try {
      const { data: logs, error: logsError } = await supabase
        .from('processing_logs')
        .select('step, status')
        .eq('document_id', documentId);

      if (logsError) {
        throw new Error(logsError.message);
      }

      const { score: processingConfidence } = scoreProcessing(logs ?? []);

      const { error: updateError } = await supabase
        .from('documents')
        .update({ processing_confidence: processingConfidence })
        .eq('id', documentId);

      if (updateError) {
        throw new Error(updateError.message);
      }
    } catch (scoringError) {
      console.error(
        `Failed to compute/persist processing_confidence for document ${documentId}:`,
        scoringError
      );
    }
  }
}
