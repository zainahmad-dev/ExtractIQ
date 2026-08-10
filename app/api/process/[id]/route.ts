import { NextResponse, type NextRequest } from 'next/server';
import { withApiErrorHandler } from '@/lib/api-error-handler';
import { processDocument } from '@/lib/jobs/process-document';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * Idempotent: process-document.ts only advances documents in 'queued' status,
 * so re-invoking this on an already-processed or in-flight document is a
 * safe no-op that just reports the current status back.
 *
 * processDocument() resolves a failed pipeline run to 'needs_manual_entry'
 * rather than throwing, so a 200 here doesn't mean the document succeeded —
 * it means the run reached a decided state. Anything that does throw
 * (including DocumentNotFoundError, which the shared handler maps to 404)
 * comes back as `{ error }` from lib/api-error-handler.ts.
 */
export const POST = withApiErrorHandler(async (_request: NextRequest, { params }: RouteContext) => {
  const { id } = await params;
  const result = await processDocument(id);
  return NextResponse.json(result, { status: 200 });
});
