import { NextResponse, type NextRequest } from 'next/server';
import { withApiErrorHandler } from '@/lib/api-error-handler';
import { getSupabaseAdminClient, DOCUMENTS_BUCKET } from '@/lib/storage/supabase';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** Live pipeline status — never statically cache this response. */
export const dynamic = 'force-dynamic';

/** Long enough for a full review session; short enough not to linger past it. */
const SIGNED_URL_EXPIRY_SECONDS = 60 * 60;

/**
 * Read-only status lookup for a single document. The Processing screen
 * (Phase 22) polls this frequently for just {id, filename, status,
 * error_reason, ...} — that lean shape is unchanged. Passing ?full=true
 * (Phase 23's Review screen, fetched once on mount) additionally returns the
 * latest extraction draft + its line items and a signed URL to the source
 * file, so the polling endpoint's cost/shape stays exactly as it was.
 */
export const GET = withApiErrorHandler(async (request: NextRequest, { params }: RouteContext) => {
  const { id } = await params;
  const supabase = getSupabaseAdminClient();
  const full = request.nextUrl.searchParams.get('full') === 'true';

  if (!full) {
    const { data: document, error } = await supabase
      .from('documents')
      .select('id, filename, status, error_reason, created_at, updated_at')
      .eq('id', id)
      .single();

    if (error || !document) {
      return NextResponse.json({ error: `Document ${id} not found.` }, { status: 404 });
    }

    return NextResponse.json(document, { status: 200 });
  }

  const { data: document, error } = await supabase
    .from('documents')
    .select('id, filename, mime_type, file_path, status, error_reason, created_at, updated_at')
    .eq('id', id)
    .single();

  if (error || !document) {
    return NextResponse.json({ error: `Document ${id} not found.` }, { status: 404 });
  }

  const [{ data: draftRow }, signedUrlResult] = await Promise.all([
    supabase
      .from('document_extractions')
      .select('*')
      .eq('document_id', id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.storage
      .from(DOCUMENTS_BUCKET)
      .createSignedUrl(document.file_path, SIGNED_URL_EXPIRY_SECONDS),
  ]);

  let draft = null;
  if (draftRow) {
    const { data: lineItems } = await supabase
      .from('line_items')
      .select('*')
      .eq('draft_id', draftRow.id);
    draft = { ...draftRow, lineItems: lineItems ?? [] };
  }

  return NextResponse.json(
    { ...document, fileUrl: signedUrlResult.data?.signedUrl ?? null, draft },
    { status: 200 }
  );
});
