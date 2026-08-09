'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DropZone } from '@/components/upload/DropZone';
import { UploadItemRow, type UploadItemState } from '@/components/upload/UploadItemRow';

/** Mirrors app/api/upload/route.ts's own constraints, purely for instant client-side feedback — the server remains the source of truth. */
const MAX_FILE_SIZE = 25 * 1024 * 1024;
const ALLOWED_MIME_TYPES = ['application/pdf', 'image/png', 'image/jpeg'];

/** How long the "Queued" badge stays visible before handing off to the Processing screen. */
const NAVIGATE_DELAY_MS = 700;

interface UploadResponse {
  id: string;
  status: string;
}

/** XHR (not fetch) because it's the only browser API that reports real upload-progress events. */
function uploadFile(file: File, onProgress: (percent: number) => void): Promise<UploadResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append('file', file);

    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    });

    xhr.addEventListener('load', () => {
      let body: unknown;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        reject(new Error('Server returned an invalid response.'));
        return;
      }

      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(body as UploadResponse);
      } else {
        const message =
          (body as { error?: string } | null)?.error ?? `Upload failed with status ${xhr.status}.`;
        reject(new Error(message));
      }
    });

    xhr.addEventListener('error', () => reject(new Error('Network error during upload.')));
    xhr.addEventListener('abort', () => reject(new Error('Upload was cancelled.')));

    xhr.open('POST', '/api/upload');
    xhr.send(formData);
  });
}

function validateFile(file: File): string | null {
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return 'Unsupported file type. Only PDF, PNG, and JPG are accepted.';
  }
  if (file.size > MAX_FILE_SIZE) {
    return 'File exceeds the 25MB limit.';
  }
  return null;
}

export default function UploadPage() {
  const router = useRouter();
  const [items, setItems] = useState<UploadItemState[]>([]);

  const pendingCountRef = useRef(0);
  const lastQueuedDocumentIdRef = useRef<string | null>(null);
  const navigateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (navigateTimeoutRef.current) clearTimeout(navigateTimeoutRef.current);
    },
    []
  );

  const updateItem = useCallback((clientId: string, patch: Partial<UploadItemState>) => {
    setItems((prev) =>
      prev.map((item) => (item.clientId === clientId ? { ...item, ...patch } : item))
    );
  }, []);

  const handleFilesSelected = useCallback(
    (files: File[]) => {
      const newItems: UploadItemState[] = files.map((file) => ({
        clientId: crypto.randomUUID(),
        file,
        phase: 'uploading',
        progress: 0,
      }));

      setItems((prev) => [...prev, ...newItems]);
      pendingCountRef.current += newItems.length;

      // One-shot per file: upload -> show "Queued" -> once the whole batch has
      // settled, hand off to the Processing screen for the last one queued.
      // No polling of any kind happens on this screen.
      const settleOne = () => {
        pendingCountRef.current -= 1;
        if (pendingCountRef.current === 0 && lastQueuedDocumentIdRef.current) {
          const documentId = lastQueuedDocumentIdRef.current;
          if (navigateTimeoutRef.current) clearTimeout(navigateTimeoutRef.current);
          navigateTimeoutRef.current = setTimeout(() => {
            // Guards against a new batch having started during the grace
            // window — don't navigate away from a still-in-flight upload.
            if (pendingCountRef.current === 0) {
              router.push(`/processing/${documentId}`);
            }
          }, NAVIGATE_DELAY_MS);
        }
      };

      for (const item of newItems) {
        const validationError = validateFile(item.file);
        if (validationError) {
          updateItem(item.clientId, { phase: 'error', errorMessage: validationError });
          settleOne();
          continue;
        }

        uploadFile(item.file, (progress) => updateItem(item.clientId, { progress }))
          .then((result) => {
            updateItem(item.clientId, { phase: 'queued', progress: 100, documentId: result.id });
            lastQueuedDocumentIdRef.current = result.id;
          })
          .catch((error: unknown) => {
            updateItem(item.clientId, {
              phase: 'error',
              errorMessage: error instanceof Error ? error.message : 'Upload failed.',
            });
          })
          .finally(settleOne);
      }
    },
    [updateItem, router]
  );

  return (
    <div className="flex flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">Upload</h1>

      <DropZone onFilesSelected={handleFilesSelected} />

      {items.length > 0 && (
        <div className="flex flex-col gap-3">
          {items.map((item) => (
            <UploadItemRow key={item.clientId} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
