import { NextResponse, type NextRequest } from 'next/server';
import { DocumentNotFoundError, processDocument } from '@/lib/jobs/process-document';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * Idempotent: process-document.ts only advances documents in 'queued' status,
 * so re-invoking this on an already-processed or in-flight document is a
 * safe no-op that just reports the current status back.
 */
export async function POST(_request: NextRequest, { params }: RouteContext) {
  const { id } = await params;

  try {
    const result = await processDocument(id);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof DocumentNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    const message = error instanceof Error ? error.message : 'Unknown error processing document';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
