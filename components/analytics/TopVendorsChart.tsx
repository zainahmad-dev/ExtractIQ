import { Card } from '@/components/ui/Card';
import { ChartPlaceholder } from '@/components/analytics/ChartFrame';
import { formatCurrency } from '@/components/analytics/format';
import type { TopVendor } from '@/types/analytics';

const TITLE = 'Top vendors';

export interface TopVendorsChartProps {
  data: TopVendor[];
  currency: string;
}

/**
 * Horizontal bars — vendor names are long and unordered, so they read down
 * the left edge rather than crammed under columns. Each bar carries its own
 * total at the tip, so no axis is needed.
 */
export function TopVendorsChart({ data, currency }: TopVendorsChartProps) {
  if (data.length === 0) {
    return <ChartPlaceholder title={TITLE} message="No approved records with a vendor yet." />;
  }

  const largestTotal = Math.max(...data.map((vendor) => vendor.total));

  return (
    <Card className="flex flex-col gap-5">
      <header>
        <h2 className="text-sm font-medium">{TITLE}</h2>
        <p className="mt-1 text-xs text-muted-foreground">By approved spend ({currency})</p>
      </header>

      <ol className="flex flex-col gap-4">
        {data.map((vendor) => (
          <li key={vendor.vendorName} className="flex flex-col gap-1.5">
            <div className="flex items-baseline gap-2">
              <span className="truncate text-sm font-medium">{vendor.vendorName}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {vendor.documentCount} {vendor.documentCount === 1 ? 'document' : 'documents'}
              </span>
              <span className="ml-auto shrink-0 text-sm tabular-nums">
                {formatCurrency(vendor.total, currency)}
              </span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-elevated">
              <div
                className="h-full rounded-full bg-secondary"
                style={{ width: `${largestTotal > 0 ? (vendor.total / largestTotal) * 100 : 0}%` }}
              />
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}
