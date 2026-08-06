import { type HTMLAttributes } from 'react';
import { cn } from '@/utils/cn';

type BadgeVariant = 'default' | 'primary' | 'success' | 'warning' | 'danger';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const variantClasses: Record<BadgeVariant, string> = {
  default: 'bg-surface-elevated text-foreground',
  primary: 'bg-primary/15 text-primary',
  success: 'bg-success/15 text-success',
  warning: 'bg-warning/15 text-warning',
  danger: 'bg-danger/15 text-danger',
};

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-control px-2.5 py-0.5 text-xs font-medium',
        variantClasses[variant],
        className
      )}
      {...props}
    />
  );
}
