import { MessagesSquare } from 'lucide-react';
import { cn } from '@/lib/utils';

export function BrandMark({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm', className)} aria-hidden>
      <MessagesSquare className="size-[55%]" />
    </span>
  );
}
