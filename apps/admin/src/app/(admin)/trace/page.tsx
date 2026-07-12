'use client';

import * as React from 'react';
import {
  Clock3,
  Eraser,
  Fingerprint,
  Inbox,
  Loader2,
  LockKeyhole,
  MessageSquareText,
  Network,
  Search,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { toast } from 'sonner';
import { Pagination } from '@/components/pagination';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getCurrentAdmin, traceDirectMessages, type DirectMessageTraceFilters } from '@/lib/api';
import { absoluteTime, relativeTime } from '@/lib/format';
import type {
  AdminDirectMessageTrace,
  AdminTraceIdentity,
  ContentStatus,
  ConversationStatus,
  PaginatedResponse,
} from '@/types/admin';

interface TraceForm {
  messageId: string;
  conversationId: string;
  userId: string;
}

const EMPTY_FORM: TraceForm = { messageId: '', conversationId: '', userId: '' };

const MESSAGE_STATUS: Record<ContentStatus, string> = {
  published: '已发布',
  pending_review: '待审核',
  hidden: '已隐藏',
  deleted: '已删除',
};

const CONVERSATION_STATUS: Record<ConversationStatus, string> = {
  pending: '等待对方回复',
  active: '进行中',
  blocked: '已封闭',
};

type AccessState = 'checking' | 'allowed' | 'denied';

