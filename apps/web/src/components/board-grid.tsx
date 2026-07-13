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
  'zheng-neng-liang': {
    icon: HandHeart,
    className: 'bg-primary/10 text-primary',
  },
  campus: {
    icon: MessageSquareText,
    className: 'bg-[#f3e7dc] text-[#a55e39] dark:bg-[#452e25] dark:text-[#efaa80]',
  },
  course: {
    icon: BookOpen,
    className: 'bg-[#e7eef0] text-[#47717c] dark:bg-[#26383b] dark:text-[#9acbd0]',
  },
  trade: {
    icon: Repeat2,
    className: 'bg-[#f0ecd9] text-[#91762f] dark:bg-[#40391f] dark:text-[#e0c977]',
  },
  job: {
    icon: BriefcaseBusiness,
    className: 'bg-[#ece8f2] text-[#725f8d] dark:bg-[#352c44] dark:text-[#c9b8df]',
  },
  emotion: {
    icon: MessageSquareText,
    className: 'bg-[#f2e4e5] text-[#a15e68] dark:bg-[#422a2e] dark:text-[#dfa0aa]',
  },
  exam: {
    icon: GraduationCap,
    className: 'bg-[#e8edf1] text-[#526e85] dark:bg-[#293640] dark:text-[#a8c2d7]',
  },
  feedback: {
    icon: Lightbulb,
    className: 'bg-[#e7f0eb] text-[#4f7d69] dark:bg-[#263a31] dark:text-[#9bc8b1]',
  },
};

export function BoardGrid({ boards }: BoardGridProps) {
  if (boards.length === 0) {
    return (
      <div className="rounded-xl border border-dashed bg-card/60 px-4 py-8 text-center text-sm text-muted-foreground">
        暂无主题频道
      </div>
    );
  }

  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="主题频道">
      {boards.map((board) => {
        const style = BOARD_STYLE[board.slug] ?? {
          icon: CircleHelp,
          className: 'bg-slate-500/10 text-slate-600 dark:text-slate-400',
        };
        const Icon = style.icon;
        return (
          <li key={board.slug} className="min-w-0">
            <Link
              href={`/board/${board.slug}`}
              aria-label={`${board.name}，${board.postCount} 篇帖子`}
              className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <Card className="group h-full border-border/70 bg-card/75 shadow-none transition-[border-color,background-color] duration-150 hover:border-primary/30 hover:bg-card">
                <CardContent className="flex min-h-[5.5rem] items-center gap-3 p-4">
                  <span
                    aria-hidden
                    className={cn(
                      'flex size-10 shrink-0 items-center justify-center rounded-lg ring-1 ring-current/5',
                      style.className,
                    )}
                  >
                    <Icon className="size-5" strokeWidth={1.8} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{board.name}</span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {board.postCount.toLocaleString('zh-CN')} 帖子
                    </span>
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
