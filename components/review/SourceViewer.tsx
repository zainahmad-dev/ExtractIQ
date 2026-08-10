'use client';

import { useState } from 'react';
import { Minus, Plus, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.25;

export interface SourceViewerProps {
  fileUrl: string | null;
  mimeType: string;
  filename: string;
}

/** Zooms via CSS transform on the container — works uniformly for both the native PDF embed and plain images without any extra rendering library. */
export function SourceViewer({ fileUrl, mimeType, filename }: SourceViewerProps) {
  const [zoom, setZoom] = useState(1);

  function zoomIn() {
    setZoom((current) => Math.min(MAX_ZOOM, +(current + ZOOM_STEP).toFixed(2)));
  }
  function zoomOut() {
    setZoom((current) => Math.max(MIN_ZOOM, +(current - ZOOM_STEP).toFixed(2)));
  }
  function resetZoom() {
    setZoom(1);
  }

  return (
    <Card className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-sm font-medium">{filename}</p>
        {/* min-* rather than h-/w- because utils/cn.ts concatenates classes
            rather than merging them — a plain h-11 would sit alongside the
            Button's own h-8 instead of replacing it. Icon-only buttons at the
            design system's sm size are 40x32, under the 44px a finger needs;
            the floor lifts at md, the width where the app swaps its mobile
            chrome for the desktop sidebar and they keep their existing size. */}
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={zoomOut}
            aria-label="Zoom out"
            className="min-h-11 min-w-11 md:min-h-0 md:min-w-0"
          >
            <Minus size={14} />
          </Button>
          <span className="w-12 text-center text-xs tabular-nums text-muted-foreground">
            {Math.round(zoom * 100)}%
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={zoomIn}
            aria-label="Zoom in"
            className="min-h-11 min-w-11 md:min-h-0 md:min-w-0"
          >
            <Plus size={14} />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={resetZoom}
            aria-label="Reset zoom"
            className="min-h-11 min-w-11 md:min-h-0 md:min-w-0"
          >
            <RotateCcw size={14} />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto rounded-control bg-background">
        {!fileUrl ? (
          <p className="p-6 text-sm text-muted-foreground">Preview unavailable.</p>
        ) : (
          <div
            className="flex min-h-full justify-center p-4"
            style={{ transform: `scale(${zoom})`, transformOrigin: 'top center' }}
          >
            {mimeType === 'application/pdf' ? (
              /* The 500px floor keeps a PDF readable in the split view, but on
                 a phone the pane is only ~295px wide, so it forced the page
                 image sideways out of view with no way back except panning.
                 Below sm the embed just takes the pane's width; the zoom
                 controls above still enlarge it. */
              <embed
                src={fileUrl}
                type="application/pdf"
                className="h-[70vh] w-full sm:min-w-[500px]"
              />
            ) : (
              // next/image needs a configured remote pattern for external hosts, and doesn't
              // suit a short-lived signed URL anyway — a plain img is the right tool here.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={fileUrl} alt={filename} className="max-w-none" />
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
