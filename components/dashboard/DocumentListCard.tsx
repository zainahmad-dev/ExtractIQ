import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { DocumentStatusBadge } from './DocumentStatusBadge';
import type { DocumentStatus } from '@/types/status';

export interface DocumentListItem {
  id: string;
  filename: string;
  status: DocumentStatus;
  updatedAt: string;
}

export interface DocumentListCardProps {
  title: string;
  items: DocumentListItem[];
  emptyMessage: string;
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Awaiting-review items go to the review flow; everything else to the processing detail view — both routes exist (Phase 5), even if not yet wired to live data. */
function detailHref(item: DocumentListItem): string {
  return item.status === 'awaiting_review' ? `/review/${item.id}` : `/processing/${item.id}`;
}

export function DocumentListCard({ title, items, emptyMessage }: DocumentListCardProps) {
  return (
    <Card className="flex flex-col gap-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-surface-elevated">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
            >
              <div className="min-w-0">
                <Link
                  href={detailHref(item)}
                  className="block truncate text-sm font-medium hover:text-primary"
                >
                  {item.filename}
                </Link>
                <p className="text-xs text-muted-foreground">{formatTimestamp(item.updatedAt)}</p>
              </div>
              <DocumentStatusBadge status={item.status} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
