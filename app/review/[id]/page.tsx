'use client';

import { use, useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { SourceViewer } from '@/components/review/SourceViewer';
import { ReviewForm, type ReviewDraft } from '@/components/review/ReviewForm';

interface ReviewDocumentResponse {
  id: string;
  filename: string;
  mime_type: string;
  fileUrl: string | null;
  draft: ReviewDraft | null;
}

interface ReviewPageProps {
  params: Promise<{ id: string }>;
}

export default function ReviewPage({ params }: ReviewPageProps) {
  const { id } = use(params);
  const [document, setDocument] = useState<ReviewDocumentResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/documents/${id}?full=true`)
      .then(async (response) => {
        const body = await response.json();
        if (cancelled) return;
        if (!response.ok) {
          setLoadError(body?.error ?? `Failed to load document ${id}.`);
          return;
        }
        setDocument(body);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : `Failed to load document ${id}.`);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold">Review</h1>

      {loadError && (
        <Card className="border border-danger/40 bg-danger/5">
          <p className="text-sm text-danger">{loadError}</p>
        </Card>
      )}

      {!document && !loadError && <p className="text-sm text-muted-foreground">Loading…</p>}

      {document && !document.draft && (
        <Card className="border border-warning/40 bg-warning/5">
          <p className="text-sm text-warning">
            No extraction draft is available for this document yet.
          </p>
        </Card>
      )}

      {document && document.draft && (
        <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
          <div className="min-h-[400px] flex-1 lg:min-h-0">
            <SourceViewer
              fileUrl={document.fileUrl}
              mimeType={document.mime_type}
              filename={document.filename}
            />
          </div>
          <div className="min-h-0 flex-1">
            <ReviewForm documentId={id} draft={document.draft} />
          </div>
        </div>
      )}
    </div>
  );
}
