import { randomUUID } from 'crypto';
import { NextResponse, after, type NextRequest } from 'next/server';
import { getSupabaseAdminClient, DOCUMENTS_BUCKET } from '@/lib/storage/supabase';
import type { DocumentStatus } from '@/types/status';

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const ALLOWED_MIME_TYPES = ['application/pdf', 'image/png', 'image/jpeg'];

export async function POST(request: NextRequest) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Expected multipart/form-data.' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: 'No file provided under the "file" field.' },
      { status: 400 }
    );
  }

  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: 'Unsupported file type. Only PDF, PNG, and JPG are accepted.' },
      { status: 400 }
    );
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'File exceeds the 25MB limit.' }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient();
  const storagePath = `${randomUUID()}/${file.name}`;

  const { error: uploadError } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .upload(storagePath, file, { contentType: file.type });

  if (uploadError) {
    return NextResponse.json({ error: 'Failed to store the file.' }, { status: 500 });
  }

  const queuedStatus: DocumentStatus = 'queued';

  const { data: document, error: insertError } = await supabase
    .from('documents')
    .insert({
      filename: file.name,
      file_path: storagePath,
      file_size: file.size,
      mime_type: file.type,
      status: queuedStatus,
    })
    .select()
    .single();

  if (insertError || !document) {
    await supabase.storage.from(DOCUMENTS_BUCKET).remove([storagePath]);
    return NextResponse.json({ error: 'Failed to create document record.' }, { status: 500 });
  }

  // Non-blocking: kick off processing after the response is sent, via
  // Phase 12's orchestrator endpoint.
  const processUrl = new URL(`/api/process/${document.id}`, request.url);
  after(() => {
    fetch(processUrl, { method: 'POST' }).catch((err: unknown) => {
      console.error(`Failed to trigger processing for document ${document.id}:`, err);
    });
  });

  return NextResponse.json({ id: document.id, status: document.status }, { status: 201 });
}
