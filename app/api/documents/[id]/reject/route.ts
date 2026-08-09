import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/storage/supabase';
import { transitionStatus, InvalidStatusTransitionError } from '@/lib/validation/state-machine';
import { isDocumentStatus } from '@/types/status';
import { getLatestDraft } from '@/lib/documents/draft-helpers';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * Rejects the document's current draft: marks review_status=rejected (no
 * inline edits — rejecting says the data isn't trustworthy, it doesn't
 * correct it) and advances documents.status to 'completed' through Phase
 * 18's state machine, same terminal state as approval.
 */
export async function POST(_request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const supabase = getSupabaseAdminClient();

  let draft;
  try {
    draft = await getLatestDraft(supabase, id);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }

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

  try {
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
  } catch (error) {
    if (error instanceof InvalidStatusTransitionError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json(
    { id, documentStatus: 'completed', reviewStatus: 'rejected' },
    { status: 200 }
  );
}
