import { getSupabaseAdminClient, DOCUMENTS_BUCKET } from '@/lib/storage/supabase';
import { isDocumentStatus, type DocumentStatus } from '@/types/status';
import { extractPdfText } from '@/lib/pdf/extract';
import { extractTextFromImageWithRetry, extractTextFromPdfWithRetry } from '@/lib/ocr/extract';
import { structureDocumentWithRetry } from '@/lib/ollama/structure';

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

interface StatusHistoryEntry {
  status: string;
  at: string;
  message?: string;
}

function readStatus(documentId: string, status: string): DocumentStatus {
  if (!isDocumentStatus(status)) {
    throw new Error(`Document ${documentId} has an unrecognized status: ${status}`);
  }
  return status;
}

/** Appends one status_history entry and writes status (+ error_reason, for failures) in one update. */
async function transition(
  documentId: string,
  history: StatusHistoryEntry[],
  status: DocumentStatus,
  message?: string
): Promise<StatusHistoryEntry[]> {
  const supabase = getSupabaseAdminClient();
  const nextHistory = [...history, { status, at: new Date().toISOString(), ...(message ? { message } : {}) }];

  const { error } = await supabase
    .from('documents')
    .update({
      status,
      status_history: nextHistory,
      ...(status === 'needs_manual_entry' && message ? { error_reason: message } : {}),
    })
    .eq('id', documentId);

  if (error) {
    throw new Error(`Failed to update document ${documentId} to status ${status}: ${error.message}`);
  }
  return nextHistory;
}

/**
 * lib/ocr/extract.ts's *WithRetry helpers never throw — on exhaustion they call
 * lib/validation/retry.ts's handleRetryExhaustion (which sets status +
 * error_reason directly) and return their last attempt's result regardless.
 * Since that write bypasses this file's status_history bookkeeping, this
 * re-reads the row after every such call to detect it and append the missing
 * history entry before the pipeline stops.
 */
async function checkForExternalFailure(
  documentId: string,
  history: StatusHistoryEntry[]
): Promise<{ failed: false } | { failed: true; history: StatusHistoryEntry[] }> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('documents')
    .select('status, error_reason')
    .eq('id', documentId)
    .single();

  if (error || !data) {
    throw new Error(`Failed to re-check status for document ${documentId}: ${error?.message ?? 'not found'}`);
  }

  if (readStatus(documentId, data.status) === 'needs_manual_entry') {
    const nextHistory = await transition(documentId, history, 'needs_manual_entry', data.error_reason ?? undefined);
    return { failed: true, history: nextHistory };
  }
  return { failed: false };
}

