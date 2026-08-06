import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/utils/cn';

export type ToggleProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>;

export const Toggle = forwardRef<HTMLInputElement, ToggleProps>(({ className, ...props }, ref) => (
  <label className={cn('inline-flex cursor-pointer items-center', className)}>
    <input ref={ref} type="checkbox" className="peer sr-only" {...props} />
    <span
      className={cn(
        'relative h-6 w-11 rounded-full bg-surface-elevated transition-colors',
        'peer-checked:bg-primary',
        'peer-focus-visible:ring-2 peer-focus-visible:ring-primary',
        'peer-disabled:cursor-not-allowed peer-disabled:opacity-50',
        'after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-foreground after:transition-transform',
        'peer-checked:after:translate-x-5'
      )}
    />
  </label>
));
Toggle.displayName = 'Toggle';
