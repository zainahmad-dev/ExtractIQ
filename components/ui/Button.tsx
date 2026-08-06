import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/utils/cn';

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive';
type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-foreground hover:bg-primary/90',
  secondary: 'bg-secondary text-foreground hover:bg-secondary/90',
  outline: 'border border-surface-elevated text-foreground hover:bg-surface',
  ghost: 'text-foreground hover:bg-surface',
  destructive: 'bg-danger text-foreground hover:bg-danger/90',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-6 text-base',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center rounded-control font-medium transition-colors',
        'disabled:pointer-events-none disabled:opacity-50',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
      {...props}
    />
  )
);
Button.displayName = 'Button';
