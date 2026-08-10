import { NextResponse, type NextRequest } from 'next/server';
import { withApiErrorHandler } from '@/lib/api-error-handler';
import { getSupabaseAdminClient } from '@/lib/storage/supabase';
import { draftEditSchema, getLatestDraft, applyDraftEdits } from '@/lib/documents/draft-helpers';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * Updates draft values only — never touches documents.status or
 * document_extractions.review_status. Only allowed while the draft is still
 * pending_review; once a human has decided, the record is final.
 *
 * The draft-helper calls below throw on a failed write; lib/api-error-handler.ts
 * turns that into a 500 `{ error }` carrying the helper's own message.
 */
export const PATCH = withApiErrorHandler(
  async (request: NextRequest, { params }: RouteContext) => {
    const { id } = await params;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 });
    }

    const parsed = draftEditSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid draft payload.' },
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
      return NextResponse.json(
        { error: `Draft already ${draft.review_status}; values can no longer be edited.` },
        { status: 409 }
      );
    }

    await applyDraftEdits(supabase, draft.id, parsed.data);

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
);
