import { cn } from '@/utils/cn';

type ConfidenceLevel = 'success' | 'warning' | 'danger';

function getConfidenceLevel(score: number): ConfidenceLevel {
  if (score >= 95) return 'success';
  if (score >= 85) return 'warning';
  return 'danger';
}

const levelClasses: Record<ConfidenceLevel, string> = {
  success: 'bg-success/15 text-success',
  warning: 'bg-warning/15 text-warning',
  danger: 'bg-danger/15 text-danger',
};

export interface ConfidenceBadgeProps {
  score: number;
  className?: string;
}

export function ConfidenceBadge({ score, className }: ConfidenceBadgeProps) {
  const level = getConfidenceLevel(score);

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-control px-2.5 py-0.5 text-xs font-medium tabular-nums',
        levelClasses[level],
        className
      )}
    >
      {Math.round(score)}%
    </span>
  );
}