async function logStep(
  documentId: string,
  step: string,
  status: 'success' | 'failed',
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

/**
 * Sequences a queued document through extraction, structuring, and draft
 * creation: Phase 7 (PDF text) -> Phase 8 OCR (if flagged, or always for
 * image uploads) -> Phase 10 LLM structuring, each guarded by Phase 11's
 * retry wrapper -> insert document_extractions (+ line_items). Confidence
 * fields are intentionally left null; Phases 14-17 populate them later.
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

  const claimHistory: StatusHistoryEntry[] = [
    ...document.status_history,
    { status: 'processing', at: new Date().toISOString(), message: 'Claimed for processing' },
  ];

  const { data: claimed, error: claimError } = await supabase
    .from('documents')
    .update({ status: 'processing', status_history: claimHistory })
    .eq('id', documentId)
    .eq('status', 'queued')
    .select()
    .maybeSingle();

  if (claimError) {
    throw new Error(`Failed to claim document ${documentId}: ${claimError.message}`);
  }

  if (!claimed) {
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

  let history: StatusHistoryEntry[] = claimed.status_history;

  try {
    const downloadStart = Date.now();
    const { data: fileBlob, error: downloadError } = await supabase.storage
      .from(DOCUMENTS_BUCKET)
      .download(document.file_path);

    if (downloadError || !fileBlob) {
      await logStep(documentId, 'download_source', 'failed', Date.now() - downloadStart, downloadError?.message);
      await transition(
        documentId,
        history,
        'needs_manual_entry',
        `Failed to download source file: ${downloadError?.message ?? 'unknown error'}`
      );
      return { id: documentId, status: 'needs_manual_entry' };
    }
    await logStep(documentId, 'download_source', 'success', Date.now() - downloadStart);
    const buffer = Buffer.from(await fileBlob.arrayBuffer());

    let rawText: string;

    if (document.mime_type === 'application/pdf') {
      history = await transition(documentId, history, 'extracting_text', 'Extracting text from PDF');

      const pdfStart = Date.now();
      const pdfResult = await extractPdfText(buffer);
      await logStep(
        documentId,
        'pdf_extraction',
        'success',
        Date.now() - pdfStart,
        `qualityScore=${pdfResult.qualityScore.toFixed(1)} requiresOcr=${pdfResult.requiresOcr}`
      );

      if (pdfResult.requiresOcr) {
        history = await transition(
          documentId,
          history,
          'running_ocr',
          `PDF text quality score ${pdfResult.qualityScore.toFixed(1)} is below threshold — running OCR`
        );

        const ocrStart = Date.now();
        const ocrResult = await extractTextFromPdfWithRetry(documentId, buffer);
        await logStep(documentId, 'ocr', 'success', Date.now() - ocrStart, `wordCount=${ocrResult.wordCount}`);

        const failureCheck = await checkForExternalFailure(documentId, history);
        if (failureCheck.failed) {
          return { id: documentId, status: 'needs_manual_entry' };
        }
        rawText = ocrResult.text;
      } else {
        rawText = pdfResult.text;
      }
    } else {
      history = await transition(documentId, history, 'running_ocr', 'Running OCR on image upload');

      const ocrStart = Date.now();
      const ocrResult = await extractTextFromImageWithRetry(documentId, buffer);
      await logStep(documentId, 'ocr', 'success', Date.now() - ocrStart, `wordCount=${ocrResult.wordCount}`);

      const failureCheck = await checkForExternalFailure(documentId, history);
      if (failureCheck.failed) {
        return { id: documentId, status: 'needs_manual_entry' };
      }
      rawText = ocrResult.text;
    }

    if (!rawText.trim()) {
      history = await transition(
        documentId,
        history,
        'needs_manual_entry',
        'No usable text could be extracted from the document'
      );
      return { id: documentId, status: 'needs_manual_entry' };
    }

    history = await transition(documentId, history, 'running_llm', 'Structuring extracted text via LLM');

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
      history = await transition(documentId, history, 'needs_manual_entry', structureResult.error);
      return { id: documentId, status: 'needs_manual_entry' };
    }

    history = await transition(documentId, history, 'validating', 'Validating structured output against schema');

    const data = structureResult.data;
    const saveStart = Date.now();

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
      })
      .select()
      .single();

    if (insertError || !extraction) {
      await logStep(documentId, 'save_extraction', 'failed', Date.now() - saveStart, insertError?.message);
      history = await transition(
        documentId,
        history,
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
        await logStep(documentId, 'save_extraction', 'failed', Date.now() - saveStart, lineItemsError.message);
        history = await transition(
          documentId,
          history,
          'needs_manual_entry',
          `Failed to save line items: ${lineItemsError.message}`
        );
        return { id: documentId, status: 'needs_manual_entry' };
      }
    }

    await logStep(documentId, 'save_extraction', 'success', Date.now() - saveStart);

    history = await transition(documentId, history, 'awaiting_review', 'Extraction saved; awaiting review');
    return { id: documentId, status: 'awaiting_review' };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error during processing';
    try {
      await transition(documentId, history, 'needs_manual_entry', message);
    } catch (transitionError) {
      console.error(`Failed to record failure for document ${documentId}:`, transitionError);
    }
    return { id: documentId, status: 'needs_manual_entry' };
  }
}
