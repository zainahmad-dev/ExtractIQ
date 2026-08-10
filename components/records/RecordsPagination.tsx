import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export interface RecordsPaginationProps {
  page: number;
  pageSize: number;
  totalPages: number;
  totalCount: number;
  onPageChange: (page: number) => void;
}

/**
 * The two page buttons are icon-only, which at the design system's sm size
 * comes to 42x32 — under the 44px a fingertip needs. min-h/min-w (rather than
 * h-/w-) because utils/cn.ts concatenates classes instead of merging them, so
 * an h-11 would sit alongside Button's own h-8 rather than replacing it. From
 * md up — the width at which the app swaps its mobile chrome for the desktop
 * sidebar — the buttons keep exactly their existing size.
 */
export function RecordsPagination({
  page,
  pageSize,
  totalPages,
  totalCount,
  onPageChange,
}: RecordsPaginationProps) {
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalCount);

  return (
    <div className="flex items-center justify-between">
      <p className="text-sm text-muted-foreground">
        Showing {start}–{end} of {totalCount}
      </p>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          aria-label="Previous page"
          className="min-h-11 min-w-11 md:min-h-0 md:min-w-0"
        >
          <ChevronLeft size={16} />
        </Button>
        <span className="text-sm tabular-nums">
          {page} / {totalPages}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          aria-label="Next page"
          className="min-h-11 min-w-11 md:min-h-0 md:min-w-0"
        >
          <ChevronRight size={16} />
        </Button>
      </div>
    </div>
  );
}
