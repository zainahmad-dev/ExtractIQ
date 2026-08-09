import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/storage/supabase';
import { draftEditSchema, getLatestDraft, applyDraftEdits } from '@/lib/documents/draft-helpers';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * Updates draft values only — never touches documents.status or
 * document_extractions.review_status. Only allowed while the draft is still
 * pending_review; once a human has decided, the record is final.
 */
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 });
  }

  const parsed = draftEditSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

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
    return NextResponse.json(
      { error: `Draft already ${draft.review_status}; values can no longer be edited.` },
      { status: 409 }
    );
  }

  try {
    await applyDraftEdits(supabase, draft.id, parsed.data);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const { data: updated, error: fetchError } = await supabase
    .from('document_extractions')
    .select('*')
    .eq('id', draft.id)
    .single();
  const { data: lineItems, error: lineItemsError } = await supabase
    .from('line_items')
    .select('*')
    .eq('draft_id', draft.id);

  if (fetchError || !updated || lineItemsError) {
    return NextResponse.json({ error: 'Failed to read back the updated draft.' }, { status: 500 });
  }

  return NextResponse.json({ ...updated, lineItems }, { status: 200 });
}
