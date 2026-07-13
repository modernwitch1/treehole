'use client';

import * as React from 'react';
import { Flag, Loader2 } from 'lucide-react';
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
import { reportTarget } from '@/lib/api';
import { toast } from 'sonner';

type ReportCategory = 'illegal' | 'porn' | 'ad' | 'harassment' | 'other';

const CATEGORIES: Array<{ value: ReportCategory; label: string }> = [
  { value: 'harassment', label: '人身攻击 / 骚扰' },
  { value: 'ad', label: '广告 / 营销' },
  { value: 'porn', label: '色情低俗' },
  { value: 'illegal', label: '违法违规' },
  { value: 'other', label: '其他' },
];

interface ReportDialogProps {
  targetType: 'post' | 'comment' | 'user' | 'conversation' | 'direct_message' | 'chatroom_message';
  targetId: string;
  evidenceMessageIds?: string[];
  trigger: React.ReactNode;
  title?: string;
}

export function ReportDialog({
  targetType,
  targetId,
  evidenceMessageIds,
  trigger,
  title = '举报内容',
}: ReportDialogProps) {
  const [open, setOpen] = React.useState(false);
  const [category, setCategory] = React.useState<ReportCategory>('harassment');
  const [reason, setReason] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);

  async function submit() {
    setSubmitting(true);
    try {
      await reportTarget({
        targetType,
        targetId,
        category,
        reason: reason.trim() || undefined,
        evidenceMessageIds,
      });
      toast.success('举报已提交', { description: '管理员会在后台举报队列中处理。' });
      setOpen(false);
      setReason('');
      setCategory('harassment');
    } catch (err) {
      toast.error((err as Error).message || '举报失败');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>请选择原因并补充说明，举报会进入管理员后台。</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as ReportCategory)}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {CATEGORIES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="补充说明（选填）"
            rows={3}
            maxLength={500}
            className="block w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm leading-relaxed placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={submitting}>
            取消
          </Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? <Loader2 className="size-4 animate-spin" /> : <Flag className="size-4" />}
            提交
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
