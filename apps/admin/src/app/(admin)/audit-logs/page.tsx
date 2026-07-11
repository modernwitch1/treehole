'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';
import { Card } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { UserRoleBadge } from '@/components/status-badge';
import { listAuditLogs } from '@/lib/api';
import { MOCK_CHANGED_EVENT } from '@/lib/mock-store';
import { absoluteTime, relativeTime } from '@/lib/format';
import type { AdminAuditLog } from '@/types/admin';

const ACTION_LABEL: Record<string, string> = {
  'post.hide': '隐藏帖子',
  'post.restore': '恢复帖子',
  'post.pin': '置顶帖子',
  'post.unpin': '取消置顶',
  'post.lock': '锁定帖子',
  'post.unlock': '解锁帖子',
  'post.delete': '删除帖子',
  'comment.hide': '隐藏评论',
  'comment.restore': '恢复评论',
  'comment.delete': '删除评论',
  'user.suspend': '禁言用户',
  'user.ban': '封禁用户',
  'user.unban': '解封用户',
  'user.promote': '升级版主',
  'user.demote': '降为用户',
  'report.resolve': '处理举报',
  'report.reject': '驳回举报',
  'report.hide': '举报-隐藏内容',
  'registration.approve': '通过注册',
  'registration.reject': '拒绝注册',
  'announcement.publish': '发布站内通知',
  'sensitive-word.create': '添加敏感词',
  'sensitive-word.update': '修改敏感词',
  'sensitive-word.delete': '删除敏感词',
  'sensitive-word.reload': '热重载词库',
  'post.reveal_author': '查看帖子真实作者',
  'comment.reveal_author': '查看评论真实作者',
};

export default function AuditLogsPage() {
  const [logs, setLogs] = React.useState<AdminAuditLog[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [total, setTotal] = React.useState(0);
  const pathname = usePathname();

  const reload = React.useCallback(() => {
    setLoading(true);
    listAuditLogs({ pageSize: 200 })
      .then((res) => {
        setLogs(res.items);
        setTotal(res.total);
      })
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    reload();
  }, [reload, pathname]);

  // 页面重新可见时刷新，确保从别的页面操作后回来能看到最新日志
  React.useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === 'visible') reload();
    }
    function onMockChange() {
      reload();
    }
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener(MOCK_CHANGED_EVENT, onMockChange);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener(MOCK_CHANGED_EVENT, onMockChange);
    };
  }, [reload]);

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">审计日志</h1>
          <p className="text-sm text-muted-foreground">
            所有管理操作完整可追溯 · 永久保留 · 共 {total} 条
          </p>
        </div>
        <button
          type="button"
          onClick={reload}
          className="rounded-md border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent"
        >
          刷新
        </button>
      </header>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>操作人</TableHead>
              <TableHead>动作</TableHead>
              <TableHead>对象</TableHead>
              <TableHead>备注</TableHead>
              <TableHead>IP</TableHead>
              <TableHead>时间</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="py-12 text-center text-sm text-muted-foreground">
                  加载中…
                </TableCell>
              </TableRow>
            ) : logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-12 text-center text-sm text-muted-foreground">
                  暂无日志
                </TableCell>
              </TableRow>
            ) : (
              logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{log.actor.username}</span>
                      <UserRoleBadge role={log.actor.role} />
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        log.action.includes('delete') || log.action.includes('ban')
                          ? 'destructive'
                          : log.action.includes('reveal')
                            ? 'warning'
                            : 'muted'
                      }
                    >
                      {ACTION_LABEL[log.action] ?? log.action}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {log.targetType && log.targetId ? (
                      <span className="font-mono text-xs text-muted-foreground">
                        {log.targetType}#{log.targetId}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-[260px]">
                    {log.metadata && Object.keys(log.metadata).length > 0 ? (
                      <code className="line-clamp-1 rounded bg-muted px-1.5 py-0.5 text-xs">
                        {JSON.stringify(log.metadata)}
                      </code>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {log.ip ?? '—'}
                  </TableCell>
                  <TableCell
                    className="text-xs text-muted-foreground"
                    title={absoluteTime(log.createdAt)}
                  >
                    {relativeTime(log.createdAt)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
