import Link from 'next/link';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { ConfidenceBadge } from '@/components/ui/ConfidenceBadge';
import { cn } from '@/utils/cn';
import { RECORDS_SORT_FIELDS, type RecordItem, type RecordsSortField } from '@/types/records';

export interface RecordsTableProps {
  items: RecordItem[];
  loading: boolean;
  sortBy: string;
  onSortChange: (sortBy: string) => void;
}

const COLUMNS: { field: RecordsSortField; label: string }[] = [
  { field: 'vendorName', label: 'Vendor' },
  { field: 'documentDate', label: 'Date' },
  { field: 'total', label: 'Amount' },
  { field: 'createdAt', label: 'Uploaded' },
];

/** documentDate is a plain SQL date (no time/zone) — parse its Y/M/D as local calendar values so display never rolls back a day near midnight in negative-UTC-offset zones. */
function formatDocumentDate(value: string | null): string {
  if (!value) return '—';
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatAmount(value: number | null, currency: string | null): string {
  if (value === null) return '—';
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency ?? 'USD',
    }).format(value);
  } catch {
    return value.toFixed(2);
  }
}

function parseSortBy(sortBy: string): { field: RecordsSortField | null; ascending: boolean } {
  const ascending = !sortBy.startsWith('-');
  const field = ascending ? sortBy : sortBy.slice(1);
  return {
    field: (RECORDS_SORT_FIELDS as readonly string[]).includes(field)
      ? (field as RecordsSortField)
      : null,
    ascending,
  };
}

export function RecordsTable({ items, loading, sortBy, onSortChange }: RecordsTableProps) {
  const activeSort = parseSortBy(sortBy);

  function toggleSort(field: RecordsSortField) {
    if (activeSort.field === field) {
      onSortChange(activeSort.ascending ? `-${field}` : field);
    } else {
      onSortChange(field);
    }
  }

  return (
    <Card className="overflow-x-auto p-0">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-surface-elevated text-left text-xs text-muted-foreground">
            {COLUMNS.map((column) => {
              const isActive = activeSort.field === column.field;
              const Icon = isActive ? (activeSort.ascending ? ArrowUp : ArrowDown) : ArrowUpDown;
              return (
                <th key={column.field} className="px-4 py-3 font-medium">
                  <button
                    type="button"
                    onClick={() => toggleSort(column.field)}
                    className={cn(
                      'inline-flex items-center gap-1.5 hover:text-foreground',
                      isActive && 'text-foreground'
                    )}
                  >
                    {column.label}
                    <Icon size={12} />
                  </button>
                </th>
              );
            })}
            <th className="px-4 py-3 font-medium">Document #</th>
            <th className="px-4 py-3 font-medium">Confidence</th>
            <th className="px-4 py-3 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-4 py-10 text-center text-sm text-muted-foreground">
                {loading ? 'Loading records…' : 'No records match these filters.'}
              </td>
            </tr>
          ) : (
            items.map((item) => (
              <tr
                key={item.id}
                className="border-b border-surface-elevated last:border-0 hover:bg-surface-elevated/50"
              >
                <td className="px-4 py-3">
                  <Link
                    href={`/processing/${item.id}`}
                    className="font-medium hover:text-primary"
                  >
                    {item.vendorName || item.filename}
                  </Link>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {formatDocumentDate(item.documentDate)}
                </td>
                <td className="px-4 py-3 tabular-nums">{formatAmount(item.total, item.currency)}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {formatTimestamp(item.createdAt)}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{item.documentNumber || '—'}</td>
                <td className="px-4 py-3">
                  {item.overallConfidence !== null ? (
                    <ConfidenceBadge score={item.overallConfidence} />
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <Badge variant={item.reviewStatus === 'approved' ? 'success' : 'danger'}>
                    {item.reviewStatus === 'approved' ? 'Approved' : 'Rejected'}
                  </Badge>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </Card>
  );
}
