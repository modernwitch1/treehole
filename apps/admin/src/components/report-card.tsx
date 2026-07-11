'use client';

import * as React from 'react';
import { EyeOff, Check, X, ExternalLink, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { reviewReport } from '@/lib/api';
import { relativeTime } from '@/lib/format';
import { WEB_APP_URL } from '@/lib/site-urls';
import { cn } from '@/lib/utils';
import type { AdminReport, ReportCategory } from '@/types/admin';
const CATEGORY_LABEL: Record<
  ReportCategory,
  { label: string; tone: 'destructive' | 'warning' | 'muted' }
> = {
  illegal: { label: '违法/政治', tone: 'destructive' },
  porn: { label: '色情低俗', tone: 'destructive' },
  ad: { label: '广告/营销', tone: 'warning' },
  harassment: { label: '人身攻击', tone: 'warning' },
  other: { label: '其他', tone: 'muted' },
};

const TARGET_TYPE_LABEL = {
  post: '帖子',
  comment: '评论',
  user: '用户',
} as const;

export function ReportCard({ report, onChanged }: { report: AdminReport; onChanged?: () => void }) {
  const [pending, setPending] = React.useState<'hide' | 'resolve' | 'reject' | null>(null);
  const [note, setNote] = React.useState('');
  const [localStatus, setLocalStatus] = React.useState(report.status);
  const router = useRouter();
  const isClosed = localStatus !== 'open';

  async function confirm() {
    if (!pending) return;
    try {
      await reviewReport(report.id, pending, note || undefined);
      setLocalStatus(
        pending === 'resolve' ? 'resolved' : pending === 'reject' ? 'rejected' : 'open',
      );
      const labels = { hide: '已隐藏内容', resolve: '已判定违规', reject: '已驳回举报' };
      toast.success(labels[pending]);
      setPending(null);
      setNote('');
      if (onChanged) {
        onChanged();
      } else {
        router.refresh();
      }
    } catch {
      toast.error('操作失败');
      setPending(null);
    }
  }

  const cat = CATEGORY_LABEL[report.category];

  return (
    <Card id={report.id}>
      <CardContent className="space-y-3 p-4">
        {/* Header */}
        <div className="flex items-start gap-2">
          <Badge variant={cat.tone}>{cat.label}</Badge>
          <Badge variant="muted">{TARGET_TYPE_LABEL[report.targetType]}</Badge>
          <span className="text-xs text-muted-foreground">{relativeTime(report.createdAt)}</span>
          <span className="ml-auto font-mono text-xs text-muted-foreground">#{report.id}</span>
        </div>

        {/* Target preview */}
        <div className="rounded-md border border-dashed bg-muted/30 p-3">
          {report.targetSnapshot.title && (
            <p className="text-sm font-semibold">{report.targetSnapshot.title}</p>
          )}
          <p
            className={cn(
              'text-sm text-foreground/90',
              report.targetSnapshot.title && 'mt-1 text-muted-foreground',
            )}
          >
            {report.targetSnapshot.preview}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {report.targetSnapshot.isAnonymous ? (
              <span className="inline-flex items-center gap-1">
                匿名作者:{' '}
                <span className="text-foreground">{report.targetSnapshot.authorUsername}</span>
              </span>
            ) : (
              <span>
                作者:{' '}
                <span className="text-foreground">{report.targetSnapshot.authorUsername}</span>
              </span>
            )}
            {report.targetSnapshot.boardSlug && (
              <span>
                · 标签: <span className="text-foreground">#{report.targetSnapshot.boardSlug}</span>
              </span>
            )}
          </div>
        </div>

        {/* Reason */}
        <div className="flex gap-2 text-sm">
          <span className="text-muted-foreground">举报人:</span>
          <span className="font-medium">{report.reporter.username}</span>
          {report.reason && (
            <>
              <Separator orientation="vertical" className="h-4" />
              <span className="flex-1 text-muted-foreground">「{report.reason}」</span>
            </>
          )}
        </div>

        {/* 已处理: 显示处理记录; 未处理: 显示动作按钮 */}
        {isClosed ? (
          <div className="flex items-start gap-2 rounded-md bg-muted/40 p-3 text-xs">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
            <div>
              <p>
                <span className="font-medium">{report.handledBy?.username ?? '系统'}</span>{' '}
                <span className="text-muted-foreground">
                  {report.status === 'resolved' ? '判定违规并处理' : '判定无效驳回'} ·{' '}
                  {report.handledAt && relativeTime(report.handledAt)}
                </span>
              </p>
              {report.resolutionNote && (
                <p className="mt-0.5 text-muted-foreground">备注: {report.resolutionNote}</p>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2 pt-1">
            <Button size="sm" variant="outline" onClick={() => setPending('hide')}>
              <EyeOff className="size-3.5" /> 隐藏内容
            </Button>
            <Button size="sm" variant="default" onClick={() => setPending('resolve')}>
              <Check className="size-3.5" /> 判定违规
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setPending('reject')}>
              <X className="size-3.5" /> 驳回举报
            </Button>
            <Button size="sm" variant="ghost" className="ml-auto" asChild>
              <a href={`${WEB_APP_URL}/p/${report.targetId}`} target="_blank" rel="noopener">
                查看原文 <ExternalLink className="size-3.5" />
              </a>
            </Button>
          </div>
        )}
      </CardContent>

      <Dialog open={pending !== null} onOpenChange={(o) => !o && setPending(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {pending === 'hide' && '确认隐藏该内容?'}
              {pending === 'resolve' && '确认判定违规?'}
              {pending === 'reject' && '确认驳回此举报?'}
            </DialogTitle>
            <DialogDescription>
              {pending === 'hide' && '内容将立即从公开列表移除,作者会看到「已隐藏」提示。'}
              {pending === 'resolve' && '记录为「确认违规」并标记举报为已处理。可选填备注。'}
              {pending === 'reject' && '该举报会标记为无效。重复无效举报的用户会被减权重。'}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="处理备注（写入审计日志）"
            className="resize-none"
            rows={3}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPending(null)}>
              取消
            </Button>
            <Button
              variant={pending === 'hide' || pending === 'resolve' ? 'destructive' : 'default'}
              onClick={() => void confirm()}
            >
              确认
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
