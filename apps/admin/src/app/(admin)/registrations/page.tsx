'use client';

import * as React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  CheckCircle2,
  XCircle,
  Clock,
  ExternalLink,
  Search,
  Hourglass,
  ChevronDown,
  ChevronRight,
  Loader2,
  Zap,
} from 'lucide-react';
import { listRegistrations, reviewRegistration } from '@/lib/api';
import { relativeTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { AdminRegistrationRequest } from '@/types/admin';

export default function RegistrationsPage() {
  const [requests, setRequests] = React.useState<AdminRegistrationRequest[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState('');
  const [actionId, setActionId] = React.useState<string | null>(null);
  const [noteText, setNoteText] = React.useState('');
  const [bulkRunning, setBulkRunning] = React.useState(false);

  React.useEffect(() => {
    listRegistrations()
      .then(setRequests)
      .finally(() => setLoading(false));
  }, []);

  const filtered = requests.filter((r) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      r.studentId.includes(q) ||
      r.username.toLowerCase().includes(q) ||
      r.email.toLowerCase().includes(q)
    );
  });

  async function handleReview(id: string, action: 'approve' | 'reject') {
    setActionId(id);
    try {
      await reviewRegistration(id, action, noteText || undefined);
      setRequests((prev) =>
        prev.map((r) =>
          r.id === id
            ? {
                ...r,
                status: action === 'approve' ? 'approved' : 'rejected',
                reviewedAt: new Date().toISOString(),
                reviewNote: noteText || undefined,
              }
            : r,
        ),
      );
      setNoteText('');
      toast.success(action === 'approve' ? '已通过该注册申请' : '已拒绝该注册申请');
    } catch {
      toast.error('操作失败');
    } finally {
      setActionId(null);
    }
  }

  async function handleBulkApprove() {
    if (pendingItems.length === 0) return;
    if (!confirm(`确认一键通过 ${pendingItems.length} 条待审批申请？\n\n仅建议在确认全部为学生本人时使用。`))
      return;
    setBulkRunning(true);
    let ok = 0;
    let fail = 0;
    for (const req of pendingItems) {
      try {
        await reviewRegistration(req.id, 'approve');
        ok++;
      } catch {
        fail++;
      }
    }
    // 刷新列表
    const fresh = await listRegistrations();
    setRequests(fresh);
    setBulkRunning(false);
    toast.success(`批量通过完成 · 成功 ${ok} 条${fail > 0 ? `，失败 ${fail} 条` : ''}`);
  }

  const pendingItems = filtered.filter(
    (r) => r.status === 'pending' && (r.remainingHours === undefined || r.remainingHours > 0),
  );
  const expiredItems = filtered.filter(
    (r) => r.status === 'pending' && r.remainingHours !== undefined && r.remainingHours <= 0,
  );
  const historyItems = filtered.filter((r) => r.status !== 'pending');

  const [showExpired, setShowExpired] = React.useState(false);
  const [showHistory, setShowHistory] = React.useState(false);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">注册审批</h1>
          <p className="text-sm text-muted-foreground">
            审核学生注册申请 · 超过 24 小时未处理将自动过期
          </p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="搜索学号/用户名/邮箱…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </header>

      {loading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">加载中…</div>
      ) : (
        <>
          <section>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                待审批
                <Badge variant="destructive">{pendingItems.length}</Badge>
              </h2>
              {pendingItems.length > 1 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleBulkApprove}
                  disabled={bulkRunning}
                  className="gap-1.5"
                >
                  {bulkRunning ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Zap className="size-4" />
                  )}
                  {bulkRunning ? '批量处理中…' : `一键通过 ${pendingItems.length} 条`}
                </Button>
              )}
            </div>
            {pendingItems.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center gap-2 py-12 text-sm text-muted-foreground">
                  <CheckCircle2 className="size-8 text-green-500" />
                  <p>暂无待审批的注册申请</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {pendingItems.map((req) => (
                  <RegistrationCard
                    key={req.id}
                    req={req}
                    actionId={actionId}
                    noteText={noteText}
                    onNoteChange={setNoteText}
                    onReview={handleReview}
                  />
                ))}
              </div>
            )}
          </section>

          {/* 已过期（待审批但超过 24h） */}
          {expiredItems.length > 0 && (
            <section>
              <button
                type="button"
                onClick={() => setShowExpired(!showExpired)}
                className="mb-3 flex w-full items-center gap-1 text-lg font-semibold text-muted-foreground hover:text-foreground"
              >
                {showExpired ? (
                  <ChevronDown className="size-5" />
                ) : (
                  <ChevronRight className="size-5" />
                )}
                已过期
                <Badge variant="secondary" className="ml-2">
                  {expiredItems.length}
                </Badge>
              </button>
              {showExpired && (
                <div className="space-y-2 opacity-60">
                  {expiredItems.map((req) => (
                    <HistoryCard key={req.id} req={{ ...req, status: 'expired' as const }} />
                  ))}
                </div>
              )}
            </section>
          )}

          {/* 处理历史（已通过/已拒绝） */}
          {historyItems.length > 0 && (
            <section>
              <button
                type="button"
                onClick={() => setShowHistory(!showHistory)}
                className="mb-3 flex w-full items-center gap-1 text-lg font-semibold text-muted-foreground hover:text-foreground"
              >
                {showHistory ? (
                  <ChevronDown className="size-5" />
                ) : (
                  <ChevronRight className="size-5" />
                )}
                处理历史
                <Badge variant="secondary" className="ml-2">
                  {historyItems.length}
                </Badge>
              </button>
              {showHistory && (
                <div className="space-y-2">
                  {historyItems.map((req) => (
                    <HistoryCard key={req.id} req={req} />
                  ))}
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}

function RegistrationCard({
  req,
  actionId,
  noteText,
  onNoteChange,
  onReview,
}: {
  req: AdminRegistrationRequest;
  actionId: string | null;
  noteText: string;
  onNoteChange: (v: string) => void;
  onReview: (id: string, action: 'approve' | 'reject') => void;
}) {
  const expired = req.remainingHours !== undefined && req.remainingHours <= 0;
  const urgent =
    req.remainingHours !== undefined && req.remainingHours > 0 && req.remainingHours <= 6;
  // 进度条：24h 内剩余时间占比
  const remainingPct =
    req.remainingHours !== undefined && req.remainingHours > 0
      ? Math.min(100, Math.max(0, (req.remainingHours / 24) * 100))
      : 0;

  return (
    <Card
      className={cn(
        urgent && 'border-yellow-500/50',
        expired && 'border-red-500/50 opacity-60',
      )}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{req.username}</span>
              <Badge variant={req.method === 'email' ? 'secondary' : 'outline'}>
                {req.method === 'email' ? '邮箱验证' : '截图审批'}
              </Badge>
              {expired && <Badge variant="destructive">已过期</Badge>}
              {urgent && <Badge variant="warning">即将过期</Badge>}
            </div>
            <div className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
              <Row label="学号" value={req.studentId} />
              <Row label="邮箱" value={req.email} />
              {req.realName && <Row label="真实姓名" value={req.realName} />}
              <Row label="提交时间" value={relativeTime(req.createdAt)} />
              <Row
                label="状态"
                value={
                  <span className="flex items-center gap-1 text-yellow-500">
                    <Hourglass className="size-3.5" />
                    待审批
                  </span>
                }
              />
            </div>
            {req.remainingHours !== undefined && !expired && (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">距自动过期</span>
                  <span className={cn('font-medium tabular-nums', urgent ? 'text-yellow-500' : '')}>
                    {req.remainingHours}h
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all',
                      urgent ? 'bg-yellow-500' : 'bg-primary',
                    )}
                    style={{ width: `${remainingPct}%` }}
                  />
                </div>
              </div>
            )}
            {req.screenshotUrl && (
              <div className="pt-1">
                <Button variant="outline" size="sm" className="gap-1.5 text-xs" asChild>
                  <a href={req.screenshotUrl} target="_blank" rel="noopener">
                    <ExternalLink className="size-3.5" />
                    查看截图
                  </a>
                </Button>
              </div>
            )}
          </div>
        </div>

        {!expired && (
          <div className="mt-3 space-y-2 border-t pt-3">
            <Textarea
              placeholder="审批备注（选填，如拒绝原因）…"
              value={actionId === req.id ? noteText : ''}
              onChange={(e) => onNoteChange(e.target.value)}
              rows={2}
              className="text-sm"
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                className="gap-1.5"
                disabled={actionId === req.id}
                onClick={() => onReview(req.id, 'approve')}
              >
                {actionId === req.id ? (
                  '处理中…'
                ) : (
                  <>
                    <CheckCircle2 className="size-4" /> 通过
                  </>
                )}
              </Button>
              <Button
                size="sm"
                variant="destructive"
                className="gap-1.5"
                disabled={actionId === req.id}
                onClick={() => onReview(req.id, 'reject')}
              >
                {actionId === req.id ? (
                  '处理中…'
                ) : (
                  <>
                    <XCircle className="size-4" /> 拒绝
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function HistoryCard({ req }: { req: AdminRegistrationRequest }) {
  const statusConfig = {
    approved: { icon: CheckCircle2, label: '已通过', color: 'text-green-500' },
    rejected: { icon: XCircle, label: '已拒绝', color: 'text-red-500' },
    expired: { icon: Clock, label: '已过期', color: 'text-orange-500' },
  } as const;
  const cfg = statusConfig[req.status as keyof typeof statusConfig];

  return (
    <Card className="opacity-70">
      <CardContent className="flex items-center justify-between p-4">
        <div className="flex items-center gap-4">
          <cfg.icon className={cn('size-5 shrink-0', cfg.color)} />
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium">{req.username}</span>
              <Badge variant="secondary" className="text-[10px]">
                {req.studentId}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {req.method === 'email' ? '邮箱验证' : '截图审批'} · {req.email}
            </p>
          </div>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          <div>{relativeTime(req.createdAt)}</div>
          {req.reviewedBy && <div>由 {req.reviewedBy.username} 处理</div>}
          {req.reviewNote && (
            <div className="mt-0.5 max-w-[200px] truncate" title={req.reviewNote}>
              备注: {req.reviewNote}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="shrink-0 text-muted-foreground">{label}:</span>
      <span className="truncate">{value}</span>
    </div>
  );
}

