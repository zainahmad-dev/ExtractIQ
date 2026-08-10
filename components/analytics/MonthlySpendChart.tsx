import { ChartFrame, ChartPlaceholder } from '@/components/analytics/ChartFrame';
import {
  formatCompactCurrency,
  formatCurrency,
  formatMonthLabel,
  formatMonthTitle,
} from '@/components/analytics/format';
import type { MonthlySpendPoint } from '@/types/analytics';

const TITLE = 'Monthly spend';

export interface MonthlySpendChartProps {
  data: MonthlySpendPoint[];
  currency: string;
}

/** Rounds the axis top up to the next 1/2/5 × 10ⁿ so the ticks land on readable numbers. */
function niceCeiling(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

/**
 * Approved spend per calendar month, keyed on each document's own date.
 * Columns, one hue — the bars' length already encodes magnitude, so nothing
 * is gained by ramping their colour too.
 */
export function MonthlySpendChart({ data, currency }: MonthlySpendChartProps) {
  if (data.length === 0) {
    return (
      <ChartPlaceholder title={TITLE} message="No approved records with a document date yet." />
    );
  }

  const axisMax = niceCeiling(Math.max(...data.map((point) => point.total)));
  const peakTotal = Math.max(...data.map((point) => point.total));

  return (
    <ChartFrame
      title={TITLE}
      subtitle={`Approved documents, by document date (${currency})`}
      yTicks={[
        formatCompactCurrency(axisMax, currency),
        formatCompactCurrency(axisMax / 2, currency),
        formatCompactCurrency(0, currency),
      ]}
      xLabels={data.map((point) => formatMonthLabel(point.month))}
    >
      <div className="absolute inset-0 flex gap-0.5">
        {data.map((point) => {
          const heightPercent = (point.total / axisMax) * 100;
          // Only the peak column is directly labelled — the axis ticks carry
          // the rest, and a number on every column reads as noise.
          const isPeak = point.total > 0 && point.total === peakTotal;

          return (
            <div
              key={point.month}
              className="relative h-full min-w-0 flex-1"
              title={`${formatMonthTitle(point.month)} — ${formatCurrency(point.total, currency)}`}
            >
              <div
                className="absolute inset-x-0 bottom-0 mx-auto w-full max-w-6 rounded-t-[4px] bg-primary"
                style={{ height: `${heightPercent}%` }}
              />
              {isPeak && (
                <span
                  className="absolute inset-x-0 whitespace-nowrap text-center text-[11px] font-medium"
                  style={{ bottom: `calc(${heightPercent}% + 4px)` }}
                >
                  {formatCompactCurrency(point.total, currency)}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </ChartFrame>
  );
}
