import * as React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { formatScore } from '@/lib/format';

interface StatCardProps {
  label: string;
  value: number;
  delta?: number;
  deltaLabel?: string;
  icon: React.ReactNode;
  tone?: 'default' | 'destructive' | 'success' | 'warning';
}

const TONE_STYLES = {
  default: 'text-primary bg-primary/10',
  destructive: 'text-destructive bg-destructive/10',
  success: 'text-[color:var(--success)] bg-[color:var(--success)]/10',
  warning: 'text-[color:var(--warning)] bg-[color:var(--warning)]/10',
};

export function StatCard({
  label,
  value,
  delta,
  deltaLabel = '较昨日',
  icon,
  tone = 'default',
}: StatCardProps) {
  return (
    <Card>
      <CardContent className="flex items-start gap-4 p-5">
        <div
          className={cn(
            'flex size-10 shrink-0 items-center justify-center rounded-lg',
            TONE_STYLES[tone],
          )}
        >
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-0.5 text-2xl font-bold tabular-nums tracking-tight">
            {formatScore(value)}
          </p>
          {delta !== undefined && (
            <p className="mt-1 text-xs text-muted-foreground">
              <span
                className={cn(
                  'font-medium tabular-nums',
                  delta > 0 && 'text-[color:var(--success)]',
                  delta < 0 && 'text-destructive',
                )}
              >
                {delta > 0 ? '+' : ''}
                {delta}
              </span>{' '}
              {deltaLabel}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
