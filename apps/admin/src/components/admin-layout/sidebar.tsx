'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  Flag,
  FileText,
  ScrollText,
  Filter,
  Settings,
  UserPlus,
  ChevronLeft,
  ExternalLink,
  MessageSquare,
  Megaphone,
  ShieldAlert,
  Scale,
  FolderPlus,
  Fingerprint,
  Utensils,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { WEB_APP_URL } from '@/lib/site-urls';
import { Badge } from '@/components/ui/badge';
import type { AdminCurrentUser, AdminStats } from '@/types/admin';

interface SidebarProps {
  role: AdminCurrentUser['role'];
  stats?: Pick<
    AdminStats,
    | 'openReports'
    | 'pendingRegistrations'
    | 'pendingReview'
    | 'pendingUploads'
    | 'pendingCases'
    | 'pendingAppeals'
  >;
}

interface NavItemDef {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badgeKey?:
    | 'openReports'
    | 'pendingRegistrations'
    | 'pendingReview'
    | 'pendingUploads'
    | 'pendingCases'
    | 'pendingAppeals';
  superadminOnly?: boolean;
  adminOnly?: boolean;
  reportsOnly?: boolean;
}

interface NavGroupDef {
  label: string;
  items: NavItemDef[];
}

const NAV_GROUPS: NavGroupDef[] = [
  {
    label: '总览',
    items: [{ href: '/', label: '仪表盘', icon: LayoutDashboard }],
  },
  {
    label: '审核工作台',
    items: [
      {
        href: '/registrations',
        label: '注册审批',
        icon: UserPlus,
        badgeKey: 'pendingRegistrations',
        superadminOnly: true,
      },
      {
        href: '/reports',
        label: '举报队列',
        icon: Flag,
        badgeKey: 'openReports',
        reportsOnly: true,
      },
      {
        href: '/moderation',
        label: '统一审核案件',
        icon: ShieldAlert,
        badgeKey: 'pendingCases',
        superadminOnly: true,
      },
      {
        href: '/appeals',
        label: '处罚申诉',
        icon: Scale,
        badgeKey: 'pendingAppeals',
        superadminOnly: true,
      },
      { href: '/content', label: '帖子与评论', icon: FileText, superadminOnly: true },
      { href: '/chatrooms', label: '聊天房监控', icon: MessageSquare, superadminOnly: true },
    ],
  },
  {
    label: '用户与规则',
    items: [
      { href: '/trace', label: '私信溯源', icon: Fingerprint, superadminOnly: true },
      { href: '/users', label: '用户与角色', icon: Users, superadminOnly: true },
      { href: '/boards', label: '板块申请', icon: FolderPlus, superadminOnly: true },
      { href: '/sensitive-words', label: '敏感词库', icon: Filter, superadminOnly: true },
    ],
  },
  {
    label: '美食模块',
    items: [{ href: '/food', label: '商家与美食审核', icon: Utensils, adminOnly: true }],
  },
  {
    label: '系统',
    items: [
      { href: '/settings', label: '账号安全与设置', icon: Settings },
      { href: '/audit-logs', label: '审计日志', icon: ScrollText, superadminOnly: true },
    ],
  },
];

export function AdminSidebar({ role, stats }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="hidden h-screen w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
      {/* Brand */}
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-sidebar-border px-4">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary text-xs font-bold text-primary-foreground">
          洞
        </span>
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-semibold">浙工商树洞</span>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Admin Console
          </span>
        </div>
      </div>

      {stats &&
        (stats.pendingReview > 0 || (role === 'superadmin' && stats.pendingAppeals > 0)) && (
          <div className="flex items-center gap-2 border-b border-sidebar-border px-3 py-2 text-[11px]">
            {stats.pendingReview > 0 && (
              <Link
                href="/moderation"
                className="flex flex-1 items-center justify-between rounded bg-[color:var(--warning)]/10 px-2 py-1 text-[color:var(--warning)] hover:bg-[color:var(--warning)]/15"
              >
                内容待审 <strong className="tabular-nums">{stats.pendingReview}</strong>
              </Link>
            )}
            {role === 'superadmin' && stats.pendingAppeals > 0 && (
              <Link
                href="/appeals"
                className="flex flex-1 items-center justify-between rounded bg-primary/10 px-2 py-1 text-primary hover:bg-primary/15"
              >
                待审申诉 <strong className="tabular-nums">{stats.pendingAppeals}</strong>
              </Link>
            )}
          </div>
        )}

      {/* Nav */}
      <nav className="flex-1 space-y-4 overflow-y-auto p-2">
        {NAV_GROUPS.map((group) => ({
          ...group,
          items: group.items.filter((item) => {
            if (item.superadminOnly && role !== 'superadmin') return false;
            if (item.adminOnly && role === 'moderator') return false;
            return true;
          }),
        }))
          .filter((group) => group.items.length > 0)
          .map((group) => (
            <div key={group.label} className="space-y-0.5">
              <div className="px-3 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                {group.label}
              </div>
              {group.items.map(({ href, label, icon: Icon, badgeKey }) => {
                const active = pathname === href || (href !== '/' && pathname.startsWith(href));
                const badge = badgeKey ? stats?.[badgeKey] : undefined;
                return (
                  <Link
                    key={href}
                    href={href}
                    className={cn(
                      'group flex h-9 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors',
                      active
                        ? 'bg-primary/15 text-primary'
                        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                    )}
                  >
                    <Icon className={cn('size-4 shrink-0', active && 'text-primary')} />
                    <span className="flex-1">{label}</span>
                    {badge !== undefined && badge > 0 && (
                      <Badge
                        variant={active ? 'default' : 'destructive'}
                        className="h-5 min-w-5 justify-center px-1.5"
                      >
                        {badge > 99 ? '99+' : badge}
                      </Badge>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
      </nav>

      {/* Footer */}
      <div className="space-y-1 border-t border-sidebar-border p-2">
        {role === 'superadmin' && (
          <Link
            href="/settings"
            className="group flex h-9 items-center gap-3 rounded-md px-3 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <Megaphone className="size-4" />
            <span className="flex-1">发布全站通知</span>
          </Link>
        )}
        <Link
          href={WEB_APP_URL}
          target="_blank"
          rel="noopener"
          className="group flex h-9 items-center gap-3 rounded-md px-3 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <ChevronLeft className="size-4" />
          <span className="flex-1">返回论坛</span>
          <ExternalLink className="size-3 opacity-60" />
        </Link>
      </div>
    </aside>
  );
}
