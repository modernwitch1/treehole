'use client';

import * as React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import {
  listBoardApplications,
  approveBoardApplication,
  rejectBoardApplication,
} from '@/lib/api';
import { relativeTime } from '@/lib/format';
import type { BoardApplication } from '@/types/admin';

export default function BoardsPage() {
  const [applications, setApplications] = React.useState<BoardApplication[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [rejectTarget, setRejectTarget] = React.useState<BoardApplication | null>(null);
  const [rejectReason, setRejectReason] = React.useState('');
  const [processing, setProcessing] = React.useState<string | null>(null);

  const reload = React.useCallback(() => {
    setLoading(true);
    listBoardApplications()
      .then(setApplications)
      .catch(() => toast.error('加载申请列表失败'))
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    reload();
  }, [reload]);

  async function handleApprove(app: BoardApplication) {
    setProcessing(app.id);
    try {
      await approveBoardApplication(app.id);
      toast.success(`已通过「${app.name}」的申请`);
      reload();
    } catch {
      toast.error('操作失败');
    } finally {
      setProcessing(null);
    }
  }

  async function handleReject() {
    if (!rejectTarget) return;
    setProcessing(rejectTarget.id);
    try {
      await rejectBoardApplication(rejectTarget.id, rejectReason || undefined);
      toast.success(`已拒绝「${rejectTarget.name}」的申请`);
      setRejectTarget(null);
      setRejectReason('');
      reload();
    } catch {
      toast.error('操作失败');
    } finally {
      setProcessing(null);
    }
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">板块管理</h1>
        <p className="text-sm text-muted-foreground">
          审核用户提交的板块申请 · 共 {applications.length} 个待审批
        </p>
      </header>

      <Card>
        {loading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">加载中…</div>
        ) : applications.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            暂无待审批的申请
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>板块名称</TableHead>
                <TableHead>简介</TableHead>
                <TableHead>申请人</TableHead>
                <TableHead>申请理由</TableHead>
                <TableHead>申请时间</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {applications.map((app) => (
                <TableRow key={app.id}>
                  <TableCell>
                    <p className="font-medium">{app.name}</p>
                  </TableCell>
                  <TableCell>
                    <p className="line-clamp-2 max-w-[200px] text-sm text-muted-foreground">
                      {app.description}
                    </p>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm">
                      {app.applicant?.username ?? '未知用户'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <p className="line-clamp-2 max-w-[260px] text-sm">
                      {app.applyReason}
                    </p>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {app.appliedAt ? relativeTime(app.appliedAt) : '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        size="sm"
                        variant="default"
                        disabled={processing === app.id}
                        onClick={() => handleApprove(app)}
                      >
                        通过
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={processing === app.id}
                        onClick={() => setRejectTarget(app)}
                      >
                        拒绝
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* 拒绝对话框 */}
      <AlertDialog open={!!rejectTarget} onOpenChange={(open) => {
        if (!open) {
          setRejectTarget(null);
          setRejectReason('');
        }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>拒绝申请</AlertDialogTitle>
            <AlertDialogDescription>
              确定要拒绝「{rejectTarget?.name}」的板块申请吗？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reject-reason">拒绝理由（可选）</Label>
            <Textarea
              id="reject-reason"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="说明拒绝原因，帮助申请人改进..."
              rows={3}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleReject}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              确认拒绝
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
