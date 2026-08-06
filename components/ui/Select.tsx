import { forwardRef, type SelectHTMLAttributes } from 'react';
import { cn } from '@/utils/cn';

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        'flex h-10 w-full rounded-control border border-surface-elevated bg-surface px-3 text-sm text-foreground',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    >
      {children}
    </select>
  )
);
Select.displayName = 'Select';
