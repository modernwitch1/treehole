import Link from 'next/link';
import { Inbox, Hourglass, MessageCircle, ShieldX } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { listConversations } from '@/lib/api';
import { relativeTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { ConversationStatus } from '@/types/api';

export const metadata = { title: '私信' };

const STATUS_META: Record<
  ConversationStatus,
  { label: string; icon: React.ComponentType<{ className?: string }>; className: string }
> = {
  pending: {
    label: '待回复',
    icon: Hourglass,
    className: 'text-[color:var(--upvote)] bg-[color:var(--upvote)]/10',
  },
  active: {
    label: '进行中',
    icon: MessageCircle,
    className: 'text-foreground bg-muted',
  },
  blocked: {
    label: '已封闭',
    icon: ShieldX,
    className: 'text-muted-foreground bg-muted/50',
  },
};

export default async function MessagesInboxPage() {
  const result = await listConversations();
  const conversations = result.items;
  const pending = conversations.filter((c) => c.status === 'pending');
  const active = conversations.filter((c) => c.status === 'active');
  const closed = conversations.filter((c) => c.status === 'blocked');

  return (
    <div className="space-y-4">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Inbox className="size-6" /> 私信
        </h1>
        <p className="text-sm text-muted-foreground">
          会话只在双方同意后才会持续 — 对方不回,首条之后无法再发
        </p>
      </header>

      <Card className="overflow-hidden">
        {conversations.length === 0 ? (
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            还没有私信。在帖子上点「私信」开启一次对话吧。
          </CardContent>
        ) : (
          <ul className="divide-y">
            {[...active, ...pending, ...closed].map((c) => (
              <li key={c.id}>
                <Link
                  href={`/messages/${c.id}`}
                  className={cn(
                    'group flex items-start gap-3 p-4 transition-colors hover:bg-accent/40',
                    c.unreadCount > 0 && 'bg-primary/[0.03]',
                  )}
                >
                  {/* Avatar */}
                  <div
                    className="flex size-10 shrink-0 items-center justify-center rounded-full text-base font-bold text-white"
                    style={{ background: c.partner.color }}
                    aria-hidden
                  >
                    匿
                  </div>

                  {/* Main */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <p className="truncate text-sm font-semibold">{c.partner.displayName}</p>
                      <StatusPill status={c.status} />
                      {c.iAmInitiator && (
                        <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                          我发起
                        </Badge>
                      )}
                      <time className="ml-auto shrink-0 text-xs text-muted-foreground">
                        {relativeTime(c.lastMessageAt)}
                      </time>
                    </div>

                    {c.origin && (
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        关于: <span className="text-foreground/80">{c.origin.postTitle}</span>{' '}
                        <span>· {c.origin.tag ? `#${c.origin.tag}` : ''}</span>
                      </p>
                    )}

                    <div className="mt-1 flex items-end gap-2">
                      <p
                        className={cn(
                          'line-clamp-2 flex-1 text-sm leading-snug',
                          c.unreadCount > 0
                            ? 'font-medium text-foreground'
                            : 'text-muted-foreground',
                        )}
                      >
                        {c.lastMessagePreview}
                      </p>
                      {c.unreadCount > 0 && (
                        <Badge
                          variant="default"
                          className="size-5 shrink-0 justify-center rounded-full p-0 text-[10px] tabular-nums"
                        >
                          {c.unreadCount > 9 ? '9+' : c.unreadCount}
                        </Badge>
                      )}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardContent className="space-y-2 p-4 text-xs text-muted-foreground">
          <p className="font-medium text-foreground">关于私信</p>
          <Separator />
          <p>
            <strong className="text-foreground">全员匿名</strong>:
            论坛里所有帖子和评论都不显示真实身份。每段私信也用临时昵称,你和对方在这段对话之外彼此不可识别。
          </p>
          <p>
            <strong className="text-foreground">配对式开锁</strong>: 如果你向陌生人发起,
            在对方回复前你只能发 1 条消息。 对方回复后,双方可自由对话。
          </p>
          <p>
            <strong className="text-foreground">你的控制</strong>:
            在「设置」里可以关闭陌生人私信;任意会话都可以拉黑或举报。
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function StatusPill({ status }: { status: ConversationStatus }) {
  const { label, icon: Icon, className } = STATUS_META[status];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium',
        className,
      )}
    >
      <Icon className="size-2.5" />
      {label}
    </span>
  );
}
