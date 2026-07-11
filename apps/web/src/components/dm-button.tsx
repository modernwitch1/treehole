'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { MessageCircle, Send, Info, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { initiateConversation } from '@/lib/api';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface DmButtonProps {
  /** 起源帖子 id (后端用这个解析接收方) */
  originPostId: string;
  /** 简短的对方昵称用于按钮标题 */
  partnerLabel?: string;
  /** 是否紧凑模式 (PostCard 用紧凑,详情页用 default) */
  variant?: 'compact' | 'default';
  className?: string;
}

export function DmButton({
  originPostId,
  partnerLabel = 'TA',
  variant = 'compact',
  className,
}: DmButtonProps) {
  const [open, setOpen] = React.useState(false);
  const [content, setContent] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const router = useRouter();
  const ref = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    if (open) {
      // focus after dialog open animation
      const t = setTimeout(() => ref.current?.focus(), 80);
      return () => clearTimeout(t);
    }
  }, [open]);

  async function handleSubmit() {
    if (!content.trim()) return;
    setSubmitting(true);
    try {
      const res = await initiateConversation({
        originPostId,
        initialMessage: content.trim(),
      });
      if (!res.ok) {
        if (res.error === 'partner_dm_disabled') {
          toast.error('对方未开放私信', {
            description: '该用户在设置中关闭了陌生人私信功能。',
          });
        } else {
          toast.error(res.message ?? '发送失败');
        }
        return;
      }
      toast.success('已发送 — 等待对方回复', {
        description: '在对方回复前,你只能发送这一条消息。',
      });
      setOpen(false);
      setContent('');
      if (res.conversationId) router.push(`/messages/${res.conversationId}`);
    } finally {
      setSubmitting(false);
    }
  }

  const len = content.trim().length;
  const max = 500;
  const valid = len > 0 && len <= max;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {variant === 'compact' ? (
          <Button
            variant="ghost"
            size="sm"
            className={cn('h-7 gap-1.5 rounded-full text-muted-foreground', className)}
            onClick={(e) => e.stopPropagation()}
          >
            <MessageCircle className="size-4" />
            <span className="hidden sm:inline">私信</span>
          </Button>
        ) : (
          <Button variant="outline" size="sm" className={cn('gap-1.5', className)}>
            <MessageCircle className="size-4" /> 私信 {partnerLabel}
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>私信 {partnerLabel}</DialogTitle>
          <DialogDescription>
            发出后将进入「待回复」状态 — 在对方回复前,你只能发这一条消息。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <textarea
            ref={ref}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            maxLength={max}
            rows={5}
            placeholder="说点什么开启对话吧…(对方会看到你来自哪个帖子)"
            className="block w-full resize-none rounded-md border border-input bg-transparent p-3 text-sm leading-relaxed placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <p
            className={cn(
              'text-right text-xs tabular-nums',
              len > max ? 'text-destructive' : 'text-muted-foreground',
            )}
          >
            {len} / {max}
          </p>
        </div>

        <div className="flex items-start gap-2 rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          <div className="space-y-1">
            <p>双方在这次会话中都以临时昵称出现,对方看不到你的真实身份。</p>
            <p>如果对方拒绝或不回复,该会话不会再继续。</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={submitting}>
            取消
          </Button>
          <Button onClick={handleSubmit} disabled={!valid || submitting}>
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin" /> 发送中
              </>
            ) : (
              <>
                <Send className="size-4" /> 发送
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
