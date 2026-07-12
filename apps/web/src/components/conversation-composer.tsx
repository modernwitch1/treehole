'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Send, Loader2, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { sendMessage } from '@/lib/api';
import { toast } from 'sonner';
import type { ConversationDetail } from '@/types/api';
import { CommunitySafetyNotice } from '@/components/community-safety-notice';

interface ConversationComposerProps {
  detail: ConversationDetail;
  /** 发送成功后的回调，用于乐观更新消息列表 */
  onSent?: (text: string, moderationStatus: 'published' | 'pending_review') => void;
}

export function ConversationComposer({ detail, onSent }: ConversationComposerProps) {
  const [value, setValue] = React.useState('');
  const [rulesAcknowledged, setRulesAcknowledged] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const router = useRouter();
  const ref = React.useRef<HTMLTextAreaElement>(null);

  const { conversation: c, canSendMore, blockedReason } = detail;

  // 各种禁止/受限状态
  if (c.status === 'blocked') {
    return <BlockedBanner reason={blockedReason ?? 'blocked_by_me'} />;
  }

  if (c.status === 'pending' && c.iAmInitiator && !canSendMore) {
    const initialMessagePending = detail.messages.some(
      (message) => message.sender === 'me' && message.status === 'pending_review',
    );
    return (
      <div className="rounded-lg border border-dashed bg-muted/40 p-4 text-center text-sm">
        <p className="font-medium">
          {initialMessagePending ? '消息正在审核' : '等待对方回复'}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {initialMessagePending
            ? '审核通过前消息仅你自己可见，不会投递给对方。'
            : '在对方回复前，你只能发这一条消息。如果对方一直不回，这段对话不会再继续。'}
        </p>
      </div>
    );
  }

  function autoresize() {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    const text = value.trim();
    if (!text || !rulesAcknowledged || submitting) return;
    setSubmitting(true);
    try {
      const res = await sendMessage(c.id, text, rulesAcknowledged);
      if (!res.ok) {
        toast.error(res.message ?? '发送失败');
        return;
      }
      setValue('');
      setRulesAcknowledged(false);
      const moderationStatus = res.moderationStatus ?? 'published';
      if (moderationStatus === 'pending_review') {
        toast.info('消息已提交审核', {
          description: '审核通过前仅你自己可见，不会投递给对方。',
        });
      }
      if (onSent) {
        onSent(text, moderationStatus);
      } else {
        router.refresh();
      }
    } catch (error) {
      toast.error((error as Error).message || '私信发送失败，请修改后重试');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      {c.status === 'pending' && !c.iAmInitiator && (
        <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-xs">
          <p className="font-medium text-foreground">这是一条来自陌生人的私信</p>
          <p className="mt-0.5 text-muted-foreground">
            回复后,对方才能继续与你对话。如果你不想回复,可以直接关闭页面或拉黑。
          </p>
        </div>
      )}

      <CommunitySafetyNotice compact privateChannel />

      <div className="flex items-end gap-2 rounded-lg border bg-card p-2 focus-within:ring-1 focus-within:ring-ring">
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            autoresize();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              void handleSubmit();
            }
          }}
          rows={1}
          maxLength={1000}
          placeholder={c.status === 'pending' && !c.iAmInitiator ? '回复对方…' : '说点什么…'}
          className="block min-h-[36px] w-full resize-none bg-transparent px-2 py-1.5 text-sm leading-relaxed placeholder:text-muted-foreground focus:outline-none"
        />
        <Button
          type="submit"
          size="icon"
          disabled={!value.trim() || !rulesAcknowledged || submitting}
          aria-label="发送 (Ctrl+Enter)"
          className="size-9 shrink-0 rounded-md"
        >
          {submitting ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        </Button>
      </div>
      <label className="flex cursor-pointer items-start gap-2 px-1 text-[11px] leading-relaxed text-muted-foreground">
        <input
          type="checkbox"
          checked={rulesAcknowledged}
          onChange={(event) => setRulesAcknowledged(event.target.checked)}
          className="mt-0.5"
        />
        <span>我确认本条私信遵守社区规则；违规私信可能被拦截、处罚并依法依规溯源。</span>
      </label>
      <p className="px-1 text-[11px] text-muted-foreground">⌘/Ctrl + Enter 快速发送</p>
    </form>
  );
}

function BlockedBanner({
  reason,
}: {
  reason: 'partner_dm_disabled' | 'blocked_by_partner' | 'blocked_by_me';
}) {
  const text = {
    partner_dm_disabled: '对方已关闭私信功能,无法再发消息。',
    blocked_by_partner: '对方已停止对话,你无法继续发送消息。',
    blocked_by_me: '你已拉黑该对话。如需恢复,请在会话菜单中解除。',
  }[reason];

  return (
    <div className="flex items-start gap-3 rounded-lg border bg-muted/50 p-4 text-sm">
      <Lock className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <p className="text-muted-foreground">{text}</p>
    </div>
  );
}
