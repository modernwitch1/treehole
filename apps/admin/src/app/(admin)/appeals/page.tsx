'use client';

import * as React from 'react';
import Link from 'next/link';
import { CheckCircle2, RefreshCw, Scale, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Pagination } from '@/components/pagination';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { listAppeals, reviewAppeal } from '@/lib/api';
import { relativeTime } from '@/lib/format';
import type { AdminAppeal, AdminAppealStatus } from '@/types/admin';

const SANCTION_LABEL: Record<AdminAppeal['sanction']['type'], string> = {
  warning: '警告',
  mute: '功能限制',
  suspension: '暂停账号',
  ban: '永久封禁',
};

type ReviewState = { appeal: AdminAppeal; action: 'approve' | 'reject' } | null;

export default function AppealsPage() {
  const [items, setItems] = React.useState<AdminAppeal[]>([]);
  const [status, setStatus] = React.useState<AdminAppealStatus | 'all'>('pending');
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const [totalPages, setTotalPages] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [review, setReview] = React.useState<ReviewState>(null);
  const [note, setNote] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const sequence = React.useRef(0);

  const reload = React.useCallback(() => {
    const request = ++sequence.current;
    setLoading(true);
    listAppeals({
      status: status === 'all' ? undefined : status,
      page,
      pageSize: 20,
    })
      .then((result) => {
        if (request !== sequence.current) return;
        setItems(result.items);
        setTotal(result.total);
        setTotalPages(result.totalPages);
        if (result.items.length === 0 && page > 1) setPage(page - 1);
      })
      .catch((error: unknown) => {
        if (request === sequence.current) {
          toast.error((error as Error).message || '申诉队列加载失败');
        }
      })
      .finally(() => {
        if (request === sequence.current) setLoading(false);
      });
  }, [page, status]);

  React.useEffect(() => {
    reload();
  }, [reload]);

  function openReview(appeal: AdminAppeal, action: 'approve' | 'reject') {
    setReview({ appeal, action });
    setNote('');
  }

  async function submitReview() {
    if (!review || note.trim().length < 5) return;
    setSubmitting(true);
    try {
      await reviewAppeal(review.appeal.id, review.action, note.trim());
      toast.success(
        review.action === 'approve'
          ? '申诉已通过，处罚已撤销并重新计算账号状态'
          : '复核完成，维持原处理',
      );
      setReview(null);
      reload();
    } catch (error) {
      toast.error((error as Error).message || '申诉处理失败，可能已被其他管理员处理');
      setReview(null);
      reload();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">处罚申诉复核</h1>
          <p className="text-sm text-muted-foreground">
            核对原处罚、用户陈述与案件上下文；通过申诉会撤销对应处罚，并按剩余处罚重新计算账号状态
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={reload} disabled={loading}>
          <RefreshCw className={loading ? 'animate-spin' : ''} /> 刷新
        </Button>
      </header>

      <Card>
        <CardContent className="flex flex-wrap items-end justify-between gap-3 p-4">
          <div className="w-44 space-y-1.5">
            <Label>复核状态</Label>
            <Select
              value={status}
              onValueChange={(value) => {
                setPage(1);
                setStatus(value as AdminAppealStatus | 'all');
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">等待复核</SelectItem>
                <SelectItem value="approved">申诉成立</SelectItem>
                <SelectItem value="rejected">维持原处理</SelectItem>
                <SelectItem value="all">全部状态</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Badge variant={total > 0 && status === 'pending' ? 'destructive' : 'muted'}>
            {total} 条记录
          </Badge>
        </CardContent>
      </Card>

      {loading ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            加载中…
          </CardContent>
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-sm text-muted-foreground">
            <Scale className="size-9 opacity-40" /> 暂无匹配的申诉
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {items.map((appeal) => (
            <Card key={appeal.id}>
              <CardContent className="space-y-4 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant={
                      appeal.status === 'pending'
                        ? 'warning'
                        : appeal.status === 'approved'
                          ? 'success'
                          : 'muted'
                    }
                  >
                    {appeal.status === 'pending'
                      ? '等待复核'
                      : appeal.status === 'approved'
                        ? '申诉成立'
                        : '维持原处理'}
                  </Badge>
                  <Badge variant="outline">{SANCTION_LABEL[appeal.sanction.type]}</Badge>
                  <span className="text-sm font-semibold">{appeal.user.username}</span>
                  <span className="text-xs text-muted-foreground">{appeal.user.email}</span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    提交于 {relativeTime(appeal.createdAt)} · 申诉 #{appeal.id}
                  </span>
                </div>

                <div className="grid gap-3 lg:grid-cols-2">
                  <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                    <p className="text-xs font-semibold text-muted-foreground">原处罚依据</p>
                    <p className="mt-1 whitespace-pre-wrap">{appeal.sanction.reason}</p>
                    <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                      <p>
                        执行人：{appeal.sanction.imposedBy?.username ?? '系统'} · 处罚 #
                        {appeal.sanction.id}
                      </p>
                      <p>
                        规则：{appeal.sanction.policyRule ?? '未单独标注'} · 适用范围：
                        {appeal.sanction.scope}
                      </p>
                      {appeal.sanction.caseId && (
                        <p>
                          关联案件：
                          <Link
                            href={`/moderation?status=all&caseId=${appeal.sanction.caseId}#case-${appeal.sanction.caseId}`}
                            className="font-mono text-primary hover:underline"
                          >
                            #{appeal.sanction.caseId}
                          </Link>
                        </p>
                      )}
                      <p>
                        期限：{new Date(appeal.sanction.startsAt).toLocaleString('zh-CN')} —{' '}
                        {appeal.sanction.endsAt
                          ? new Date(appeal.sanction.endsAt).toLocaleString('zh-CN')
                          : '长期'}
                      </p>
                    </div>
                  </div>
                  <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm">
                    <p className="text-xs font-semibold text-primary">用户申诉陈述</p>
                    <p className="mt-1 whitespace-pre-wrap break-words">{appeal.reason}</p>
                  </div>
                </div>

                {appeal.status === 'pending' ? (
                  <div className="flex flex-wrap gap-2 border-t pt-3">
                    <Button size="sm" onClick={() => openReview(appeal, 'approve')}>
                      <CheckCircle2 /> 申诉成立并撤销处罚
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openReview(appeal, 'reject')}
                    >
                      <XCircle /> 维持原处理
                    </Button>
                  </div>
                ) : (
                  <div className="rounded-md bg-muted/40 p-3 text-xs">
                    <p>
                      复核人：{appeal.reviewer?.username ?? '管理员'} ·{' '}
                      {appeal.reviewedAt && relativeTime(appeal.reviewedAt)}
                    </p>
                    {appeal.reviewNote && (
                      <p className="mt-1 text-muted-foreground">复核说明：{appeal.reviewNote}</p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {totalPages > 1 && <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />}

      <Dialog
        open={review !== null}
        onOpenChange={(open) => {
          if (!open && !submitting) setReview(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {review?.action === 'approve' ? '确认申诉成立？' : '确认维持原处理？'}
            </DialogTitle>
            <DialogDescription>
              {review?.action === 'approve'
                ? '系统会撤销这条处罚；若用户还有其他有效处罚，账号仍按最严重的剩余处罚执行。'
                : '原处罚继续有效。请清楚说明复核了哪些事实、上下文和规则条款。'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="appeal-review-note">复核说明（必填）</Label>
            <Textarea
              id="appeal-review-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={4}
              maxLength={1000}
              placeholder="至少 5 个字；该说明会展示给申诉用户并写入审计日志"
              className="resize-none"
              disabled={submitting}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" disabled={submitting} onClick={() => setReview(null)}>
              取消
            </Button>
            <Button
              variant={review?.action === 'approve' ? 'default' : 'destructive'}
              disabled={submitting || note.trim().length < 5}
              onClick={() => void submitReview()}
            >
              {submitting ? '处理中…' : '确认提交复核结果'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
