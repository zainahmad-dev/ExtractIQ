import { getSupabaseAdminClient, type Database } from '@/lib/storage/supabase';
import { extractedDocumentSchema } from '@/types/document';
import type { z } from 'zod';

export type SupabaseAdminClient = ReturnType<typeof getSupabaseAdminClient>;
type DraftColumnUpdate = Database['public']['Tables']['document_extractions']['Update'];

/**
 * Every field is optional so a caller can send just what changed — Zod omits
 * unset keys from the parsed result entirely (rather than setting them to
 * `undefined`), which is what lets applyDraftEdits tell "leave this alone"
 * apart from "clear this field" (an explicit `null`). Shared by the draft
 * PATCH endpoint and the approve endpoint (approving can also carry inline
 * corrections); the reject endpoint doesn't take edits at all.
 */
export const draftEditSchema = extractedDocumentSchema.partial();
export type DraftEdit = z.infer<typeof draftEditSchema>;

/**
 * A document can accumulate more than one document_extractions row (e.g. a
 * Phase 13 sweep-recovered document re-runs the whole pipeline and inserts a
 * fresh draft) — the most recently created one is the authoritative draft
 * for review purposes.
 */
export async function getLatestDraft(supabase: SupabaseAdminClient, documentId: string) {
  const { data, error } = await supabase
    .from('document_extractions')
    .select('*')
    .eq('document_id', documentId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch draft for document ${documentId}: ${error.message}`);
  }
  return data;
}

/**
 * Applies a reviewer's field-level corrections to a draft. Deliberately
 * updates only the flattened header columns (+ line_items) — extracted_data
 * is the pipeline's raw output "preserved verbatim" per Phase 3's schema and
 * is never touched by human edits.
 */
export async function applyDraftEdits(
  supabase: SupabaseAdminClient,
  draftId: string,
  edits: DraftEdit
): Promise<void> {
  const columnUpdate: DraftColumnUpdate = {};
  if ('vendorName' in edits) columnUpdate.vendor_name = edits.vendorName ?? null;
  if ('documentNumber' in edits) columnUpdate.document_number = edits.documentNumber ?? null;
  if ('documentDate' in edits) columnUpdate.document_date = edits.documentDate ?? null;
  if ('currency' in edits) columnUpdate.currency = edits.currency ?? null;
  if ('subtotal' in edits) columnUpdate.subtotal_amount = edits.subtotal ?? null;
  if ('tax' in edits) columnUpdate.tax_amount = edits.tax ?? null;
  if ('total' in edits) columnUpdate.total_amount = edits.total ?? null;

  if (Object.keys(columnUpdate).length > 0) {
    const { error } = await supabase
      .from('document_extractions')
      .update(columnUpdate)
      .eq('id', draftId);
    if (error) {
      throw new Error(`Failed to update draft ${draftId}: ${error.message}`);
    }
  }

  if (edits.lineItems) {
    const { error: deleteError } = await supabase
      .from('line_items')
      .delete()
      .eq('draft_id', draftId);
    if (deleteError) {
      throw new Error(
        `Failed to clear existing line items for draft ${draftId}: ${deleteError.message}`
      );
    }

    if (edits.lineItems.length > 0) {
      const { error: insertError } = await supabase.from('line_items').insert(
        edits.lineItems.map((item) => ({
          draft_id: draftId,
          description: item.description,
          quantity: item.quantity,
          unit_price: item.unitPrice,
          amount: item.amount,
        }))
      );
      if (insertError) {
        throw new Error(
          `Failed to insert edited line items for draft ${draftId}: ${insertError.message}`
        );
      }
    }
  }
}
