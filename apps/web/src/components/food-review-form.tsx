'use client';

import * as React from 'react';
import { Loader2, Send, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createFoodReview } from '@/lib/api';
import type { FoodReview } from '@/types/api';
import { CommunitySafetyNotice } from '@/components/community-safety-notice';

export function FoodReviewForm({
  windowId,
  onCreated,
}: {
  windowId: string;
  onCreated?: (review: FoodReview) => void;
}) {
  const [type, setType] = React.useState<'taste_review' | 'suggestion'>('taste_review');
  const [score, setScore] = React.useState(5);
  const [content, setContent] = React.useState('');
  const [anonymous, setAnonymous] = React.useState(true);
  const [rulesAcknowledged, setRulesAcknowledged] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [message, setMessage] = React.useState('');

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!content.trim()) {
      setMessage('请写下你的真实感受');
      return;
    }
    if (!rulesAcknowledged) {
      setMessage('请先阅读并同意社区规则');
      return;
    }
    setLoading(true);
    setMessage('');
    try {
      const review = await createFoodReview(windowId, {
        type,
        tasteScore: type === 'taste_review' ? score : undefined,
        contentMd: content.trim(),
        isAnonymous: anonymous,
        rulesAcknowledged,
      });
      setContent('');
      setMessage('提交成功，感谢你的反馈');
      onCreated?.(review);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '提交失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border bg-card p-5 shadow-card">
      <CommunitySafetyNotice compact />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setType('taste_review')}
          className={`rounded-full px-3 py-1.5 text-sm ${type === 'taste_review' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
        >
          口味评价
        </button>
        <button
          type="button"
          onClick={() => setType('suggestion')}
          className={`rounded-full px-3 py-1.5 text-sm ${type === 'suggestion' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
        >
          给商家的意见
        </button>
      </div>

      {type === 'taste_review' && (
        <div className="space-y-2">
          <p className="text-sm font-medium">口味评分</p>
          <div className="flex items-center gap-1" aria-label={`当前评分 ${score} 星`}>
            {[1, 2, 3, 4, 5].map((item) => (
              <button
                key={item}
                type="button"
                aria-label={`${item} 星`}
                onClick={() => setScore(item)}
                className="rounded p-1 text-amber-500 hover:bg-amber-50"
              >
                <Star className={`size-5 ${item <= score ? 'fill-current' : ''}`} />
              </button>
            ))}
          </div>
        </div>
      )}

      <textarea
        value={content}
        onChange={(event) => setContent(event.target.value)}
        maxLength={4000}
        rows={5}
        placeholder={
          type === 'taste_review' ? '味道、分量、价格，欢迎具体说说…' : '把具体建议告诉商家…'
        }
        className="w-full resize-y rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={anonymous}
              onChange={(event) => setAnonymous(event.target.checked)}
              className="size-4 rounded border-input"
            />
            匿名发布
          </label>
          <label className="flex items-start gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={rulesAcknowledged}
              onChange={(event) => setRulesAcknowledged(event.target.checked)}
              className="mt-0.5 size-4 rounded border-input"
            />
            <span>我已阅读并同意社区规则，确认评价基于真实体验且不侵犯他人权益</span>
          </label>
        </div>
        <Button type="submit" disabled={loading} className="rounded-full">
          {loading ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          提交
        </Button>
      </div>
      {message && <p className="text-sm text-muted-foreground">{message}</p>}
    </form>
  );
}
