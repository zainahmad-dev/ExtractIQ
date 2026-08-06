import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/utils/cn';

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

export const Input = forwardRef<HTMLInputElement, InputProps>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      'flex h-10 w-full rounded-control border border-surface-elevated bg-surface px-3 text-sm text-foreground',
      'placeholder:text-muted-foreground',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
      'disabled:cursor-not-allowed disabled:opacity-50',
      className
    )}
    {...props}
  />
));
Input.displayName = 'Input';
