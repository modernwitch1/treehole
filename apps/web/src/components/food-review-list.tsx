'use client';

import * as React from 'react';
import { MessageCircle, Star } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { listFoodReviews } from '@/lib/api';
import type { FoodReview } from '@/types/api';

export function FoodReviewList({
  windowId,
  initial,
}: {
  windowId: string;
  initial: {
    averageTasteScore: number | null;
    reviewCount: number;
    items: FoodReview[];
    nextCursor?: string;
  };
}) {
  const [reviews, setReviews] = React.useState(initial.items);
  const [cursor, setCursor] = React.useState(initial.nextCursor);
  const [loading, setLoading] = React.useState(false);
  const [loadError, setLoadError] = React.useState('');

  async function loadMore() {
    if (!cursor || loading) return;
    setLoading(true);
    setLoadError('');
    try {
      const page = await listFoodReviews(windowId, { cursor });
      setReviews((current) => [...current, ...page.items]);
      setCursor(page.nextCursor);
    } catch (error) {
      setLoadError((error as Error).message || '评价加载失败，请重试');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border bg-card p-4 shadow-card">
        <div className="text-2xl font-bold">{initial.averageTasteScore ?? '—'}</div>
        <div>
          <div className="flex items-center gap-1 text-amber-500">
            {[1, 2, 3, 4, 5].map((item) => (
              <Star
                key={item}
                className={`size-4 ${initial.averageTasteScore && item <= Math.round(initial.averageTasteScore) ? 'fill-current' : ''}`}
              />
            ))}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{initial.reviewCount} 条口味评价</p>
        </div>
      </div>

      {reviews.length === 0 ? (
        <div className="rounded-2xl border border-dashed py-12 text-center text-sm text-muted-foreground">
          还没有评价，来分享第一份真实体验吧。
        </div>
      ) : (
        <div className="space-y-3">
          {reviews.map((review) => (
            <article key={review.id} className="rounded-2xl border bg-card p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <span>
                    {review.author.type === 'anonymous'
                      ? review.author.displayName
                      : review.author.username}
                  </span>
                  {review.type === 'suggestion' ? (
                    <Badge variant="outline">意见</Badge>
                  ) : (
                    review.tasteScore && <Badge variant="secondary">{review.tasteScore} 星</Badge>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">
                  {formatDate(review.createdAt)}
                </span>
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-foreground/85">
                {review.contentMd}
              </p>
              {review.replies.length > 0 && (
                <div className="mt-4 space-y-2 border-l-2 border-primary/30 pl-3">
                  {review.replies.map((reply) => (
                    <div key={reply.id} className="rounded-xl bg-muted/60 p-3 text-sm">
                      <div className="flex items-center gap-2 font-medium text-primary">
                        <MessageCircle className="size-3.5" /> {reply.merchant.name} · 官方回复
                      </div>
                      <p className="mt-1 whitespace-pre-wrap leading-6">{reply.contentMd}</p>
                    </div>
                  ))}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
      {cursor && (
        <div className="space-y-2">
          {loadError && <p className="text-center text-sm text-destructive">{loadError}</p>}
          <Button
            type="button"
            variant="outline"
            onClick={() => void loadMore()}
            disabled={loading}
            className="w-full rounded-xl"
          >
            {loading ? '加载中…' : loadError ? '重试加载评价' : '加载更多评价'}
          </Button>
        </div>
      )}
    </section>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).format(new Date(value));
}
