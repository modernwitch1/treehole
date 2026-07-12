'use client';

import * as React from 'react';
import { notFound } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { ConversationHeader } from '@/components/conversation-header';
import { ConversationComposer } from '@/components/conversation-composer';
import { getConversation } from '@/lib/api';
import { relativeTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { ConversationDetail, Message } from '@/types/api';
import { ReportDialog } from '@/components/report-dialog';
import { Flag } from 'lucide-react';

interface ConversationPageProps {
  params: Promise<{ id: string }>;
}

export default function ConversationPage({ params }: ConversationPageProps) {
  const { id } = React.use(params);

  const [detail, setDetail] = React.useState<ConversationDetail | null>(null);
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const refreshInFlightRef = React.useRef(false);

  const load = React.useCallback(() => {
    setLoading(true);
    setError(false);
    getConversation(id)
      .then((d) => {
        if (!d) {
          setLoading(false);
          return;
        }
        setDetail(d);
        setMessages(d.messages);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, [id]);

  React.useEffect(() => {
    load();
  }, [load]);

  const refresh = React.useCallback(async () => {
    if (refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;
    try {
      const next = await getConversation(id);
      if (next) {
        setDetail(next);
        setMessages(next.messages);
        setError(false);
      }
    } catch {
      // Keep the last successful snapshot during transient polling failures.
    } finally {
      refreshInFlightRef.current = false;
    }
  }, [id]);

  React.useEffect(() => {
    const poll = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    const interval = window.setInterval(poll, 15_000);
    document.addEventListener('visibilitychange', poll);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', poll);
    };
  }, [refresh]);

  React.useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  function handleSent(text: string, moderationStatus: 'published' | 'pending_review') {
    const newMsg: Message = {
      id: `local-${Date.now()}`,
      conversationId: id,
      sender: 'me',
      contentMd: text,
      contentHtml: text,
      createdAt: new Date().toISOString(),
      status: moderationStatus === 'pending_review' ? 'pending_review' : 'sent',
    };
    setMessages((prev) => [...prev, newMsg]);
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-8 gap-3">
        <p className="text-sm text-muted-foreground">加载失败，请稍后重试</p>
        <button
          type="button"
          onClick={load}
          className="text-sm text-primary underline hover:no-underline"
        >
          重试
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8 text-sm text-muted-foreground">
        加载中…
      </div>
    );
  }

  if (!detail) {
    notFound();
    return null;
  }

  const { conversation } = detail;
  const grouped = groupByDay(messages.map((m) => ({ ...m, day: m.createdAt.slice(0, 10) })));

  return (
    <div className="mx-auto flex h-[calc(100vh-7rem)] max-w-2xl flex-col gap-3">
      <Card className="flex flex-1 flex-col overflow-hidden">
        <CardContent className="flex flex-1 flex-col gap-3 p-4">
          <ConversationHeader conversation={conversation} />

          {/* Message list */}
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto pr-1">
            {grouped.map((group) => (
              <div key={group.day} className="space-y-2">
                <div className="my-2 text-center text-[11px] text-muted-foreground">
                  {formatDayLabel(group.day)}
                </div>
                {group.items.map((m) => (
                  <MessageBubble
                    key={m.id}
                    isMine={m.sender === 'me'}
                    partnerColor={conversation.partner.color}
                    pending={m.status === 'pending_review'}
                  >
                    <div className="whitespace-pre-wrap text-sm leading-relaxed">{m.contentMd}</div>
                    <div
                      className={cn(
                        'mt-1 text-[10px]',
                        m.sender === 'me' && m.status !== 'pending_review'
                          ? 'text-primary-foreground/70'
                          : 'text-muted-foreground',
                      )}
                    >
                      {relativeTime(m.createdAt)}
                      {m.sender === 'me' && m.status === 'sent' && (
                        <span className="ml-1">· 已送达</span>
                      )}
                      {m.sender === 'me' && m.status === 'read' && (
                        <span className="ml-1">· 已读</span>
                      )}
                      {m.sender === 'me' && m.status === 'pending_review' && (
                        <span className="ml-1 font-medium">· 审核中（未投递）</span>
                      )}
                      {m.sender === 'me' && m.status === 'not_delivered' && (
                        <span className="ml-1 font-medium">· 未投递</span>
                      )}
                      {m.sender === 'partner' && (
                        <ReportDialog
                          targetType="direct_message"
                          targetId={m.id}
                          title="举报这条私信"
                          trigger={
                            <button
                              type="button"
                              className="ml-2 inline-flex items-center gap-0.5 hover:text-destructive"
                            >
                              <Flag className="size-2.5" /> 举报
                            </button>
                          }
                        />
                      )}
                    </div>
                  </MessageBubble>
                ))}
              </div>
            ))}
          </div>

          {/* Composer */}
          <ConversationComposer detail={detail} onSent={handleSent} />
        </CardContent>
      </Card>
    </div>
  );
}

function MessageBubble({
  isMine,
  partnerColor,
  pending,
  children,
}: {
  isMine: boolean;
  partnerColor: string;
  pending?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('flex items-end gap-2', isMine ? 'justify-end' : 'justify-start')}>
      {!isMine && (
        <div
          className="flex size-7 shrink-0 items-center justify-center self-end rounded-full text-[10px] font-bold text-white"
          style={{ background: partnerColor }}
          aria-hidden
        >
          匿
        </div>
      )}
      <div
        className={cn(
          'max-w-[78%] rounded-2xl px-3.5 py-2',
          isMine
            ? pending
              ? 'rounded-br-sm border border-amber-500/40 bg-amber-500/10 text-foreground'
              : 'rounded-br-sm bg-primary text-primary-foreground'
            : 'rounded-bl-sm bg-muted text-foreground',
        )}
      >
        {children}
      </div>
    </div>
  );
}

function groupByDay<T extends { day: string }>(items: T[]) {
  const groups: Array<{ day: string; items: T[] }> = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (last && last.day === item.day) last.items.push(item);
    else groups.push({ day: item.day, items: [item] });
  }
  return groups;
}

function formatDayLabel(day: string): string {
  const d = new Date(day);
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const yesterday = new Date(now.getTime() - 86400_000).toISOString().slice(0, 10);
  if (day === today) return '今天';
  if (day === yesterday) return '昨天';
  return d.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' });
}
