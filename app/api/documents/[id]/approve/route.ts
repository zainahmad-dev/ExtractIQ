import { NextResponse, type NextRequest } from 'next/server';
import { withApiErrorHandler } from '@/lib/api-error-handler';
import { getSupabaseAdminClient } from '@/lib/storage/supabase';
import { transitionStatus } from '@/lib/validation/state-machine';
import { isDocumentStatus } from '@/types/status';
import { draftEditSchema, getLatestDraft, applyDraftEdits } from '@/lib/documents/draft-helpers';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * Approves the document's current draft: persists any inline corrections
 * sent in the (optional) body, marks the draft review_status=approved with
 * approved_at, then advances documents.status to 'completed' through Phase
 * 18's state machine — which naturally rejects the request if the document
 * wasn't actually awaiting review, by throwing InvalidStatusTransitionError.
 * lib/api-error-handler.ts maps that to the 409 this route used to build
 * itself; every other write failure surfaces as a 500 `{ error }`.
 */
export const POST = withApiErrorHandler(async (request: NextRequest, { params }: RouteContext) => {
  const { id } = await params;

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return NextResponse.json({ error: 'Failed to read request body.' }, { status: 400 });
  }

  let body: unknown = {};
  if (rawBody) {
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 });
    }
  }

  const parsedEdits = draftEditSchema.safeParse(body);
  if (!parsedEdits.success) {
    return NextResponse.json(
      { error: parsedEdits.error.issues[0]?.message ?? 'Invalid draft payload.' },
      { status: 400 }
    );
  }

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

  await applyDraftEdits(supabase, draft.id, parsedEdits.data);

  const { error: approveError } = await supabase
    .from('document_extractions')
    .update({ review_status: 'approved', approved_at: new Date().toISOString() })
    .eq('id', draft.id);
  if (approveError) {
    throw new Error(`Failed to approve draft ${draft.id}: ${approveError.message}`);
  }

  await transitionStatus(
    id,
    document.status,
    'completed',
    document.status_history,
    'Approved by reviewer'
  );

  return NextResponse.json(
    { id, documentStatus: 'completed', reviewStatus: 'approved' },
    { status: 200 }
  );
});
