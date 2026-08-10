import { ChartFrame, ChartPlaceholder } from '@/components/analytics/ChartFrame';
import { formatMonthLabel, formatMonthTitle } from '@/components/analytics/format';
import type { AccuracyTrendPoint } from '@/types/analytics';

const TITLE = 'Accuracy trend';

/** Confidence tops out at 100, so only the floor moves — and never above this, to keep visible range. */
const MAX_AXIS_FLOOR = 90;

export interface AccuracyTrendChartProps {
  data: AccuracyTrendPoint[];
}

/**
 * Average extraction confidence per month. The y-axis is anchored at 100 and
 * floored just under the lowest month (rounded down to a ten) — a full 0-100
 * axis would flatten every real movement into a straight line at the top.
 */
export function AccuracyTrendChart({ data }: AccuracyTrendChartProps) {
  if (data.length === 0) {
    return <ChartPlaceholder title={TITLE} message="No scored extractions yet." />;
  }

  const lowest = Math.min(...data.map((point) => point.averageConfidence));
  const axisFloor = Math.min(MAX_AXIS_FLOOR, Math.floor(lowest / 10) * 10);
  const axisRange = 100 - axisFloor;

  // Points sit at band centres — the same geometry the x-axis labels use.
  const points = data.map((point, index) => ({
    ...point,
    x: ((index + 0.5) / data.length) * 100,
    y: (1 - (point.averageConfidence - axisFloor) / axisRange) * 100,
  }));

  const linePoints = points.map((point) => `${point.x},${point.y}`).join(' ');
  const areaPath = [
    `M ${points[0].x},100`,
    ...points.map((point) => `L ${point.x},${point.y}`),
    `L ${points[points.length - 1].x},100`,
    'Z',
  ].join(' ');

  // The endpoint's value is directly labelled; it flips below the line when
  // the point sits high enough that a label above it would leave the plot.
  const lastPoint = points[points.length - 1];
  const labelBelowLine = lastPoint.y < 20;

  return (
    <ChartFrame
      title={TITLE}
      subtitle="Average extraction confidence, by month processed"
      yTicks={['100%', `${axisFloor + axisRange / 2}%`, `${axisFloor}%`]}
      xLabels={data.map((point) => formatMonthLabel(point.month))}
    >
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden
      >
        <path d={areaPath} className="fill-accent/10" />
        {points.length > 1 && (
          <polyline
            points={linePoints}
            className="fill-none stroke-accent"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>

      {points.map((point) => (
        <span
          key={point.month}
          className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent ring-2 ring-surface"
          style={{ left: `${point.x}%`, top: `${point.y}%` }}
          title={`${formatMonthTitle(point.month)} — ${point.averageConfidence.toFixed(1)}%`}
        />
      ))}

      <span
        className="absolute whitespace-nowrap text-[11px] font-medium"
        style={{
          left: `${lastPoint.x}%`,
          top: `${lastPoint.y}%`,
          transform: labelBelowLine ? 'translate(-50%, 60%)' : 'translate(-50%, -160%)',
        }}
      >
        {lastPoint.averageConfidence.toFixed(1)}%
      </span>
    </ChartFrame>
  );
}
