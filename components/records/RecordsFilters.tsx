import { Search } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import type { RecordsStatusFilter } from '@/types/records';

export interface RecordsFilterState {
  vendor: string;
  dateFrom: string;
  dateTo: string;
  amountMin: string;
  amountMax: string;
  status: RecordsStatusFilter;
  search: string;
}

export const DEFAULT_RECORDS_FILTERS: RecordsFilterState = {
  vendor: '',
  dateFrom: '',
  dateTo: '',
  amountMin: '',
  amountMax: '',
  status: 'approved',
  search: '',
};

export interface RecordsFiltersProps {
  filters: RecordsFilterState;
  onChange: (filters: RecordsFilterState) => void;
}

export function RecordsFilters({ filters, onChange }: RecordsFiltersProps) {
  function set<K extends keyof RecordsFilterState>(key: K, value: RecordsFilterState[K]) {
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
          aria-label="Search records"
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
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
        <Select
          value={filters.status}
          onChange={(event) => set('status', event.target.value as RecordsStatusFilter)}
          aria-label="Review status"
        >
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </Select>
      </div>
    </Card>
  );
}
