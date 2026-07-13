'use client';

import * as React from 'react';
import { Heart } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatScore } from '@/lib/format';
import { toast } from 'sonner';

interface LikeButtonProps {
  count: number;
  liked?: boolean;
  onChange?: (liked: boolean) => void | Promise<void>;
}

export function LikeButton({
  count: initialCount,
  liked: initialLiked,
  onChange,
}: LikeButtonProps) {
  const [liked, setLiked] = React.useState(Boolean(initialLiked));
  const [count, setCount] = React.useState(initialCount);
  const [pending, setPending] = React.useState(false);

  async function toggle() {
    if (pending) return;
    const previousLiked = liked;
    const previousCount = count;
    const next = !liked;
    setLiked(next);
    setCount((current) => Math.max(0, current + (next ? 1 : -1)));
    setPending(true);
    try {
      await onChange?.(next);
    } catch (error) {
      setLiked(previousLiked);
      setCount(previousCount);
      toast.error((error as Error).message || '点赞失败，请稍后重试');
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-busy={pending}
      aria-label={liked ? '取消点赞' : '点赞'}
      aria-pressed={liked}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium transition-colors [&_svg]:stroke-[1.8]',
        liked
          ? 'bg-rose-500/10 text-rose-500'
          : 'bg-muted text-muted-foreground hover:text-rose-500',
      )}
    >
      <Heart className={cn('size-4', liked && 'fill-current')} />
      <span className="tabular-nums">{formatScore(count)}</span>
    </button>
  );
}
