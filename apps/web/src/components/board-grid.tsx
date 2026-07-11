'use client';

import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { Board } from '@/types/api';

interface BoardGridProps {
  boards: Board[];
}

const COLOR_MAP: Record<string, string> = {
  blue: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  green: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  orange: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
  yellow: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400',
  purple: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
  red: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
  indigo: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400',
  gray: 'bg-gray-500/10 text-gray-600 dark:text-gray-400',
};

export function BoardGrid({ boards }: BoardGridProps) {
  if (boards.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed bg-card/60 px-4 py-8 text-center text-sm text-muted-foreground">
        暂无板块，稍后再来看看
      </div>
    );
  }

  return (
    <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-4" aria-label="校园板块">
      {boards.map((board) => (
        <li key={board.slug} className="min-w-0">
          <Link
            href={`/board/${board.slug}`}
            aria-label={`${board.name}，${board.postCount} 篇帖子`}
            className="block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <Card className="group h-full transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md">
              <CardContent className="flex min-h-[4.75rem] items-center gap-2.5 p-3 sm:gap-3 sm:p-3.5">
                <span
                  aria-hidden="true"
                  className={cn(
                    'flex size-10 shrink-0 items-center justify-center rounded-xl text-lg ring-1 ring-current/5',
                    COLOR_MAP[board.color ?? 'gray'] ?? COLOR_MAP.gray,
                  )}
                >
                  {board.icon ?? '📋'}
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
      ))}
    </ul>
  );
}
