import { AccuracyTrendChart } from '@/components/analytics/AccuracyTrendChart';
import { MetricCard } from '@/components/analytics/MetricCard';
import { MonthlySpendChart } from '@/components/analytics/MonthlySpendChart';
import { TopVendorsChart } from '@/components/analytics/TopVendorsChart';
import { formatDuration, formatPercent } from '@/components/analytics/format';
import { getAnalytics } from '@/lib/analytics/metrics';

export const dynamic = 'force-dynamic';

/**
 * Server-rendered from the same aggregation the API route serves (mirroring
 * Phase 20's Dashboard), so the screen never flashes an empty shell and
 * GET /api/analytics can't drift away from what's on screen.
 */
export default async function AnalyticsPage() {
  const { currency, monthlySpend, topVendors, accuracyTrend, operational } = await getAnalytics();

  return (
    <div className="flex flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">Analytics</h1>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <MonthlySpendChart data={monthlySpend} currency={currency} />
        <TopVendorsChart data={topVendors} currency={currency} />
      </div>

      <AccuracyTrendChart data={accuracyTrend} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard
          label="Avg processing time"
          value={formatDuration(operational.averageProcessingTimeMs)}
          hint="Pipeline steps summed per document"
        />
        <MetricCard
          label="OCR usage"
          value={formatPercent(operational.ocrUsageRate)}
          hint="Of documents that reached the pipeline"
        />
        <MetricCard
          label="Approval rate"
          value={formatPercent(operational.approvalRate)}
          hint="Of drafts a reviewer has decided on"
        />
        <MetricCard
          label="Manual entry rate"
          value={formatPercent(operational.manualEntryRate)}
          hint="Of all uploaded documents"
        />
        <MetricCard
          label="Avg confidence"
          value={formatPercent(operational.averageConfidence)}
          hint="Across every scored extraction"
        />
        <MetricCard
          label="Processing success rate"
          value={formatPercent(operational.processingSuccessRate)}
          hint="Of documents the pipeline has finished"
        />
      </div>
    </div>
  );
}
