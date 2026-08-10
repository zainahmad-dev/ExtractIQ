import type { ReactNode } from 'react';
import { Card } from '@/components/ui/Card';

export interface ChartFrameProps {
  title: string;
  subtitle?: string;
  /** Tick labels top to bottom; each one also draws its hairline gridline. */
  yTicks: string[];
  /** One label per band. The plot layer must use the same band geometry so the two line up. */
  xLabels: string[];
  /** The plot layer — absolutely positioned inside the (relative) plot area. */
  children: ReactNode;
}

/** Plot height in the same rem scale as the rest of the design system (h-48). */
const PLOT_HEIGHT_CLASS = 'h-48';

/**
 * The shared chart chrome: title, a left gutter of y-axis ticks, recessive
 * gridlines, the plot area itself, and an x-axis band underneath. The axis
 * band lives inside the card's normal flow (rather than a fixed-height box)
 * so the labels can never be clipped by the plot's height.
 */
export function ChartFrame({ title, subtitle, yTicks, xLabels, children }: ChartFrameProps) {
  const lastTickIndex = Math.max(1, yTicks.length - 1);

  return (
    <Card className="flex flex-col gap-5">
      <header>
        <h2 className="text-sm font-medium">{title}</h2>
        {subtitle && <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>}
      </header>

      <div className="flex gap-3">
        <div className={`relative w-16 shrink-0 ${PLOT_HEIGHT_CLASS}`}>
          {yTicks.map((tick, index) => (
            <span
              key={index}
              className="absolute right-0 -translate-y-1/2 text-[11px] tabular-nums text-muted-foreground"
              style={{ top: `${(index / lastTickIndex) * 100}%` }}
            >
              {tick}
            </span>
          ))}
        </div>

        <div className="min-w-0 flex-1">
          <div className={`relative ${PLOT_HEIGHT_CLASS}`}>
            {yTicks.map((_, index) => (
              <div
                key={index}
                aria-hidden
                className="absolute inset-x-0 h-px bg-surface-elevated"
                style={
                  index === yTicks.length - 1
                    ? { bottom: 0 }
                    : { top: `${(index / lastTickIndex) * 100}%` }
                }
              />
            ))}
            {children}
          </div>

          <div className="mt-2 flex gap-0.5">
            {xLabels.map((label, index) => (
              <span
                key={index}
                className="min-w-0 flex-1 truncate text-center text-[11px] text-muted-foreground"
              >
                {label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

export interface ChartPlaceholderProps {
  title: string;
  message: string;
}

/** Stands in for a chart with nothing to plot yet, at the same height so the grid doesn't reflow once data arrives. */
export function ChartPlaceholder({ title, message }: ChartPlaceholderProps) {
  return (
    <Card className="flex flex-col gap-5">
      <header>
        <h2 className="text-sm font-medium">{title}</h2>
      </header>
      <div className={`flex items-center justify-center ${PLOT_HEIGHT_CLASS}`}>
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
    </Card>
  );
}
