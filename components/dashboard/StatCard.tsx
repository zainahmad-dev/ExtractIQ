import type { LucideIcon } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { cn } from '@/utils/cn';

export interface StatCardProps {
  label: string;
  value: number;
  icon: LucideIcon;
  accentClassName?: string;
}

export function StatCard({ label, value, icon: Icon, accentClassName }: StatCardProps) {
  return (
    <Card className="flex items-center gap-4">
      <div
        className={cn(
          'flex h-11 w-11 shrink-0 items-center justify-center rounded-control',
          accentClassName ?? 'bg-primary/15 text-primary'
        )}
      >
        <Icon size={20} />
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold tabular-nums">{value.toLocaleString()}</p>
      </div>
    </Card>
  );
}
