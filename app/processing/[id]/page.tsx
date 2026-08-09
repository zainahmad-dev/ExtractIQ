'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Check, Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { cn } from '@/utils/cn';
import { isDocumentStatus, type DocumentStatus } from '@/types/status';

const POLL_INTERVAL_MS = 2000;
const TERMINAL_STATUSES = new Set<DocumentStatus>([
  'awaiting_review',
  'completed',
  'needs_manual_entry',
]);

/** How long the terminal checkmarks stay visible before handing off to Review. */
const REVIEW_NAVIGATE_DELAY_MS = 1200;

const STEPS = ['Upload', 'OCR', 'AI Processing', 'Validation', 'Completed'] as const;

/**
 * Phase 22's exact required mapping from the 9-state pipeline enum onto the
 * 5-step visual. needs_manual_entry isn't part of this linear progression —
 * it renders as its own error state instead (see below).
 */
function stepIndexForStatus(status: DocumentStatus): number | null {
  switch (status) {
    case 'queued':
    case 'processing':
      return 0;
    case 'extracting_text':
    case 'running_ocr':
      return 1;
    case 'running_llm':
      return 2;
    case 'validating':
      return 3;
    case 'awaiting_review':
    case 'completed':
      return 4;
    case 'needs_manual_entry':
      return null;
  }
}

interface DocumentStatusResponse {
  id: string;
  filename: string;
  status: string;
  error_reason: string | null;
}

interface ProcessingPageProps {
  params: Promise<{ id: string }>;
}

export default function ProcessingPage({ params }: ProcessingPageProps) {
  const { id } = use(params);
  const router = useRouter();
  const [doc, setDoc] = useState<DocumentStatusResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout>;

    async function poll() {
      try {
        const response = await fetch(`/api/documents/${id}`);
        const body = await response.json();
        if (cancelled) return;

        if (!response.ok) {
          setLoadError(body?.error ?? `Failed to load document ${id}.`);
          if (response.status !== 404) {
            timeoutId = setTimeout(poll, POLL_INTERVAL_MS);
          }
          return;
        }

        setDoc(body);
        setLoadError(null);

        if (!isDocumentStatus(body.status) || !TERMINAL_STATUSES.has(body.status)) {
          timeoutId = setTimeout(poll, POLL_INTERVAL_MS);
        }
      } catch {
        if (!cancelled) {
          timeoutId = setTimeout(poll, POLL_INTERVAL_MS);
        }
      }
    }

    poll();
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [id]);

  const status = doc && isDocumentStatus(doc.status) ? doc.status : null;

  // Only awaiting_review hands off to Review — completed already went through
  // a human decision, and needs_manual_entry keeps showing its error card.
  useEffect(() => {
    if (status !== 'awaiting_review') return;
    const timeoutId = setTimeout(() => {
      router.push(`/review/${id}`);
    }, REVIEW_NAVIGATE_DELAY_MS);
    return () => clearTimeout(timeoutId);
  }, [status, id, router]);

  const currentStepIndex = status ? stepIndexForStatus(status) : null;
  // awaiting_review/completed both map to the last step, but they're resting
  // states, not active work — that step should read as done, not spinning.
  const isRestingAtFinalStep = status === 'awaiting_review' || status === 'completed';

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Processing</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {doc ? doc.filename : `Document ${id}`}
        </p>
      </div>

      {loadError && (
        <Card className="border border-danger/40 bg-danger/5">
          <p className="text-sm text-danger">{loadError}</p>
        </Card>
      )}

      {!doc && !loadError && <p className="text-sm text-muted-foreground">Loading…</p>}

      {status && status !== 'needs_manual_entry' && currentStepIndex !== null && (
        <Card>
          <ol className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            {STEPS.map((label, index) => {
              const state =
                index < currentStepIndex || (index === currentStepIndex && isRestingAtFinalStep)
                  ? 'complete'
                  : index === currentStepIndex
                    ? 'active'
                    : 'upcoming';
              return (
                <li
                  key={label}
                  className="flex flex-1 items-center gap-3 sm:flex-col sm:text-center"
                >
                  <span
                    className={cn(
                      'flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 text-sm font-semibold',
                      state === 'complete' && 'border-success bg-success/15 text-success',
                      state === 'active' && 'border-primary bg-primary/15 text-primary',
                      state === 'upcoming' && 'border-surface-elevated text-muted-foreground'
                    )}
                  >
                    {state === 'complete' ? (
                      <Check size={16} />
                    ) : state === 'active' ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      index + 1
                    )}
                  </span>
                  <span
                    className={cn(
                      'text-sm font-medium',
                      state === 'upcoming' && 'text-muted-foreground'
                    )}
                  >
                    {label}
                  </span>
                </li>
              );
            })}
          </ol>
        </Card>
      )}

      {status === 'needs_manual_entry' && (
        <Card className="border border-danger/40 bg-danger/5">
          <div className="flex items-start gap-3">
            <AlertTriangle size={20} className="mt-0.5 shrink-0 text-danger" />
            <div>
              <p className="text-sm font-semibold text-danger">Needs Manual Entry</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {doc?.error_reason ?? 'This document could not be processed automatically.'}
              </p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