export default function DirectMessageTracePage() {
  const [access, setAccess] = React.useState<AccessState>('checking');
  const [form, setForm] = React.useState<TraceForm>(EMPTY_FORM);
  const [activeFilters, setActiveFilters] = React.useState<DirectMessageTraceFilters | null>(null);
  const [result, setResult] = React.useState<PaginatedResponse<AdminDirectMessageTrace> | null>(
    null,
  );
  const [loading, setLoading] = React.useState(false);
  const requestSequence = React.useRef(0);

  React.useEffect(() => {
    let mounted = true;
    getCurrentAdmin().then((admin) => {
      if (mounted) setAccess(admin?.role === 'superadmin' ? 'allowed' : 'denied');
    });
    return () => {
      mounted = false;
    };
  }, []);

  const runTrace = React.useCallback(async (filters: DirectMessageTraceFilters, page: number) => {
    const requestId = ++requestSequence.current;
    setLoading(true);
    try {
      const response = await traceDirectMessages({ ...filters, page, pageSize: 20 });
      if (requestId !== requestSequence.current) return;
      setActiveFilters(filters);
      setResult(response);
      toast.success('查询完成，本次真实信息访问已自动写入审计日志');
    } catch (error) {
      if (requestId !== requestSequence.current) return;
      toast.error((error as Error).message || '私信溯源查询失败');
    } finally {
      if (requestId === requestSequence.current) setLoading(false);
    }
  }, []);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const filters: DirectMessageTraceFilters = {
      messageId: form.messageId.trim() || undefined,
      conversationId: form.conversationId.trim() || undefined,
      userId: form.userId.trim() || undefined,
    };
    void runTrace(filters, 1);
  }

  function clearTrace() {
    requestSequence.current += 1;
    setLoading(false);
    setForm(EMPTY_FORM);
    setActiveFilters(null);
    setResult(null);
  }

  if (access === 'checking') {
    return (
      <Card className="mx-auto mt-12 max-w-xl">
        <CardContent className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> 正在核验超级管理员权限…
        </CardContent>
      </Card>
    );
  }

  if (access === 'denied') {
    return (
      <Card className="mx-auto mt-12 max-w-xl border-destructive/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LockKeyhole className="size-5 text-destructive" /> 无权使用溯源中心
          </CardTitle>
          <CardDescription>
            只有全站唯一超级管理员可以读取私信参与者的 UID、学号、邮箱、IP 与设备信息。
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Fingerprint className="size-6 text-primary" /> 私信溯源中心
        </h1>
        <p className="text-sm text-muted-foreground">
          仅超级管理员可查询私信真实参与者及发送环境；普通管理员与版主无法取得这些字段
        </p>
      </header>

      <Card className="border-primary/25 bg-primary/[0.03]">
        <CardContent className="flex items-start gap-3 p-4">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" />
          <div className="space-y-1">
            <p className="text-sm font-semibold">无需关联案件或填写理由，但每次访问都会自动审计</p>
            <p className="text-xs leading-5 text-muted-foreground">
              点击查询以及翻页时，系统都会记录超级管理员账号、精确筛选条件、请求
              IP、设备信息、命中数量与时间。审计写入失败时不会返回任何真实身份或消息内容。
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base">精确筛选</CardTitle>
          <CardDescription>
            至少填写一项，可组合筛选。系统不允许无条件浏览全库，也不支持模糊搜索。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={submit}>
            <div className="grid gap-3 md:grid-cols-3">
              <TraceIdInput
                id="trace-message-id"
                label="消息 ID（messageId）"
                placeholder="例如 1024"
                value={form.messageId}
                onChange={(value) => setForm((current) => ({ ...current, messageId: value }))}
              />
              <TraceIdInput
                id="trace-conversation-id"
                label="会话 ID（conversationId）"
                placeholder="例如 256"
                value={form.conversationId}
                onChange={(value) => setForm((current) => ({ ...current, conversationId: value }))}
              />
              <TraceIdInput
                id="trace-user-id"
                label="用户 UID（userId）"
                placeholder="例如 42"
                value={form.userId}
                onChange={(value) => setForm((current) => ({ ...current, userId: value }))}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" disabled={loading}>
                {loading ? <Loader2 className="animate-spin" /> : <Search />}
                {loading ? '查询中…' : '查询并审计'}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={loading && !result}
                onClick={clearTrace}
              >
                <Eraser /> 清空
              </Button>
              <span className="text-xs text-muted-foreground">
                用户 UID 会返回该用户参与会话中的收发双方消息
              </span>
            </div>
          </form>
        </CardContent>
      </Card>

      {result && activeFilters && (
        <>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">当前条件：</span>
            {activeFilters.messageId && (
              <Badge variant="outline" className="font-mono">
                messageId={activeFilters.messageId}
              </Badge>
            )}
            {activeFilters.conversationId && (
              <Badge variant="outline" className="font-mono">
                conversationId={activeFilters.conversationId}
              </Badge>
            )}
            {activeFilters.userId && (
              <Badge variant="outline" className="font-mono">
                userId={activeFilters.userId}
              </Badge>
            )}
            <span className="ml-auto text-muted-foreground">
              共 {result.total} 条 · 第 {result.page}/{Math.max(result.totalPages, 1)} 页
            </span>
          </div>

          {loading ? (
            <Card>
              <CardContent className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> 正在读取并登记审计记录…
              </CardContent>
            </Card>
          ) : result.items.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-2 py-12 text-center text-sm text-muted-foreground">
                <Inbox className="size-9 opacity-40" />
                没有符合全部精确条件的私信记录
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {result.items.map((message) => (
                <TraceMessageCard key={message.id} message={message} />
              ))}
            </div>
          )}

          {!loading && result.totalPages > 1 && (
            <Pagination
              page={result.page}
              totalPages={result.totalPages}
              onPageChange={(nextPage) => void runTrace(activeFilters, nextPage)}
            />
          )}
        </>
      )}

      {!result && !loading && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
            <MessageSquareText className="size-9 opacity-40" />
            填写精确 ID 后主动查询；打开本页面本身不会读取私信数据
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function TraceIdInput(props: {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={props.id}>{props.label}</Label>
      <Input
        id={props.id}
        inputMode="numeric"
        autoComplete="off"
        maxLength={19}
        pattern="[1-9][0-9]*"
        placeholder={props.placeholder}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
      />
    </div>
  );
}

function TraceMessageCard({ message }: { message: AdminDirectMessageTrace }) {
  return (
    <Card className={message.legalHold ? 'border-[color:var(--warning)]/40' : undefined}>
      <CardContent className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="font-mono">
            消息 #{message.id}
          </Badge>
          <Badge variant="muted" className="font-mono">
            会话 #{message.conversation.id}
          </Badge>
          <MessageStatusBadge status={message.status} />
          <Badge variant={message.conversation.status === 'blocked' ? 'warning' : 'muted'}>
            {CONVERSATION_STATUS[message.conversation.status]}
          </Badge>
          {message.legalHold && <Badge variant="warning">证据保全</Badge>}
          <span className="ml-auto text-xs text-muted-foreground" title={message.createdAt}>
            <Clock3 className="mr-1 inline size-3" />
            {absoluteTime(message.createdAt)}（{relativeTime(message.createdAt)}）
          </span>
        </div>

        <div className="rounded-lg border bg-muted/20 p-3">
          <p className="mb-2 text-xs font-medium text-muted-foreground">私信原始 Markdown 内容</p>
          <p className="whitespace-pre-wrap break-words text-sm leading-6">
            {message.contentMd || '（空内容）'}
          </p>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <IdentityCard label="本条发送者" identity={message.sender} emphasis />
          <IdentityCard label="本条接收者" identity={message.recipient} />
        </div>

        <div className="grid gap-x-6 gap-y-3 rounded-lg border p-3 text-sm md:grid-cols-2 xl:grid-cols-3">
          <TraceDetail icon={Network} label="发送 IP" value={message.senderIp ?? '未记录'} mono />
          <TraceDetail
            icon={Fingerprint}
            label="发送设备 / User-Agent"
            value={message.senderUserAgent ?? '未记录'}
            mono
          />
          <TraceDetail
            icon={Clock3}
            label="读取时间"
            value={message.readAt ? absoluteTime(message.readAt) : '尚未读取'}
          />
          <TraceDetail
            icon={UserRound}
            label="会话发起方"
            value={`${message.conversation.initiator.username} · UID ${message.conversation.initiator.uid}`}
          />
          <TraceDetail
            icon={UserRound}
            label="会话原接收方"
            value={`${message.conversation.recipient.username} · UID ${message.conversation.recipient.uid}`}
          />
          <TraceDetail
            icon={MessageSquareText}
            label="来源帖子 / 封闭人"
            value={`${message.conversation.originPostId ? `帖子 #${message.conversation.originPostId}` : '无来源帖子'} · ${
              message.conversation.blockedByUserId
                ? `UID ${message.conversation.blockedByUserId} 封闭`
                : '未封闭'
            }`}
          />
          <TraceDetail
            icon={Clock3}
            label="会话创建时间"
            value={absoluteTime(message.conversation.createdAt)}
          />
          <TraceDetail
            icon={Clock3}
            label="最后消息时间"
            value={absoluteTime(message.conversation.lastMessageAt)}
          />
          <TraceDetail
            icon={Clock3}
            label="会话更新时间"
            value={absoluteTime(message.conversation.updatedAt)}
          />
        </div>

        {message.moderationLabels !== null && message.moderationLabels !== undefined && (
          <details className="rounded-lg border px-3 py-2 text-xs">
            <summary className="cursor-pointer font-medium text-muted-foreground">
              查看自动风控元数据
            </summary>
            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all rounded bg-muted/40 p-2 font-mono">
              {JSON.stringify(message.moderationLabels, null, 2)}
            </pre>
          </details>
        )}
      </CardContent>
    </Card>
  );
}

function IdentityCard(props: { label: string; identity: AdminTraceIdentity; emphasis?: boolean }) {
  const { identity } = props;
  return (
    <div className={`rounded-lg border p-3 ${props.emphasis ? 'bg-primary/[0.03]' : ''}`}>
      <p className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <UserRound className="size-4 text-primary" /> {props.label}
      </p>
      <dl className="grid grid-cols-[5rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
        <dt className="text-muted-foreground">真实 UID</dt>
        <dd className="break-all font-mono">{identity.uid}</dd>
        <dt className="text-muted-foreground">用户名</dt>
        <dd className="break-all font-medium">{identity.username}</dd>
        <dt className="text-muted-foreground">邮箱</dt>
        <dd className="break-all font-mono text-xs">{identity.email}</dd>
        <dt className="text-muted-foreground">学号</dt>
        <dd className="break-all font-mono">{identity.studentId ?? '未关联'}</dd>
      </dl>
    </div>
  );
}

function TraceDetail(props: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  mono?: boolean;
}) {
  const Icon = props.icon;
  return (
    <div className="min-w-0">
      <p className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="size-3.5" /> {props.label}
      </p>
      <p className={`break-all ${props.mono ? 'font-mono text-xs' : ''}`}>{props.value}</p>
    </div>
  );
}

function MessageStatusBadge({ status }: { status: ContentStatus }) {
  const variant =
    status === 'published'
      ? 'success'
      : status === 'pending_review'
        ? 'warning'
        : status === 'deleted'
          ? 'destructive'
          : 'muted';
  return <Badge variant={variant}>{MESSAGE_STATUS[status]}</Badge>;
}
