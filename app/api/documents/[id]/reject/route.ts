import { NextResponse, type NextRequest } from 'next/server';
import { withApiErrorHandler } from '@/lib/api-error-handler';
import { getSupabaseAdminClient } from '@/lib/storage/supabase';
import { transitionStatus } from '@/lib/validation/state-machine';
import { isDocumentStatus } from '@/types/status';
import { getLatestDraft } from '@/lib/documents/draft-helpers';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * Rejects the document's current draft: marks review_status=rejected (no
 * inline edits — rejecting says the data isn't trustworthy, it doesn't
 * correct it) and advances documents.status to 'completed' through Phase
 * 18's state machine, same terminal state as approval. As with approve, an
 * InvalidStatusTransitionError from that state machine reaches the client as
 * a 409 `{ error }` via lib/api-error-handler.ts.
 */
export const POST = withApiErrorHandler(async (_request: NextRequest, { params }: RouteContext) => {
  const { id } = await params;
  const supabase = getSupabaseAdminClient();

  const draft = await getLatestDraft(supabase, id);

  if (!draft) {
    return NextResponse.json(
      { error: `No extraction draft found for document ${id}.` },
      { status: 404 }
    );
  }

  if (draft.review_status !== 'pending_review') {
    return NextResponse.json({ error: `Draft already ${draft.review_status}.` }, { status: 409 });
  }

  const { data: document, error: documentError } = await supabase
    .from('documents')
    .select('status, status_history')
    .eq('id', id)
    .single();

  if (documentError || !document || !isDocumentStatus(document.status)) {
    return NextResponse.json(
      { error: `Document ${id} not found or has an invalid status.` },
      { status: 404 }
    );
  }

  const { error: rejectError } = await supabase
    .from('document_extractions')
    .update({ review_status: 'rejected' })
    .eq('id', draft.id);
  if (rejectError) {
    throw new Error(`Failed to reject draft ${draft.id}: ${rejectError.message}`);
  }

  await transitionStatus(
    id,
    document.status,
    'completed',
    document.status_history,
    'Rejected by reviewer'
  );

  return NextResponse.json(
    { id, documentStatus: 'completed', reviewStatus: 'rejected' },
    { status: 200 }
  );
});
