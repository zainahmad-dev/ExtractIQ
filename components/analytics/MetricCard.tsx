import { Card } from '@/components/ui/Card';

export interface MetricCardProps {
  label: string;
  /** Pre-formatted so each metric keeps its own unit — "94.2%", "4.2 s", "—" when there's no data yet. */
  value: string;
  /** One line naming what the metric is measured over, so the number can't be read out of context. */
  hint: string;
}

/**
 * A single operational metric. Unlike Phase 20's StatCard (a raw count with
 * an icon), this renders an already-formatted rate or duration, so the value
 * arrives as a string.
 */
export function MetricCard({ label, value, hint }: MetricCardProps) {
  return (
    <Card className="flex flex-col gap-1">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold">{value}</p>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </Card>
  );
}
