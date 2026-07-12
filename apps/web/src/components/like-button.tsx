'use client';

import * as React from 'react';
import { Heart } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatScore } from '@/lib/format';

interface LikeButtonProps {
  count: number;
  liked?: boolean;
  onChange?: (liked: boolean) => void;
}

export function LikeButton({ count: initialCount, liked: initialLiked, onChange }: LikeButtonProps) {
  const [liked, setLiked] = React.useState(Boolean(initialLiked));
  const [count, setCount] = React.useState(initialCount);

  function toggle() {
    const next = !liked;
    setLiked(next);
    setCount((current) => Math.max(0, current + (next ? 1 : -1)));
    onChange?.(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={liked ? '取消点赞' : '点赞'}
      aria-pressed={liked}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium transition-colors',
        liked ? 'bg-rose-500/10 text-rose-500' : 'bg-muted text-muted-foreground hover:text-rose-500',
      )}
    >
      <Heart className={cn('size-4', liked && 'fill-current')} />
      <span className="tabular-nums">{formatScore(count)}</span>
    </button>
  );
}
