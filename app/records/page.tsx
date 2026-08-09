'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import {
  RecordsFilters,
  DEFAULT_RECORDS_FILTERS,
  type RecordsFilterState,
} from '@/components/records/RecordsFilters';
import { RecordsTable } from '@/components/records/RecordsTable';
import { RecordsPagination } from '@/components/records/RecordsPagination';
import type { RecordsResponse } from '@/types/records';

/** Debounces filter/search input so every keystroke doesn't fire a request. */
const DEBOUNCE_MS = 350;

function buildQuery(filters: RecordsFilterState, sortBy: string, page: number): string {
  const params = new URLSearchParams();
  if (filters.vendor) params.set('vendor', filters.vendor);
  if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
  if (filters.dateTo) params.set('dateTo', filters.dateTo);
  if (filters.amountMin) params.set('amountMin', filters.amountMin);
  if (filters.amountMax) params.set('amountMax', filters.amountMax);
  if (filters.status) params.set('status', filters.status);
  if (filters.search) params.set('search', filters.search);
  params.set('sortBy', sortBy);
  params.set('page', String(page));
  return params.toString();
}

export default function RecordsPage() {
  const [filters, setFilters] = useState<RecordsFilterState>(DEFAULT_RECORDS_FILTERS);
  const [sortBy, setSortBy] = useState('-documentDate');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<RecordsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Any filter/sort change restarts pagination from page 1.
  useEffect(() => {
    setPage(1);
  }, [filters, sortBy]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const timeoutId = setTimeout(() => {
      fetch(`/api/documents?${buildQuery(filters, sortBy, page)}`)
        .then(async (response) => {
          const body = await response.json();
          if (cancelled) return;
          if (!response.ok) {
            setError(body?.error ?? 'Failed to load records.');
            setResult(null);
            return;
          }
          setError(null);
          setResult(body as RecordsResponse);
        })
        .catch(() => {
          if (!cancelled) {
            setError('Failed to load records.');
            setResult(null);
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [filters, sortBy, page]);

  return (
    <div className="flex flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">Records</h1>

      <RecordsFilters filters={filters} onChange={setFilters} />

      {error && (
        <Card className="border border-danger/40 bg-danger/5">
          <p className="text-sm text-danger">{error}</p>
        </Card>
      )}

      <RecordsTable
        items={result?.data ?? []}
        loading={loading}
        sortBy={sortBy}
        onSortChange={setSortBy}
      />

      {result && result.totalCount > 0 && (
        <RecordsPagination
          page={result.page}
          pageSize={result.pageSize}
          totalPages={result.totalPages}
          totalCount={result.totalCount}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}
