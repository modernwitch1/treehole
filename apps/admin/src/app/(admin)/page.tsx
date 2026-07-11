'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Users,
  FileText,
  MessageSquare,
  Flag,
  ArrowRight,
  UserPlus,
  Filter,
  Megaphone,
  Clock,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StatCard } from '@/components/stat-card';
import { TrendChart } from '@/components/trend-chart';
import { getStats, listReports, listAuditLogs } from '@/lib/api';
import { relativeTime } from '@/lib/format';
import type { AdminAuditLog, AdminReport, AdminStats } from '@/types/admin';

const CATEGORY_LABEL: Record<string, string> = {
  illegal: '违法',
  porn: '色情',
  ad: '广告',
  harassment: '人身攻击',
  other: '其他',
};

const ACTION_LABEL: Record<string, string> = {
  'post.hide': '隐藏帖子',
  'post.pin': '置顶帖子',
  'post.lock': '锁定帖子',
  'post.restore': '恢复帖子',
  'post.delete': '删除帖子',
  'comment.hide': '隐藏评论',
  'comment.delete': '删除评论',
  'user.suspend': '禁言用户',
  'user.ban': '封禁用户',
  'user.unban': '解封用户',
  'user.promote': '升级版主',
  'user.demote': '降为用户',
  'report.resolve': '处理举报',
  'report.reject': '驳回举报',
  'report.hide': '举报-隐藏',
  'registration.approve': '通过注册',
  'registration.reject': '拒绝注册',
  'announcement.publish': '发布站内通知',
  'post.reveal_author': '查看帖子真实作者',
  'comment.reveal_author': '查看评论真实作者',
};

