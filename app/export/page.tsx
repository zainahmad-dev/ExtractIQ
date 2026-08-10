'use client';

import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import {
  ExportFilters,
  DEFAULT_EXPORT_FILTERS,
  type ExportFilterState,
} from '@/components/export/ExportFilters';
import { usePreferences } from '@/hooks/usePreferences';
import { EXPORT_FORMATS, isExportFormat, type ExportFormat } from '@/types/export';
import type { RecordsResponse } from '@/types/records';

/** Matches Records' debounce so the match count doesn't refetch on every keystroke. */
const DEBOUNCE_MS = 350;

/** The filter half of the query, shared by the count preview and the export itself. */
function buildFilterParams(filters: ExportFilterState): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.vendor) params.set('vendor', filters.vendor);
  if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
  if (filters.dateTo) params.set('dateTo', filters.dateTo);
  if (filters.amountMin) params.set('amountMin', filters.amountMin);
  if (filters.amountMax) params.set('amountMax', filters.amountMax);
  if (filters.search) params.set('search', filters.search);
  return params;
}

export default function ExportPage() {
  const preferences = usePreferences();
  const [filters, setFilters] = useState<ExportFilterState>(DEFAULT_EXPORT_FILTERS);
  const [format, setFormat] = useState<ExportFormat>(preferences.defaultExportFormat);
  const [matchCount, setMatchCount] = useState<number | null>(null);
  const [countError, setCountError] = useState<string | null>(null);
  const [counting, setCounting] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [lastExport, setLastExport] = useState<{ filename: string; count: number } | null>(null);

  // Follows the Settings preference until the user overrides it here.
  useEffect(() => {
    setFormat(preferences.defaultExportFormat);
  }, [preferences.defaultExportFormat]);

  // Counts matching records through Phase 24's list endpoint (approved is its
  // default scope) rather than a second count endpoint of its own.
  useEffect(() => {
    let cancelled = false;
    setCounting(true);

    const timeoutId = setTimeout(() => {
      const params = buildFilterParams(filters);
      params.set('status', 'approved');

      fetch(`/api/documents?${params.toString()}`)
        .then(async (response) => {
          const body = await response.json();
          if (cancelled) return;
          if (!response.ok) {
            setCountError(body?.error ?? 'Failed to count matching records.');
            setMatchCount(null);
            return;
          }
          setCountError(null);
          setMatchCount((body as RecordsResponse).totalCount);
        })
        .catch(() => {
          if (!cancelled) {
            setCountError('Failed to count matching records.');
            setMatchCount(null);
          }
        })
        .finally(() => {
          if (!cancelled) setCounting(false);
        });
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [filters]);

  /** Downloaded via fetch + blob (not a plain link) so a failed export surfaces its error here instead of navigating to a JSON page. */
  async function runExport() {
    setExporting(true);
    setExportError(null);
    try {
      const params = buildFilterParams(filters);
      params.set('format', format);

      const response = await fetch(`/api/export?${params.toString()}`);
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error ?? `Export failed with status ${response.status}.`);
      }

      const disposition = response.headers.get('Content-Disposition') ?? '';
      const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? `extractiq-export.${format}`;
      const count = Number(response.headers.get('X-Export-Record-Count') ?? '0');

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);

      setLastExport({ filename, count });
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'Export failed.');
    } finally {
      setExporting(false);
    }
  }

  const nothingToExport = matchCount === 0;

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Export</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Downloads approved records only. Documents still awaiting review, or rejected, are never
          included.
        </p>
      </div>

      <ExportFilters filters={filters} onChange={setFilters} />

      {countError && (
        <Card className="border border-danger/40 bg-danger/5">
          <p className="text-sm text-danger">{countError}</p>
        </Card>
      )}

      {exportError && (
        <Card className="border border-danger/40 bg-danger/5">
          <p className="text-sm text-danger">{exportError}</p>
        </Card>
      )}

      <Card className="flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="exportFormat" className="text-sm font-medium">
            Format
          </label>
          {/* Width lives on the wrapper: utils/cn.ts concatenates rather than
              merging, so Select's own w-full would win over a w-* passed in. */}
          <div className="w-40">
            <Select
              id="exportFormat"
              value={format}
              onChange={(event) => {
                if (isExportFormat(event.target.value)) setFormat(event.target.value);
              }}
            >
              {EXPORT_FORMATS.map((option) => (
                <option key={option} value={option}>
                  {option.toUpperCase()}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-surface-elevated pt-4">
          <Button
            type="button"
            variant="primary"
            onClick={runExport}
            disabled={exporting || counting || nothingToExport}
          >
            <Download size={16} className="mr-2" />
            {exporting ? 'Exporting…' : 'Export'}
          </Button>
          <span className="text-sm text-muted-foreground">
            {counting
              ? 'Counting matching records…'
              : matchCount === null
                ? 'Match count unavailable.'
                : `${matchCount.toLocaleString()} approved ${matchCount === 1 ? 'record matches' : 'records match'}.`}
          </span>
        </div>

        {lastExport && (
          <p className="text-xs text-success">
            Downloaded {lastExport.filename} ({lastExport.count.toLocaleString()}{' '}
            {lastExport.count === 1 ? 'record' : 'records'}).
          </p>
        )}
      </Card>
    </div>
  );
}
