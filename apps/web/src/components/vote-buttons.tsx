'use client';

import * as React from 'react';
import { ArrowBigDown, ArrowBigUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatScore } from '@/lib/format';

interface VoteButtonsProps {
  score: number;
  myVote?: 1 | -1 | 0;
  size?: 'sm' | 'md';
  orientation?: 'horizontal' | 'vertical';
  onVote?: (value: 1 | -1 | 0) => void;
  className?: string;
}

/**
 * 投票控件:
 *   - horizontal: 圆角胶囊, ▲ 分数 ▼ 横排 (用于评论/详情页内联)
 *   - vertical:   竖排 ▲ / 分数 / ▼ (用于帖子卡片左侧)
 */
export function VoteButtons({
  score: initialScore,
  myVote: initialVote,
  size = 'md',
  orientation = 'horizontal',
  onVote,
  className,
}: VoteButtonsProps) {
  const [vote, setVote] = React.useState<1 | -1 | 0>(initialVote ?? 0);
  const [score, setScore] = React.useState(initialScore);

  function handleClick(value: 1 | -1, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const next: 1 | -1 | 0 = vote === value ? 0 : value;
    const delta = next - vote;
    setVote(next);
    setScore((s) => s + delta);
    onVote?.(next);
  }

  const isUp = vote === 1;
  const isDown = vote === -1;

  if (orientation === 'vertical') {
    const sizes = {
      sm: { btn: 'size-6 rounded-sm', icon: 'size-4', text: 'text-xs min-w-[1.5rem]' },
      md: { btn: 'size-7 rounded-sm', icon: 'size-5', text: 'text-sm min-w-[1.75rem]' },
    }[size];

    return (
      <div className={cn('inline-flex flex-col items-center gap-0.5', className)}>
        <button
          type="button"
          onClick={(e) => handleClick(1, e)}
          aria-label="赞"
          aria-pressed={isUp}
          className={cn(
            'inline-flex shrink-0 items-center justify-center transition-colors',
            'hover:bg-[color:var(--upvote)]/15 hover:text-[color:var(--upvote)]',
            isUp && 'text-[color:var(--upvote)]',
            !isUp && 'text-muted-foreground',
            sizes.btn,
          )}
        >
          <ArrowBigUp className={cn(sizes.icon, isUp && 'fill-current')} />
        </button>

        <span
          className={cn(
            'select-none text-center font-semibold tabular-nums leading-none',
            sizes.text,
            isUp && 'text-[color:var(--upvote)]',
            isDown && 'text-[color:var(--downvote)]',
            !isUp && !isDown && 'text-foreground',
          )}
        >
          {formatScore(score)}
        </span>

        <button
          type="button"
          onClick={(e) => handleClick(-1, e)}
          aria-label="踩"
          aria-pressed={isDown}
          className={cn(
            'inline-flex shrink-0 items-center justify-center transition-colors',
            'hover:bg-[color:var(--downvote)]/15 hover:text-[color:var(--downvote)]',
            isDown && 'text-[color:var(--downvote)]',
            !isDown && 'text-muted-foreground',
            sizes.btn,
          )}
        >
          <ArrowBigDown className={cn(sizes.icon, isDown && 'fill-current')} />
        </button>
      </div>
    );
  }

  // horizontal (默认, 用于评论/详情页内联)
  const sizes = {
    sm: { btn: 'h-7 w-7', icon: 'size-4', pill: 'h-7 text-xs', text: 'min-w-[1.5rem]' },
    md: { btn: 'h-8 w-8', icon: 'size-5', pill: 'h-8 text-sm', text: 'min-w-[2rem]' },
  }[size];

  return (
    <div
      className={cn(
        'inline-flex items-center rounded-full bg-muted transition-colors',
        isUp && 'bg-[color:var(--upvote)]/15',
        isDown && 'bg-[color:var(--downvote)]/15',
        sizes.pill,
        className,
      )}
    >
      <button
        type="button"
        onClick={(e) => handleClick(1, e)}
        aria-label="赞"
        aria-pressed={isUp}
        className={cn(
          'inline-flex shrink-0 items-center justify-center rounded-full transition-colors',
          'hover:bg-[color:var(--upvote)]/20 hover:text-[color:var(--upvote)]',
          isUp && 'text-[color:var(--upvote)]',
          sizes.btn,
        )}
      >
        <ArrowBigUp
          className={cn(sizes.icon, 'transition-transform', isUp && 'scale-110 fill-current')}
        />
      </button>

      <span
        className={cn(
          'select-none text-center font-semibold tabular-nums',
          sizes.text,
          isUp && 'text-[color:var(--upvote)]',
          isDown && 'text-[color:var(--downvote)]',
        )}
      >
        {formatScore(score)}
      </span>

      <button
        type="button"
        onClick={(e) => handleClick(-1, e)}
        aria-label="踩"
        aria-pressed={isDown}
        className={cn(
          'inline-flex shrink-0 items-center justify-center rounded-full transition-colors',
          'hover:bg-[color:var(--downvote)]/20 hover:text-[color:var(--downvote)]',
          isDown && 'text-[color:var(--downvote)]',
          sizes.btn,
        )}
      >
        <ArrowBigDown
          className={cn(sizes.icon, 'transition-transform', isDown && 'scale-110 fill-current')}
        />
      </button>
    </div>
  );
}
