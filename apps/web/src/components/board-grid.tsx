'use client';

import Link from 'next/link';
import {
  BookOpen,
  BriefcaseBusiness,
  CircleHelp,
  GraduationCap,
  HandHeart,
  Lightbulb,
  MessageSquareText,
  Repeat2,
  type LucideIcon,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { Board } from '@/types/api';

interface BoardGridProps {
  boards: Board[];
}

const BOARD_STYLE: Record<string, { icon: LucideIcon; className: string }> = {
  'zheng-neng-liang': { icon: HandHeart, className: 'bg-sky-500/10 text-sky-600 dark:text-sky-400' },
  campus: { icon: MessageSquareText, className: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  course: { icon: BookOpen, className: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400' },
  trade: { icon: Repeat2, className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  job: { icon: BriefcaseBusiness, className: 'bg-violet-500/10 text-violet-600 dark:text-violet-400' },
  emotion: { icon: MessageSquareText, className: 'bg-rose-500/10 text-rose-600 dark:text-rose-400' },
  exam: { icon: GraduationCap, className: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400' },
  feedback: { icon: Lightbulb, className: 'bg-slate-500/10 text-slate-600 dark:text-slate-400' },
};

export function BoardGrid({ boards }: BoardGridProps) {
  if (boards.length === 0) {
    return <div className="rounded-2xl border border-dashed bg-card/60 px-4 py-8 text-center text-sm text-muted-foreground">暂无主题频道</div>;
  }

  return (
    <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-4" aria-label="主题频道">
      {boards.map((board) => {
        const style = BOARD_STYLE[board.slug] ?? { icon: CircleHelp, className: 'bg-slate-500/10 text-slate-600 dark:text-slate-400' };
        const Icon = style.icon;
        return (
          <li key={board.slug} className="min-w-0">
            <Link href={`/board/${board.slug}`} aria-label={`${board.name}，${board.postCount} 篇帖子`} className="block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
              <Card className="group h-full transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md">
                <CardContent className="flex min-h-[4.75rem] items-center gap-3 p-3.5">
                  <span aria-hidden className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl ring-1 ring-current/5', style.className)}>
                    <Icon className="size-5" strokeWidth={1.8} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{board.name}</span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">{board.postCount.toLocaleString('zh-CN')} 帖子</span>
                  </span>
                </CardContent>
              </Card>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
