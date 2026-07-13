'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { UsersFilters } from '@/components/users-filters';
import { UserActionsMenu } from '@/components/user-actions-menu';
import { UserRoleBadge, UserStatusBadge } from '@/components/status-badge';
import { listUsers } from '@/lib/api';
import { absoluteTime, relativeTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { AdminUser, UserRole, UserStatus } from '@/types/admin';

const STATUS_CHIPS: { value: UserStatus | 'all'; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'active', label: '正常' },
  { value: 'suspended', label: '禁言中' },
  { value: 'banned', label: '已封禁' },
];

export default function UsersPage() {
  const params = useSearchParams();
  const q = params.get('q') ?? undefined;
  const status = (params.get('status') ?? undefined) as UserStatus | undefined;
  const role = (params.get('role') ?? undefined) as UserRole | undefined;

  const [users, setUsers] = React.useState<AdminUser[]>([]);
  const [loading, setLoading] = React.useState(true);

  const reload = React.useCallback(() => {
    setLoading(true);
    listUsers({ q, status, role, pageSize: 200 })
      .then((res) => setUsers(res.items))
      .finally(() => setLoading(false));
  }, [q, status, role]);

  React.useEffect(() => {
    reload();
  }, [reload]);

  // 状态计数 — 基于当前筛选条件下（不含 status）的所有用户
  const statusCounts = React.useMemo(() => {
    const map: Record<string, number> = { active: 0, suspended: 0, banned: 0 };
    for (const u of users) {
      if (map[u.status] !== undefined) map[u.status]++;
    }
    return map;
  }, [users]);

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">用户管理</h1>
        <p className="text-sm text-muted-foreground">
          共 {users.length} 个匹配用户 · 处罚、权限变更等重要操作会写入审计日志
        </p>
      </header>

      {/* 状态快捷筛选 chip */}
      <div className="flex flex-wrap items-center gap-2">
        {STATUS_CHIPS.map((c) => {
          const active = (status ?? 'all') === c.value;
          const count = c.value === 'all' ? users.length : (statusCounts[c.value] ?? 0);
          // 构建 URL，保留 q 与 role，仅切换 status
          const p = new URLSearchParams(params.toString());
          if (c.value === 'all') p.delete('status');
          else p.set('status', c.value);
          const qs = p.toString();
          return (
            <Link
              key={c.value}
              href={qs ? `?${qs}` : '?'}
              className={cn(
                'inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors',
                active
                  ? 'bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              )}
            >
              {c.label}
              <span
                className={cn(
                  'rounded-full px-1.5 text-[10px] tabular-nums',
                  active ? 'bg-primary/20' : 'bg-muted',
                )}
              >
                {count}
              </span>
            </Link>
          );
        })}
      </div>

      <UsersFilters />

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[28%]">用户</TableHead>
              <TableHead>UID</TableHead>
              <TableHead>角色</TableHead>
              <TableHead>状态</TableHead>
              <TableHead className="text-right">发帖 / 评论</TableHead>
              <TableHead className="text-right">举报</TableHead>
              <TableHead>最后登录</TableHead>
              <TableHead>注册</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={9} className="py-12 text-center text-sm text-muted-foreground">
                  加载中…
                </TableCell>
              </TableRow>
            ) : users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="py-12 text-center text-sm text-muted-foreground">
                  没有匹配的用户
                </TableCell>
              </TableRow>
            ) : (
              users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="size-8">
                        <AvatarImage src={u.avatarUrl} alt={u.username} />
                        <AvatarFallback>{u.username[0]}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="truncate font-medium">{u.username}</p>
                        <p className="truncate font-mono text-xs text-muted-foreground">
                          {u.email}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{u.id}</TableCell>
                  <TableCell>
                    <UserRoleBadge role={u.role} />
                  </TableCell>
                  <TableCell>
                    <UserStatusBadge status={u.status} />
                    {u.status === 'suspended' && u.suspendedUntil && (
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        至 {u.suspendedUntil.slice(0, 10)}
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {u.postCount} / {u.commentCount}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {u.reportCount > 0 ? (
                      <span className="text-destructive">{u.reportCount}</span>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {u.lastLoginAt ? (
                      <span title={u.lastLoginIp ?? undefined}>{relativeTime(u.lastLoginAt)}</span>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {absoluteTime(u.createdAt).slice(0, 10)}
                  </TableCell>
                  <TableCell>
                    {u.role === 'superadmin' ? (
                      <span
                        className="text-xs font-medium text-muted-foreground"
                        title="唯一超级管理员账号不能在用户列表中被处罚或降权"
                      >
                        受保护
                      </span>
                    ) : (
                      <UserActionsMenu user={u} onChanged={reload} />
                    )}
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
