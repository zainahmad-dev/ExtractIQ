import { Search } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';

/**
 * The same filter set Records offers, minus review status — an export is
 * always scoped to approved records, so that control would be a lie.
 */
export interface ExportFilterState {
  vendor: string;
  dateFrom: string;
  dateTo: string;
  amountMin: string;
  amountMax: string;
  search: string;
}

export const DEFAULT_EXPORT_FILTERS: ExportFilterState = {
  vendor: '',
  dateFrom: '',
  dateTo: '',
  amountMin: '',
  amountMax: '',
  search: '',
};

export interface ExportFiltersProps {
  filters: ExportFilterState;
  onChange: (filters: ExportFilterState) => void;
}

export function ExportFilters({ filters, onChange }: ExportFiltersProps) {
  function set<K extends keyof ExportFilterState>(key: K, value: ExportFilterState[K]) {
    onChange({ ...filters, [key]: value });
  }

  return (
    <Card className="flex flex-col gap-4">
      <div className="relative">
        <Search
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          placeholder="Search vendor or document number…"
          value={filters.search}
          onChange={(event) => set('search', event.target.value)}
          className="pl-9"
          aria-label="Search records to export"
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Input
          placeholder="Vendor"
          value={filters.vendor}
          onChange={(event) => set('vendor', event.target.value)}
          aria-label="Filter by vendor"
        />
        <Input
          type="date"
          value={filters.dateFrom}
          onChange={(event) => set('dateFrom', event.target.value)}
          aria-label="Date from"
        />
        <Input
          type="date"
          value={filters.dateTo}
          onChange={(event) => set('dateTo', event.target.value)}
          aria-label="Date to"
        />
        <Input
          type="text"
          inputMode="decimal"
          placeholder="Min amount"
          value={filters.amountMin}
          onChange={(event) => set('amountMin', event.target.value)}
          aria-label="Minimum amount"
        />
        <Input
          type="text"
          inputMode="decimal"
          placeholder="Max amount"
          value={filters.amountMax}
          onChange={(event) => set('amountMax', event.target.value)}
          aria-label="Maximum amount"
        />
      </div>
    </Card>
  );
}