export default function DashboardPage() {
  const [stats, setStats] = React.useState<AdminStats | null>(null);
  const [openReports, setOpenReports] = React.useState<AdminReport[]>([]);
  const [recentLogs, setRecentLogs] = React.useState<AdminAuditLog[]>([]);
  const [loading, setLoading] = React.useState(true);
  const pathname = usePathname();

  React.useEffect(() => {
    setLoading(true);
    Promise.all([getStats(), listReports({ status: 'open', pageSize: 200 }), listAuditLogs({ pageSize: 200 })])
      .then(([s, r, l]) => {
        setStats(s);
        setOpenReports(r.items);
        setRecentLogs(l.items);
      })
      .finally(() => setLoading(false));
  }, [pathname]);

  if (loading || !stats) {
    return <div className="py-12 text-center text-sm text-muted-foreground">加载中…</div>;
  }

  const pendingRegs = stats.pendingRegistrations;
  const openRpts = stats.openReports;
  const hasWork = pendingRegs > 0 || openRpts > 0;

  return (
    <div className="space-y-6">
      {/* 欢迎区 + 待办提示 */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {hasWork ? '今天还有待处理的工作' : '一切就绪，无待处理事项 🎉'}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            浙工商树洞运营总览 · 数据每分钟刷新
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {pendingRegs > 0 && (
            <Button asChild size="sm" variant="outline" className="gap-1.5">
              <Link href="/registrations">
                <UserPlus className="size-4" />
                {pendingRegs} 个注册待审批
                <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          )}
          {openRpts > 0 && (
            <Button asChild size="sm" variant="destructive" className="gap-1.5">
              <Link href="/reports">
                <Flag className="size-4" />
                {openRpts} 个举报待处理
                <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="总用户数"
          value={stats.totalUsers}
          delta={stats.newUsersToday}
          icon={<Users className="size-5" />}
        />
        <StatCard
          label="总帖子数"
          value={stats.totalPosts}
          delta={stats.newPostsToday}
          tone="success"
          icon={<FileText className="size-5" />}
        />
        <StatCard
          label="总评论数"
          value={stats.totalComments}
          delta={stats.newCommentsToday}
          tone="warning"
          icon={<MessageSquare className="size-5" />}
        />
        <StatCard
          label="待处理举报"
          value={stats.openReports}
          delta={stats.newReportsToday}
          deltaLabel="今日新增"
          tone="destructive"
          icon={<Flag className="size-5" />}
        />
      </div>

      {/* 快捷操作 */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">快捷操作</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <QuickAction href="/registrations" icon={UserPlus} label="注册审批" badge={pendingRegs} />
          <QuickAction href="/reports" icon={Flag} label="处理举报" badge={openRpts} tone="destructive" />
          <QuickAction href="/content" icon={FileText} label="内容管理" />
          <QuickAction href="/chatrooms" icon={MessageSquare} label="聊天房监控" />
          <QuickAction href="/sensitive-words" icon={Filter} label="敏感词库" />
          <QuickAction href="/settings" icon={Megaphone} label="发全站通知" />
        </div>
      </div>

      {/* Trend chart */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div>
            <CardTitle className="text-base">最近 30 天活动趋势</CardTitle>
            <CardDescription>每日新增用户 / 帖子 / 评论 / 举报</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <TrendChart data={stats.trend} />
        </CardContent>
      </Card>

      {/* Two-column bottom */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Open report queue preview */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base">待处理举报</CardTitle>
              <CardDescription>{openReports.length} 条等待处理</CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/reports">
                全部 <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            {openReports.slice(0, 4).map((r) => (
              <Link
                key={r.id}
                href={`/reports#${r.id}`}
                className="group flex gap-3 rounded-md border border-transparent p-2 -mx-2 hover:border-border hover:bg-accent/50"
              >
                <Badge variant="destructive" className="h-fit shrink-0">
                  {CATEGORY_LABEL[r.category] ?? r.category}
                </Badge>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-1 text-sm font-medium">
                    {r.targetSnapshot.title ?? r.targetSnapshot.preview}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {r.targetType === 'user' ? '针对用户' : '帖子/评论'} · {r.reporter.username}{' '}
                    举报 · {relativeTime(r.createdAt)}
                  </p>
                </div>
              </Link>
            ))}
            {openReports.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">无待处理举报 🎉</p>
            )}
          </CardContent>
        </Card>

        {/* Recent admin actions */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base">最近管理动作</CardTitle>
              <CardDescription>来自审计日志</CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/audit-logs">
                全部 <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            {recentLogs.slice(0, 6).map((log) => (
              <div key={log.id} className="flex gap-3 text-sm">
                <div className="mt-1 size-1.5 shrink-0 rounded-full bg-primary" />
                <div className="min-w-0 flex-1">
                  <p>
                    <span className="font-medium">{log.actor.username}</span>{' '}
                    <span className="text-muted-foreground">
                      {ACTION_LABEL[log.action] ?? log.action}
                    </span>
                    {log.targetType && log.targetId && (
                      <span className="ml-1 font-mono text-xs text-muted-foreground">
                        #{log.targetId}
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="size-3" />
                    {relativeTime(log.createdAt)}
                  </p>
                </div>
              </div>
            ))}
            {recentLogs.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">暂无管理动作</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function QuickAction({
  href,
  icon: Icon,
  label,
  badge,
  tone = 'default',
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  badge?: number;
  tone?: 'default' | 'destructive';
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col gap-2 rounded-xl border bg-card p-3.5 transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-card"
    >
      <div className="flex items-center justify-between">
        <div
          className={
            tone === 'destructive'
              ? 'flex size-9 items-center justify-center rounded-lg bg-destructive/10 text-destructive'
              : 'flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary'
          }
        >
          <Icon className="size-4.5" />
        </div>
        {badge !== undefined && badge > 0 && (
          <Badge variant={tone === 'destructive' ? 'destructive' : 'default'} className="h-5 px-1.5">
            {badge > 99 ? '99+' : badge}
          </Badge>
        )}
      </div>
      <p className="text-sm font-medium leading-tight">{label}</p>
    </Link>
  );
}
